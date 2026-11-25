import "server-only"

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { consumeStock, StockError } from "@/lib/stock-ledger"
import { saveTransferNotification } from "@/lib/transfer-notification"
import { consumeReservations, extendReservations, lockAndReadStock, releaseReservations, reservationDeadline, reserveForTransferItem } from "@/lib/stock-reservation"

export type PelakuTransfer = { id: string; organizationId: string }

/**
 * Alert transfer milik startup 4-3. Lokasi tujuan perlu tahu barang sedang
 * dikirim — dialah yang harus mengonfirmasi penerimaan. Penolakan/pembatalan
 * pun dicatat supaya pemohon tidak menunggu kiriman yang tidak akan datang.
 * locationId sengaja kosong: transfer menyangkut dua lokasi dan keduanya
 * berhak melihat.
 */
async function buatAlertTransfer(
  tx: Prisma.TransactionClient,
  organizationId: string,
  transferId: string,
  jenis: "SENT" | "REJECTED" | "CANCELLED",
  notes: string | null,
) {
  const transfer = await tx.stockTransfer.findFirstOrThrow({
    where: { id: transferId, organizationId },
    select: {
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
      _count: { select: { items: true } },
    },
  })
  const jumlah = transfer._count.items
  const rute = `dari ${transfer.fromLocation.name} ke ${transfer.toLocation.name}`
  const catatan = notes ? ` Catatan: ${notes}` : ""
  await saveTransferNotification(tx, jenis === "SENT"
      ? {
          organizationId, type: "TRANSFER_SENT", severity: "INFO", title: "Transfer Dikirim",
          message: `${jumlah} jenis item dikirim ${rute}. Konfirmasi penerimaan setelah barang tiba.`,
          referenceId: transferId,
        }
      : {
          organizationId, type: "TRANSFER_REJECTED", severity: "WARNING",
          title: jenis === "REJECTED" ? "Request Transfer Ditolak" : "Transfer Dibatalkan",
          message: jenis === "REJECTED"
            ? `Permintaan transfer ${jumlah} jenis item ${rute} ditolak. Stok tidak berpindah.${catatan}`
            : `Transfer ${jumlah} jenis item ${rute} dibatalkan sebelum dikirim. Stok tidak berpindah.${catatan}`,
          referenceId: transferId,
        },
  )
}

/**
 * Menyetujui permintaan outlet: stok gudang DIRESERVASI, belum berkurang.
 *
 * `quantities` berisi jumlah yang disetujui per baris transfer. Kalau stok
 * tersedia kurang, permintaan ditolak dengan angka maksimum yang bisa
 * disetujui — bukan dikecilkan diam-diam, karena keputusan mengirim sebagian
 * beserta alasannya adalah milik penanggung jawab gudang.
 */
export async function approveTransfer(
  user: PelakuTransfer,
  transferId: string,
  quantities: Map<string, number>,
  notes: string | null,
) {
  return prisma.$transaction((tx) => approveTransferInTx(tx, user, transferId, quantities, notes))
}

/**
 * Isi persetujuan di dalam transaksi milik pemanggil. Dipakai saat pihak
 * gudang mengisi pengiriman dari tautan WhatsApp: transfer dibuat dan langsung
 * disetujui dalam satu transaksi, jadi tidak pernah tersisa setengah jadi.
 */
