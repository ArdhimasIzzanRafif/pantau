import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const asOf = searchParams.get("asOf")
  const accessibleLocationIds = await getAccessibleLocationIds(user)
  if (locationId && !(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  // Point-in-time: sum all movements up to asOf
  if (asOf && locationId) {
    const movements = await prisma.stockMovement.groupBy({
      by: ["itemId"],
      where: {
        organizationId: user.organizationId,
        locationId,
        affectsBalance: true,
        effectiveAt: { lte: new Date(asOf) },
      },
      _sum: { quantity: true },
    })
    return ok(
      movements.map((m) => ({
        itemId: m.itemId,
        quantity: Number(m._sum.quantity ?? 0),
      }))
    )
  }

  const balances = await prisma.stockBalance.findMany({
    where: {
      organizationId: user.organizationId,
      ...(accessibleLocationIds && { locationId: { in: accessibleLocationIds } }),
      ...(locationId && { locationId }),
    },
    include: {
      item: { include: { locationSettings: { select: { locationId: true, minStock: true } } } },
      location: true,
    },
    orderBy: { item: { name: "asc" } },
  })
  // Stok yang sudah dikunci (direservasi) untuk transfer yang disetujui tetapi
  // belum dikirim. Hanya informasi tampilan: angka fisik tidak berubah.
  const reservasi = await prisma.stockReservation.findMany({
    where: {
      organizationId: user.organizationId, status: "ACTIVE",
      ...(accessibleLocationIds && { locationId: { in: accessibleLocationIds } }),
      ...(locationId && { locationId }),
    },
    select: { itemId: true, locationId: true, quantity: true, transfer: { select: { toLocation: { select: { name: true } } } } },
  })
  const dikunci = new Map<string, { jumlah: number; tujuan: Set<string> }>()
  for (const r of reservasi) {
    const kunci = `${r.itemId}:${r.locationId}`
    const baris = dikunci.get(kunci) ?? { jumlah: 0, tujuan: new Set<string>() }
    baris.jumlah += Number(r.quantity)
    baris.tujuan.add(r.transfer.toLocation.name)
    dikunci.set(kunci, baris)
  }
  return ok(balances.map((balance) => {
    const baris = dikunci.get(`${balance.itemId}:${balance.locationId}`)
    return { ...balance, reservedQuantity: baris?.jumlah ?? 0, reservedFor: baris ? [...baris.tujuan] : [] }
  }))
}
