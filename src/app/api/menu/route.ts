import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(_req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const menus = await prisma.inventoryItem.findMany({
    where: { organizationId: user.organizationId, isMenuItem: true },
    include: {
      recipeItems: { include: { childItem: true } },
      modifierGroups: {
        include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })
  return ok(menus)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const body = await req.json()
  const { name, sku, category, notes, sellPrice, description, imageUrl } = body

  if (!name) return err("Nama menu wajib diisi")

  if (sku) {
    const existing = await prisma.inventoryItem.findUnique({
      where: { organizationId_sku: { organizationId: user.organizationId, sku } },
    })
    if (existing) return err("SKU sudah digunakan", 409)
  }

  const menu = await prisma.inventoryItem.create({
    data: {
      organizationId: user.organizationId,
      name,
      sku: sku || null,
      category: category || null,
      unit: "pcs",
      isTrackable: false,
      isMenuItem: true,
      notes: notes || null,
      sellPrice: sellPrice != null ? sellPrice : null,
      description: description || null,
      imageUrl: imageUrl || null,
    },
  })

  return ok(menu, 201)
}
