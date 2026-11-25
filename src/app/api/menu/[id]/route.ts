import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params

  const menu = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId, isMenuItem: true },
    include: {
      recipeItems: {
        include: { childItem: true },
      },
    },
  })
  if (!menu) return err("Menu tidak ditemukan", 404)
  return ok(menu)
}

export async function PATCH(
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
  const { name, sku, category, notes, isActive, sellPrice, description, imageUrl } = body

  if (sku && sku !== menu.sku) {
    const existing = await prisma.inventoryItem.findUnique({
      where: { organizationId_sku: { organizationId: user.organizationId, sku } },
    })
    if (existing) return err("SKU sudah digunakan", 409)
  }

  const updated = await prisma.inventoryItem.update({
    where: { id },
    data: {
      name: name ?? menu.name,
      sku: sku !== undefined ? (sku || null) : menu.sku,
      category: category !== undefined ? (category || null) : menu.category,
      notes: notes !== undefined ? (notes || null) : menu.notes,
      isActive: isActive !== undefined ? isActive : menu.isActive,
      sellPrice: sellPrice !== undefined ? (sellPrice != null ? sellPrice : null) : menu.sellPrice,
      description: description !== undefined ? (description || null) : menu.description,
      imageUrl: imageUrl !== undefined ? (imageUrl || null) : menu.imageUrl,
    },
    include: {
      recipeItems: { include: { childItem: true } },
    },
  })

  return ok(updated)
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

  const menu = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId, isMenuItem: true },
  })
  if (!menu) return err("Menu tidak ditemukan", 404)

  await prisma.inventoryItem.delete({ where: { id } })
  return ok({ success: true })
}
