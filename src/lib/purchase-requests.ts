import "server-only"

import { randomBytes } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { enqueueWhatsApp, retryAggregateDelivery, retryOutboxMessage, scheduleOutboxDelivery } from "@/lib/whatsapp-outbox"
import { hasReachedMinimumStock, parseMinimumStock } from "@/lib/purchase-request-rules"
import { formatSupplierOrderMessage } from "@/lib/supplier-replies"

type Tx = Prisma.TransactionClient

const purchaseRequestKey = (id: string) => `PURCHASE_REQUEST:${id}:INITIAL`
const purchaseReminderKey = (id: string, sequence: number) => `PURCHASE_REMINDER:${id}:${sequence}`
const REMINDER_GRACE_MINUTES = 60

/**
 * Mengantre ulang pesan pesanan atas permintaan pengguna. Status pesanan ikut
 * berubah sendiri karena disalin dari antrean.
 */
export async function retryPurchaseRequestDelivery(id: string, organizationId: string) {
  const request = await prisma.purchaseRequest.findFirst({
    where: { id, organizationId, status: "ACTIVE" },
    select: { message: true, purchaseOrderId: true, supplier: { select: { phone: true } } },
  })
  if (!request) return false
  // Baris dari pesanan banyak bahan: yang dikirim ulang adalah WA pesanannya.
  if (request.purchaseOrderId) return retryPurchaseOrderDelivery(request.purchaseOrderId, organizationId)

  const queued = await prisma.whatsAppOutbox.findFirst({
    where: { organizationId, aggregateType: "PURCHASE_REQUEST", aggregateId: id },
    select: { id: true },
  })
  if (queued) {
    const retried = await retryAggregateDelivery(organizationId, "PURCHASE_REQUEST", id)
    if (retried) {
      await prisma.purchaseRequest.updateMany({
        where: { id, organizationId },
        data: {
          providerDeliveryStatus: "UNKNOWN",
          providerStatusRaw: null,
          providerStateRaw: null,
          providerStateId: null,
          deliveryStatusUpdatedAt: null,
          deliveredAt: null,
          readAt: null,
          undeliveredAt: null,
          responseDueAt: null,
          responseOverdueAt: null,
        },
      })
      scheduleOutboxDelivery()
    }
    return retried
  }

  // Belum punya baris antrean sama sekali: dulu gagal sebelum sempat mengantre
  // karena nomor supplier masih kosong. Sekarang nomornya ada, jadi buat.
  const supplierPhone = request.supplier.phone?.trim()
  if (!supplierPhone) return false
  await prisma.$transaction((tx) => enqueueWhatsApp(tx, {
    organizationId,
    aggregateType: "PURCHASE_REQUEST",
    aggregateId: id,
    targetPhone: supplierPhone,
    message: request.message,
    idempotencyKey: purchaseRequestKey(id),
  }))
  scheduleOutboxDelivery()
  return true
}

/** Mengantre ulang WA pesanan banyak bahan (semua bagiannya yang gagal). */
export async function retryPurchaseOrderDelivery(orderId: string, organizationId: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, organizationId },
    select: { id: true, message: true, supplier: { select: { phone: true } } },
  })
  if (!order) return false
  const nomor = order.supplier.phone?.trim()
  if (!nomor) return false
  const gagal = await prisma.whatsAppOutbox.findMany({
    where: { organizationId, aggregateType: "PURCHASE_ORDER", aggregateId: orderId, status: { in: ["FAILED", "UNCERTAIN", "DEAD"] } },
    select: { id: true },
  })
  const adaAntrean = await prisma.whatsAppOutbox.count({ where: { organizationId, aggregateType: "PURCHASE_ORDER", aggregateId: orderId } })
  let dijadwalkan = false
  for (const row of gagal) {
    // Supplier mungkin memperbaiki nomor setelah kegagalan pertama. Antrean
    // ulang harus memakai nomor terbaru, bukan target lama yang invalid.
    await prisma.whatsAppOutbox.update({ where: { id: row.id }, data: { targetPhone: nomor } })
    if (await retryOutboxMessage(row.id, organizationId)) dijadwalkan = true
  }
  if (!adaAntrean) {
    // Dulu gagal sebelum sempat mengantre karena nomor supplier kosong.
    await prisma.$transaction((tx) => enqueueWhatsApp(tx, {
      organizationId, aggregateType: "PURCHASE_ORDER", aggregateId: orderId, targetPhone: nomor,
      message: order.message, idempotencyKey: `PURCHASE_ORDER:${orderId}:ULANG`,
    }))
    dijadwalkan = true
  }
  if (dijadwalkan) {
    await prisma.purchaseRequest.updateMany({
      where: { purchaseOrderId: orderId, organizationId, status: "ACTIVE" },
      data: {
        providerDeliveryStatus: "UNKNOWN", providerStatusRaw: null, providerStateRaw: null, providerStateId: null,
        deliveryStatusUpdatedAt: null, deliveredAt: null, readAt: null, undeliveredAt: null,
        responseDueAt: null, responseOverdueAt: null,
      },
    })
    scheduleOutboxDelivery()
  }
  return dijadwalkan
}

