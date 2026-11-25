import "server-only"

import type { Prisma } from "@prisma/client"
import { StockError } from "@/lib/stock-ledger"

type Tx = Prisma.TransactionClient

/**
 * Stok yang sudah dijanjikan ke transfer lain dan belum berangkat.
 *
 * Hanya reservasi ACTIVE yang dihitung: yang CONSUMED sudah menjadi pengurangan
 * stok fisik, yang RELEASED sudah dikembalikan ke stok tersedia.
 */
export async function reservedQuantity(
  tx: Tx,
  organizationId: string,
  itemId: string,
  locationId: string,
) {
  const total = await tx.stockReservation.aggregate({
    where: { organizationId, itemId, locationId, status: "ACTIVE" },
    _sum: { quantity: true },
  })
  return Number(total._sum.quantity ?? 0)
}

/**
 * Mengunci saldo gudang lalu membaca stok fisik, yang direservasi, dan yang
 * benar-benar masih bisa dijanjikan.
 *
 * Penguncian baris membuat dua persetujuan yang berjalan bersamaan berbaris:
 * yang kedua baru membaca setelah yang pertama selesai, sehingga tidak mungkin
 * keduanya melihat stok tersedia yang sama.
 */
export async function lockAndReadStock(
  tx: Tx,
  organizationId: string,
  itemId: string,
  locationId: string,
) {
  await tx.$queryRaw`
    SELECT id FROM "StockBalance"
    WHERE "organizationId" = ${organizationId} AND "itemId" = ${itemId} AND "locationId" = ${locationId}
    FOR UPDATE
  `
  const balance = await tx.stockBalance.findUnique({
    where: { itemId_locationId: { itemId, locationId } },
    select: { quantity: true },
  })
  const physical = Number(balance?.quantity ?? 0)
  const reserved = await reservedQuantity(tx, organizationId, itemId, locationId)
  return { physical, reserved, available: Math.round((physical - reserved) * 1000) / 1000 }
}

/**
 * Memesan stok untuk satu baris transfer yang disetujui.
 *
 * Stok fisik TIDAK berubah di sini — yang berkurang hanya stok tersedia.
 * Pemanggil wajib sudah mengunci saldo lewat lockAndReadStock.
 */
export async function reserveForTransferItem(
  tx: Tx,
  input: {
    organizationId: string
    locationId: string
    itemId: string
    stockTransferId: string
    stockTransferItemId: string
    quantity: number
    available: number
    itemName: string
    unit: string
    expiresAt: Date
  },
) {
  if (input.quantity <= 0) throw new StockError("Jumlah yang disetujui harus lebih dari 0")
  if (input.quantity > input.available) {
    // Jangan diam-diam dikecilkan. Penanggung jawab gudang yang memutuskan
    // apakah mau mengirim sebagian, dan wajib menuliskan alasannya.
    throw new StockError(
      `Stok tersedia hanya ${format(input.available)} ${input.unit}. `
      + `Jumlah maksimal yang dapat disetujui adalah ${format(input.available)} ${input.unit}.`,
    )
  }

  return tx.stockReservation.create({
    data: {
      organizationId: input.organizationId,
      locationId: input.locationId,
      itemId: input.itemId,
      stockTransferId: input.stockTransferId,
      stockTransferItemId: input.stockTransferItemId,
      quantity: input.quantity,
      expiresAt: input.expiresAt,
    },
  })
}

/** Berapa lama organisasi ini boleh menahan stok sebelum ditandai terlambat. */
export async function reservationDeadline(tx: Tx, organizationId: string, from = new Date()) {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { reservationHoldHours: true },
  })
  const hours = org?.reservationHoldHours ?? 48
  return new Date(from.getTime() + hours * 60 * 60_000)
}

/**
 * Memperpanjang batas waktu reservasi atas keputusan pengguna.
 *
 * Bukan pelepasan: stoknya tetap dijanjikan ke transfer yang sama, hanya
 * tenggatnya digeser karena pengirimannya memang tertunda.
 */
export async function extendReservations(
  tx: Tx,
  organizationId: string,
  stockTransferId: string,
  expiresAt: Date,
) {
  const changed = await tx.stockReservation.updateMany({
    where: { organizationId, stockTransferId, status: "ACTIVE" },
    data: { expiresAt },
  })
  return changed.count
}

/** Reservasi dipakai: barangnya berangkat dan stok fisik berkurang. */
export async function consumeReservations(tx: Tx, stockTransferId: string) {
  const changed = await tx.stockReservation.updateMany({
    where: { stockTransferId, status: "ACTIVE" },
    data: { status: "CONSUMED", consumedAt: new Date() },
  })
  return changed.count
}

/** Reservasi dilepas: transfer ditolak atau dibatalkan, stok kembali tersedia. */
export async function releaseReservations(tx: Tx, stockTransferId: string) {
  const changed = await tx.stockReservation.updateMany({
    where: { stockTransferId, status: "ACTIVE" },
    data: { status: "RELEASED", releasedAt: new Date() },
  })
  return changed.count
}

function format(value: number) {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 3 })
}
