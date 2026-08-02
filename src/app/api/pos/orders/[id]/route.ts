import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params

  const order = await prisma.pOSOrder.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      items: true,
      payments: true,
      cashier: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      shift: { select: { id: true, shiftNumber: true } },
    },
  })
  if (!order) return err("Pesanan tidak ditemukan", 404)
  return ok(order)
}

// PATCH — kasir ambil QR order: ubah OPEN → HELD dan assign ke shift kasir
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params
  const { shiftId } = await req.json()

  const order = await prisma.pOSOrder.findFirst({
    where: { id, organizationId: user.organizationId, status: "OPEN", shiftId: null },
  })
  if (!order) return err("Pesanan tidak ditemukan atau sudah diambil", 404)

  const updated = await prisma.pOSOrder.update({
    where: { id },
    data: { status: "HELD", shiftId: shiftId ?? null, cashierId: user.id },
  })
  return ok(updated)
}
