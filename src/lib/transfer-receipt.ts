import "server-only"

import { prisma } from "@/lib/db"
import { addStock, recordVariance } from "@/lib/stock-ledger"
import { continueOutstandingNeeds } from "@/lib/transfer-flow"
import { saveTransferNotification } from "@/lib/transfer-notification"

type ReceivedInput = { id?: unknown; receivedQty?: unknown; damagedQty?: unknown }
type ReceivedCondition = { receivedQty: number; damagedQty: number }

export type PenerimaTransfer = { id: string; organizationId: string; role: string }

/// Penolakan yang punya pesan untuk pengguna, bukan kesalahan server.
export class PenerimaanTransferDitolak extends Error {}

/**
 * Mengonfirmasi penerimaan transfer di outlet.
 *
 * Stok gudang TIDAK disentuh di sini — sudah berkurang saat barang dikirim.
 * Hanya barang baik yang menambah stok outlet; rusak dan tidak tiba dicatat
 * sebagai penyesuaian dan selisih.
 */
export async function confirmTransferReceipt(
  user: PenerimaTransfer,
  id: string,
  body: Record<string, unknown>,
  canAccess: (locationId: string) => Promise<boolean>,
) {
  const action = body.action === "receive" ? "receive" : body.action === "reject" ? "reject" : null
  if (!action) throw new PenerimaanTransferDitolak("Aksi konfirmasi tidak valid")
  const receiptNotes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null
  const imageUrl = typeof body.imageUrl === "string" && body.imageUrl.trim() ? body.imageUrl.trim() : null
  const varianceResolution = body.varianceResolution === "RETURN_TO_SOURCE" ? "RETURN_TO_SOURCE" : "RECORD_LOSS"

  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      items: {
        include: {
          item: { select: { name: true, costPrice: true } },
          batchAllocations: { orderBy: [{ expiryDate: "asc" }, { id: "asc" }] },
        },
      },
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
    },
  })
  if (!transfer) throw new PenerimaanTransferDitolak("Transfer tidak ditemukan")
  if (transfer.status !== "SENT") throw new PenerimaanTransferDitolak("Transfer belum dikirim atau sudah diproses")
  const [canAccessSource, canAccessDestination] = await Promise.all([
    canAccess(transfer.fromLocationId),
    canAccess(transfer.toLocationId),
  ])
  if (!canAccessSource && !canAccessDestination) throw new PenerimaanTransferDitolak("Tidak ada akses ke lokasi transfer")
  if (transfer.outletRequested && !canAccessDestination) throw new PenerimaanTransferDitolak("Penerimaan harus dikonfirmasi petugas outlet tujuan")

  const receivedMap = new Map<string, ReceivedCondition>()
  if (action === "receive" && transfer.outletRequested && (!Array.isArray(body.receivedItems) || body.receivedItems.length !== transfer.items.length)) {
    throw new PenerimaanTransferDitolak("Konfirmasi jumlah diterima untuk setiap bahan")
  }
  if (Array.isArray(body.receivedItems)) {
    for (const raw of body.receivedItems) {
      const received = raw as ReceivedInput
      const itemId = typeof received.id === "string" ? received.id : ""
      if (transfer.outletRequested && (!transfer.items.some((item) => item.id === itemId) || receivedMap.has(itemId))) throw new PenerimaanTransferDitolak("Bahan penerimaan tidak valid atau duplikat")
      const receivedQtyInput = Number(received.receivedQty)
      const damagedQtyInput = Number(received.damagedQty ?? 0)
      if (!itemId || !Number.isFinite(receivedQtyInput) || receivedQtyInput < 0 || !Number.isFinite(damagedQtyInput) || damagedQtyInput < 0) {
        throw new PenerimaanTransferDitolak("Jumlah barang baik/rusak tidak valid")
      }
      const receivedQty = Math.round(receivedQtyInput * 1000) / 1000
      const damagedQty = Math.round(damagedQtyInput * 1000) / 1000
      receivedMap.set(itemId, { receivedQty, damagedQty })
    }
  }

  let hasConditionIssue = false
  let hasMissingInRequest = false
  for (const item of transfer.items) {
    const condition = receivedMap.get(item.id) ?? { receivedQty: Number(item.quantity), damagedQty: 0 }
    if (condition.receivedQty + condition.damagedQty > Number(item.quantity)) {
      throw new PenerimaanTransferDitolak(`Jumlah baik dan rusak ${item.item.name} melebihi jumlah kirim`)
    }
    const missingQty = Math.round((Number(item.quantity) - condition.receivedQty - condition.damagedQty) * 1000) / 1000
    if (condition.damagedQty > 0 || missingQty > 0) hasConditionIssue = true
    if (missingQty > 0) hasMissingInRequest = true
  }
  if (action === "receive" && hasConditionIssue && !receiptNotes) {
    throw new PenerimaanTransferDitolak("Catatan wajib diisi jika ada barang rusak atau tidak tiba")
  }

  const discrepancies: string[] = []
  let hasDamagedItems = false
  let hasMissingItems = false

  try {
    await prisma.$transaction(async (tx) => {
    const claimed = await tx.stockTransfer.updateMany({
      where: { id, organizationId: user.organizationId, status: "SENT" },
      data: {
        status: action === "receive" ? "RECEIVED" : "REJECTED",
        receivedAt: action === "receive" ? new Date() : null,
        confirmedById: user.id,
        receiptImageUrl: imageUrl,
        receiptNotes,
        varianceResolution: action === "reject"
          ? "RETURN_TO_SOURCE"
          : hasMissingInRequest
            ? varianceResolution
            : null,
      },
    })
    if (claimed.count !== 1) throw new Error("ALREADY_PROCESSED")

    for (const item of transfer.items) {
      const sentQty = Number(item.quantity)
      const condition = receivedMap.get(item.id) ?? { receivedQty: sentQty, damagedQty: 0 }
      const receivedQty = action === "receive" ? condition.receivedQty : 0
      const damagedQty = action === "receive" ? condition.damagedQty : 0
      const missingQty = Math.round((sentQty - receivedQty - damagedQty) * 1000) / 1000

      // Sisa kebutuhan dihitung dari yang DIMINTA outlet, bukan dari yang
      // dikirim gudang. Diminta 18, diterima baik 15 → sisa 3 tetap tercatat
      // walau transfernya sendiri sudah selesai.
      const dimintaOutlet = Number(item.requestedQuantity ?? item.quantity)
      const outstandingQty = transfer.outletRequested && action === "receive"
        ? Math.max(0, Math.round((dimintaOutlet - receivedQty) * 1000) / 1000)
        : null

      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: {
          receivedQty: action === "receive" ? receivedQty : 0,
          damagedQty: action === "receive" ? damagedQty : 0,
          outstandingQty,
        },
      })

      const allocations = item.batchAllocations.length > 0
        ? item.batchAllocations.map((allocation) => ({
            sourceBatchId: allocation.sourceBatchId,
            batchNumber: allocation.batchNumber,
            expiryDate: allocation.expiryDate,
            costPrice: allocation.costPrice == null ? null : Number(allocation.costPrice),
            quantity: Number(allocation.quantity),
          }))
        : [{
            sourceBatchId: null,
            batchNumber: null,
            expiryDate: null,
            costPrice: null,
            quantity: sentQty,
          }]

      let remainingGood = receivedQty
      let remainingDamaged = damagedQty
      let damagedValue = 0
      let damagedCostedQty = 0
      const unreceived: typeof allocations = []
      for (const allocation of allocations) {
        const goodFromAllocation = Math.min(allocation.quantity, remainingGood)
        if (goodFromAllocation > 0) {
          await addStock(tx, {
            organizationId: user.organizationId,
            itemId: item.itemId,
            locationId: transfer.toLocationId,
            type: "TRANSFER_IN",
            quantity: goodFromAllocation,
            note: `Transfer dari ${transfer.fromLocation.name}`,
            referenceId: id,
            createdById: user.id,
            batchNumber: allocation.batchNumber,
            expiryDate: allocation.expiryDate,
            costPrice: allocation.costPrice,
          })
          remainingGood -= goodFromAllocation
        }

        const availableAfterGood = allocation.quantity - goodFromAllocation
        const damagedFromAllocation = Math.min(availableAfterGood, remainingDamaged)
        if (damagedFromAllocation > 0) {
          const allocationCost = allocation.costPrice ?? (item.item.costPrice == null ? null : Number(item.item.costPrice))
          if (allocationCost != null) {
            damagedValue += damagedFromAllocation * allocationCost
            damagedCostedQty += damagedFromAllocation
          }
          remainingDamaged -= damagedFromAllocation
        }

        const notAccounted = availableAfterGood - damagedFromAllocation
        if (notAccounted > 0) unreceived.push({ ...allocation, quantity: notAccounted })
      }

      if (damagedQty > 0) {
        hasDamagedItems = true
        const fallbackCost = item.item.costPrice == null ? null : Number(item.item.costPrice)
        const unitCost = damagedCostedQty > 0 ? damagedValue / damagedCostedQty : fallbackCost
        const damageNote = `Rusak saat penerimaan transfer dari ${transfer.fromLocation.name}${receiptNotes ? `: ${receiptNotes}` : ""}`
        const adjustment = await tx.stockAdjustment.create({
          data: {
            organizationId: user.organizationId,
            locationId: transfer.toLocationId,
            itemId: item.itemId,
            type: "DAMAGE",
            quantity: damagedQty,
            unitCost,
            totalCost: unitCost == null ? null : Math.round(unitCost * damagedQty * 100) / 100,
            note: damageNote,
            evidenceUrl: imageUrl,
            createdById: user.id,
          },
        })
        await recordVariance(tx, {
          organizationId: user.organizationId,
          itemId: item.itemId,
          locationId: transfer.toLocationId,
          type: "DAMAGE",
          quantity: -damagedQty,
          note: damageNote,
          referenceId: adjustment.id,
          createdById: user.id,
        })
        discrepancies.push(`${item.item.name}: ${damagedQty} rusak`)
      }

      if (missingQty > 0) {
        if (action === "receive") hasMissingItems = true
        if (action === "receive") {
          discrepancies.push(`${item.item.name}: ${missingQty} tidak tiba`)
        }

        if (action === "reject" || varianceResolution === "RETURN_TO_SOURCE") {
          for (const allocation of unreceived) {
            await addStock(tx, {
              organizationId: user.organizationId,
              itemId: item.itemId,
              locationId: transfer.fromLocationId,
              type: "TRANSFER_RETURN",
              quantity: allocation.quantity,
              note: action === "reject" ? "Transfer ditolak, stok dikembalikan" : "Selisih penerimaan dikembalikan ke lokasi asal",
              referenceId: id,
              createdById: user.id,
              existingBatchId: allocation.sourceBatchId,
            })
          }
        }

        if (action === "receive") {
          await recordVariance(tx, {
            organizationId: user.organizationId,
            itemId: item.itemId,
            locationId: transfer.fromLocationId,
            type: "TRANSFER_VARIANCE",
            quantity: -missingQty,
            note: varianceResolution === "RETURN_TO_SOURCE"
              ? `Selisih ${missingQty} dikembalikan ke lokasi asal${receiptNotes ? `: ${receiptNotes}` : ""}`
              : `Selisih ${missingQty} dicatat sebagai kehilangan dalam perjalanan${receiptNotes ? `: ${receiptNotes}` : ""}`,
            referenceId: id,
            createdById: user.id,
          })
        }
      }
    }

    if (action === "receive") {
      for (const item of transfer.items) {
        const balance = await tx.stockBalance.findUnique({
          where: { itemId_locationId: { itemId: item.itemId, locationId: transfer.toLocationId } },
          include: {
            item: { include: { locationSettings: { where: { locationId: transfer.toLocationId }, select: { minStock: true } } } },
          },
        })
        const minimum = balance?.item.locationSettings[0]?.minStock
        if (balance && minimum != null && Number(balance.quantity) > Number(minimum)) {
          await tx.alert.updateMany({
            where: {
              organizationId: user.organizationId,
              type: "LOW_STOCK",
              itemId: item.itemId,
              locationId: transfer.toLocationId,
              isResolved: false,
            },
            data: { isResolved: true, resolvedAt: new Date() },
          })
        }

        // Bila penerimaan ini masih menyisakan kebutuhan dan gudang masih
        // punya stok tersedia, langsung buat pengiriman lanjutan. Jumlahnya
        // dibatasi stok gudang; sisa berikutnya tetap dibawa sampai selesai.
        await continueOutstandingNeeds(tx, {
          organizationId: user.organizationId,
          warehouseId: transfer.fromLocationId,
          outletId: transfer.toLocationId,
          itemId: item.itemId,
          userId: user.id,
        })
      }
    }

    const pengirim = await tx.auditLog.findFirst({
      where: { organizationId: user.organizationId, entity: "StockTransfer", entityId: id, action: "DISPATCH_TRANSFER" },
      orderBy: { createdAt: "desc" },
      select: { userId: true },
    })
    const orangSama = action === "receive" && !!pengirim?.userId && pengirim.userId === user.id
    const catatanPelaku = orangSama ? " Pengirim dan penerima orang yang sama." : ""

    await saveTransferNotification(tx, action === "reject"
        ? {
            organizationId: user.organizationId,
            type: "TRANSFER_REJECTED",
            severity: "CRITICAL",
            title: "Transfer Ditolak",
            message: "Transfer ditolak di lokasi tujuan dan seluruh stok dikembalikan ke lokasi asal.",
            referenceId: id,
          }
        : discrepancies.length > 0
        ? {
            organizationId: user.organizationId,
            // Selisih penerimaan transfer = kritis, sejalan dengan selisih opname.
            type: "STOCK_SHORTAGE",
            severity: "CRITICAL",
            title: "Selisih penerimaan transfer",
            message: `${discrepancies.join("; ")}. ${hasMissingItems ? (varianceResolution === "RETURN_TO_SOURCE" ? "Barang yang tidak tiba dikembalikan ke stok asal." : "Barang yang tidak tiba dicatat sebagai kehilangan dalam perjalanan.") : ""}${hasDamagedItems ? " Barang rusak dicatat pada Waste & Penyesuaian." : ""}${receiptNotes ? ` Catatan: ${receiptNotes}` : ""}${catatanPelaku}`,
            referenceId: id,
          }
        : {
            organizationId: user.organizationId,
            type: "TRANSFER_COMPLETED",
            severity: "INFO",
            title: "Transfer Barang Selesai",
            message: `${transfer.items.length} jenis item dari ${transfer.fromLocation.name} diterima di ${transfer.toLocation.name} tanpa selisih.${catatanPelaku}`,
            referenceId: id,
          },
    )

    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: action === "receive" ? "CONFIRM_TRANSFER" : "REJECT_TRANSFER_DELIVERY",
        entity: "StockTransfer",
        entityId: id,
        after: action === "receive" ? {
          sentAndReceivedBySameUser: orangSama,
          receivedItems: transfer.items.map((item) => {
            const condition = receivedMap.get(item.id) ?? { receivedQty: Number(item.quantity), damagedQty: 0 }
            return {
              itemId: item.itemId,
              sentQty: Number(item.quantity),
              receivedQty: condition.receivedQty,
              damagedQty: condition.damagedQty,
              missingQty: Number(item.quantity) - condition.receivedQty - condition.damagedQty,
            }
          }),
        } : undefined,
      },
    })
    })
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_PROCESSED") {
      throw new PenerimaanTransferDitolak("Transfer sudah diproses oleh pengguna lain")
    }
    throw error
  }

  return { message: action === "receive" ? "Transfer diterima" : "Transfer ditolak dan stok dikembalikan" }
}
