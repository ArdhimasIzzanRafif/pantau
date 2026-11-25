import "server-only"

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { enqueueWhatsApp, retryAggregateDelivery, scheduleOutboxDelivery } from "@/lib/whatsapp-outbox"
import { maybeCreatePurchaseRequest } from "@/lib/purchase-requests"
import { ownerPhone } from "@/lib/whatsapp"

type Tx = Prisma.TransactionClient

function applicationUrl() {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")
}

/**
 * Menulis pesan pemberitahuan gudang ke antrean, di dalam transaksi yang sama
 * dengan permintaan outletnya. Isi pesan disalin saat itu juga supaya yang
 * terkirim persis sama dengan yang disetujui outlet.
 */
export async function enqueueWarehouseNotification(tx: Tx, id: string, organizationId: string) {

  const transfer = await tx.stockTransfer.findFirst({
    where: { id, organizationId, autoReplenishment: true, outletRequested: true, status: "PENDING" },
    include: {
      organization: { select: { name: true, ownerPhone: true } },
      fromLocation: { select: { name: true, whatsappPhone: true } },
      toLocation: { select: { name: true } },
      items: { include: { item: { select: { name: true, unit: true } } } },
    },
  })
  if (!transfer) return false

  const warehousePhone = transfer.fromLocation.whatsappPhone?.trim()
    || transfer.organization.ownerPhone?.trim()
    || ownerPhone()
  if (!warehousePhone) {
    await tx.stockTransfer.update({
      where: { id },
      data: { notificationStatus: "FAILED", notificationError: "Nomor WhatsApp gudang dan owner belum dikonfigurasi" },
    })
    return false
  }

  const itemLines = transfer.items
    .map((entry) => `- ${entry.item.name}: ${Number(entry.quantity)} ${entry.item.unit}`)
    .join("\n")
  const message =
    `Permintaan pengisian stok ${transfer.organization.name}\n\n` +
    `Outlet: ${transfer.toLocation.name}\n` +
    `Gudang pemasok: ${transfer.fromLocation.name}\n` +
    `${itemLines}\n\n` +
    `Catatan outlet: ${transfer.notes || "—"}\n\n` +
    `Form transfer sudah disiapkan. Periksa stok dan konfirmasi pengiriman melalui tautan berikut:\n` +
    `${applicationUrl()}/dashboard/transfer?transferId=${transfer.id}`

  await enqueueWhatsApp(tx, {
    organizationId,
    aggregateType: "STOCK_TRANSFER",
    aggregateId: id,
    targetPhone: warehousePhone,
    message,
    idempotencyKey: `STOCK_TRANSFER:${id}:WAREHOUSE_NOTIFICATION`,
  })
  return true
}

/** Mengantre ulang pemberitahuan gudang atas permintaan pengguna. */
export async function retryWarehouseNotification(id: string, organizationId: string) {
  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, organizationId, autoReplenishment: true, outletRequested: true, status: "PENDING" },
    select: { id: true },
  })
  if (!transfer) return false

  const queued = await prisma.whatsAppOutbox.findFirst({
    where: { organizationId, aggregateType: "STOCK_TRANSFER", aggregateId: id },
    select: { id: true },
  })
  if (queued) {
    const retried = await retryAggregateDelivery(organizationId, "STOCK_TRANSFER", id)
    if (retried) scheduleOutboxDelivery()
    return retried
  }

  // Belum punya baris antrean sama sekali: dulu gagal sebelum sempat mengantre
  // karena nomor WhatsApp gudang masih kosong. Sekarang nomornya ada.
  const created = await prisma.$transaction((tx) => enqueueWarehouseNotification(tx, id, organizationId))
  if (created) scheduleOutboxDelivery()
  return created
}

export async function maybeCreateReplenishment(tx: Tx, organizationId: string, itemId: string, locationId: string) {
  const location = await tx.location.findFirst({
    where: { id: locationId, organizationId }, select: { type: true },
  })
  // Outlet receives a low-stock alert first. Its staff supplies the quantity
  // through /api/replenishment; no estimated transfer or supplier order here.
  if (!location || location.type === "OUTLET") return null
  return maybeCreatePurchaseRequest(tx, organizationId, itemId, locationId)
}
