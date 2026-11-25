import { NextRequest } from "next/server"
import { OrderType, PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"
import { getPosCooldown, lockStockFlowLocation, OpnameQuietPeriodError } from "@/lib/opname-lock"
import {
  asOrderError,
  deductOrderStock,
  priceOrderItems,
  resolveOrderDiscount,
  resolveTaxPercent,
} from "@/lib/pos-orders"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const shiftId = searchParams.get("shiftId")
  const status = searchParams.get("status")
  const date = searchParams.get("date")

  const qr = searchParams.get("qr")

  if (locationId && !(await canAccessLocation(user, locationId))) {
    return err("Tidak ada akses ke outlet ini", 403)
  }

  const where: Record<string, unknown> = { organizationId: user.organizationId }
  if (locationId) where.locationId = locationId
  if (shiftId) where.shiftId = shiftId
  if (status) where.status = status
  // QR orders = OPEN orders without a shift (came from customer-facing menu)
  if (qr === "true") { where.status = "OPEN"; where.shiftId = null }
  if (date) {
    const d = new Date(date)
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const end = new Date(start.getTime() + 86400000)
    where.createdAt = { gte: start, lt: end }
  }

  const orders = await prisma.pOSOrder.findMany({
    where,
    include: {
      items: { include: { modifiers: true } },
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

  const body = await req.json() as Record<string, unknown>
  const {
    locationId,
    shiftId,
    orderType = "DINE_IN",
    tableNumber,
    customerName,
    items,
    discountRuleId,
    discountType,
    discountValue = 0,
    discountLabel,
    platformOrderNumber,
    taxPercent = 0,
    notes,
    payment,
    hold,
  } = body
  const shouldHold = hold === true

  if (typeof locationId !== "string") return err("locationId diperlukan")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)
  if (!Object.values(OrderType).includes(orderType as OrderType)) return err("Tipe pesanan tidak valid")

  // Masa tenang: pembayaran (bukan sekadar tahan) ditahan sesaat setelah opname
  // disimpan di outlet ini.
  if (!shouldHold) {
    const cooldown = await getPosCooldown(user.organizationId, locationId)
    if (cooldown.locked) {
      return ok({ error: `Opname baru disimpan — transaksi ditahan ${cooldown.secondsRemaining} detik`, secondsRemaining: cooldown.secondsRemaining }, 423)
    }
  }

  const paymentInput = payment as { method?: unknown; amount?: unknown; reference?: unknown; note?: unknown } | undefined
  if (!shouldHold && (!paymentInput || !Object.values(PaymentMethod).includes(paymentInput.method as PaymentMethod))) {
    return err("Metode pembayaran diperlukan")
  }

  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: user.organizationId },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)
  const today = new Date()
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0")

  try {
    const order = await prisma.$transaction(async (tx) => {
      // Order yang hanya ditahan belum mengubah stok. Kunci lokasi baru wajib
      // saat pembayaran langsung akan membukukan POS_SALE.
      if (!shouldHold) {
        const locationExists = await lockStockFlowLocation(tx, user.organizationId, locationId)
        if (!locationExists) throw new Error("LOCATION_UNAVAILABLE")
        const lockedCooldown = await getPosCooldown(user.organizationId, locationId, tx)
        if (lockedCooldown.locked) {
          throw new OpnameQuietPeriodError("POS_COOLDOWN", lockedCooldown.secondsRemaining)
        }
      }

      const priced = await priceOrderItems(tx, user.organizationId, items, {
        allowItemDiscount: ["OWNER", "SUPERVISOR"].includes(user.role),
      })
      const discount = await resolveOrderDiscount(tx, user.organizationId, locationId, priced.subtotal, user.role, {
        discountRuleId,
        discountType,
        discountValue,
        discountLabel,
      }, priced.items)
      const safeTaxPercent = resolveTaxPercent(taxPercent)
      const afterDiscount = priced.subtotal - discount.discountAmount
      const taxAmount = Math.round(afterDiscount * safeTaxPercent / 100)
      const total = afterDiscount + taxAmount

      const safeShiftId = typeof shiftId === "string" ? shiftId : null
      if (safeShiftId) {
        const activeShift = await tx.pOSShift.findFirst({
          where: { id: safeShiftId, organizationId: user.organizationId, locationId, status: "OPEN" },
          select: { id: true },
        })
        if (!activeShift) throw new Error("SHIFT_INVALID")
      }

      let orderNumber: string
      if (shouldHold) {
        orderNumber = `HOLD-${Date.now().toString().slice(-6)}`
      } else {
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
          shiftId: safeShiftId,
          cashierId: user.id,
          orderNumber,
          orderType: orderType as OrderType,
          tableNumber: typeof tableNumber === "string" && tableNumber.trim() ? tableNumber.trim() : null,
          customerName: typeof customerName === "string" && customerName.trim() ? customerName.trim() : null,
          status: shouldHold ? "HELD" : "PAID",
          subtotal: priced.subtotal,
          ...discount,
          platformOrderNumber: typeof platformOrderNumber === "string" && platformOrderNumber.trim() ? platformOrderNumber.trim() : null,
          taxPercent: safeTaxPercent,
          taxAmount,
          total,
          notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 500) : null,
          paidAt: shouldHold ? null : new Date(),
        },
      })

      for (const item of priced.items) {
        const orderItem = await tx.pOSOrderItem.create({
          data: {
            orderId: newOrder.id,
            menuItemId: item.menuItemId,
            name: item.name,
            price: item.unitPrice,
            qty: item.qty,
            discount: item.discount,
            subtotal: item.subtotal,
            notes: item.notes,
          },
        })
        if (item.modifiers.length > 0) {
          await tx.pOSOrderItemModifier.createMany({
            data: item.modifiers.map((modifier) => ({
              orderItemId: orderItem.id,
              optionId: modifier.optionId,
              groupName: modifier.groupName,
              optionName: modifier.optionName,
              price: modifier.price,
            })),
          })
        }
      }

      if (!shouldHold && paymentInput) {
        const method = paymentInput.method as PaymentMethod
        const tendered = method === "CASH" ? Number(paymentInput.amount) : total
        if (!Number.isFinite(tendered) || tendered < total) {
          throw new Error("PAYMENT_INSUFFICIENT")
        }
        await tx.pOSPayment.create({
          data: {
            orderId: newOrder.id,
            method,
            amount: tendered,
            change: method === "CASH" ? tendered - total : 0,
            reference: typeof paymentInput.reference === "string" && paymentInput.reference.trim() ? paymentInput.reference.trim() : null,
            note: typeof paymentInput.note === "string" && paymentInput.note.trim() ? paymentInput.note.trim() : null,
          },
        })
        const cogs = await deductOrderStock(tx, {
          organizationId: user.organizationId,
          orderId: newOrder.id,
          orderNumber,
          locationId,
          createdById: user.id,
        })
        await tx.pOSOrder.update({
          where: { id: newOrder.id },
          data: { cogsAmount: cogs.amount, cogsComplete: cogs.complete },
        })

        if (safeShiftId) {
          await tx.pOSShift.update({
            where: { id: safeShiftId },
            data: { totalSales: { increment: total }, totalOrders: { increment: 1 } },
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
  } catch (error) {
    if (error instanceof OpnameQuietPeriodError && error.kind === "POS_COOLDOWN") {
      return ok({
        error: `Opname baru disimpan — transaksi ditahan ${error.secondsRemaining} detik`,
        secondsRemaining: error.secondsRemaining,
      }, 423)
    }
    const message = asOrderError(error)
    if (message) return err(message, 422)
    if (error instanceof Error && error.message === "SHIFT_INVALID") return err("Shift tidak aktif atau bukan milik outlet", 409)
    if (error instanceof Error && error.message === "PAYMENT_INSUFFICIENT") return err("Jumlah pembayaran kurang", 422)
    if (error instanceof Error && error.message === "LOCATION_UNAVAILABLE") return err("Outlet sudah tidak tersedia", 409)
    throw error
  }
}
