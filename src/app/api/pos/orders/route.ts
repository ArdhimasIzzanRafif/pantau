import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { checkAndCreateLowStockAlert } from "@/lib/stock-alerts"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const shiftId = searchParams.get("shiftId")
  const status = searchParams.get("status")
  const date = searchParams.get("date")

  const where: Record<string, unknown> = { organizationId: user.organizationId }
  if (locationId) where.locationId = locationId
  if (shiftId) where.shiftId = shiftId
  if (status) where.status = status
  if (date) {
    const d = new Date(date)
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const end = new Date(start.getTime() + 86400000)
    where.createdAt = { gte: start, lt: end }
  }

  const orders = await prisma.pOSOrder.findMany({
    where,
    include: {
      items: true,
      payments: true,
      cashier: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return ok(orders)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const body = await req.json()
  const {
    locationId,
    shiftId,
    orderType = "DINE_IN",
    tableNumber,
    customerName,
    items,
    discountType,
    discountValue = 0,
    discountLabel,
    platformOrderNumber,
    taxPercent = 0,
    notes,
    payment,
    hold = false,
  } = body

  if (!locationId) return err("locationId diperlukan")
  if (!items || items.length === 0) return err("Pesanan harus memiliki item")
  if (!hold && !payment?.method) return err("Metode pembayaran diperlukan")

  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: user.organizationId },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)

  const subtotal = items.reduce(
    (sum: number, item: { price: number; qty: number; discount?: number; modifiers?: { price: number }[] }) => {
      const modifierTotal = (item.modifiers ?? []).reduce((ms, m) => ms + m.price, 0)
      return sum + (item.price + modifierTotal) * item.qty - (item.discount ?? 0)
    },
    0
  )

  let discountAmount = 0
  if (discountType === "PERCENT") {
    discountAmount = Math.round((subtotal * discountValue) / 100)
  } else if (discountType === "AMOUNT") {
    discountAmount = discountValue
  }

  const afterDiscount = subtotal - discountAmount
  const taxAmount = Math.round((afterDiscount * taxPercent) / 100)
  const total = afterDiscount + taxAmount

  const today = new Date()
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0")

  const order = await prisma.$transaction(async (tx) => {
    let orderNumber: string

    if (hold) {
      // Held orders get a temporary label — counter only increments on payment
      const ts = Date.now().toString().slice(-6)
      orderNumber = `HOLD-${ts}`
    } else {
      // Atomic increment — safe for concurrent multi-kasir across any number of outlets
      const { orderCounter } = await tx.organization.update({
        where: { id: user.organizationId },
        data: { orderCounter: { increment: 1 } },
        select: { orderCounter: true },
      })
      orderNumber = `ORD-${dateStr}-${String(orderCounter).padStart(4, "0")}`
    }

    const newOrder = await tx.pOSOrder.create({
      data: {
        organizationId: user.organizationId,
        locationId,
        shiftId: shiftId ?? null,
        cashierId: user.id,
        orderNumber,
        orderType,
        tableNumber: tableNumber ?? null,
        customerName: customerName ?? null,
        status: hold ? "HELD" : "PAID",
        subtotal,
        discountType: discountType ?? null,
        discountValue,
        discountAmount,
        discountLabel: discountLabel ?? null,
        platformOrderNumber: platformOrderNumber ?? null,
        taxPercent,
        taxAmount,
        total,
        notes: notes ?? null,
        paidAt: hold ? null : new Date(),
      },
    })

    for (const item of items as {
      menuItemId: string
      name: string
      price: number
      qty: number
      discount?: number
      notes?: string
      modifiers?: { groupName: string; optionName: string; price: number }[]
    }[]) {
      const modifierTotal = (item.modifiers ?? []).reduce((s, m) => s + m.price, 0)
      const orderItem = await tx.pOSOrderItem.create({
        data: {
          orderId: newOrder.id,
          menuItemId: item.menuItemId ?? null,
          name: item.name,
          price: item.price + modifierTotal,
          qty: item.qty,
          discount: item.discount ?? 0,
          subtotal: (item.price + modifierTotal) * item.qty - (item.discount ?? 0),
          notes: item.notes ?? null,
        },
      })
      if (item.modifiers && item.modifiers.length > 0) {
        await tx.pOSOrderItemModifier.createMany({
          data: item.modifiers.map((m) => ({
            orderItemId: orderItem.id,
            groupName: m.groupName,
            optionName: m.optionName,
            price: m.price,
          })),
        })
      }
    }

    if (!hold) {
      const change = Number(payment.amount) - total
      await tx.pOSPayment.create({
        data: {
          orderId: newOrder.id,
          method: payment.method,
          amount: payment.amount,
          change: change > 0 ? change : 0,
          reference: payment.reference ?? null,
          note: payment.note ?? null,
        },
      })

      for (const item of items) {
        const recipeItems = await tx.recipeItem.findMany({
          where: { parentItemId: item.menuItemId },
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
              referenceId: newOrder.id,
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

      if (shiftId) {
        await tx.pOSShift.update({
          where: { id: shiftId },
          data: {
            totalSales: { increment: total },
            totalOrders: { increment: 1 },
          },
        })
      }
    }

    return tx.pOSOrder.findUnique({
      where: { id: newOrder.id },
      include: {
        items: { include: { modifiers: true } },
        payments: true,
        cashier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, address: true } },
        shift: { select: { id: true, shiftNumber: true } },
      },
    })
  })

  return ok(order, 201)
}
