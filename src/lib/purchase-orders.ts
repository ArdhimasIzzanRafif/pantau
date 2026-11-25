import "server-only"

import { randomBytes } from "node:crypto"
import { Prisma } from "@prisma/client"
import { enqueueWhatsApp, scheduleOutboxDelivery } from "@/lib/whatsapp-outbox"
import { formatPurchaseOrderMessages } from "@/lib/supplier-replies"
import { warehouseNeedSource } from "@/lib/warehouse-purchase-needs"

type Tx = Prisma.TransactionClient

export class PesananDitolak extends Error {}

export type BarisPesananInput = {
  itemId: string
  /// Jumlah yang diketik, dalam satuan beli supplier (bila diatur) atau satuan dasar.
  quantity: number
}

/** Isian versi supplier pada pemetaan: nama bahan & satuan beli. Semua opsional. */
export function bacaIsianSupplier(body: Record<string, unknown>):
  { supplierItemName: string | null; purchaseUnit: string | null; purchaseUnitSize: number | null } | string {
  const teks = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null
  const supplierItemName = teks(body.supplierItemName)
  const purchaseUnit = teks(body.purchaseUnit)
  const isiMentah = body.purchaseUnitSize
  const purchaseUnitSize = isiMentah === null || isiMentah === undefined || isiMentah === "" ? null : Number(isiMentah)
  if (purchaseUnitSize !== null && !(Number.isFinite(purchaseUnitSize) && purchaseUnitSize > 0)) {
    return "Isi per satuan beli harus angka lebih dari 0"
  }
  if ((purchaseUnit === null) !== (purchaseUnitSize === null)) {
    return "Satuan beli dan isinya harus diisi bersamaan (mis. dus = 100)"
  }
  return { supplierItemName, purchaseUnit, purchaseUnitSize }
}

/** Kelompok tab di halaman Pesanan. */
export type KelompokPesanan = "PERLU_TINDAKAN" | "MENUNGGU" | "PENGIRIMAN" | "SELESAI"

type BarisRingkas = {
  status: string
  supplierReplyStatus: string
  messageStatus: string
  responseOverdueAt: Date | null
  supplierShippedAt?: Date | null
  supplierConfirmedAt?: Date | null
  receivedQuantity?: unknown
}

type PesananRingkas = {
  lines: BarisRingkas[]
  isManual?: boolean
  manualConfirmedAt?: Date | null
  incomingMessages?: Array<{ id: string }>
}

/**
 * Pesanan dianggap SUDAH DIKONFIRMASI bila supplier menjawab siap/sebagian,
 * sudah mengirim, sebagian barang sudah diterima, dikonfirmasi manual
 * (mis. lewat telepon), atau dicatat manual. Sebelum itu penerimaan barang
 * hanya lewat jalur darurat (alasan + foto).
 */
export function sudahDikonfirmasi(order: PesananRingkas) {
  if (order.isManual || order.manualConfirmedAt) return true
  return order.lines.some((l) => l.status === "ACTIVE" && (
    ["READY", "PARTIAL", "SHIPPED"].includes(l.supplierReplyStatus)
    || l.supplierShippedAt != null || l.supplierConfirmedAt != null || Number(l.receivedQuantity ?? 0) > 0))
}

/**
 * Status gabungan satu pesanan dari baris-barisnya. Satu bahan bermasalah
 * cukup membuat pesanan butuh tindakan; pesanan selesai bila tak ada baris aktif.
 */
