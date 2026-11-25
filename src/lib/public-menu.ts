import "server-only"
import { prisma } from "@/lib/db"
import { businessPhotoOwnerSelect, publicBusinessPhotoUrl } from "@/lib/public-business-photo"

export async function getPublicMenu(token: string, mejaToken?: string | null) {
  const location = await prisma.location.findUnique({
    where: { menuToken: token },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          users: businessPhotoOwnerSelect,
        },
      },
    },
  })

  if (!location || !location.isActive) return null

  const table = mejaToken
    ? await prisma.table.findFirst({
        where: { tableToken: mejaToken, locationId: location.id, isActive: true },
        select: { id: true, name: true },
      })
    : null

  const [menuItems, stockBalances, openShift] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { organizationId: location.organizationId, isMenuItem: true },
      include: {
        recipeItems: true,
        modifierGroups: {
          include: {
            group: { include: { options: { orderBy: { sortOrder: "asc" } } } },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    // Only fetch stock for this location — trackable items only
    prisma.stockBalance.groupBy({
      by: ["itemId"],
      where: { locationId: location.id },
      _sum: { quantity: true },
    }),
    prisma.pOSShift.findFirst({
      where: { locationId: location.id, status: "OPEN" },
      select: { id: true },
    }),
  ])

  const stockMap = new Map(stockBalances.map((s) => [s.itemId, Number(s._sum.quantity ?? 0)]))

  return {
    location: { id: location.id, name: location.name },
    table,
    isOpen: !!openShift,
    organization: {
      name: location.organization.name,
      logoUrl: publicBusinessPhotoUrl(token, location.organization.users[0]?.user.image),
    },
    menuItems: menuItems.map((item) => {
      const recipeCapacity = item.recipeItems.length > 0
        ? Math.min(...item.recipeItems.map((recipe) => {
            const needed = Number(recipe.quantity)
            return needed > 0 ? (stockMap.get(recipe.childItemId) ?? 0) / needed : Number.POSITIVE_INFINITY
          }))
        : null
      const directStock = stockMap.get(item.id) ?? 0
      const outOfStock = recipeCapacity != null ? recipeCapacity < 1 : item.isTrackable && directStock <= 0
      const isAvailable = item.isActive && item.isAvailableForQr && !outOfStock
      const unavailableReason = !item.isActive ? "nonaktif" : !item.isAvailableForQr ? "qr_nonaktif" : outOfStock ? "habis" : null
      return {
      id: item.id,
      name: item.name,
      price: Number(item.sellPrice ?? 0),
      category: item.category ?? "Lainnya",
      imageUrl: item.imageUrl,
      description: item.description,
      isAvailable,
      unavailableReason,
      modifierGroups: item.modifierGroups
        .map((pmg: { group: { id: string; name: string; isRequired: boolean; maxSelect: number; options: { id: string; name: string; price: unknown; sortOrder: number }[] } | null }) => {
          const g = pmg.group
          if (!g) return null
          return {
            id: g.id,
            name: g.name,
            isRequired: g.isRequired,
            maxSelect: g.maxSelect,
            options: g.options.map((opt) => ({
              id: opt.id,
              name: opt.name,
              price: Number(opt.price),
              sortOrder: opt.sortOrder,
            })),
          }
        })
        .filter((group) => group !== null),
      }
    }),
  }
}

export type PublicMenuData = NonNullable<Awaited<ReturnType<typeof getPublicMenu>>>
