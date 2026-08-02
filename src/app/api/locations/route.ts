import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const type = req.nextUrl.searchParams.get("type") ?? undefined
  const LOCATION_SCOPED_ROLES = ["SUPERVISOR", "ADMIN_GUDANG"]

  let locationIdFilter: string[] | undefined
  if (LOCATION_SCOPED_ROLES.includes(user.role)) {
    const orgUser = await prisma.organizationUser.findFirst({
      where: { userId: user.id, organizationId: user.organizationId },
      include: { assignedLocations: { select: { locationId: true } } },
    })
    locationIdFilter = orgUser?.assignedLocations.map((l) => l.locationId) ?? []
  }

  const locations = await prisma.location.findMany({
    where: {
      organizationId: user.organizationId,
      isActive: true,
      ...(type ? { type } : {}),
      ...(locationIdFilter ? { id: { in: locationIdFilter } } : {}),
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  })
  return ok(locations)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { name, type, address } = await req.json()
  if (!name || !type) return err("Nama dan tipe wajib diisi")

  const location = await prisma.location.create({
    data: { organizationId: user.organizationId, name, type, address },
  })
  return ok(location, 201)
}
