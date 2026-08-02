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

  const shift = await prisma.pOSShift.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      cashier: { select: { id: true, name: true, email: true } },
      location: { select: { id: true, name: true } },
      orders: {
        include: { items: true, payments: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!shift) return err("Shift tidak ditemukan", 404)
  return ok(shift)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params

  const shift = await prisma.pOSShift.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!shift) return err("Shift tidak ditemukan", 404)
  if (shift.status === "CLOSED") return err("Shift sudah ditutup")

  const body = await req.json()
  const { closingBalance, notes } = body

  const cashPayments = await prisma.pOSPayment.aggregate({
    where: {
      method: "CASH",
      order: { shiftId: id, status: "PAID" },
    },
    _sum: { amount: true },
  })

  const cashSales = Number(cashPayments._sum.amount ?? 0)
  const expectedCash = Number(shift.openingBalance) + cashSales

  const updated = await prisma.pOSShift.update({
    where: { id },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closingBalance: closingBalance ?? null,
      expectedCash,
      notes: notes ?? null,
    },
    include: {
      cashier: { select: { id: true, name: true, email: true } },
      location: { select: { id: true, name: true } },
    },
  })

  return ok(updated)
}
