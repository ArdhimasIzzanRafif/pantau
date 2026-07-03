import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { checkAndCreateLowStockAlert } from "@/lib/stock-alerts"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { id } = await params
  const { action, receivedItems, notes: receiptNotes, imageUrl } = await req.json() // "receive" | "reject"

  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      items: { include: { item: { select: { name: true } } } },
      fromLocation: { select: { name: true } },
      toLocation:   { select: { name: true } },
    },
  })
  if (!transfer) return err("Transfer tidak ditemukan", 404)
  if (transfer.status !== "SENT") return err("Transfer sudah diproses")

  if (action === "reject") {
    await prisma.$transaction(async (tx) => {
      await tx.stockTransfer.update({
        where: { id },
        data: { status: "REJECTED", confirmedById: user.id },
      })

      for (const item of transfer.items) {
        await tx.stockBalance.upsert({
          where: { itemId_locationId: { itemId: item.itemId, locationId: transfer.fromLocationId } },
          update: { quantity: { increment: item.quantity } },
          create: {
            organizationId: user.organizationId,
            itemId: item.itemId,
            locationId: transfer.fromLocationId,
            quantity: item.quantity,
          },
        })
      }

      await tx.alert.create({
        data: {
          organizationId: user.organizationId,
          type: "TRANSFER_REJECTED",
          severity: "WARNING",
          title: "Transfer Ditolak oleh Supervisor",
          message: `Permintaan transfer ke lokasi tujuan telah ditolak oleh supervisor. Stok telah dikembalikan ke lokasi asal.`,
          referenceId: id,
        },
      })
    })

    return ok({ message: "Transfer ditolak" })
  }

  // Build a map of receivedQty per item id
  const receivedMap: Record<string, number> = {}
  if (Array.isArray(receivedItems)) {
    for (const ri of receivedItems as Array<{ id: string; receivedQty: number }>) {
      receivedMap[ri.id] = ri.receivedQty
    }
  }

  const discrepancies: string[] = []

  // Receive: add actual received qty to destination, return shortage to source
  await prisma.$transaction(async (tx) => {
    await tx.stockTransfer.update({
      where: { id },
      data: { status: "RECEIVED", receivedAt: new Date(), confirmedById: user.id, receiptImageUrl: imageUrl ?? null },
    })

    for (const item of transfer.items) {
      const sentQty = Number(item.quantity)
      const receivedQty = item.id in receivedMap ? receivedMap[item.id] : sentQty
      const shortage = sentQty - receivedQty

      // Save receivedQty on the item
      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: { receivedQty },
      })

      // Add received qty to destination
      if (receivedQty > 0) {
        await tx.stockBalance.upsert({
          where: { itemId_locationId: { itemId: item.itemId, locationId: transfer.toLocationId } },
          update: { quantity: { increment: receivedQty } },
          create: {
            organizationId: user.organizationId,
            itemId: item.itemId,
            locationId: transfer.toLocationId,
            quantity: receivedQty,
          },
        })

        await tx.stockMovement.create({
          data: {
            organizationId: user.organizationId,
            itemId: item.itemId,
            locationId: transfer.toLocationId,
            type: "TRANSFER_IN",
            quantity: receivedQty,
            referenceId: id,
            createdById: user.id,
          },
        })
      }

      if (shortage > 0) {
        discrepancies.push(`${item.item.name}: kirim ${sentQty}, diterima ${receivedQty} (selisih -${shortage})`)
      }

      await checkAndCreateLowStockAlert(tx, user.organizationId, item.itemId, transfer.fromLocationId)
    }

    if (discrepancies.length > 0) {
      const noteText = receiptNotes ? ` — Catatan: ${receiptNotes}` : ""
      await tx.alert.create({
        data: {
          organizationId: user.organizationId,
          type: "STOCK_SHORTAGE",
          severity: "WARNING",
          title: "Selisih Jumlah Penerimaan Transfer",
          message: `Transfer diterima dengan ketidaksesuaian jumlah: ${discrepancies.join("; ")}${noteText}`,
          referenceId: id,
        },
      })
    } else {
      const itemCount = transfer.items.length
      const fromName = transfer.fromLocation.name
      const toName   = transfer.toLocation.name
      await tx.alert.create({
        data: {
          organizationId: user.organizationId,
          type: "TRANSFER_COMPLETED",
          severity: "INFO",
          title: "Transfer Barang Selesai",
          message: `${itemCount} jenis item dari ${fromName} telah diterima di ${toName} tanpa selisih.`,
          referenceId: id,
        },
      })
    }
  })

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "CONFIRM_TRANSFER",
      entity: "StockTransfer",
      entityId: id,
    },
  })

  return ok({ message: "Transfer diterima" })
}
