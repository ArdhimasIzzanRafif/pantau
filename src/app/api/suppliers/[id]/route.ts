import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { normalizeWhatsAppPhone } from "@/lib/whatsapp"
import { bacaNomorTambahan, nomorDipakaiSupplierLain, simpanNomorTambahan } from "@/lib/supplier-phones"

function cleanOptional(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function timeoutMinutes(value: unknown, fallback: number) {
  if (value == null || value === "") return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 5 && parsed <= 1440 ? parsed : null
}

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "SUPPLIERS")
  if (forbidden) return forbidden

  const { id } = await params
  const supplier = await prisma.supplier.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!supplier) return err("Supplier tidak ditemukan", 404)

  const body = await req.json()
  const name = body.name !== undefined ? cleanOptional(body.name, 120) : supplier.name
  const email = body.email !== undefined ? cleanOptional(body.email, 160) : supplier.email
  const phoneInput = body.phone !== undefined ? cleanOptional(body.phone, 40) : supplier.phone
  const phone = phoneInput ? normalizeWhatsAppPhone(phoneInput) : null
  const responseTimeoutMinutes = timeoutMinutes(body.responseTimeoutMinutes, supplier.responseTimeoutMinutes)
  const urgentResponseTimeoutMinutes = timeoutMinutes(body.urgentResponseTimeoutMinutes, supplier.urgentResponseTimeoutMinutes)
  if (!name) return err("Nama supplier wajib diisi")
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return err("Format email tidak valid")
  if (phoneInput && !phone) return err("Format nomor WhatsApp tidak valid")
  const extraPhones = bacaNomorTambahan(body.extraPhones)
  if (typeof extraPhones === "string") return err(extraPhones)
  if (responseTimeoutMinutes == null || urgentResponseTimeoutMinutes == null || urgentResponseTimeoutMinutes > responseTimeoutMinutes) {
    return err("Batas balasan harus 5–1.440 menit dan batas mendesak tidak boleh lebih lama dari batas normal")
  }
  if (phone) {
    const nomorTerpakai = await prisma.supplier.findFirst({
      where: { organizationId: user.organizationId, normalizedPhone: phone, id: { not: id } },
      select: { name: true },
    })
    if (nomorTerpakai) return err(`Nomor WhatsApp ini sudah dipakai supplier "${nomorTerpakai.name}"`, 409)
  }

  const duplicate = await prisma.supplier.findFirst({
    where: {
      organizationId: user.organizationId,
      id: { not: id },
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  })
  if (duplicate) return err("Nama supplier sudah digunakan", 409)

  const nomorBentrok = await nomorDipakaiSupplierLain(user.organizationId, [...(phone ? [phone] : []), ...extraPhones], id)
  if (nomorBentrok) return err(nomorBentrok, 409)

  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      name,
      contactPerson: body.contactPerson !== undefined ? cleanOptional(body.contactPerson, 120) : supplier.contactPerson,
      phone,
      normalizedPhone: phone,
      email,
      address: body.address !== undefined ? cleanOptional(body.address, 500) : supplier.address,
      notes: body.notes !== undefined ? cleanOptional(body.notes, 1000) : supplier.notes,
      isActive: typeof body.isActive === "boolean" ? body.isActive : supplier.isActive,
      responseTimeoutMinutes,
      urgentResponseTimeoutMinutes,
    },
  })

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "UPDATE",
      entity: "Supplier",
      entityId: id,
      before: toAuditJson(supplier),
      after: toAuditJson(updated),
    },
  })
  // Hanya diganti bila form mengirim daftarnya (aktifkan/nonaktifkan tidak menyentuh).
  if (body.extraPhones !== undefined) await simpanNomorTambahan(user.organizationId, id, extraPhones, phone)

  return ok(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "SUPPLIERS")
  if (forbidden) return forbidden

  const { id } = await params
  const supplier = await prisma.supplier.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!supplier) return err("Supplier tidak ditemukan", 404)

  const updated = await prisma.supplier.update({ where: { id }, data: { isActive: false } })
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "UPDATE",
      entity: "Supplier",
      entityId: id,
      before: toAuditJson(supplier),
      after: toAuditJson(updated),
    },
  })

  return ok({ message: "Supplier dinonaktifkan" })
}
