import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { normalizeWhatsAppPhone } from "@/lib/whatsapp"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const typeParam = req.nextUrl.searchParams.get("type")
  const type = typeParam === "WAREHOUSE" || typeParam === "OUTLET" ? typeParam : undefined
  if (typeParam && !type) return err("Tipe lokasi tidak valid")
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
    // Gudang tetap dikelompokkan lebih dulu, lalu setiap lokasi mengikuti
    // urutan pembuatannya agar konsisten di seluruh kartu, tabel, dan dropdown.
    orderBy: [{ type: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  })
  return ok(locations)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { name, type, address, whatsappPhone, fulfillmentWarehouseId } = await req.json() as {
    name?: string
    type?: string
    address?: string
    whatsappPhone?: string | null
    fulfillmentWarehouseId?: string | null
  }
  if (!name || !type) return err("Nama dan tipe wajib diisi")
  if (type !== "WAREHOUSE" && type !== "OUTLET") return err("Tipe lokasi tidak valid")

  // Nomor WhatsApp penanggung jawab lokasi: penerima notifikasi permintaan
  // outlet (untuk gudang) dan peringatan stok menipis.
  const normalizedPhone = whatsappPhone?.trim()
    ? normalizeWhatsAppPhone(whatsappPhone)
    : null
  if (whatsappPhone?.trim() && !normalizedPhone) {
    return err("Nomor WhatsApp penanggung jawab tidak valid")
  }

  // Gudang yang memasok outlet ini saat outlet meminta stok.
  let warehouseId: string | null = null
  if (type === "OUTLET" && fulfillmentWarehouseId) {
    const warehouse = await prisma.location.findFirst({
      where: {
        id: fulfillmentWarehouseId,
        organizationId: user.organizationId,
        type: "WAREHOUSE",
        isActive: true,
      },
      select: { id: true },
    })
    if (!warehouse) return err("Gudang pemenuhan tidak valid")
    warehouseId = warehouse.id
  }

  const location = await prisma.location.create({
    data: {
      organizationId: user.organizationId,
      name,
      type,
      address,
      whatsappPhone: normalizedPhone,
      fulfillmentWarehouseId: type === "OUTLET" ? warehouseId : null,
    },
  })
  return ok(location, 201)
}
