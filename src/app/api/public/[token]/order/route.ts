import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, err } from "@/lib/api-helpers"
import { asOrderError, assertPricedStockAvailable, priceOrderItems } from "@/lib/pos-orders"
import { isGuestSessionId } from "@/lib/guest-bill"
import { GuestSessionError, resolveGuestOrderIdentity } from "@/lib/guest-order-session"

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const location = await prisma.location.findUnique({
    where: { menuToken: token },
    include: { organization: { select: { id: true } } },
  })

  if (!location || !location.isActive) return err("Outlet tidak ditemukan", 404)

  const body = await req.json() as Record<string, unknown>
  const { items, tableNumber, customerName, notes, guestSessionId, tableToken } = body
  if (typeof customerName !== "string" || !customerName.trim()) return err("Nama pelanggan wajib diisi")
  if (customerName.trim().length > 100) return err("Nama pelanggan maksimal 100 karakter")
  if (!isGuestSessionId(guestSessionId)) return err("Sesi pesanan tidak valid. Muat ulang halaman.")

  const org = location.organization

  const openShift = await prisma.pOSShift.findFirst({
    where: { organizationId: org.id, locationId: location.id, status: "OPEN" },
    select: { id: true },
  })
  if (!openShift) return err("Kasir outlet belum membuka shift", 409)

  let finalTableNumber = typeof tableNumber === "string" ? tableNumber.trim() : ""
  if (typeof tableToken === "string" && tableToken) {
    const table = await prisma.table.findFirst({
      where: { tableToken, organizationId: org.id, locationId: location.id, isActive: true },
      select: { name: true },
    })
    if (!table) return err("Meja tidak valid, coba scan ulang QR", 400)
    finalTableNumber = table.name
  }
  if (!finalTableNumber) return err("Nomor meja wajib diisi")

  const today = new Date()
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0")

  try {
    const order = await prisma.$transaction(async (tx) => {
      const identity = await resolveGuestOrderIdentity(tx, location.id, guestSessionId, customerName.trim(), finalTableNumber)
      const priced = await priceOrderItems(tx, org.id, items, { qrOnly: true })
      await assertPricedStockAvailable(tx, { organizationId: org.id, locationId: location.id, items: priced.items })
      const { orderCounter } = await tx.organization.update({
        where: { id: org.id },
        data: { orderCounter: { increment: 1 } },
        select: { orderCounter: true },
      })
      const orderNumber = `ORD-${dateStr}-${String(orderCounter).padStart(4, "0")}`

      const newOrder = await tx.pOSOrder.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          orderNumber,
          orderType: "DINE_IN",
          tableNumber: identity.tableNumber,
          customerName: identity.customerName,
          guestSessionId,
          status: "OPEN",
          subtotal: priced.subtotal,
          discountAmount: 0,
          discountValue: 0,
          taxPercent: 0,
          taxAmount: 0,
          total: priced.subtotal,
          notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 500) : null,
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
            discount: 0,
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
      return newOrder
    })

    return ok({ orderNumber: order.orderNumber, orderId: order.id, total: Number(order.total), customerName: order.customerName, tableNumber: order.tableNumber }, 201)
  } catch (error) {
    if (error instanceof GuestSessionError) return err(error.message, 409)
    const message = asOrderError(error)
    if (message) return err(message, 422)
    throw error
  }
}
