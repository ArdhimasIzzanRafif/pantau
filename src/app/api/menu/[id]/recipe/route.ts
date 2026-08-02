import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

// PUT replaces the entire recipe for a menu item
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)
  const { id } = await params

  const menu = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId, isMenuItem: true },
  })
  if (!menu) return err("Menu tidak ditemukan", 404)

  const body = await req.json()
  const items: { childItemId: string; quantity: number }[] = body.items ?? []

  if (!Array.isArray(items)) return err("Format recipe tidak valid")

  for (const item of items) {
    if (!item.childItemId || !item.quantity || item.quantity <= 0) {
      return err("Setiap ingredient harus punya id dan quantity > 0")
    }
    // Verify ingredient belongs to same org
    const ingredient = await prisma.inventoryItem.findFirst({
      where: { id: item.childItemId, organizationId: user.organizationId, isMenuItem: false },
    })
    if (!ingredient) return err(`Ingredient tidak ditemukan: ${item.childItemId}`)
  }

  await prisma.$transaction([
    prisma.recipeItem.deleteMany({ where: { parentItemId: id } }),
    ...(items.length > 0
      ? [
          prisma.recipeItem.createMany({
            data: items.map((item) => ({
              parentItemId: id,
              childItemId: item.childItemId,
              quantity: item.quantity,
            })),
          }),
        ]
      : []),
  ])

  const updated = await prisma.inventoryItem.findFirst({
    where: { id },
    include: { recipeItems: { include: { childItem: true } } },
  })

  return ok(updated)
}
