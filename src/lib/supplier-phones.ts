import "server-only"

import { prisma } from "@/lib/db"
import { normalizeWhatsAppPhone } from "@/lib/whatsapp"

/**
 * Nomor WA tambahan supplier (admin, sales). Balasan dari nomor ini dianggap
 * dari supplier tersebut. Satu nomor tidak boleh milik dua supplier, supaya
 * balasan yang masuk selalu jelas asalnya.
 */
export function bacaNomorTambahan(value: unknown): string[] | string {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return "Daftar nomor tambahan tidak valid"
  const hasil: string[] = []
  for (const mentah of value.slice(0, 5)) {
    if (typeof mentah !== "string" || !mentah.trim()) continue
    const nomor = normalizeWhatsAppPhone(mentah.trim())
    if (!nomor) return `Format nomor tambahan "${mentah}" tidak valid`
    if (!hasil.includes(nomor)) hasil.push(nomor)
  }
  return hasil
}

/** Pesan galat bila salah satu nomor sudah dipakai supplier lain, atau null. */
export async function nomorDipakaiSupplierLain(organizationId: string, phones: string[], supplierId: string | null) {
  if (phones.length === 0) return null
  const utama = await prisma.supplier.findFirst({
    where: { organizationId, normalizedPhone: { in: phones }, ...(supplierId ? { id: { not: supplierId } } : {}) },
    select: { name: true, normalizedPhone: true },
  })
  if (utama) return `Nomor ${utama.normalizedPhone} sudah dipakai supplier "${utama.name}"`
  const tambahan = await prisma.supplierPhone.findFirst({
    where: { organizationId, phone: { in: phones }, ...(supplierId ? { supplierId: { not: supplierId } } : {}) },
    select: { phone: true, supplier: { select: { name: true } } },
  })
  if (tambahan) return `Nomor ${tambahan.phone} sudah dipakai supplier "${tambahan.supplier.name}"`
  return null
}

/** Mengganti seluruh nomor tambahan supplier dengan daftar baru. */
export async function simpanNomorTambahan(organizationId: string, supplierId: string, phones: string[], nomorUtama: string | null) {
  const daftar = phones.filter((phone) => phone !== nomorUtama)
  await prisma.$transaction([
    prisma.supplierPhone.deleteMany({ where: { organizationId, supplierId, phone: { notIn: daftar } } }),
    ...daftar.map((phone) => prisma.supplierPhone.upsert({
      where: { organizationId_phone: { organizationId, phone } },
      update: {},
      create: { organizationId, supplierId, phone },
    })),
  ])
}