function statusPesanan(order: PesananRingkas): { kelompok: KelompokPesanan; label: string } {
  const { lines } = order
  const aktif = lines.filter((l) => l.status === "ACTIVE")
  if (aktif.length === 0) {
    const semuaBatal = lines.every((l) => l.status === "CANCELLED")
    return { kelompok: "SELESAI", label: semuaBatal ? "Dibatalkan" : lines.some((l) => l.status === "FULFILLED") ? "Selesai" : "Ditutup" }
  }
  // Balasan yang menunggu keputusan di kotak masuk.
  if (order.incomingMessages?.length) return { kelompok: "PERLU_TINDAKAN", label: "Balasan perlu ditinjau" }
  if (!order.isManual && aktif.some((l) => ["FAILED", "DEAD", "UNCERTAIN"].includes(l.messageStatus))) return { kelompok: "PERLU_TINDAKAN", label: "WA gagal terkirim" }
  if (aktif.some((l) => l.supplierReplyStatus === "NEEDS_REVIEW")) return { kelompok: "PERLU_TINDAKAN", label: "Perlu ditinjau" }
  if (aktif.some((l) => l.supplierReplyStatus === "UNAVAILABLE")) return { kelompok: "PERLU_TINDAKAN", label: "Ada bahan kosong" }
  if (aktif.some((l) => l.responseOverdueAt != null)) return { kelompok: "PERLU_TINDAKAN", label: "Belum dibalas" }
  if (aktif.some((l) => l.supplierReplyStatus === "SHIPPED")) return { kelompok: "PENGIRIMAN", label: "Dalam pengiriman" }
  if (aktif.every((l) => l.supplierReplyStatus === "READY" || l.supplierReplyStatus === "PARTIAL")) {
    return { kelompok: "MENUNGGU", label: aktif.some((l) => l.supplierReplyStatus === "PARTIAL") ? "Disanggupi sebagian" : "Supplier siap" }
  }
  return { kelompok: "MENUNGGU", label: "Menunggu jawaban" }
}

/** Data satu pesanan beserta semua barisnya, untuk kartu pesanan. */
export const pesananInclude = {
  supplier: { select: { id: true, name: true, phone: true } },
  location: { select: { id: true, name: true } },
  lines: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true, itemId: true, status: true, supplierReplyStatus: true, messageStatus: true, lastMessageError: true,
      providerDeliveryStatus: true, readAt: true, deliveredAt: true, responseOverdueAt: true, responseDueAt: true,
      quantity: true, receivedQuantity: true, promisedQuantity: true, shippedQuantity: true, supplierShippedAt: true,
      inputQuantity: true, inputUnit: true, conversionFactor: true, orderCode: true, priority: true,
      supplierLastMessage: true, supplierLastMessageAt: true, reminderCount: true, supplierConfirmedAt: true,
      item: { select: { id: true, name: true, unit: true } },
    },
  },
  incomingMessages: { where: { processingStatus: "NEEDS_REVIEW" }, select: { id: true } },
  _count: { select: { documents: true } },
} satisfies Prisma.PurchaseOrderInclude

export function denganStatus<T extends PesananRingkas>(order: T) {
  return { ...order, ...statusPesanan(order), dikonfirmasi: sudahDikonfirmasi(order) }
}

const purchaseOrderKey = (orderId: string, bagian: number) => `PURCHASE_ORDER:${orderId}:${bagian}`

/** Kode pendek 4 karakter (0-9 A-F), unik per organisasi. */
async function buatKodePendek(tx: Tx, organizationId: string) {
  for (let percobaan = 0; percobaan < 20; percobaan++) {
    const kode = randomBytes(2).toString("hex").toUpperCase()
    const dipakai = await tx.purchaseOrder.findUnique({
      where: { organizationId_shortCode: { organizationId, shortCode: kode } },
      select: { id: true },
    })
    if (!dipakai) return kode
  }
  throw new PesananDitolak("Gagal membuat kode pesanan. Coba lagi.")
}

/**
 * Membuat SATU pesanan ke satu supplier untuk satu gudang, berisi banyak bahan.
 *
 * - Setiap bahan harus masih menjadi kebutuhan beli (aturan yang sama dengan
 *   daftar kebutuhan) dan dipetakan ke supplier ini.
 * - Setiap bahan menjadi satu PurchaseRequest (baris) — aturan per bahan
 *   (penerimaan, eskalasi ke supplier berikutnya) tetap berlaku seperti biasa.
 * - Jumlah memakai satuan beli supplier dari pemetaan (mis. dus = 100 pcs);
 *   stok tetap dicatat dalam satuan dasar.
 * - Satu WA berisi semua bahan (dipecah bila sangat panjang), masuk antrean
 *   permanen di transaksi yang sama.
 */