export async function approveTransferInTx(
  tx: Prisma.TransactionClient,
  user: PelakuTransfer,
  transferId: string,
  quantities: Map<string, number>,
  notes: string | null,
) {
  const transfer = await tx.stockTransfer.findFirstOrThrow({
    where: { id: transferId, organizationId: user.organizationId },
    include: { items: { include: { item: { select: { name: true, unit: true } } } } },
  })

  const claimed = await tx.stockTransfer.updateMany({
    where: { id: transferId, organizationId: user.organizationId, status: "PENDING" },
    data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), approvalNotes: notes },
  })
  if (claimed.count !== 1) throw new StockError("Transfer sudah direview")

  const expiresAt = await reservationDeadline(tx, user.organizationId)
  const hasil: Array<{ itemId: string; quantity: number }> = []
  // Diurutkan agar dua persetujuan yang berjalan bersamaan mengunci barisnya
  // dengan urutan sama dan tidak saling menunggu selamanya.
  for (const item of [...transfer.items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
    const quantity = quantities.get(item.id) ?? Number(item.quantity)
    const stok = await lockAndReadStock(tx, user.organizationId, item.itemId, transfer.fromLocationId)
    await reserveForTransferItem(tx, {
      organizationId: user.organizationId,
      locationId: transfer.fromLocationId,
      itemId: item.itemId,
      stockTransferId: transferId,
      stockTransferItemId: item.id,
      quantity,
      available: stok.available,
      itemName: item.item.name,
      unit: item.item.unit,
      expiresAt,
    })
    if (transfer.outletRequested) {
      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: { quantity, requestedQuantity: item.requestedQuantity ?? item.quantity },
      })
    }
    hasil.push({ itemId: item.itemId, quantity })
  }

  await tx.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "APPROVE_TRANSFER",
      entity: "StockTransfer",
      entityId: transferId,
      after: { notes, items: hasil },
    },
  })
  return hasil
}

/** Menolak permintaan yang belum disetujui. Belum ada reservasi untuk dilepas. */
// Di startup 4-3 alasan penolakan boleh kosong, jadi notes boleh null.
export async function rejectTransfer(user: PelakuTransfer, transferId: string, notes: string | null) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.stockTransfer.updateMany({
      where: { id: transferId, organizationId: user.organizationId, status: "PENDING" },
      data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date(), approvalNotes: notes },
    })
    if (claimed.count !== 1) throw new StockError("Transfer sudah direview")
    await buatAlertTransfer(tx, user.organizationId, transferId, "REJECTED", notes)
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId, userId: user.id,
        action: "REJECT_TRANSFER_REQUEST", entity: "StockTransfer", entityId: transferId,
        after: { notes },
      },
    })
  })
}

/**
 * Membatalkan transfer yang sudah disetujui tetapi belum berangkat.
 * Stok fisik tidak pernah berubah, jadi yang dikembalikan hanya alokasinya.
 */
export async function cancelApprovedTransfer(user: PelakuTransfer, transferId: string, notes: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.stockTransfer.updateMany({
      where: { id: transferId, organizationId: user.organizationId, status: "APPROVED" },
      data: { status: "REJECTED", approvalNotes: notes },
    })
    if (claimed.count !== 1) {
      throw new StockError("Hanya transfer yang sudah disetujui dan belum dikirim yang dapat dibatalkan")
    }
    const dilepas = await releaseReservations(tx, transferId)
    await buatAlertTransfer(tx, user.organizationId, transferId, "CANCELLED", notes)
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId, userId: user.id,
        action: "CANCEL_TRANSFER", entity: "StockTransfer", entityId: transferId,
        after: { notes, reservasiDilepas: dilepas },
      },
    })
    return dilepas
  })
}

/**
 * Memberangkatkan transfer yang sudah disetujui.
 *
 * Inilah satu-satunya titik stok gudang benar-benar berkurang.
 */
