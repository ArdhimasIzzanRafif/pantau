import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"

export async function GET(_req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const groups = await prisma.menuModifierGroup.findMany({
    where: { organizationId: user.organizationId },
    include: {
      options: {
        orderBy: { sortOrder: "asc" },
        include: { recipeItems: { include: { item: { select: { id: true, name: true, unit: true } } } } },
      },
      items: { select: { itemId: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return ok(groups)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden

  const body = await req.json() as Record<string, unknown>
  const { name, isRequired = false, maxSelect = 1, options = [], menuItemId } = body

  if (typeof name !== "string" || !name.trim()) return err("Nama grup modifier wajib diisi")
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
    const created = await tx.menuModifierGroup.create({
      data: {
        organizationId: user.organizationId,
        name: name.trim(),
        isRequired: isRequired === true,
        maxSelect: Math.max(1, Number(maxSelect) || 1),
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

    if (typeof menuItemId === "string" && menuItemId) {
      const item = await tx.inventoryItem.findFirst({
        where: { id: menuItemId, organizationId: user.organizationId, isMenuItem: true },
      })
      if (item) {
        const maxOrder = await tx.inventoryItemModifier.count({ where: { itemId: menuItemId } })
        await tx.inventoryItemModifier.create({
          data: { itemId: menuItemId, groupId: created.id, sortOrder: maxOrder },
        })
      }
    }

    return created
  })

  return ok(group, 201)
}
