import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit, getFeatureAccess } from "@/lib/feature-access"
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

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? ""
  const activeParam = req.nextUrl.searchParams.get("active")
  const pageParam = req.nextUrl.searchParams.get("page")
  // Pemanggilan tanpa page dipakai sebagai opsi Supplier pada Barang Masuk.
  // Halaman pengelolaan Supplier sendiri wajib memiliki izin fitur Supplier.
  if (pageParam !== null && await getFeatureAccess(user, "SUPPLIERS") === null) {
    return err("Role Anda tidak memiliki akses ke fitur Supplier", 403)
  }
  const active = activeParam === "true" ? true : activeParam === "false" ? false : undefined
  const where: Prisma.SupplierWhereInput = {
    organizationId: user.organizationId,
    ...(active !== undefined ? { isActive: active } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { contactPerson: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  }

  if (pageParam === null) {
    const suppliers = await prisma.supplier.findMany({
      where: { ...where, isActive: active ?? true },
      orderBy: { name: "asc" },
    })
    return ok(suppliers)
  }

  const page = Math.max(1, Number(pageParam) || 1)
  const take = 30
  const [items, total, totalAll, activeCount] = await Promise.all([
    prisma.supplier.findMany({
      where,
      include: {
        extraPhones: { select: { id: true, phone: true, label: true }, orderBy: { createdAt: "asc" } },
        itemSuppliers: {
          include: {
            item: { select: { id: true, name: true, unit: true } },
            location: { select: { id: true, name: true, type: true } },
          },
          orderBy: [{ location: { name: "asc" } }, { item: { name: "asc" } }, { priority: "asc" }],
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (page - 1) * take,
      take,
    }),
    prisma.supplier.count({ where }),
    prisma.supplier.count({ where: { organizationId: user.organizationId } }),
    prisma.supplier.count({ where: { organizationId: user.organizationId, isActive: true } }),
  ])

  return ok({ items, total, totalAll, activeCount, page, pages: Math.ceil(total / take) })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "SUPPLIERS")
  if (forbidden) return forbidden

  const body = await req.json()
  const name = cleanOptional(body.name, 120)
  const email = cleanOptional(body.email, 160)
  const phoneInput = cleanOptional(body.phone, 40)
  const phone = phoneInput ? normalizeWhatsAppPhone(phoneInput) : null
  const responseTimeoutMinutes = timeoutMinutes(body.responseTimeoutMinutes, 120)
  const urgentResponseTimeoutMinutes = timeoutMinutes(body.urgentResponseTimeoutMinutes, 30)
  if (!name) return err("Nama supplier wajib diisi")
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return err("Format email tidak valid")
  if (phoneInput && !phone) return err("Format nomor WhatsApp tidak valid")
  const extraPhones = bacaNomorTambahan(body.extraPhones)
  if (typeof extraPhones === "string") return err(extraPhones)
  if (responseTimeoutMinutes == null || urgentResponseTimeoutMinutes == null || urgentResponseTimeoutMinutes > responseTimeoutMinutes) {
    return err("Batas balasan harus 5–1.440 menit dan batas mendesak tidak boleh lebih lama dari batas normal")
  }

  const duplicate = await prisma.supplier.findFirst({
    where: { organizationId: user.organizationId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  })
  if (duplicate) return err("Nama supplier sudah digunakan", 409)
  if (phone) {
    const nomorTerpakai = await prisma.supplier.findFirst({
      where: { organizationId: user.organizationId, normalizedPhone: phone },
      select: { name: true },
    })
    // Satu nomor tidak boleh dimiliki dua pemasok: balasan WhatsApp yang masuk
    // harus dapat dipastikan berasal dari pemasok yang mana.
    if (nomorTerpakai) return err(`Nomor WhatsApp ini sudah dipakai supplier "${nomorTerpakai.name}"`, 409)
  }

  const nomorBentrok = await nomorDipakaiSupplierLain(user.organizationId, [...(phone ? [phone] : []), ...extraPhones], null)
  if (nomorBentrok) return err(nomorBentrok, 409)

  const supplier = await prisma.supplier.create({
    data: {
      organizationId: user.organizationId,
      name,
      contactPerson: cleanOptional(body.contactPerson, 120),
      phone,
      // Disimpan terpisah agar keunikan nomor per organisasi dapat dijaga
      // database, bukan hanya diperiksa di aplikasi.
      normalizedPhone: phone,
      email,
      address: cleanOptional(body.address, 500),
      notes: cleanOptional(body.notes, 1000),
      responseTimeoutMinutes,
      urgentResponseTimeoutMinutes,
    },
  })

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "CREATE",
      entity: "Supplier",
      entityId: supplier.id,
      after: toAuditJson(supplier),
    },
  })
  if (extraPhones.length) await simpanNomorTambahan(user.organizationId, supplier.id, extraPhones, phone)

  return ok(supplier, 201)
}
