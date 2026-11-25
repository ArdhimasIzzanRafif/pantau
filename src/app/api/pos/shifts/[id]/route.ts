import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { getHistoryScope } from "@/lib/history-scope"
import { visibleShiftCash } from "@/lib/shift-cash-visibility"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params
  const historyScope = await getHistoryScope(user, req.nextUrl.searchParams.get("history") === "1")
  if (!historyScope.allowed) return err("Tidak memiliki akses ke Riwayat", 403)
  if (req.nextUrl.searchParams.get("history") === "1" && user.role !== "OWNER") {
    return err("Riwayat shift hanya dapat dilihat Owner", 403)
  }

  const shift = await prisma.pOSShift.findFirst({
    where: {
      id,
      organizationId: user.organizationId,
      ...(historyScope.actorId && { cashierId: historyScope.actorId }),
    },
    include: {
      cashier: { select: { id: true, name: true, email: true } },
      location: { select: { id: true, name: true } },
      orders: {
        include: {
          items: { include: { modifiers: true } },
          payments: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  })
  if (!shift) return err("Shift tidak ditemukan", 404)
  return ok(visibleShiftCash(shift, user.role))
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
  if (shift.cashierId !== user.id) return err("Kamu hanya bisa menutup shift yang kamu buka sendiri", 403)
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

  const claimed = await prisma.pOSShift.updateMany({
    where: { id, organizationId: user.organizationId, cashierId: user.id, status: "OPEN" },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closingBalance: closingBalance ?? null,
      expectedCash,
      notes: notes ?? null,
    },
  })
  if (claimed.count !== 1) return err("Shift sudah ditutup. Muat ulang halaman untuk melihat status terbaru.", 409)

  const updated = await prisma.pOSShift.findUnique({
    where: { id },
    include: {
      cashier: { select: { id: true, name: true, email: true } },
      location: { select: { id: true, name: true } },
    },
  })

  return ok(updated ? visibleShiftCash(updated, user.role) : null)
}
