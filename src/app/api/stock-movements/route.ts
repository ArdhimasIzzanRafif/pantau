import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"
import { attachActors } from "@/lib/actors"

// Batas atas baris yang boleh ditelusuri dalam satu periode.
const MAX_ROWS = 2000

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null
  const date = new Date(value.includes("T") ? value : `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`)
  return Number.isFinite(date.getTime()) ? date : null
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get("itemId")
  const locationId = searchParams.get("locationId")
  if (locationId && !(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  // Tanpa itemId, kartu stok tampil sebagai catatan seluruh pergerakan.
  const item = itemId
    ? await prisma.inventoryItem.findFirst({
        where: { id: itemId, organizationId: user.organizationId },
        select: { id: true, name: true, sku: true, unit: true },
      })
    : null
  if (itemId && !item) return err("Item tidak ditemukan", 404)

  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  defaultFrom.setHours(0, 0, 0, 0)
  const from = parseDate(searchParams.get("from")) ?? defaultFrom
  const to = parseDate(searchParams.get("to"), true) ?? new Date()
  if (from > to) return err("Tanggal awal harus sebelum tanggal akhir")

  const accessibleLocationIds = await getAccessibleLocationIds(user)
  const locationScope = locationId
    ? { locationId }
    : accessibleLocationIds
      ? { locationId: { in: accessibleLocationIds } }
      : {}
  const baseWhere = {
    organizationId: user.organizationId,
    ...(item && { itemId: item.id }),
    ...locationScope,
  }

  const page = Math.max(1, Number(searchParams.get("page") ?? 1))
  const take = 50
  const skip = (page - 1) * take
  // Tabel ditampilkan terbaru dahulu. Untuk menjaga saldo tiap baris tetap
  // benar pada halaman berikutnya, baca jendela dari transaksi paling baru
  // sampai akhir halaman yang diminta, lalu hitung mundur dari saldo akhir.
  const windowSize = Math.min(skip + take, MAX_ROWS)

  const periodWhere = { ...baseWhere, effectiveAt: { gte: from, lte: to } }
  // Saldo pembuka tetap berada di ledger untuk opname, bukan daftar transaksi.
  const transactionWhere = { ...periodWhere, type: { not: "INITIAL_STOCK" as const } }

  // Lintas item, saldo berjalan dan batch tidak punya arti — satuannya pun
  // berbeda-beda. Yang disajikan murni catatan kronologis, terbaru di atas.
  if (!item) {
    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where: transactionWhere }),
      prisma.stockMovement.findMany({
        where: transactionWhere,
        include: {
          item: { select: { id: true, name: true, sku: true, unit: true } },
          location: { select: { id: true, name: true } },
          batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        },
        orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
    ])
    const cappedTotalAll = Math.min(total, MAX_ROWS)
    return ok({
      item: null,
      period: { from, to },
      summary: null,
      movements: await attachActors(user.organizationId, movements.map((movement) => ({
        ...movement,
        quantity: Number(movement.quantity),
      }))),
      batches: [],
      total: cappedTotalAll,
      page,
      pages: Math.max(1, Math.ceil(cappedTotalAll / take)),
      truncated: total > MAX_ROWS,
    })
  }

  const [openingAggregate, initialAggregate, initialCount, netAggregate, incomingAggregate, outgoingAggregate, total, currentBatches] = await Promise.all([
    prisma.stockMovement.aggregate({
      where: { ...baseWhere, affectsBalance: true, effectiveAt: { lt: from } },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.aggregate({
      where: { ...periodWhere, type: "INITIAL_STOCK", affectsBalance: true },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.count({ where: { ...periodWhere, type: "INITIAL_STOCK" } }),
    // Ringkasan dihitung lewat agregat atas seluruh periode, bukan dari baris
    // yang kebetulan termuat, supaya angkanya tidak ikut mengecil saat dipaginasi.
    prisma.stockMovement.aggregate({
      where: { ...periodWhere, affectsBalance: true },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.aggregate({
      where: { ...transactionWhere, affectsBalance: true, quantity: { gt: 0 } },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.aggregate({
      where: { ...transactionWhere, affectsBalance: true, quantity: { lt: 0 } },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.count({ where: transactionWhere }),
    prisma.stockBatch.findMany({
      where: {
        organizationId: user.organizationId,
        itemId: item.id,
        quantity: { gt: 0 },
        ...locationScope,
      },
      include: { location: { select: { id: true, name: true } } },
      orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
    }),
  ])

  const windowMovements = await prisma.stockMovement.findMany({
    where: periodWhere,
    include: {
      location: { select: { id: true, name: true } },
      batch: { select: { id: true, batchNumber: true, expiryDate: true } },
    },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    // Baca juga saldo awal yang disembunyikan agar saldo per baris tetap benar.
    take: windowSize + initialCount,
  })
  const balanceBeforePeriod = Number(openingAggregate._sum.quantity ?? 0)
  const opening = balanceBeforePeriod + Number(initialAggregate._sum.quantity ?? 0)
  const closing = balanceBeforePeriod + Number(netAggregate._sum.quantity ?? 0)
  let runningBalance = closing
  const windowRows = windowMovements.map((movement) => {
    const quantity = Number(movement.quantity)
    // Nilai baris adalah saldo SESUDAH transaksi tersebut. Setelah disimpan,
    // mundurkan saldo untuk mendapatkan keadaan sebelum transaksi yang lebih
    // lama di baris berikutnya.
    const balanceAfterMovement = runningBalance
    if (movement.affectsBalance) runningBalance -= quantity
    return { ...movement, quantity, runningBalance: balanceAfterMovement }
  }).filter((movement) => movement.type !== "INITIAL_STOCK")

  const cappedTotal = Math.min(total, MAX_ROWS)
  const pageRows = await attachActors(user.organizationId, windowRows.slice(skip, skip + take))

  return ok({
    item,
    period: { from, to },
    summary: {
      opening,
      incoming: Number(incomingAggregate._sum.quantity ?? 0),
      outgoing: Math.abs(Number(outgoingAggregate._sum.quantity ?? 0)),
      closing,
    },
    movements: pageRows,
    batches: currentBatches,
    total: cappedTotal,
    page,
    pages: Math.max(1, Math.ceil(cappedTotal / take)),
    truncated: total > MAX_ROWS,
  })
}
