import { NextRequest } from "next/server"
import { TransferStatus, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation, getAccessibleLocationIds, isAssignedToLocation } from "@/lib/location-access"
import { getHistoryScope } from "@/lib/history-scope"
import { memberJoinedAt } from "@/lib/membership"
import { getLowStockTransferContext } from "@/lib/low-stock-transfer-context"
import { consumeNeedLinks } from "@/lib/need-action-link"

function isTransferStatus(value: string): value is TransferStatus {
  return Object.values(TransferStatus).includes(value as TransferStatus)
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get("status")
  const statusList  = (statusParam ?? "").split(",").map((v) => v.trim()).filter(Boolean)
  const status      = statusList.every(isTransferStatus) ? statusList : undefined
  const locationId = searchParams.get("locationId")
  const from       = searchParams.get("from")
  const to         = searchParams.get("to")
  const requestedPage = Number(searchParams.get("page") ?? 1)
  const requestedSize = Number(searchParams.get("perPage") ?? 30)
  const take = Number.isSafeInteger(requestedSize) && requestedSize > 0 ? Math.min(30, requestedSize) : 30
  // Riwayat transfer mengikuti lokasi tanggung jawab. Transfer yang dibuat
  // Owner tetap perlu diketahui Supervisor bila asal atau tujuannya ditugaskan.
  const historyScope = await getHistoryScope(user, searchParams.get("history") === "1", "LOCATION")
  if (!historyScope.allowed) return err("Tidak memiliki akses ke Riwayat", 403)

  if (statusParam && !status) return err("Status transfer tidak valid")

  const accessibleLocationIds = await getAccessibleLocationIds(user)
  const joinedAt = await memberJoinedAt(user)

  const baseWhere: Prisma.StockTransferWhereInput = {
      organizationId: user.organizationId,
      ...(historyScope.actorId && { createdById: historyScope.actorId }),
      AND: [
        // Anggota baru mulai dari nol, kecuali kiriman yang masih berjalan —
        // itu tetap perlu ada yang menyetujui atau menerimanya.
        ...(joinedAt ? [{ OR: [
          { createdAt: { gte: joinedAt } },
          { status: { in: ["PENDING", "APPROVED", "SENT"] as TransferStatus[] } },
        ] }] : []),
        ...(accessibleLocationIds ? [{
          OR: [
            { fromLocationId: { in: accessibleLocationIds } },
            { toLocationId: { in: accessibleLocationIds } },
          ],
        }] : []),
        ...(locationId ? [{
          OR: [{ fromLocationId: locationId }, { toLocationId: locationId }],
        }] : []),
      ],
      ...(from || to ? {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to + "T23:59:59.999Z") }),
        },
      } : {}),
  }

  // baseWhere sengaja tanpa filter status: dipakai groupBy supaya angka tiap tab
  // tetap benar walau daftarnya dipaginasi dan disaring.
  const where: Prisma.StockTransferWhereInput = {
    ...baseWhere,
    ...(status && status.length > 0 && { status: { in: status } }),
  }

  const [total, grouped] = await Promise.all([
    prisma.stockTransfer.count({ where }),
    prisma.stockTransfer.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ])

  const statusCounts = Object.fromEntries(
    grouped.map((g) => [g.status, g._count._all]),
  ) as Record<TransferStatus, number>

  const pages = Math.max(1, Math.ceil(total / take))
  const page = Math.min(pages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1)
  const transfers = await prisma.stockTransfer.findMany({
    where,
    include: {
      fromLocation: true, toLocation: true, items: { include: { item: true } },
      // Tenggat reservasi dipakai tampilan untuk menandai yang sudah terlambat.
      reservations: { where: { status: "ACTIVE" }, select: { expiresAt: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * take, take,
  })
  // Fetch balances only for items/source locations on this authorized page.
  const pending = transfers.filter((transfer) => transfer.status === "PENDING")
  const balances = pending.length ? await prisma.stockBalance.findMany({
    where: { organizationId: user.organizationId, OR: pending.map((transfer) => ({
      locationId: transfer.fromLocationId, itemId: { in: transfer.items.map((item) => item.itemId) },
    })) }, select: { locationId: true, itemId: true, quantity: true },
  }) : []
  const items = transfers.map((transfer) => ({ ...transfer, items: transfer.items.map((item) => ({
    ...item, sourceQuantity: transfer.status === "PENDING"
      ? Number(balances.find((balance) => balance.locationId === transfer.fromLocationId && balance.itemId === item.itemId)?.quantity ?? 0)
      : null,
  })) }))
  // Tenggat paling awal per transfer, plus penanda terlambat. Dihitung di
  // server agar tampilan tidak perlu tahu aturan waktunya.
  const sekarang = Date.now()
  const rows = items.map((transfer) => {
    const deadlines = transfer.reservations.map((r) => r.expiresAt.getTime())
    const reservationExpiresAt = deadlines.length ? new Date(Math.min(...deadlines)) : null
    return {
      ...transfer,
      reservationExpiresAt,
      reservationOverdue: reservationExpiresAt != null && reservationExpiresAt.getTime() < sekarang,
    }
  })
  return ok({ items: rows, total, page, pages, perPage: take, statusCounts })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (!["OWNER", "SUPERVISOR", "ADMIN_GUDANG"].includes(user.role)) {
    return err("Role ini tidak dapat membuat request transfer", 403)
  }

  const forbidden = await denyUnlessCanEdit(user, "TRANSFER")
  if (forbidden) return forbidden
  const body = await req.json() as Record<string, unknown>
  const fromLocationId = typeof body.fromLocationId === "string" ? body.fromLocationId : ""
  const toLocationId = typeof body.toLocationId === "string" ? body.toLocationId : ""
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null
  const rawItems = Array.isArray(body.items) ? body.items : []
  const lowStockAlertIds = Array.isArray(body.lowStockAlertIds)
    ? [...new Set(body.lowStockAlertIds.filter((id): id is string => typeof id === "string" && !!id))].slice(0, 50)
    : []

  if (!fromLocationId || !toLocationId || rawItems.length === 0) {
    return err("Lokasi asal, tujuan, dan item wajib diisi")
  }
  if (fromLocationId === toLocationId) return err("Lokasi asal dan tujuan tidak boleh sama")
  if (!(await canAccessLocation(user, fromLocationId))) return err("Tidak ada akses ke lokasi asal", 403)

  const destination = await prisma.location.findFirst({
    where: { id: toLocationId, organizationId: user.organizationId, isActive: true },
    select: { id: true },
  })
  if (!destination) return err("Lokasi tujuan tidak ditemukan", 404)

  const items: Array<{ itemId: string; quantity: number }> = []
  for (const raw of rawItems) {
    const item = raw as { itemId?: unknown; quantity?: unknown }
    const itemId = typeof item.itemId === "string" ? item.itemId : ""
    const quantity = Number(item.quantity)
    if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return err("Item transfer tidak valid")
    items.push({ itemId, quantity })
  }
  if (new Set(items.map((item) => item.itemId)).size !== items.length) return err("Item transfer tidak boleh duplikat")

  // Item non-trackable (bumbu/garnish) tetap boleh ditransfer antar lokasi.
  const validItemCount = await prisma.inventoryItem.count({
    where: { id: { in: items.map((item) => item.itemId) }, organizationId: user.organizationId },
  })
  if (validItemCount !== items.length) return err("Ada item transfer yang tidak valid")

  // Tautan WA tidak boleh menentukan lokasi/barang secara bebas. Semuanya
  // dicocokkan lagi terhadap alert aktif, gudang pemenuhan, stok outlet, serta
  // stok gudang tersedia tepat sebelum request dibuat.
  if (lowStockAlertIds.length > 0) {
    const context = await getLowStockTransferContext(user.organizationId, lowStockAlertIds)
    if (!context || context.lines.length === 0) return err("Kebutuhan stok ini sudah pulih atau sedang diproses", 409)
    const authorizedRecipient = user.role === "OWNER"
      || (user.role === "ADMIN_GUDANG" && await isAssignedToLocation(user, context.warehouse.id))
    if (!authorizedRecipient) {
      return err("Tautan ini hanya dapat diproses oleh Owner atau Admin Gudang yang ditugaskan ke gudang penerima", 403)
    }
    if (fromLocationId !== context.warehouse.id || toLocationId !== context.outlet.id) {
      return err("Gudang atau outlet tidak sesuai dengan peringatan stok", 409)
    }
    const lines = new Map(context.lines.map((line) => [line.itemId, line]))
    for (const item of items) {
      const line = lines.get(item.itemId)
      if (!line) return err("Ada barang yang tidak termasuk kebutuhan outlet ini", 409)
      if (item.quantity > line.warehouseAvailable) {
        return err(`Stok ${line.itemName} di gudang berubah. Tersedia ${line.warehouseAvailable} ${line.unit}.`, 409)
      }
    }
  }

  const transfer = await prisma.$transaction(async (tx) => {
    const tr = await tx.stockTransfer.create({
      data: {
        organizationId: user.organizationId,
        fromLocationId,
        toLocationId,
        notes,
        status: "PENDING",
        createdById: user.id,
        items: {
          create: items.map((i) => ({
            itemId: i.itemId,
            quantity: i.quantity,
          })),
        },
      },
      include: { items: true },
    })

    if (lowStockAlertIds.length > 0) {
      for (const item of items) {
        await consumeNeedLinks(tx, user.organizationId, user.id, item.itemId, toLocationId, tr.id)
      }
    }

    return tr
  })

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "REQUEST_TRANSFER_APPROVAL",
      entity: "StockTransfer",
      entityId: transfer.id,
    },
  })

  return ok(transfer, 201)
}
