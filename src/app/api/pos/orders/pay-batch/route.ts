import { NextRequest } from "next/server"
import { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"
import { asOrderError, deductOrderStock } from "@/lib/pos-orders"
import { getPosCooldown, lockStockFlowLocation, OpnameQuietPeriodError } from "@/lib/opname-lock"
import { guestBillKey } from "@/lib/guest-bill"

// Multiple orders may be paid together only within the same customer session.
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { orderIds, payment, shiftId } = await req.json() as {
    orderIds?: unknown
    payment?: { method?: unknown; amount?: unknown; reference?: unknown }
    shiftId?: unknown
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0) return err("orderIds wajib diisi")
  if (!payment || !Object.values(PaymentMethod).includes(payment.method as PaymentMethod)) {
    return err("Metode pembayaran diperlukan")
  }
  const ids = [...new Set(orderIds.filter((id): id is string => typeof id === "string"))]
  if (ids.length !== orderIds.length) return err("orderIds tidak valid")

  const orders = await prisma.pOSOrder.findMany({
    where: {
      id: { in: ids },
      organizationId: user.organizationId,
      status: { in: ["OPEN", "HELD"] },
    },
  })

  if (orders.length !== ids.length) return err("Ada order yang tidak ditemukan atau sudah diproses", 409)
  if (new Set(orders.map(guestBillKey)).size !== 1) return err("Tagihan pelanggan berbeda harus dibayar terpisah", 409)

  const combinedTotal = orders.reduce((s, o) => s + Number(o.total), 0)
  const locationId = orders[0].locationId
  if (orders.some((order) => order.locationId !== locationId)) return err("Semua order harus berasal dari outlet yang sama")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke outlet ini", 403)

  const cooldown = await getPosCooldown(user.organizationId, locationId)
  if (cooldown.locked) {
    return ok({ error: `Opname baru disimpan — transaksi ditahan ${cooldown.secondsRemaining} detik`, secondsRemaining: cooldown.secondsRemaining }, 423)
  }

  const resolvedShiftId = typeof shiftId === "string" ? shiftId : orders.find((order) => order.shiftId)?.shiftId ?? null

  try {
    await prisma.$transaction(async (tx) => {
      const locationExists = await lockStockFlowLocation(tx, user.organizationId, locationId)
      if (!locationExists) throw new Error("LOCATION_UNAVAILABLE")
      const lockedCooldown = await getPosCooldown(user.organizationId, locationId, tx)
      if (lockedCooldown.locked) {
        throw new OpnameQuietPeriodError("POS_COOLDOWN", lockedCooldown.secondsRemaining)
      }

      const now = new Date()
      if (resolvedShiftId) {
        const shift = await tx.pOSShift.findFirst({
          where: { id: resolvedShiftId, organizationId: user.organizationId, locationId, status: "OPEN" },
          select: { id: true },
        })
        if (!shift) throw new Error("SHIFT_INVALID")
      }

      for (const order of orders) {
        const claimed = await tx.pOSOrder.updateMany({
          where: { id: order.id, organizationId: user.organizationId, status: { in: ["OPEN", "HELD"] } },
          data: {
            status: "PAID",
            paidAt: now,
            cashierId: user.id,
            ...(resolvedShiftId && !order.shiftId ? { shiftId: resolvedShiftId } : {}),
          },
        })
        if (claimed.count !== 1) throw new Error("ALREADY_PAID")
        const cogs = await deductOrderStock(tx, {
          organizationId: user.organizationId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          locationId,
          createdById: user.id,
        })
        await tx.pOSOrder.update({
          where: { id: order.id },
          data: { cogsAmount: cogs.amount, cogsComplete: cogs.complete },
        })
      }

      const method = payment.method as PaymentMethod
      const tendered = method === "CASH" ? Number(payment.amount) : combinedTotal
      if (!Number.isFinite(tendered) || tendered < combinedTotal) throw new Error("PAYMENT_INSUFFICIENT")
      await tx.pOSPayment.create({
        data: {
          orderId: orders[0].id,
          method,
          amount: tendered,
          change: method === "CASH" ? tendered - combinedTotal : 0,
          reference: typeof payment.reference === "string" && payment.reference.trim() ? payment.reference.trim() : null,
          note: `Pembayaran gabungan ${orders.length} order`,
        },
      })

      if (resolvedShiftId) {
        await tx.pOSShift.update({
          where: { id: resolvedShiftId },
          data: { totalSales: { increment: combinedTotal }, totalOrders: { increment: orders.length } },
        })
      }
    })
  } catch (error) {
    if (error instanceof OpnameQuietPeriodError && error.kind === "POS_COOLDOWN") {
      return ok({
        error: `Opname baru disimpan — transaksi ditahan ${error.secondsRemaining} detik`,
        secondsRemaining: error.secondsRemaining,
      }, 423)
    }
    const message = asOrderError(error)
    if (message) return err(message, 409)
    if (error instanceof Error && error.message === "SHIFT_INVALID") return err("Shift tidak aktif atau bukan milik outlet", 409)
    if (error instanceof Error && error.message === "PAYMENT_INSUFFICIENT") return err("Jumlah pembayaran kurang", 422)
    if (error instanceof Error && error.message === "ALREADY_PAID") return err("Ada order yang sudah diproses kasir lain", 409)
    if (error instanceof Error && error.message === "LOCATION_UNAVAILABLE") return err("Outlet sudah tidak tersedia", 409)
    throw error
  }

  return ok({
    paidCount: orders.length,
    total: combinedTotal,
    tableNumber: orders[0].tableNumber,
    orderNumbers: orders.map(o => o.orderNumber),
  })
}
