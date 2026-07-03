import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const asOf = searchParams.get("asOf")

  // Point-in-time: sum all movements up to asOf
  if (asOf && locationId) {
    const movements = await prisma.stockMovement.groupBy({
      by: ["itemId"],
      where: {
        organizationId: user.organizationId,
        locationId,
        createdAt: { lte: new Date(asOf) },
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
      ...(locationId && { locationId }),
      quantity: { gt: 0 },
    },
    include: {
      item: { include: { locationSettings: { select: { locationId: true, minStock: true } } } },
      location: true,
    },
    orderBy: { item: { name: "asc" } },
  })
  return ok(balances)
}