export async function dispatchTransfer(user: PelakuTransfer, transferId: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirstOrThrow({
      where: { id: transferId, organizationId: user.organizationId },
      include: { items: true, toLocation: { select: { name: true } } },
    })

    // Klaim dulu: dua permintaan pengiriman bersamaan hanya menyisakan satu
    // yang berhasil, sehingga stok tidak berkurang dua kali.
    const claimed = await tx.stockTransfer.updateMany({
      where: { id: transferId, organizationId: user.organizationId, status: "APPROVED" },
      data: { status: "SENT", sentAt: new Date() },
    })
    if (claimed.count !== 1) throw new StockError("Transfer sudah dikirim atau statusnya berubah")

    // Reservasi ditutup lebih dahulu supaya pengurangan stok di bawah ini tidak
    // dianggap melanggar reservasinya sendiri.
    await consumeReservations(tx, transferId)

    for (const item of [...transfer.items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
      const quantity = Number(item.quantity)
      await tx.$queryRaw`
        SELECT id FROM "StockBalance"
        WHERE "organizationId" = ${user.organizationId} AND "itemId" = ${item.itemId}
          AND "locationId" = ${transfer.fromLocationId}
        FOR UPDATE
      `
      const consumed = await consumeStock(tx, {
        organizationId: user.organizationId,
        itemId: item.itemId,
        locationId: transfer.fromLocationId,
        type: "TRANSFER_OUT",
        quantity,
        note: `Transfer ke ${transfer.toLocation.name}`,
        referenceId: transferId,
        createdById: user.id,
      })
      await tx.stockTransferBatchAllocation.createMany({
        data: consumed.map((batch) => ({
          transferItemId: item.id,
          sourceBatchId: batch.batchId,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          costPrice: batch.costPrice,
          quantity: batch.quantity,
        })),
      })
    }

    await buatAlertTransfer(tx, user.organizationId, transferId, "SENT", null)
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId, userId: user.id,
        action: "DISPATCH_TRANSFER", entity: "StockTransfer", entityId: transferId,
        after: { items: transfer.items.map((item) => ({ itemId: item.itemId, quantity: Number(item.quantity) })) },
      },
    })
  })
}

/**
 * Memperpanjang tenggat reservasi transfer yang belum dikirim.
 *
 * Dipakai saat pengiriman tertunda karena alasan yang sah — bukan untuk
 * membiarkan stok terkunci tanpa batas, karena setiap perpanjangan tercatat.
 */
export async function extendTransferReservation(
  user: PelakuTransfer,
  transferId: string,
  notes: string,
) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirstOrThrow({
      where: { id: transferId, organizationId: user.organizationId },
      select: { status: true },
    })
    if (transfer.status !== "APPROVED") {
      throw new StockError("Hanya transfer yang sudah disetujui dan belum dikirim yang dapat diperpanjang")
    }
    const expiresAt = await reservationDeadline(tx, user.organizationId)
    const diperpanjang = await extendReservations(tx, user.organizationId, transferId, expiresAt)
    if (diperpanjang === 0) throw new StockError("Tidak ada reservasi aktif untuk transfer ini")

    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId, userId: user.id,
        action: "EXTEND_TRANSFER_RESERVATION", entity: "StockTransfer", entityId: transferId,
        after: { notes, expiresAt, jumlahReservasi: diperpanjang },
      },
    })
    return { expiresAt, diperpanjang }
  })
}

/**
 * Melanjutkan sisa kebutuhan outlet setelah stok gudang bertambah.
 *
 * Inilah yang membuat outlet tidak perlu mengisi jumlah untuk kedua kalinya.
 * Outlet meminta 10, semuanya tiba rusak, sisa kebutuhan tetap 10 — angka itu
 * dibawa sistem sampai selesai, bukan dikembalikan menjadi formulir kosong.
 *
 * Seluruhnya satu transaksi, dan `sourceOutstandingItemId` bersifat unik,
 * sehingga muat ulang halaman atau dua Barang Masuk yang berbarengan tidak
 * mungkin melahirkan dua transfer lanjutan untuk sisa yang sama.
 *
 * Yang dilanjutkan didahulukan yang paling lama menunggu — urutan alokasi
 * memang tidak harus sama dengan urutan tampilan.
 */
