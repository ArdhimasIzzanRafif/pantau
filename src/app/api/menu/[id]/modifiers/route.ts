import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

// PUT /api/menu/:id/modifiers — replace all modifier group assignments for a menu item
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { id } = await params
  const body = await req.json()
  const { groupIds = [] }: { groupIds: string[] } = body

  const item = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!item) return err("Menu item tidak ditemukan", 404)

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
