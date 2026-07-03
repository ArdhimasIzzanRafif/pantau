import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { checkAndCreateLowStockAlert } from "@/lib/stock-alerts"

// POST /api/pos/orders/:id/pay — process payment on a held order
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { id } = await params
  const body = await req.json()
  const { payment } = body

  if (!payment?.method) return err("Metode pembayaran diperlukan")

  const held = await prisma.pOSOrder.findFirst({
    where: { id, organizationId: user.organizationId, status: "HELD" },
    include: { items: true },
  })
  if (!held) return err("Order ditahan tidak ditemukan", 404)

  const today = new Date()
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0")

  const order = await prisma.$transaction(async (tx) => {
    const { orderCounter } = await tx.organization.update({
      where: { id: user.organizationId },
      data: { orderCounter: { increment: 1 } },
      select: { orderCounter: true },
    })

    const orderNumber = `ORD-${dateStr}-${String(orderCounter).padStart(4, "0")}`
    const total = Number(held.total)
    const change = Number(payment.amount) - total

    await tx.pOSOrder.update({
      where: { id },
      data: {
        status: "PAID",
        orderNumber,
        paidAt: new Date(),
      },
    })

    await tx.pOSPayment.create({
      data: {
        orderId: id,
        method: payment.method,
        amount: payment.amount,
        change: change > 0 ? change : 0,
        reference: payment.reference ?? null,
        note: payment.note ?? null,
      },
    })

    for (const item of held.items) {
      const recipeItems = await tx.recipeItem.findMany({
        where: { parentItemId: item.menuItemId ?? "" },
      })
      for (const recipe of recipeItems) {
        const deductQty = Number(recipe.quantity) * item.qty
        await tx.stockMovement.create({
          data: {
            organizationId: user.organizationId,
            itemId: recipe.childItemId,
            locationId: held.locationId,
            type: "POS_SALE",
            quantity: -deductQty,
            note: `POS Sale: ${item.name} × ${item.qty}`,
            referenceId: id,
            createdById: user.id,
          },
        })
        await tx.stockBalance.upsert({
          where: { itemId_locationId: { itemId: recipe.childItemId, locationId: held.locationId } },
          update: { quantity: { decrement: deductQty } },
          create: {
            organizationId: user.organizationId,
            itemId: recipe.childItemId,
            locationId: held.locationId,
            quantity: -deductQty,
          },
        })

        await checkAndCreateLowStockAlert(tx, user.organizationId, recipe.childItemId, held.locationId)
      }
    }

    if (held.shiftId) {
      await tx.pOSShift.update({
        where: { id: held.shiftId },
        data: {
          totalSales: { increment: total },
          totalOrders: { increment: 1 },
        },
      })
    }

    return tx.pOSOrder.findUnique({
      where: { id },
      include: {
        items: { include: { modifiers: true } },
        payments: true,
        cashier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, address: true } },
        shift: { select: { id: true, shiftNumber: true } },
      },
    })
  })

  return ok(order)
}

// DELETE /api/pos/orders/:id/pay — cancel (void) a held order
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params

  const held = await prisma.pOSOrder.findFirst({
    where: { id, organizationId: user.organizationId, status: "HELD" },
  })
  if (!held) return err("Order ditahan tidak ditemukan", 404)

  await prisma.pOSOrder.update({
    where: { id },
    data: { status: "VOID", voidReason: "Dibatalkan dari daftar tahan" },
  })

  return ok({ success: true })
}