/**
 * Mengirim pengingat pada PO yang benar-benar sudah melewati tenggat balasan.
 * PO lama tetap dipakai: tidak ada pesanan baru, perubahan stok, atau eskalasi
 * otomatis. Setelah pengingat dibuat, supplier diberi waktu satu jam lagi.
 */
export async function remindSupplier(id: string, organizationId: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${id} FOR UPDATE`
    const request = await tx.purchaseRequest.findFirst({
      where: { id, organizationId },
      include: {
        supplier: { select: { name: true, phone: true } },
        item: { select: { name: true, unit: true } },
        location: { select: { name: true } },
      },
    })
    if (!request || request.status !== "ACTIVE") throw new Error("Pesanan sudah tidak aktif")
    if (request.supplierReplyStatus !== "WAITING") throw new Error("Supplier sudah memberikan balasan")
    const reminderRetryable = ["FAILED", "UNCERTAIN", "DEAD"].includes(request.lastReminderStatus ?? "")
    if (!reminderRetryable && (!request.responseDueAt || request.responseDueAt.getTime() > Date.now())) {
      throw new Error("Batas waktu balasan belum terlewati")
    }
    if (["PENDING", "PROCESSING"].includes(request.lastReminderStatus ?? "")) {
      throw new Error("Pengingat masih dalam antrean pengiriman")
    }
    const targetPhone = request.supplier.phone?.trim()
    if (!targetPhone) throw new Error("Nomor WhatsApp supplier belum diisi")

    const sequence = request.reminderCount + 1
    const unit = request.inputUnit ?? request.baseUnit ?? request.item.unit
    const quantity = Number(request.inputQuantity ?? request.quantity).toLocaleString("id-ID", { maximumFractionDigits: 3 })
    // Pesanan banyak bahan: satu pengingat berisi semua bahan yang belum dijawab.
    const pesanan = request.purchaseOrderId
      ? await tx.purchaseOrder.findUnique({
          where: { id: request.purchaseOrderId },
          select: {
            shortCode: true,
            lines: {
              where: { status: "ACTIVE", supplierReplyStatus: "WAITING" },
              select: { id: true, inputQuantity: true, quantity: true, inputUnit: true, baseUnit: true, item: { select: { name: true } }, itemId: true },
            },
          },
        })
      : null
    const namaDiSupplier = pesanan
      ? new Map((await tx.itemSupplier.findMany({
          where: { organizationId, supplierId: request.supplierId, locationId: request.locationId, itemId: { in: pesanan.lines.map((l) => l.itemId) } },
          select: { itemId: true, supplierItemName: true },
        })).map((m) => [m.itemId, m.supplierItemName?.trim() || null]))
      : new Map<string, string | null>()
    const message = pesanan ? [
      `Halo ${request.supplier.name}, kami belum menerima konfirmasi untuk pesanan #${pesanan.shortCode} ke ${request.location.name}:`,
      ...pesanan.lines.map((l) => `• ${namaDiSupplier.get(l.itemId) ?? l.item.name} ${Number(l.inputQuantity ?? l.quantity).toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${l.inputUnit ?? l.baseUnit ?? ""}`.trimEnd()),
      "",
      "Balas: *1* siap semua · *2 [jumlah]* sebagian · *3* kosong · *4* sudah dikirim",
      "Pesan ini adalah pengingat, bukan pesanan baru.",
    ].join("\n") : [
      `Halo ${request.supplier.name}, kami belum menerima konfirmasi untuk pesanan berikut:`,
      "",
      `*Kode:* ${request.orderCode}`,
      `*Tujuan:* ${request.location.name}`,
      `*Bahan:* ${request.item.name}`,
      `*Jumlah:* ${quantity} ${unit}`,
      "",
      `Mohon balas: ${request.orderCode} READY [jumlah] ${unit}, ${request.orderCode} SEBAGIAN [jumlah] ${unit}, atau ${request.orderCode} KOSONG 0.`,
      "",
      "Pesan ini adalah pengingat, bukan pesanan baru.",
    ].join("\n")
    const now = new Date()
    const responseDueAt = new Date(now.getTime() + REMINDER_GRACE_MINUTES * 60_000)

    await enqueueWhatsApp(tx, {
      organizationId,
      aggregateType: "PURCHASE_REMINDER",
      aggregateId: request.id,
      targetPhone,
      message,
      idempotencyKey: purchaseReminderKey(request.id, sequence),
    })
    await tx.purchaseRequest.updateMany({
      where: pesanan ? { id: { in: pesanan.lines.map((l) => l.id).concat(request.id) } } : { id: request.id },
      data: {
        reminderCount: sequence,
        lastReminderAt: now,
        lastReminderStatus: "PENDING",
        lastReminderError: null,
        responseDueAt,
        responseOverdueAt: null,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: "REMIND_SUPPLIER",
        entity: "PurchaseRequest",
        entityId: request.id,
        after: { sequence, responseDueAt: responseDueAt.toISOString() },
      },
    })
    return { sequence, responseDueAt }
  })
  scheduleOutboxDelivery()
  return result
}

