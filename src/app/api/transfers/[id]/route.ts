import { NextRequest } from "next/server"
import type { TransferStatus } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"
import { getHistoryScope } from "@/lib/history-scope"
import { memberJoinedAt } from "@/lib/membership"
import { retryWarehouseNotification } from "@/lib/replenishment"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params
  const historyScope = await getHistoryScope(user, req.nextUrl.searchParams.get("history") === "1", "LOCATION")
  if (!historyScope.allowed) return err("Tidak memiliki akses ke Riwayat", 403)
  const joinedAt = await memberJoinedAt(user)

  const transfer = await prisma.stockTransfer.findFirst({
    where: {
      id,
      organizationId: user.organizationId,
      ...(historyScope.actorId && { createdById: historyScope.actorId }),
      ...(joinedAt ? { OR: [
        { createdAt: { gte: joinedAt } },
        { status: { in: ["PENDING", "APPROVED", "SENT"] as TransferStatus[] } },
      ] } : {}),
    },
    include: {
      fromLocation: true,
      toLocation: true,
      items: { include: { item: true, batchAllocations: true } },
    },
  })
  if (!transfer) return err("Transfer tidak ditemukan", 404)
  const canViewSource = await canAccessLocation(user, transfer.fromLocationId)
  const canViewDestination = await canAccessLocation(user, transfer.toLocationId)
  if (!canViewSource && !canViewDestination) return err("Tidak ada akses ke transfer ini", 403)
  const stock = canViewSource ? await prisma.stockBalance.findMany({
    where: { organizationId: user.organizationId, locationId: transfer.fromLocationId, itemId: { in: transfer.items.map((i) => i.itemId) } },
    select: { itemId: true, quantity: true },
  }) : []
  // Siapa yang mengirim dan siapa yang menerima, untuk label
  // "Dikirim & diterima oleh orang yang sama" di riwayat transfer.
  const [dikirim, diterima] = await Promise.all(["DISPATCH_TRANSFER", "CONFIRM_TRANSFER"].map((action) =>
    prisma.auditLog.findFirst({
      where: { organizationId: user.organizationId, entity: "StockTransfer", entityId: transfer.id, action },
      orderBy: { createdAt: "desc" },
      select: { userId: true },
    })))
  const sentAndReceivedBySameUser = !!dikirim?.userId && dikirim.userId === diterima?.userId
  return ok({ ...transfer, sentAndReceivedBySameUser, items: transfer.items.map((item) => ({ ...item,
    availableQuantity: canViewSource ? Number(stock.find((s) => s.itemId === item.itemId)?.quantity ?? 0) : null,
  })) })
}

// Kirim ulang notifikasi WhatsApp ke gudang untuk permintaan outlet yang gagal terkirim.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params
  const body = await req.json() as { action?: string }
  if (body.action !== "RETRY_NOTIFICATION") return err("Aksi tidak valid")

  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { fromLocationId: true, autoReplenishment: true, outletRequested: true, status: true },
  })
  if (!transfer) return err("Transfer tidak ditemukan", 404)
  if (!transfer.autoReplenishment || !transfer.outletRequested || transfer.status !== "PENDING") {
    return err("Notifikasi transfer ini tidak dapat dikirim ulang", 409)
  }
  if (!(await canAccessLocation(user, transfer.fromLocationId))) {
    return err("Tidak ada akses ke gudang asal", 403)
  }

  const retried = await retryWarehouseNotification(id, user.organizationId)
  if (!retried) return err("Notifikasi belum berstatus gagal atau sedang diproses", 409)
  return ok({ message: "Pengiriman ulang WhatsApp dijadwalkan" })
}