export async function buatPesananSupplier(tx: Tx, input: {
  organizationId: string
  userId: string
  supplierId: string
  warehouseId: string
  lines: BarisPesananInput[]
  urgency: "NORMAL" | "URGENT"
  notes: string | null
  /// Dipesan di luar Pantau (mis. WA pribadi owner): tidak ada WA, langsung terkonfirmasi.
  manual?: boolean
}) {
  const { organizationId, supplierId, warehouseId } = input
  const manual = input.manual === true
  if (input.lines.length === 0) throw new PesananDitolak("Pilih minimal satu bahan")
  const itemIds = input.lines.map((line) => line.itemId)
  if (new Set(itemIds).size !== itemIds.length) throw new PesananDitolak("Bahan yang sama tercantum dua kali")
  for (const line of input.lines) {
    if (!(line.quantity > 0) || !Number.isFinite(line.quantity)) throw new PesananDitolak("Jumlah setiap bahan harus lebih dari 0")
  }

  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, organizationId, isActive: true },
    select: { id: true, name: true, phone: true, responseTimeoutMinutes: true, urgentResponseTimeoutMinutes: true },
  })
  if (!supplier) throw new PesananDitolak("Supplier tidak aktif atau tidak ditemukan")
  const gudang = await tx.location.findFirst({
    where: { id: warehouseId, organizationId, type: "WAREHOUSE", isActive: true },
    select: { id: true, name: true },
  })
  if (!gudang) throw new PesananDitolak("Gudang tidak valid")

  // Kunci saldo bahan-bahan ini supaya dua pengisian bersamaan tidak membuat
  // pesanan ganda untuk bahan yang sama.
  await tx.$queryRaw`SELECT id FROM "StockBalance" WHERE "organizationId" = ${organizationId}
    AND "locationId" = ${warehouseId} AND "itemId" IN (${Prisma.join(itemIds)}) FOR UPDATE`

  const masihDibutuhkan = manual ? [] : await tx.$queryRaw<Array<{ itemId: string }>>(Prisma.sql`SELECT b."itemId"
    ${warehouseNeedSource(organizationId, null, true)}
    AND b."locationId" = ${warehouseId} AND b."itemId" IN (${Prisma.join(itemIds)})`)
  const dibutuhkan = new Set(masihDibutuhkan.map((row) => row.itemId))

  const pemetaan = await tx.itemSupplier.findMany({
    where: { organizationId, supplierId, locationId: warehouseId, itemId: { in: itemIds } },
    include: { item: { select: { id: true, name: true, unit: true } } },
  })
  const petaBahan = new Map(pemetaan.map((map) => [map.itemId, map]))

  if (manual) {
    // Pesanan manual boleh untuk bahan yang belum dipetakan; satuan beli
    // dipakai bila pemetaannya ada.
    const items = await tx.inventoryItem.findMany({
      where: { organizationId, id: { in: itemIds }, isTrackable: true },
      select: { id: true, name: true, unit: true },
    })
    for (const itemId of itemIds) {
      const item = items.find((row) => row.id === itemId)
      if (!item) throw new PesananDitolak("Ada bahan yang tidak valid")
      if (!petaBahan.has(itemId)) {
        petaBahan.set(itemId, { itemId, priority: 1, supplierItemName: null, purchaseUnit: null, purchaseUnitSize: null, item } as unknown as (typeof pemetaan)[number])
      }
      const aktif = await tx.purchaseRequest.findFirst({ where: { organizationId, itemId, locationId: warehouseId, status: "ACTIVE" }, select: { id: true } })
      if (aktif) throw new PesananDitolak(`${item.name} masih punya pesanan aktif di gudang ini. Selesaikan atau batalkan dulu.`)
    }
  }

  for (const itemId of itemIds) {
    const map = petaBahan.get(itemId)
    if (!map) throw new PesananDitolak("Ada bahan yang belum dipetakan ke supplier ini")
    if (!manual && !dibutuhkan.has(itemId)) {
      throw new PesananDitolak(`${map.item.name} sudah tidak perlu dibeli atau masih punya pesanan aktif. Muat ulang daftar.`)
    }
  }

  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
  const shortCode = await buatKodePendek(tx, organizationId)
  const responseTimeoutMinutes = input.urgency === "URGENT"
    ? supplier.urgentResponseTimeoutMinutes
    : supplier.responseTimeoutMinutes

  const baris = input.lines.map((line) => {
    const map = petaBahan.get(line.itemId)!
    const isi = map.purchaseUnit && map.purchaseUnitSize != null && Number(map.purchaseUnitSize) > 0
      ? Number(map.purchaseUnitSize) : null
    const satuan = isi != null ? map.purchaseUnit! : map.item.unit
    const faktor = isi ?? 1
    return {
      map,
      inputQuantity: line.quantity,
      inputUnit: satuan,
      conversionFactor: faktor,
      baseQuantity: Math.round(line.quantity * faktor * 1000) / 1000,
      namaDiWa: map.supplierItemName?.trim() || map.item.name,
    }
  })

  const pesan = manual ? [[
    `Dicatat manual — dipesan di luar Pantau ke ${supplier.name}:`,
    ...baris.map((b) => `• ${b.namaDiWa} ${b.inputQuantity} ${b.inputUnit}`),
  ].join("\n")] : formatPurchaseOrderMessages({
    supplierName: supplier.name,
    organizationName: organization?.name ?? "Pantau",
    destinationName: gudang.name,
    shortCode,
    lines: baris.map((b) => ({ name: b.namaDiWa, quantity: b.inputQuantity, unit: b.inputUnit })),
    notes: input.notes,
  })

  const order = await tx.purchaseOrder.create({
    data: {
      organizationId, supplierId, locationId: warehouseId, shortCode,
      message: pesan.join("\n\n"), urgency: input.urgency, notes: input.notes, createdById: input.userId,
      ...(manual ? { isManual: true, manualConfirmedAt: new Date(), manualConfirmedById: input.userId, manualConfirmNote: "Dicatat manual" } : {}),
    },
  })

  const dateCode = new Date().toISOString().slice(2, 10).replaceAll("-", "")
  for (const b of baris) {
    const line = await tx.purchaseRequest.create({
      data: {
        organizationId, itemId: b.map.itemId, locationId: warehouseId, supplierId,
        priority: b.map.priority,
        quantity: b.baseQuantity,
        // Kode per baris tetap ada untuk riwayat dan format balasan lama.
        orderCode: `PO-${dateCode}-${randomBytes(3).toString("hex").toUpperCase()}`,
        message: order.message,
        status: "ACTIVE",
        // Pesanan manual: tidak ada WA, supplier dianggap sudah menyanggupi.
        messageStatus: manual ? "SENT" : supplier.phone?.trim() ? "PENDING" : "FAILED",
        lastMessageError: manual || supplier.phone?.trim() ? null : "Nomor WhatsApp supplier belum diisi",
        ...(manual ? { supplierReplyStatus: "READY" as const, promisedQuantity: b.baseQuantity, supplierConfirmedAt: new Date() } : {}),
        urgency: input.urgency,
        responseTimeoutMinutes,
        inputQuantity: b.inputQuantity,
        inputUnit: b.inputUnit,
        conversionFactor: b.conversionFactor,
        baseUnit: b.map.item.unit,
        purchaseOrderId: order.id,
      },
    })
    await tx.purchaseRequest.update({ where: { id: line.id }, data: { procurementChainId: line.id } })
  }

  // Peringatan "supplier belum diatur" untuk bahan-bahan ini sudah tidak berlaku.
  await tx.alert.updateMany({
    where: {
      organizationId, type: "STOCK_SHORTAGE", locationId: warehouseId, itemId: { in: itemIds }, isResolved: false,
      OR: [{ title: { startsWith: "Supplier belum diatur" } }, { title: { startsWith: "Semua supplier aktif gagal" } }],
    },
    data: { isResolved: true, resolvedAt: new Date() },
  })

  const nomor = manual ? null : supplier.phone?.trim()
  if (nomor) {
    for (const [index, isi] of pesan.entries()) {
      await enqueueWhatsApp(tx, {
        organizationId,
        aggregateType: "PURCHASE_ORDER",
        aggregateId: order.id,
        targetPhone: nomor,
        message: isi,
        idempotencyKey: purchaseOrderKey(order.id, index + 1),
      })
    }
  }

  await tx.auditLog.create({ data: {
    organizationId, userId: input.userId, action: manual ? "CREATE_MANUAL_PURCHASE_ORDER" : "CREATE_PURCHASE_ORDER", entity: "PurchaseOrder", entityId: order.id,
    after: {
      shortCode, supplier: supplier.name, gudang: gudang.name, urgency: input.urgency, notes: input.notes,
      bahan: baris.map((b) => ({ itemId: b.map.itemId, jumlah: b.inputQuantity, satuan: b.inputUnit, dasar: b.baseQuantity })),
    },
  } })
  return { order, shortCode, terkirim: Boolean(nomor) }
}

/** Dipanggil setelah transaksi selesai, supaya WA segera diproses. */
export function jadwalkanPengirimanPesanan() {
  scheduleOutboxDelivery()
}
