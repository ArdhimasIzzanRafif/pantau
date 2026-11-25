import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const itemId = searchParams.get("itemId")
  const includeEmpty = searchParams.get("includeEmpty") === "true"
  const expiringDays = Number(searchParams.get("expiringDays") ?? "")
  const accessibleLocationIds = await getAccessibleLocationIds(user)

  if (locationId && !(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)
  if (itemId) {
    const validItem = await prisma.inventoryItem.count({ where: { id: itemId, organizationId: user.organizationId } })
    if (!validItem) return err("Item tidak ditemukan", 404)
  }

  const expiryLimit = Number.isFinite(expiringDays) && expiringDays > 0
    ? new Date(Date.now() + Math.min(expiringDays, 365) * 86_400_000)
    : null
  const batches = await prisma.stockBatch.findMany({
    where: {
      organizationId: user.organizationId,
      ...(accessibleLocationIds && { locationId: { in: accessibleLocationIds } }),
      ...(locationId && { locationId }),
      ...(itemId && { itemId }),
      ...(!includeEmpty && { quantity: { gt: 0 } }),
      ...(expiryLimit && { expiryDate: { not: null, lte: expiryLimit } }),
    },
    include: {
      item: { select: { id: true, name: true, unit: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: [
      { expiryDate: { sort: "asc", nulls: "last" } },
      { receivedAt: "asc" },
    ],
    take: 500,
  })

  return ok(batches)
}
