import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { denyUnlessCanEdit, getFeatureAccess } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { ambilBerkasPengadaan } from "@/lib/procurement-dossier"
import { remindSupplier, retryPurchaseRequestDelivery } from "@/lib/purchase-requests"
import { closePurchaseRequest, escalateToNextSupplier, KeputusanDitolak } from "@/lib/purchase-request-decisions"
import { getWhatsAppDeviceStatus, validateWhatsAppRecipient } from "@/lib/whatsapp"

/** Riwayat lengkap satu pengadaan, termasuk seluruh rantai eskalasinya. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (await getFeatureAccess(user, "SUPPLIERS") === null) return err("Tidak diizinkan", 403)

  const { id } = await params
  const berkas = await ambilBerkasPengadaan(user.organizationId, id)
  if (!berkas) return err("Pengadaan tidak ditemukan", 404)
  if (!(await canAccessLocation(user, berkas.ringkasan.lokasi.id))) {
    return err("Tidak ada akses ke lokasi ini", 403)
  }
  return ok(berkas)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "SUPPLIERS")
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const existing = await prisma.purchaseRequest.findFirst({ where: { id, organizationId: user.organizationId } })
  if (!existing) return err("Permintaan tidak ditemukan", 404)
  if (!(await canAccessLocation(user, existing.locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  const action = typeof body?.action === "string" ? body.action : ""
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : ""

  if (action === "RETRY_MESSAGE") {
    // UNCERTAIN ikut boleh, tetapi hanya lewat konfirmasi sadar di tampilan:
    // pesannya mungkin sudah sampai, jadi keputusannya ada di pengguna.
    const dapatDikirimUlang = ["FAILED", "UNCERTAIN", "DEAD"].includes(existing.messageStatus)
    if (existing.status !== "ACTIVE" || !dapatDikirimUlang) {
      return err("Pesan ini tidak dapat dikirim ulang", 409)
    }
    // Jangan mengubah pesan gagal menjadi antrean baru sebelum perangkat
    // benar-benar tersambung. Pemeriksaan di server tetap wajib agar aksi dari
    // klien lama atau permintaan langsung tidak melewati pemeriksaan koneksi.
    const perangkat = await getWhatsAppDeviceStatus(user.organizationId)
    if (!perangkat.connected) {
      return err(
        perangkat.error
          ? `Perangkat WhatsApp masih belum terhubung: ${perangkat.error}`
          : "Perangkat WhatsApp masih belum terhubung. Sambungkan perangkat, lalu periksa kembali.",
        409,
      )
    }
    const supplier = await prisma.supplier.findFirst({
      where: { id: existing.supplierId, organizationId: user.organizationId, isActive: true },
      select: { name: true, phone: true },
    })
    if (!supplier?.phone) return err("Nomor WhatsApp supplier belum diisi", 409)
    const validation = await validateWhatsAppRecipient(user.organizationId, supplier.phone)
    if (!validation.valid) return err(`${supplier.name}: ${validation.reason}. Perbaiki nomor supplier lalu coba lagi.`, validation.unavailable ? 503 : 409)
    const scheduled = await retryPurchaseRequestDelivery(id, user.organizationId)
    return scheduled ? ok({ success: true }) : err("Pesan sedang diproses atau statusnya telah berubah", 409)
  }

  if (action === "REMIND_SUPPLIER") {
    try {
      const result = await remindSupplier(id, user.organizationId, user.id)
      return ok({ success: true, ...result })
    } catch (error) {
      return err(error instanceof Error ? error.message : "Pengingat belum dapat dikirim", 409)
    }
  }

  const keputusan = ["ESCALATE", "STOP", "CANCEL"]
  if (!keputusan.includes(action)) {
    return err("Tindakan tidak dikenali", 400)
  }
  if (!note) return err("Isi alasan keputusan, maksimal 500 karakter")

  try {
    if (action === "ESCALATE") {
      // Pergantian supplier selalu diawali WA pembatalan ke supplier lama.
      // Tolak dari awal saat perangkat putus agar pesanan lama tetap aktif
      // dan supplier berikutnya tidak pernah dihubungi lebih dulu.
      const perangkat = await getWhatsAppDeviceStatus(user.organizationId)
      if (!perangkat.connected) {
        return err(
          perangkat.error
            ? `Belum dapat mengganti supplier: WhatsApp belum terhubung (${perangkat.error}).`
            : "Belum dapat mengganti supplier: WhatsApp belum terhubung.",
          409,
        )
      }
      const created = await escalateToNextSupplier(id, user.organizationId, user.id, note)
      return ok({
        success: true,
        message: `Pembatalan sudah dikirim ke ${created.previousSupplier}. Pesanan ${created.orderCode} untuk ${created.quantity} sudah dibuat dan diantrekan ke ${created.supplier}.`,
        ...created,
      })
    }
    const result = await closePurchaseRequest(
      id, user.organizationId, user.id,
      action === "STOP" ? "STOP" : "CANCEL", note,
    )
    return ok({ success: true, ...result })
  } catch (error) {
    if (error instanceof KeputusanDitolak) return err(error.message, error.status)
    console.error("Keputusan pengadaan gagal diproses", error)
    return err("Gagal memproses keputusan pengadaan", 500)
  }
}
