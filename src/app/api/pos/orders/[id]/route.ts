import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"

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
      items: { include: { modifiers: true } },
      payments: true,
      cashier: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      shift: { select: { id: true, shiftNumber: true } },
    },
  })
  if (!order) return err("Pesanan tidak ditemukan", 404)
  return ok(order)
}

// PATCH — kasir menerima QR order: ubah OPEN → HELD agar masuk daftar
// pesanan aktif. Pembayaran dilakukan terpisah setelah pelanggan selesai.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params
  const { shiftId } = await req.json() as { shiftId?: string }

  const order = await prisma.pOSOrder.findFirst({
    where: { id, organizationId: user.organizationId, status: "OPEN", shiftId: null },
  })
  if (!order) return err("Pesanan tidak ditemukan atau sudah diambil", 404)
  if (!(await canAccessLocation(user, order.locationId))) return err("Tidak ada akses ke outlet ini", 403)

  if (!shiftId) return err("Buka shift sebelum memproses pesanan", 409)
  const activeShift = await prisma.pOSShift.findFirst({
    where: {
      id: shiftId,
      organizationId: user.organizationId,
      locationId: order.locationId,
      status: "OPEN",
    },
    select: { id: true },
  })
  if (!activeShift) return err("Shift tidak aktif atau bukan milik outlet", 409)

  const claimed = await prisma.pOSOrder.updateMany({
    where: { id, organizationId: user.organizationId, status: "OPEN", shiftId: null },
    data: { status: "HELD", shiftId, cashierId: user.id },
  })
  if (claimed.count !== 1) return err("Pesanan sudah diproses kasir lain", 409)

  const updated = await prisma.pOSOrder.findUnique({ where: { id } })
  return ok(updated)
}
