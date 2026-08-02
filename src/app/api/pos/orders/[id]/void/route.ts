import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params

  const order = await prisma.pOSOrder.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { items: true, payments: true },
  })
  if (!order) return err("Pesanan tidak ditemukan", 404)
  if (order.status === "VOID") return err("Pesanan sudah dibatalkan")

  const body = await req.json()
  const { reason } = body

  await prisma.$transaction(async (tx) => {
    await tx.pOSOrder.update({
      where: { id },
      data: { status: "VOID", voidReason: reason ?? null },
    })

    if (order.status === "PAID") {
      for (const item of order.items) {
        if (!item.menuItemId) continue
        const recipeItems = await tx.recipeItem.findMany({
          where: { parentItemId: item.menuItemId },
        })

        for (const recipe of recipeItems) {
          const restoreQty = Number(recipe.quantity) * item.qty

          await tx.stockMovement.create({
            data: {
              organizationId: user.organizationId,
              itemId: recipe.childItemId,
              locationId: order.locationId,
              type: "POS_SALE",
              quantity: restoreQty,
              note: `VOID: ${item.name} × ${item.qty} — ${reason ?? ""}`,
              referenceId: id,
              createdById: user.id,
            },
          })

          await tx.stockBalance.upsert({
            where: { itemId_locationId: { itemId: recipe.childItemId, locationId: order.locationId } },
            update: { quantity: { increment: restoreQty } },
            create: {
              organizationId: user.organizationId,
              itemId: recipe.childItemId,
              locationId: order.locationId,
              quantity: restoreQty,
            },
          })
        }
      }

      if (order.shiftId) {
        await tx.pOSShift.update({
          where: { id: order.shiftId },
          data: {
            totalSales: { decrement: Number(order.total) },
            totalOrders: { decrement: 1 },
          },
        })
      }
    }
  })

  const updated = await prisma.pOSOrder.findUnique({
    where: { id },
    include: {
      items: true,
      payments: true,
      cashier: { select: { id: true, name: true } },
    },
  })

  return ok(updated)
}
