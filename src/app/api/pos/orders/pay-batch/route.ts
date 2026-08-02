import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { checkAndCreateLowStockAlert } from "@/lib/stock-alerts"

// POST /api/pos/orders/pay-batch — bayar beberapa QR order sekaligus (per meja)
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { orderIds, payment, shiftId } = await req.json()
  if (!Array.isArray(orderIds) || orderIds.length === 0) return err("orderIds wajib diisi")
  if (!payment?.method) return err("Metode pembayaran diperlukan")

  const orders = await prisma.pOSOrder.findMany({
    where: {
      id: { in: orderIds },
      organizationId: user.organizationId,
      status: { in: ["OPEN", "HELD"] },
    },
    include: { items: true },
  })

  if (orders.length === 0) return err("Tidak ada order yang bisa diproses", 404)

  const combinedTotal = orders.reduce((s, o) => s + Number(o.total), 0)
  const locationId = orders[0].locationId

  await prisma.$transaction(async (tx) => {
    const now = new Date()

    for (const order of orders) {
      await tx.pOSOrder.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAt: now,
          cashierId: user.id,
          ...(shiftId && !order.shiftId ? { shiftId } : {}),
        },
      })

      // Deduct stock for each order's items
      for (const item of order.items) {
        const recipeItems = await tx.recipeItem.findMany({
          where: { parentItemId: item.menuItemId ?? "" },
        })
        for (const recipe of recipeItems) {
          const deductQty = Number(recipe.quantity) * item.qty
          await tx.stockMovement.create({
            data: {
              organizationId: user.organizationId,
              itemId: recipe.childItemId,
              locationId,
              type: "POS_SALE",
              quantity: -deductQty,
              note: `POS Sale: ${item.name} × ${item.qty}`,
              referenceId: order.id,
              createdById: user.id,
            },
          })
          await tx.stockBalance.upsert({
            where: { itemId_locationId: { itemId: recipe.childItemId, locationId } },
            update: { quantity: { decrement: deductQty } },
            create: {
              organizationId: user.organizationId,
              itemId: recipe.childItemId,
              locationId,
              quantity: -deductQty,
            },
          })
          await checkAndCreateLowStockAlert(tx, user.organizationId, recipe.childItemId, locationId)
        }
      }
    }

    // One combined payment record on the first order
    await tx.pOSPayment.create({
      data: {
        orderId: orders[0].id,
        method: payment.method,
        amount: combinedTotal,
        change: Math.max(0, Number(payment.amount) - combinedTotal),
        reference: payment.reference ?? null,
      },
    })

    // Update shift totals
    const targetShiftId = shiftId ?? orders.find(o => o.shiftId)?.shiftId
    if (targetShiftId) {
      await tx.pOSShift.update({
        where: { id: targetShiftId },
        data: {
          totalSales: { increment: combinedTotal },
          totalOrders: { increment: orders.length },
        },
      })
    }
  })

  return ok({
    paidCount: orders.length,
    total: combinedTotal,
    tableNumber: orders[0].tableNumber,
    orderNumbers: orders.map(o => o.orderNumber),
  })
}
