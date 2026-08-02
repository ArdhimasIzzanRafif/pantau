import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, err } from "@/lib/api-helpers"

// GET /api/public/[token]/session?sessionId=xxx
// Dipakai customer untuk track status pesanan mereka (tanpa login)
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sessionId = new URL(req.url).searchParams.get("sessionId")
  if (!sessionId) return err("sessionId diperlukan", 400)

  const location = await prisma.location.findUnique({
    where: { menuToken: token },
    select: { id: true, isActive: true },
  })
  if (!location || !location.isActive) return err("Outlet tidak ditemukan", 404)

  const orders = await prisma.pOSOrder.findMany({
    where: { guestSessionId: sessionId, locationId: location.id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      tableNumber: true,
      customerName: true,
      createdAt: true,
      items: {
        select: { name: true, qty: true, price: true },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  const grandTotal = orders.reduce((s, o) => s + Number(o.total), 0)

  // Status ringkasan untuk customer
  const allPaid = orders.length > 0 && orders.every(o => o.status === "PAID")
  const anyVoid = orders.some(o => o.status === "VOID")
  const anyHeld = orders.some(o => o.status === "HELD")
  const sessionStatus = allPaid ? "PAID" : anyVoid && orders.every(o => o.status === "VOID") ? "VOID" : anyHeld ? "HELD" : "OPEN"

  return ok({ orders, grandTotal, sessionStatus })
}
