import { NextRequest } from "next/server"
import { PaymentMethod } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"
import { asOrderError, deductOrderStock } from "@/lib/pos-orders"
import { getPosCooldown, lockStockFlowLocation, OpnameQuietPeriodError } from "@/lib/opname-lock"

// POST /api/pos/orders/:id/pay — process payment on a held order
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { id } = await params
  const body = await req.json() as Record<string, unknown>
  const payment = body.payment as { method?: unknown; amount?: unknown; reference?: unknown; note?: unknown } | undefined
  const bodyShiftId = typeof body.shiftId === "string" ? body.shiftId : null

  if (!payment || !Object.values(PaymentMethod).includes(payment.method as PaymentMethod)) {
    return err("Metode pembayaran diperlukan")
  }

  const held = await prisma.pOSOrder.findFirst({
    where: { id, organizationId: user.organizationId, status: { in: ["HELD", "OPEN"] } },
    include: { items: true },
  })
  if (!held) return err("Order tidak ditemukan", 404)
  if (!(await canAccessLocation(user, held.locationId))) return err("Tidak ada akses ke outlet ini", 403)

  // Masa tenang: transaksi ditahan sesaat setelah opname disimpan di outlet ini.
  const cooldown = await getPosCooldown(user.organizationId, held.locationId)
  if (cooldown.locked) {
    return ok({ error: `Opname baru disimpan — transaksi ditahan ${cooldown.secondsRemaining} detik`, secondsRemaining: cooldown.secondsRemaining }, 423)
  }

  // QR orders (OPEN, no shiftId) need a shift assigned at payment time
  const resolvedShiftId = held.shiftId ?? bodyShiftId ?? null

  const today = new Date()
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0")

  try {
    const order = await prisma.$transaction(async (tx) => {
      const locationExists = await lockStockFlowLocation(tx, user.organizationId, held.locationId)
      if (!locationExists) throw new Error("LOCATION_UNAVAILABLE")
      const lockedCooldown = await getPosCooldown(user.organizationId, held.locationId, tx)
      if (lockedCooldown.locked) {
        throw new OpnameQuietPeriodError("POS_COOLDOWN", lockedCooldown.secondsRemaining)
      }

      if (resolvedShiftId) {
        const shift = await tx.pOSShift.findFirst({
          where: { id: resolvedShiftId, organizationId: user.organizationId, locationId: held.locationId, status: "OPEN" },
          select: { id: true },
        })
        if (!shift) throw new Error("SHIFT_INVALID")
      }

      const { orderCounter } = await tx.organization.update({
        where: { id: user.organizationId },
        data: { orderCounter: { increment: 1 } },
        select: { orderCounter: true },
      })

      const orderNumber = `ORD-${dateStr}-${String(orderCounter).padStart(4, "0")}`
      const total = Number(held.total)
      const method = payment.method as PaymentMethod
      const tendered = method === "CASH" ? Number(payment.amount) : total
      if (!Number.isFinite(tendered) || tendered < total) throw new Error("PAYMENT_INSUFFICIENT")

      const claimed = await tx.pOSOrder.updateMany({
        where: { id, organizationId: user.organizationId, status: { in: ["HELD", "OPEN"] } },
        data: {
          status: "PAID",
          orderNumber,
          paidAt: new Date(),
          cashierId: user.id,
          ...(resolvedShiftId && !held.shiftId ? { shiftId: resolvedShiftId } : {}),
        },
      })
      if (claimed.count !== 1) throw new Error("ALREADY_PAID")

      await tx.pOSPayment.create({
        data: {
          orderId: id,
          method,
          amount: tendered,
          change: method === "CASH" ? tendered - total : 0,
          reference: typeof payment.reference === "string" && payment.reference.trim() ? payment.reference.trim() : null,
          note: typeof payment.note === "string" && payment.note.trim() ? payment.note.trim() : null,
        },
      })

      const cogs = await deductOrderStock(tx, {
        organizationId: user.organizationId,
        orderId: id,
        orderNumber,
        locationId: held.locationId,
        createdById: user.id,
      })
      await tx.pOSOrder.update({
        where: { id },
        data: { cogsAmount: cogs.amount, cogsComplete: cogs.complete },
      })

      if (resolvedShiftId) {
        await tx.pOSShift.update({
          where: { id: resolvedShiftId },
          data: { totalSales: { increment: total }, totalOrders: { increment: 1 } },
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
    if (error instanceof Error && error.message === "ALREADY_PAID") return err("Order sudah diproses oleh kasir lain", 409)
    if (error instanceof Error && error.message === "LOCATION_UNAVAILABLE") return err("Outlet sudah tidak tersedia", 409)
    throw error
  }
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
