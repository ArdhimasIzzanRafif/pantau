import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"

// PUT /api/menu/:id/modifiers — replace all modifier group assignments for a menu item
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json()
  const { groupIds = [] }: { groupIds: string[] } = body

  const item = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!item) return err("Menu item tidak ditemukan", 404)

  // Pastikan semua grup memang milik organisasi ini
  const ids = [...new Set(groupIds)]
  if (ids.some((groupId) => typeof groupId !== "string" || !groupId)) {
    return err("Grup modifier tidak valid")
  }
  if (ids.length > 0) {
    const owned = await prisma.menuModifierGroup.count({
      where: { id: { in: ids }, organizationId: user.organizationId },
    })
    if (owned !== ids.length) return err("Ada grup modifier yang tidak valid")
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItemModifier.deleteMany({ where: { itemId: id } })
    if (groupIds.length > 0) {
      await tx.inventoryItemModifier.createMany({
        data: groupIds.map((groupId: string, i: number) => ({
          itemId: id,
          groupId,
          sortOrder: i,
        })),
      })
    }
  })

  return ok({ success: true })
}
