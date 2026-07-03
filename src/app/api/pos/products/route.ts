import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")

  const [products, balances] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { organizationId: user.organizationId, isMenuItem: true, isActive: true },
      include: {
        recipeItems: { select: { childItemId: true, quantity: true, childItem: { select: { name: true, unit: true } } } },
        modifierGroups: {
          include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    locationId
      ? prisma.stockBalance.findMany({
          where: { organizationId: user.organizationId, locationId },
          select: { itemId: true, quantity: true },
        })
      : Promise.resolve([]),
  ])

  const stockMap = new Map((balances as { itemId: string; quantity: unknown }[]).map((b) => [b.itemId, Number(b.quantity)]))

  return ok(products.map((p) => {
    if (!locationId) return { ...p, stockQty: null }

    if (p.recipeItems.length > 0) {
      // Effective stock = min servings across all ingredients (missing record = 0)
      let effectiveQty = Infinity
      const recipeItemsWithStock = p.recipeItems.map((ri) => {
        const ingredientQty = stockMap.get(ri.childItemId) ?? 0
        const servings = Math.floor(ingredientQty / Number(ri.quantity))
        effectiveQty = Math.min(effectiveQty, servings)
        return { ...ri, currentStock: ingredientQty }
      })
      return { ...p, recipeItems: recipeItemsWithStock, stockQty: effectiveQty === Infinity ? 0 : effectiveQty }
    }

    // No recipe — treat missing balance as 0
    return { ...p, stockQty: stockMap.get(p.id) ?? 0 }
  }))
}
