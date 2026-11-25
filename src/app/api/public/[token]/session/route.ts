import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, err } from "@/lib/api-helpers"
import { isGuestSessionId } from "@/lib/guest-bill"

// Only the opaque browser session grants access, never a shared table QR/name.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const url = new URL(req.url)
  const sessionId = url.searchParams.get("sessionId")
  if (!isGuestSessionId(sessionId)) return err("Sesi pesanan tidak valid", 400)

  const location = await prisma.location.findUnique({
    where: { menuToken: token },
    select: { id: true, isActive: true },
  })
  if (!location || !location.isActive) return err("Outlet tidak ditemukan", 404)

  const selectFields = {
    id: true,
    orderNumber: true,
    status: true,
    total: true,
    tableNumber: true,
    customerName: true,
    guestSessionId: true,
    createdAt: true,
    items: {
      select: { name: true, qty: true, price: true },
    },
  } as const

  // Pesanan milik tamu ini (semua status) — untuk riwayat pribadi & logika reset sesi.
  const own = await prisma.pOSOrder.findMany({
    where: { guestSessionId: sessionId, locationId: location.id },
    select: selectFields,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  // Buang guestSessionId dari payload; ganti dengan flag isMine.
  const orders = own.map(({ guestSessionId, ...rest }) => ({
    ...rest,
    isMine: guestSessionId === sessionId,
  }))

  const myOrders = orders.filter(o => o.isMine)
  const myTotal = myOrders.reduce((s, o) => s + Number(o.total), 0)
  const tableTotal = orders.reduce((s, o) => s + Number(o.total), 0)

  // Ringkasan status untuk tamu ini — dihitung dari pesanannya SENDIRI saja.
  const allPaid = myOrders.length > 0 && myOrders.every(o => o.status === "PAID")
  const anyVoid = myOrders.some(o => o.status === "VOID")
  const anyHeld = myOrders.some(o => o.status === "HELD")
  const sessionStatus = allPaid
    ? "PAID"
    : anyVoid && myOrders.every(o => o.status === "VOID")
      ? "VOID"
      : anyHeld
        ? "HELD"
        : "OPEN"

  return ok({ orders, myTotal, tableTotal, sessionStatus })
}
