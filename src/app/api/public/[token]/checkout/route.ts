import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, err } from "@/lib/api-helpers"
import { createSnap } from "@/lib/midtrans"

// POST /api/public/[token]/checkout
// Customer checkout via QR menu — creates PENDING_PAYMENT order + Snap token
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const location = await prisma.location.findUnique({
    where: { menuToken: token },
    include: {
      organization: {
        select: {
          id: true,
          midtransServerKey: true,
          midtransClientKey: true,
          midtransProduction: true,
          orderCounter: true,
        },
      },
    },
  })

  if (!location || !location.isActive) return err("Outlet tidak ditemukan", 404)

  const org = location.organization
  if (!org.midtransServerKey || !org.midtransClientKey) {
    return err("Pembayaran online belum tersedia di outlet ini", 400)
  }

  // Pastikan ada shift aktif
  const activeShift = await prisma.pOSShift.findFirst({
    where: { locationId: location.id, status: "OPEN" },
    select: { id: true },
  })
  if (!activeShift) return err("Kasir belum buka. Silakan hubungi kasir.", 400)

  const { items, tableNumber, customerName, notes, tableToken } = await req.json()
  if (!items || items.length === 0) return err("Pesanan harus memiliki item")
  if (!customerName?.trim()) return err("Nama pelanggan wajib diisi")

  let finalTableNumber = tableNumber?.trim() || ""
  if (tableToken) {
    const table = await prisma.table.findFirst({
      where: { tableToken, organizationId: org.id, locationId: location.id, isActive: true },
      select: { name: true },
    })
    if (!table) return err("Meja tidak valid, coba scan ulang QR", 400)
    finalTableNumber = table.name
  }
  if (!finalTableNumber) return err("Nomor meja wajib diisi")

  // Validasi item
  const menuItemIds: string[] = items.map((i: { menuItemId: string }) => i.menuItemId).filter(Boolean)
  if (menuItemIds.length > 0) {
    const dbItems = await prisma.inventoryItem.findMany({
      where: { id: { in: menuItemIds }, organizationId: org.id },
      select: { id: true, name: true, isActive: true, isAvailableForQr: true },
    })
    for (const dbItem of dbItems) {
      if (!dbItem.isActive || !dbItem.isAvailableForQr) {
        return err(`"${dbItem.name}" tidak tersedia saat ini`, 422)
      }
    }
  }

  const subtotal: number = items.reduce(
    (sum: number, item: { price: number; qty: number; modifiers?: { price: number }[] }) => {
      const modTotal = (item.modifiers ?? []).reduce((s, m) => s + Number(m.price), 0)
      return sum + (Number(item.price) + modTotal) * item.qty
    },
    0
  )

  const today = new Date()
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0")

  // Buat order + Snap token dalam satu transaksi
  const order = await prisma.$transaction(async (tx) => {
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
        tableNumber: finalTableNumber,
        customerName: customerName.trim(),
        status: "PENDING_PAYMENT",
        subtotal,
        discountAmount: 0,
        discountValue: 0,
        taxPercent: 0,
        taxAmount: 0,
        total: subtotal,
        notes: notes?.trim() || null,
      },
    })

    for (const item of items as {
      menuItemId: string; name: string; price: number; qty: number
      notes?: string; modifiers?: { groupName: string; optionName: string; price: number }[]
    }[]) {
      const modTotal = (item.modifiers ?? []).reduce((s, m) => s + Number(m.price), 0)
      const orderItem = await tx.pOSOrderItem.create({
        data: {
          orderId: newOrder.id,
          menuItemId: item.menuItemId ?? null,
          name: item.name,
          price: Number(item.price) + modTotal,
          qty: item.qty,
          discount: 0,
          subtotal: (Number(item.price) + modTotal) * item.qty,
          notes: item.notes || null,
        },
      })
      if (item.modifiers?.length) {
        await tx.pOSOrderItemModifier.createMany({
          data: item.modifiers.map((m) => ({
            orderItemId: orderItem.id,
            groupName: m.groupName,
            optionName: m.optionName,
            price: Number(m.price),
          })),
        })
      }
    }

    return newOrder
  })

  // Generate Snap token
  const snap = createSnap(org.midtransServerKey, org.midtransClientKey, org.midtransProduction)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await snap.createTransaction({
    transaction_details: {
      order_id: order.id,
      gross_amount: Math.round(subtotal),
    },
    customer_details: {
      first_name: customerName.trim(),
    },
    callbacks: {
      finish: `${process.env.NEXT_PUBLIC_APP_URL}/t/${token}`,
    },
  } as any) as { token: string }

  await prisma.pOSOrder.update({
    where: { id: order.id },
    data: { snapToken: result.token },
  })

  return ok({
    snapToken: result.token,
    clientKey: org.midtransClientKey,
    isProduction: org.midtransProduction,
    orderId: order.id,
    orderNumber: order.orderNumber,
  })
}