export async function maybeCreatePurchaseRequest(
  tx: Tx,
  organizationId: string,
  itemId: string,
  locationId: string,
  options: {
    afterFailedPriority?: number
    force?: boolean
    requestedQuantity?: number
    requestContext?: string
    urgency?: "NORMAL" | "URGENT"
    /// Pesanan yang gagal dan memicu percobaan ini. Diisi hanya oleh eskalasi.
    escalatedFrom?: { id: string; procurementChainId: string | null }
    /// Satuan yang diketik penanggung jawab gudang beserta faktornya saat ini.
    /// Kosong berarti pesanan dibuat langsung dalam satuan dasar.
    unitSnapshot?: { inputQuantity: number; inputUnit: string; conversionFactor: number }
  } = {},
) {
  const balance = await tx.stockBalance.findUnique({
    where: { itemId_locationId: { itemId, locationId } },
    include: {
      item: { include: { locationSettings: { where: { locationId }, select: { minStock: true } } } },
      location: { select: { name: true } },
    },
  })
  if (!balance) return null

  const configuredMinimum = balance.item.locationSettings[0]?.minStock
  const minStock = parseMinimumStock(configuredMinimum == null ? null : Number(configuredMinimum))
  const currentQuantity = Number(balance.quantity)
  const requestedQuantity = Number(options.requestedQuantity)
  // A user supplies the amount, or escalation reuses the unfulfilled amount.
  // Stock movements alone must never invent an order quantity or message.
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return null
  if (options.force) {
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return null
  } else if (minStock == null || !hasReachedMinimumStock(currentQuantity, minStock)) {
    return null
  }

  const activeRequest = await tx.purchaseRequest.findFirst({
    where: { organizationId, itemId, locationId, status: "ACTIVE" },
    select: { id: true, orderCode: true },
  })
  if (activeRequest) return activeRequest

  const lastTriedPriority = options.afterFailedPriority ?? 0
  const candidate = await tx.itemSupplier.findFirst({
    where: {
      organizationId,
      itemId,
      locationId,
      priority: { gt: lastTriedPriority },
      supplier: { isActive: true, phone: { not: null } },
    },
    orderBy: { priority: "asc" },
    include: { supplier: true },
  })

  if (!candidate) {
    const titlePrefix = lastTriedPriority > 0 ? "Semua supplier aktif gagal" : "Supplier belum diatur"
    const existingAlert = await tx.alert.findFirst({
      where: {
        organizationId,
        type: "STOCK_SHORTAGE",
        itemId,
        locationId,
        isResolved: false,
        title: { startsWith: titlePrefix },
      },
      select: { id: true },
    })
    if (!existingAlert) {
      await tx.alert.create({
        data: {
          organizationId,
          type: "STOCK_SHORTAGE",
          severity: "CRITICAL",
          title: `${titlePrefix}: ${balance.item.name}`,
          message: lastTriedPriority > 0
            ? `Semua supplier aktif untuk ${balance.item.name} di ${balance.location.name} sudah dicoba. Diperlukan keputusan pengadaan manual.`
            : `${balance.item.name} di ${balance.location.name} memerlukan pengadaan, tetapi belum memiliki supplier aktif dengan nomor WhatsApp.`,
          locationId,
          itemId,
        },
      })
    }
    return null
  }

  await tx.alert.updateMany({
    where: {
      organizationId,
      type: "STOCK_SHORTAGE",
      itemId,
      locationId,
      isResolved: false,
      OR: [
        { title: { startsWith: "Supplier belum diatur" } },
        { title: { startsWith: "Semua supplier aktif gagal" } },
      ],
    },
    data: { isResolved: true, resolvedAt: new Date() },
  })

  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
  const orderQuantity = requestedQuantity
  const dateCode = new Date().toISOString().slice(2, 10).replaceAll("-", "")
  const orderCode = `PO-${dateCode}-${randomBytes(3).toString("hex").toUpperCase()}`
  // Pesan ke supplier memakai satuan pembelian yang dia kenal; stok tetap
  // dicatat dalam satuan dasar.
  const snapshot = options.unitSnapshot ?? {
    inputQuantity: orderQuantity,
    inputUnit: balance.item.unit,
    conversionFactor: 1,
  }
  const urgency = options.urgency === "URGENT" ? "URGENT" : "NORMAL"
  const responseTimeoutMinutes = urgency === "URGENT"
    ? candidate.supplier.urgentResponseTimeoutMinutes
    : candidate.supplier.responseTimeoutMinutes
  const message = formatSupplierOrderMessage({
    supplierName: candidate.supplier.name,
    organizationName: organization?.name ?? "Pantau",
    orderCode,
    destinationName: balance.location.name,
    itemName: balance.item.name,
    quantity: snapshot.inputQuantity,
    unit: snapshot.inputUnit,
    baseQuantity: orderQuantity,
    baseUnit: balance.item.unit,
    context: options.requestContext,
  })

  const request = await tx.purchaseRequest.create({
    data: {
      organizationId,
      itemId,
      locationId,
      supplierId: candidate.supplierId,
      priority: candidate.priority,
      quantity: orderQuantity,
      orderCode,
      message,
      status: "ACTIVE",
      messageStatus: "PENDING",
      urgency,
      responseTimeoutMinutes,
      escalatedFromId: options.escalatedFrom?.id ?? null,
      inputQuantity: snapshot.inputQuantity,
      inputUnit: snapshot.inputUnit,
      conversionFactor: snapshot.conversionFactor,
      baseUnit: balance.item.unit,
    },
  })

  // Rantai selalu ditandai id pesanan PERTAMA. Percobaan pertama menandai
  // dirinya sendiri, karena id-nya baru ada setelah baris tersimpan.
  const chainId = options.escalatedFrom
    ? options.escalatedFrom.procurementChainId ?? options.escalatedFrom.id
    : request.id
  await tx.purchaseRequest.update({ where: { id: request.id }, data: { procurementChainId: chainId } })

  const supplierPhone = candidate.supplier.phone?.trim()
  if (!supplierPhone) {
    await tx.purchaseRequest.update({
      where: { id: request.id },
      data: { messageStatus: "FAILED", lastMessageError: "Nomor WhatsApp supplier belum diisi" },
    })
    return request
  }

  // Tugas pengiriman lahir di transaksi yang sama dengan pesanannya: bila
  // transaksi batal, tidak ada pesan yang dikirim; bila tersimpan, pesan pasti
  // punya antrean walau server mati sesudahnya.
  await enqueueWhatsApp(tx, {
    organizationId,
    aggregateType: "PURCHASE_REQUEST",
    aggregateId: request.id,
    targetPhone: supplierPhone,
    message,
    idempotencyKey: purchaseRequestKey(request.id),
  })
  scheduleOutboxDelivery()
  return request
}
