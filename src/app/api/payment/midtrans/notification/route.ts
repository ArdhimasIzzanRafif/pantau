import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    order_id: string
    status_code: string
    gross_amount: string
    signature_key: string
    transaction_status: string
    fraud_status?: string
    payment_type: string
    transaction_id: string
  }

  const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = body

  // order_id is POSOrder.id
  const order = await prisma.pOSOrder.findUnique({
    where: { id: order_id },
    include: { organization: { select: { midtransServerKey: true, ownerPhone: true, name: true } } },
  })

  if (!order || !order.organization.midtransServerKey) {
    return NextResponse.json({ ok: true })
  }

  // Verify signature: SHA512(order_id + status_code + gross_amount + server_key)
  const expected = crypto
    .createHash("sha512")
    .update(`${order_id}${status_code}${gross_amount}${order.organization.midtransServerKey}`)
    .digest("hex")

  if (signature_key !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const isSuccess =
    (transaction_status === "capture" && fraud_status === "accept") ||
    transaction_status === "settlement"

  const isFailed =
    transaction_status === "cancel" ||
    transaction_status === "deny" ||
    transaction_status === "expire"

  if (isSuccess && order.status !== "PAID") {
    // Cari shift aktif di lokasi ini untuk assign order
    const activeShift = await prisma.pOSShift.findFirst({
      where: { locationId: order.locationId, status: "OPEN" },
      select: { id: true },
    })

    await prisma.$transaction(async (tx) => {
      await tx.pOSOrder.update({
        where: { id: order_id },
        data: {
          status: "PAID",
          shiftId: activeShift?.id ?? null,
          paymentRef: body.transaction_id,
          paidAt: new Date(),
        },
      })

      await tx.pOSPayment.create({
        data: {
          orderId: order.id,
          method: "OTHER",
          amount: order.total,
          reference: body.transaction_id,
        },
      })

      // Deduct stock
      const orderItems = await tx.pOSOrderItem.findMany({
        where: { orderId: order.id },
        select: { menuItemId: true, qty: true },
      })
      for (const item of orderItems) {
        if (!item.menuItemId) continue
        const inv = await tx.inventoryItem.findUnique({
          where: { id: item.menuItemId },
          select: { isTrackable: true },
        })
        if (!inv?.isTrackable) continue
        await tx.stockBalance.updateMany({
          where: { itemId: item.menuItemId, locationId: order.locationId },
          data: { quantity: { decrement: item.qty } },
        })
      }

      // Update shift totals
      if (activeShift) {
        await tx.pOSShift.update({
          where: { id: activeShift.id },
          data: { totalSales: { increment: order.total } },
        })
      }
    })

    // WA notif ke owner
    const phone = order.organization.ownerPhone
    if (phone) {
      const rp = new Intl.NumberFormat("id-ID").format(Number(order.total))
      fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: process.env.WA_FONNTE_TOKEN ?? "" },
        body: new URLSearchParams({
          target: phone,
          message: `✅ *Pembayaran Diterima*\nPesanan: *${order.orderNumber}*\nMeja: *${order.tableNumber ?? "-"}*\nTotal: *Rp ${rp}*\nvia ${body.payment_type}`,
        }),
      }).catch(() => {})
    }
  } else if (isFailed && order.status === "PENDING_PAYMENT") {
    await prisma.pOSOrder.update({
      where: { id: order_id },
      data: { status: "VOID", voidReason: `Payment ${transaction_status}` },
    })
  }

  return NextResponse.json({ ok: true })
}
