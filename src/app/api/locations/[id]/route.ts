import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { normalizeWhatsAppPhone } from "@/lib/whatsapp"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  if (user.role !== "OWNER") return err("Hanya Owner yang bisa mengubah lokasi", 403)

  const { id } = await params
  const { name, address, whatsappPhone, fulfillmentWarehouseId } = await req.json() as {
    name?: string
    address?: string | null
    whatsappPhone?: string | null
    fulfillmentWarehouseId?: string | null
  }

  const location = await prisma.location.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)

  // undefined = tidak dikirim, jadi nilai lama dipertahankan.
  let normalizedPhone = location.whatsappPhone
  if (whatsappPhone !== undefined) {
    normalizedPhone = whatsappPhone?.trim() ? normalizeWhatsAppPhone(whatsappPhone) : null
    if (whatsappPhone?.trim() && !normalizedPhone) return err("Nomor WhatsApp penanggung jawab tidak valid")
  }

  let warehouseId = location.fulfillmentWarehouseId
  if (location.type === "OUTLET" && fulfillmentWarehouseId !== undefined) {
    warehouseId = fulfillmentWarehouseId || null
    if (warehouseId) {
      const warehouse = await prisma.location.findFirst({
        where: {
          id: warehouseId,
          organizationId: user.organizationId,
          type: "WAREHOUSE",
          isActive: true,
        },
        select: { id: true },
      })
      if (!warehouse) return err("Gudang pemenuhan tidak valid")
    }
  }

  const updated = await prisma.location.update({
    where: { id },
    data: {
      name: name ?? location.name,
      address: address !== undefined ? address : location.address,
      whatsappPhone: normalizedPhone,
      fulfillmentWarehouseId: location.type === "OUTLET" ? warehouseId : null,
    },
  })

  return ok(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  if (user.role !== "OWNER") return err("Hanya Owner yang bisa menghapus lokasi", 403)

  const { id } = await params

  const location = await prisma.location.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)

  await prisma.$transaction(async (tx) => {
    // Outlet yang dipasok gudang ini dilepas dari gudangnya.
    if (location.type === "WAREHOUSE") {
      await tx.location.updateMany({
        where: { organizationId: user.organizationId, fulfillmentWarehouseId: id },
        data: { fulfillmentWarehouseId: null },
      })
    }
    await tx.location.update({ where: { id }, data: { isActive: false } })
  })

  return ok({ message: "Lokasi dinonaktifkan" })
}
