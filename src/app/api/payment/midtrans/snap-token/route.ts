import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { createSnap } from "@/lib/midtrans"

// Called from POS to create a Midtrans Snap token for an existing order
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { orderId } = await req.json()
  if (!orderId) return err("orderId wajib diisi")

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { midtransServerKey: true, midtransClientKey: true, midtransProduction: true },
  })

  if (!org?.midtransServerKey || !org?.midtransClientKey) {
    return err("Midtrans belum dikonfigurasi. Hubungi pemilik untuk setup di Pengaturan.", 400)
  }

  const order = await prisma.pOSOrder.findUnique({
    where: { id: orderId, organizationId: user.organizationId },
    include: { items: true },
  })

  if (!order) return err("Pesanan tidak ditemukan", 404)
  if (order.status === "PAID") return err("Pesanan sudah lunas", 400)

  const snap = createSnap(org.midtransServerKey, org.midtransClientKey, org.midtransProduction)

  const result = await snap.createTransaction({
    transaction_details: {
      order_id: order.id,
      gross_amount: Math.round(Number(order.total)),
    },
    item_details: order.items.map((item) => ({
      id: item.menuItemId ?? "item",
      price: Math.round(Number(item.price)),
      quantity: item.qty,
      name: item.name.substring(0, 50),
    })),
    customer_details: {
      first_name: order.customerName ?? "Customer",
    },
    callbacks: {
      finish: `${process.env.NEXT_PUBLIC_APP_URL}/pos`,
    },
  }) as { token: string; redirect_url: string }

  await prisma.pOSOrder.update({
    where: { id: order.id },
    data: { snapToken: result.token },
  })

  return ok({
    snapToken: result.token,
    clientKey: org.midtransClientKey,
    isProduction: org.midtransProduction,
  })
}
