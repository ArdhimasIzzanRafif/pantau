import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { restoreOrderStock } from "@/lib/pos-orders"

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
      await restoreOrderStock(tx, {
        organizationId: user.organizationId,
        orderId: id,
        locationId: order.locationId,
        createdById: user.id,
        reason: typeof reason === "string" ? reason : null,
      })

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
