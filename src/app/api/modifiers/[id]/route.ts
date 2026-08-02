import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { id } = await params
  const body = await req.json()
  const { name, isRequired, maxSelect, options = [] } = body

  const existing = await prisma.menuModifierGroup.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!existing) return err("Grup modifier tidak ditemukan", 404)

  const group = await prisma.$transaction(async (tx) => {
    await tx.menuModifierOption.deleteMany({ where: { groupId: id } })

    return tx.menuModifierGroup.update({
      where: { id },
      data: {
        name: name?.trim() ?? existing.name,
        isRequired: isRequired ?? existing.isRequired,
        maxSelect: maxSelect ?? existing.maxSelect,
        options: {
          create: (options as { name: string; price?: number }[]).map((o, i) => ({
            name: o.name.trim(),
            price: o.price ?? 0,
            sortOrder: i,
          })),
        },
      },
      include: { options: { orderBy: { sortOrder: "asc" } } },
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
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { id } = await params

  const existing = await prisma.menuModifierGroup.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!existing) return err("Grup modifier tidak ditemukan", 404)

  await prisma.menuModifierGroup.delete({ where: { id } })

  return ok({ success: true })
}
