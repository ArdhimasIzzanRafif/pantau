import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, err } from "@/lib/api-helpers"

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const mejaToken = new URL(req.url).searchParams.get("meja")

  const location = await prisma.location.findUnique({
    where: { menuToken: token },
    include: {
      organization: { select: { id: true, name: true, logoUrl: true, qrisImageUrl: true, ownerPhone: true } },
    },
  })

  if (!location || !location.isActive) return err("Outlet tidak ditemukan", 404)

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

  return ok({
    location: { id: location.id, name: location.name },
    table,
    isOpen: !!openShift,
    organization: {
      name: location.organization.name,
      logoUrl: location.organization.logoUrl,
      qrisImageUrl: location.organization.qrisImageUrl,
      hasQris: !!location.organization.qrisImageUrl,
    },
    menuItems: menuItems.map((item) => {
      const stock = stockMap.get(item.id) ?? null
      // trackable + stock = 0 → out of stock
      const outOfStock = item.isTrackable && stock !== null && stock <= 0
      const isAvailable = item.isActive && item.isAvailableForQr && !outOfStock
      const unavailableReason = !item.isActive ? "nonaktif" : outOfStock ? "habis" : !item.isAvailableForQr ? "habis" : null
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
        .filter(Boolean),
      }
    }),
  })
}