export async function continueOutstandingNeeds(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; warehouseId: string; itemId: string; userId: string; outletId?: string },
) {
  // Hanya buat pengiriman lanjutan sebesar stok yang benar-benar tersedia.
  // Dengan begitu satu penerimaan supplier tidak dapat membuat beberapa
  // transfer PENDING yang totalnya melebihi stok gudang.
  const stock = await lockAndReadStock(tx, input.organizationId, input.itemId, input.warehouseId)
  let tersedia = Math.max(0, stock.available)
  if (tersedia <= 0) return []

  const antre = input.outletId
    ? await tx.$queryRaw<Array<{ id: string }>>`
      SELECT ti."id" FROM "StockTransferItem" ti
      JOIN "StockTransfer" t ON t."id" = ti."transferId"
      WHERE t."organizationId" = ${input.organizationId}
        AND t."fromLocationId" = ${input.warehouseId}
        AND t."toLocationId" = ${input.outletId}
        AND t."status" = 'RECEIVED'
        AND ti."itemId" = ${input.itemId}
        AND ti."outstandingQty" > 0
      ORDER BY t."createdAt" ASC
      FOR UPDATE OF ti
    `
    : await tx.$queryRaw<Array<{ id: string }>>`
      SELECT ti."id" FROM "StockTransferItem" ti
      JOIN "StockTransfer" t ON t."id" = ti."transferId"
      WHERE t."organizationId" = ${input.organizationId}
        AND t."fromLocationId" = ${input.warehouseId}
        AND t."status" = 'RECEIVED'
        AND ti."itemId" = ${input.itemId}
        AND ti."outstandingQty" > 0
      ORDER BY t."createdAt" ASC
      FOR UPDATE OF ti
    `

  const dibuat: Array<{ transferId: string; quantity: number }> = []
  for (const baris of antre) {
    if (tersedia <= 0) break
    const lama = await tx.stockTransferItem.findUnique({
      where: { id: baris.id },
      include: { transfer: { select: { toLocationId: true, fromLocationId: true, notes: true } }, continuedBy: { select: { id: true } } },
    })
    // Sudah pernah dilanjutkan, atau sisanya sudah nol karena proses lain.
    if (!lama || lama.continuedBy || Number(lama.outstandingQty ?? 0) <= 0) continue

    const aktif = await tx.stockTransfer.findFirst({
      where: {
        organizationId: input.organizationId,
        fromLocationId: input.warehouseId,
        toLocationId: lama.transfer.toLocationId,
        status: { in: ["PENDING", "APPROVED", "SENT"] },
        items: { some: { itemId: input.itemId } },
      },
      select: { id: true },
    })
    if (aktif) continue

    const sisa = Number(lama.outstandingQty)
    const jumlahKirim = Math.min(sisa, tersedia)
    if (jumlahKirim <= 0) break
    const lanjutan = await tx.stockTransfer.create({
      data: {
        organizationId: input.organizationId,
        fromLocationId: lama.transfer.fromLocationId,
        toLocationId: lama.transfer.toLocationId,
        status: "PENDING",
        autoReplenishment: true,
        outletRequested: true,
        createdById: input.userId,
        notes: "Lanjutan sisa kebutuhan outlet yang belum terpenuhi",
        items: {
          create: {
            itemId: input.itemId,
            quantity: jumlahKirim,
            requestedQuantity: sisa,
            sourceOutstandingItemId: lama.id,
          },
        },
      },
      select: { id: true },
    })

    // Sisa lama dinolkan di transaksi yang sama, supaya kebutuhannya tidak
    // pernah terhitung dua kali: sekali sebagai sisa, sekali sebagai permintaan.
    await tx.stockTransferItem.update({ where: { id: lama.id }, data: { outstandingQty: 0 } })

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "CONTINUE_OUTSTANDING_NEED",
        entity: "StockTransfer",
        entityId: lanjutan.id,
        before: { transferItemLama: lama.id, sisaKebutuhan: sisa },
        after: { transferLanjutan: lanjutan.id, jumlahKirim, sisaKebutuhan: sisa, status: "PENDING" },
      },
    })
    dibuat.push({ transferId: lanjutan.id, quantity: jumlahKirim })
    tersedia = Math.round((tersedia - jumlahKirim) * 1000) / 1000
  }
  return dibuat
}
