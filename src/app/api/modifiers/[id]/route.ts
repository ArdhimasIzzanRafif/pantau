import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json() as Record<string, unknown>
  const { name, isRequired, maxSelect, options = [] } = body

  const existing = await prisma.menuModifierGroup.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!existing) return err("Grup modifier tidak ditemukan", 404)
  if (!Array.isArray(options)) return err("Opsi modifier tidak valid")

  const parsedOptions: Array<{
    name: string
    price: number
    recipeItems: Array<{ itemId: string; quantity: number }>
  }> = []
  for (const raw of options) {
    const option = raw as { name?: unknown; price?: unknown; recipeItems?: unknown }
    const optionName = typeof option.name === "string" ? option.name.trim() : ""
    const price = Number(option.price ?? 0)
    if (!optionName || !Number.isFinite(price) || price < 0) return err("Nama atau harga opsi tidak valid")

    const recipeItems: Array<{ itemId: string; quantity: number }> = []
    if (Array.isArray(option.recipeItems)) {
      for (const rawRecipe of option.recipeItems) {
        const recipe = rawRecipe as { itemId?: unknown; quantity?: unknown }
        const itemId = typeof recipe.itemId === "string" ? recipe.itemId : ""
        const quantity = Number(recipe.quantity)
        if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return err("Komposisi bahan modifier tidak valid")
        recipeItems.push({ itemId, quantity })
      }
    }
    if (new Set(recipeItems.map((recipe) => recipe.itemId)).size !== recipeItems.length) return err("Bahan modifier tidak boleh duplikat")
    parsedOptions.push({ name: optionName, price, recipeItems })
  }

  const ingredientIds = [...new Set(parsedOptions.flatMap((option) => option.recipeItems.map((recipe) => recipe.itemId)))]
  if (ingredientIds.length > 0) {
    const count = await prisma.inventoryItem.count({
      where: { id: { in: ingredientIds }, organizationId: user.organizationId, isTrackable: true },
    })
    if (count !== ingredientIds.length) return err("Ada bahan modifier yang tidak valid")
  }

  const group = await prisma.$transaction(async (tx) => {
    await tx.menuModifierOption.deleteMany({ where: { groupId: id } })

    return tx.menuModifierGroup.update({
      where: { id },
      data: {
        name: typeof name === "string" && name.trim() ? name.trim() : existing.name,
        isRequired: typeof isRequired === "boolean" ? isRequired : existing.isRequired,
        maxSelect: maxSelect == null ? existing.maxSelect : Math.max(1, Number(maxSelect) || 1),
        options: {
          create: parsedOptions.map((option, i) => ({
            name: option.name,
            price: option.price,
            sortOrder: i,
            recipeItems: { create: option.recipeItems },
          })),
        },
      },
      include: {
        options: {
          orderBy: { sortOrder: "asc" },
          include: { recipeItems: { include: { item: { select: { id: true, name: true, unit: true } } } } },
        },
      },
    })
  })

  return ok(group)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden

  const { id } = await params

  const existing = await prisma.menuModifierGroup.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!existing) return err("Grup modifier tidak ditemukan", 404)

  await prisma.menuModifierGroup.delete({ where: { id } })

  return ok({ success: true })
}
