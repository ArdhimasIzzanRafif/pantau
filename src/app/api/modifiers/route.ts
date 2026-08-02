import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(_req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const groups = await prisma.menuModifierGroup.findMany({
    where: { organizationId: user.organizationId },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      items: { select: { itemId: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return ok(groups)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const body = await req.json()
  const { name, isRequired = false, maxSelect = 1, options = [], menuItemId } = body

  if (!name?.trim()) return err("Nama grup modifier wajib diisi")

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.menuModifierGroup.create({
      data: {
        organizationId: user.organizationId,
        name: name.trim(),
        isRequired,
        maxSelect,
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

    if (menuItemId) {
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
