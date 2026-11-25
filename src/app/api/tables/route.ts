import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const locationId = new URL(req.url).searchParams.get("locationId")
  const where: Record<string, unknown> = { organizationId: user.organizationId }
  if (locationId) where.locationId = locationId

  const tables = await prisma.table.findMany({
    where,
    include: { location: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })
  return ok(tables)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  // QR meja diurus juga oleh Supervisor dan Admin Gudang yang menyiapkan outlet,
  // bukan hanya Owner.
  if (!["OWNER", "SUPERVISOR", "ADMIN_GUDANG"].includes(user.role)) return err("Tidak diizinkan", 403)

  const { locationId, name, sortOrder } = await req.json()
  if (!locationId) return err("locationId diperlukan")
  if (!name?.trim()) return err("Nama meja diperlukan")

  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: user.organizationId },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)

  const table = await prisma.table.create({
    data: {
      organizationId: user.organizationId,
      locationId,
      name: name.trim(),
      sortOrder: sortOrder ?? 0,
    },
    include: { location: { select: { id: true, name: true } } },
  })
  return ok(table, 201)
}
