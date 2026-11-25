import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { parseInventoryQuantity, QuantityInputError } from "@/lib/inventory-quantity"
import { convertToBase, UnitError } from "@/lib/unit-conversion"

// PUT replaces the entire recipe for a menu item
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden
  const { id } = await params

  const menu = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId, isMenuItem: true },
  })
  if (!menu) return err("Menu tidak ditemukan", 404)

  const body = await req.json()
  const items: { childItemId: string; quantity: number | string }[] = body.items ?? []

  if (!Array.isArray(items)) return err("Format recipe tidak valid")

  const normalized: { childItemId: string; quantity: number }[] = []
  for (const item of items) {
    if (!item.childItemId) return err("Setiap bahan harus punya id")

    // Verify ingredient belongs to same org
    const ingredient = await prisma.inventoryItem.findFirst({
      where: { id: item.childItemId, organizationId: user.organizationId, isMenuItem: false },
    })
    if (!ingredient) return err(`Ingredient tidak ditemukan: ${item.childItemId}`)

    // Bahan non-lacak tidak pernah dipotong saat penjualan (lihat filter
    // `isTrackable: true` di src/lib/pos-orders.ts), jadi kuantitasnya memang
    // tidak diisi — barisnya hanya jadi keterangan isi resep.
    try {
      const quantity = parseInventoryQuantity(item.quantity ?? 0, `Jumlah ${ingredient.name}`, !ingredient.isTrackable)
      if (ingredient.isTrackable) convertToBase(ingredient, quantity, "base")
      normalized.push({ childItemId: item.childItemId, quantity })
    } catch (error) {
      if (error instanceof QuantityInputError || error instanceof UnitError) return err(error.message)
      throw error
    }
  }

  await prisma.$transaction([
    prisma.recipeItem.deleteMany({ where: { parentItemId: id } }),
    ...(items.length > 0
      ? [
          prisma.recipeItem.createMany({
            data: normalized.map((item) => ({
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
