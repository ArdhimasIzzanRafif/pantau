import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const status     = searchParams.get("status")
  const mine       = searchParams.get("mine") === "true"
  const page       = Math.max(1, Number(searchParams.get("page") ?? 1))
  const take       = 30

  const where: Record<string, unknown> = { organizationId: user.organizationId }
  if (locationId) where.locationId = locationId
  if (status)     where.status = status
  if (mine)       where.cashierId = user.id

  const [total, shifts] = await Promise.all([
    prisma.pOSShift.count({ where }),
    prisma.pOSShift.findMany({
      where,
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        location: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
  ])

  return ok({ items: shifts, total, page, pages: Math.ceil(total / take) })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const body = await req.json()
  const { locationId, openingBalance = 0 } = body

  if (!locationId) return err("locationId diperlukan")

  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: user.organizationId },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)

  const myOpenShift = await prisma.pOSShift.findFirst({
    where: { organizationId: user.organizationId, locationId, cashierId: user.id, status: "OPEN" },
  })
  if (myOpenShift) return err("Kamu sudah punya shift yang sedang buka", 409)

  const today = new Date()
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0")

  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(todayStart.getTime() + 86400000)

  const countToday = await prisma.pOSShift.count({
    where: {
      organizationId: user.organizationId,
      locationId,
      openedAt: { gte: todayStart, lt: todayEnd },
    },
  })

  const shiftNumber = `SHIFT-${dateStr}-${String(countToday + 1).padStart(2, "0")}`

  const shift = await prisma.pOSShift.create({
    data: {
      organizationId: user.organizationId,
      locationId,
      cashierId: user.id,
      shiftNumber,
      openingBalance,
      status: "OPEN",
    },
    include: {
      cashier: { select: { id: true, name: true, email: true } },
      location: { select: { id: true, name: true } },
    },
  })

  return ok(shift, 201)
}
