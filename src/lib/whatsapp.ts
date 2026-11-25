import "server-only"
import { prisma } from "@/lib/db"
import { decryptWhatsAppToken } from "@/lib/whatsapp-token-crypto"

export type WhatsAppSendResult = {
  ok: boolean
  providerMessageId: string | null
  error: string | null
  /// Permintaan terkirim tetapi jawabannya tidak pernah sampai (timeout atau
  /// koneksi putus). Fonnte mungkin sudah menerima dan meneruskan pesannya,
  /// jadi pengiriman ulang otomatis berisiko menghasilkan pesan WhatsApp ganda.
  uncertain?: boolean
  /// Ditolak oleh pengaturan, bukan oleh Fonnte. Mencoba ulang tidak akan
  /// mengubah apa pun sampai pengaturannya diperbaiki manusia.
  blocked?: boolean
  /// Kesalahan yang tidak akan membaik dengan mencoba ulang: permintaan salah
  /// bentuk, token ditolak, perangkat terputus. Menunggu tindakan manusia,
  /// jangan menghabiskan jatah percobaan.
  permanent?: boolean
  /// Penyedia meminta menunggu sekian lama sebelum mencoba lagi (HTTP 429).
  retryAfterMs?: number
}

/// Lamanya menunggu bila penyedia mengirim header Retry-After. Dibatasi agar
/// satu jawaban aneh tidak mengunci antrean berjam-jam.
function parseRetryAfter(header: string | null) {
  if (!header) return null
  const detik = Number(header.trim())
  if (Number.isFinite(detik) && detik >= 0) return Math.min(detik, 3_600) * 1_000
  const waktu = new Date(header)
  if (Number.isFinite(waktu.getTime())) {
    return Math.min(Math.max(0, waktu.getTime() - Date.now()), 3_600_000)
  }
  return null
}

/// Perangkat yang tidak terhubung tidak dapat mengirim apa pun sampai
/// pemiliknya memindai ulang. Mencoba ulang hanya membuang jatah percobaan.
function perangkatBermasalah(reason: string) {
  const teks = reason.toLowerCase()
  return teks.includes("disconnect") || teks.includes("not connected")
    || teks.includes("device") && teks.includes("invalid")
}

export type WhatsAppDeviceResult = {
  configured: boolean
  connected: boolean
  status: string | null
  error: string | null
  senderPhone?: string | null
  valid?: boolean
}

type FonnteResponse = {
  status?: boolean
  reason?: string
  detail?: string
  id?: string | number | Array<string | number>
}

export function normalizeWhatsAppPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "")
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`
  else if (digits.startsWith("8")) digits = `62${digits}`

  if (!digits.startsWith("62") || digits.length < 10 || digits.length > 15) return null
  return digits
}

export type WhatsAppRecipientValidation =
  | { valid: true; phone: string }
  | { valid: false; phone: string | null; reason: string; unavailable?: boolean }

/** Memastikan nomor tujuan benar-benar terdaftar di WhatsApp sebelum membuat pesanan. */
export async function validateWhatsAppRecipient(
  organizationId: string,
  phone: string,
): Promise<WhatsAppRecipientValidation> {
  const target = normalizeWhatsAppPhone(phone)
  if (!target) return { valid: false, phone: null, reason: "Format nomor WhatsApp tidak valid" }

  let token: string | null
  try {
    token = await organizationToken(organizationId)
  } catch {
    return { valid: false, phone: target, reason: "Konfigurasi WhatsApp bisnis tidak dapat dibaca", unavailable: true }
  }
  if (!token) return { valid: false, phone: target, reason: "Integrasi WhatsApp bisnis belum diatur", unavailable: true }

  try {
    const response = await fetch("https://api.fonnte.com/validate", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ target, countryCode: "62" }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    const data = await response.json().catch(() => null) as {
      status?: boolean; reason?: string; registered?: string[]; not_registered?: string[]
    } | null
    if (!response.ok || data?.status !== true) {
      return {
        valid: false,
        phone: target,
        reason: data?.reason || "Nomor WhatsApp belum dapat diperiksa. Coba lagi.",
        unavailable: true,
      }
    }
    const registered = (data.registered ?? []).some((value) => normalizeWhatsAppPhone(String(value)) === target)
    if (!registered) return { valid: false, phone: target, reason: "Nomor supplier tidak terdaftar di WhatsApp" }
    return { valid: true, phone: target }
  } catch {
    return { valid: false, phone: target, reason: "Pemeriksaan nomor WhatsApp gagal atau melewati batas waktu", unavailable: true }
  }
}

async function organizationToken(organizationId: string) {
  const integration = await prisma.organizationWhatsApp.findUnique({ where: { organizationId } })
  if (!integration) return null
  return decryptWhatsAppToken(integration.encryptedToken, organizationId)
}

/**
 * Memutuskan apakah satu nomor boleh dikirimi pesan dari lingkungan ini.
 *
 * Ini pengaman agar mesin pengembangan tidak pernah tidak sengaja mengirim
 * WhatsApp ke nomor asing — kesalahan yang tidak bisa ditarik kembali.
 *
 * - `WHATSAPP_OUTBOUND_ENABLED=true` membuka pengiriman ke semua nomor.
 * - Nomor di `WHATSAPP_ALLOWED_NUMBERS` juga selalu boleh dikirimi. Daftar
 *   dipisah koma dan boleh memakai akhiran `*`, mis. `62800000*`.
 * - Di development, nomor resmi yang disimpan lewat Manajemen/Pengaturan
 *   diperiksa kemudian oleh `sendWhatsApp` dan tidak perlu disalin ke env.
 * - Bawaannya: production terbuka, sedangkan development hanya membuka nomor
 *   env atau nomor resmi bisnis. Nilai `false` menutup semua pengiriman.
 */
export function outboundAllowed(target: string) {
  const setting = process.env.WHATSAPP_OUTBOUND_ENABLED?.trim().toLowerCase()
  const explicitlyDisabled = setting === "false" || setting === "0"
  if (explicitlyDisabled) {
    return {
      allowed: false as const,
      reason: "Pengiriman WhatsApp keluar dinonaktifkan melalui WHATSAPP_OUTBOUND_ENABLED",
      explicitlyDisabled: true as const,
    }
  }
  const enabled = setting === "true" || setting === "1"
    || (setting == null || setting === "" ? process.env.NODE_ENV === "production" : false)
  if (enabled) return { allowed: true as const }

  const matched = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      if (entry.endsWith("*")) {
        const prefix = entry.slice(0, -1).replace(/\D/g, "")
        return prefix.length > 0 && target.startsWith(prefix)
      }
      return normalizeWhatsAppPhone(entry) === target
    })
  if (matched) return { allowed: true as const }

  return {
    allowed: false as const,
    reason: "Nomor tujuan belum terdaftar sebagai nomor bisnis ini",
    explicitlyDisabled: false as const,
  }
}

/**
 * Nomor yang dimasukkan pengguna melalui Manajemen/Pengaturan adalah penerima
 * resmi milik bisnis. Pada development nomor seperti ini boleh langsung dipakai
 * tanpa harus didaftarkan ulang ke environment variable.
 */
async function isConfiguredBusinessRecipient(organizationId: string, target: string) {
  const fallbackOwner = normalizeWhatsAppPhone(ownerPhone())
  if (fallbackOwner === target) return true

  const [organization, sender, location, supplier, supplierExtra] = await Promise.all([
    prisma.organization.findFirst({
      where: { id: organizationId, ownerPhone: target },
      select: { id: true },
    }),
    prisma.organizationWhatsApp.findFirst({
      where: { organizationId, senderPhone: target },
      select: { organizationId: true },
    }),
    prisma.location.findFirst({
      where: { organizationId, whatsappPhone: target, isActive: true },
      select: { id: true },
    }),
    prisma.supplier.findFirst({
      where: {
        organizationId,
        isActive: true,
        OR: [{ normalizedPhone: target }, { phone: target }],
      },
      select: { id: true },
    }),
    prisma.supplierPhone.findFirst({
      where: { organizationId, phone: target },
      select: { id: true },
    }),
  ])
  return Boolean(organization || sender || location || supplier || supplierExtra)
}

export async function sendWhatsApp(organizationId: string, phone: string, message: string): Promise<WhatsAppSendResult> {
  let token: string | null
  try {
    token = await organizationToken(organizationId)
  } catch {
    return { ok: false, providerMessageId: null, error: "Konfigurasi WhatsApp bisnis tidak dapat dibaca. Hubungi pengelola Pantau." }
  }
  if (!token) return { ok: false, providerMessageId: null, error: "Atur WhatsApp bisnis melalui Pengaturan → Integrasi WhatsApp" }

  const target = normalizeWhatsAppPhone(phone)
  if (!target) return { ok: false, providerMessageId: null, error: "Nomor WhatsApp tujuan tidak valid" }

  // Diperiksa sebelum menyentuh jaringan: pesan yang tidak boleh keluar tidak
  // boleh sempat dikirim sedikit pun.
  const gate = outboundAllowed(target)
  if (!gate.allowed) {
    const configured = !gate.explicitlyDisabled
      && await isConfiguredBusinessRecipient(organizationId, target)
    if (!configured) {
      return { ok: false, providerMessageId: null, error: gate.reason, blocked: true }
    }
  }

  try {
    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target, message }),
      signal: AbortSignal.timeout(15_000),
    })
    const mentah = await response.text()
    let data: FonnteResponse | null = null
    let terbaca = true
    try {
      data = mentah ? JSON.parse(mentah) as FonnteResponse : null
    } catch {
      terbaca = false
    }

    // Jawaban 200 yang tidak terbaca adalah kasus paling berbahaya: permintaan
    // jelas sampai, tetapi hasilnya tidak diketahui. Diperlakukan tidak pasti,
    // bukan gagal — mengulangnya berisiko pesan ganda.
    if (response.ok && !terbaca) {
      return {
        ok: false,
        providerMessageId: null,
        error: "Jawaban Fonnte tidak dapat dibaca, status pengiriman tidak diketahui",
        uncertain: true,
      }
    }

    if (!response.ok || data?.status !== true) {
      const alasan = String(data?.reason || data?.detail || `Fonnte merespons HTTP ${response.status}`)
        .split(token).join("[token]").slice(0, 500)
      if (response.status === 429) {
        return {
          ok: false,
          providerMessageId: null,
          error: alasan,
          retryAfterMs: parseRetryAfter(response.headers.get("retry-after")) ?? undefined,
        }
      }
      // 4xx selain 429 adalah kesalahan permintaan atau izin: bentuk yang sama
      // akan ditolak lagi. 5xx adalah gangguan sementara di sisi penyedia.
      const permanen = (response.status >= 400 && response.status < 500)
        || (response.ok && perangkatBermasalah(alasan))
      return { ok: false, providerMessageId: null, error: alasan, permanent: permanen || undefined }
    }

    const rawId = Array.isArray(data.id) ? data.id[0] : data.id
    return { ok: true, providerMessageId: rawId == null ? null : String(rawId), error: null }
  } catch (error) {
    // Timeout dan koneksi terputus terjadi SETELAH permintaan dikirim, jadi
    // statusnya tidak diketahui — bukan kegagalan yang pasti.
    const aborted = error instanceof DOMException && error.name === "TimeoutError"
    return {
      ok: false,
      providerMessageId: null,
      error: "Koneksi ke Fonnte gagal atau melewati batas waktu",
      uncertain: aborted || error instanceof TypeError,
    }
  }
}

export async function getWhatsAppDeviceStatus(organizationId: string): Promise<WhatsAppDeviceResult> {
  try {
    const token = await organizationToken(organizationId)
    if (!token) return { configured: false, connected: false, status: null, senderPhone: null, error: "Atur WhatsApp bisnis melalui Pengaturan → Integrasi WhatsApp" }
    return await inspectWhatsAppToken(token)
  } catch {
    return { configured: true, connected: false, status: null, error: "Konfigurasi WhatsApp bisnis tidak dapat dibaca. Hubungi pengelola Pantau." }
  }
}

export async function inspectWhatsAppToken(token: string): Promise<WhatsAppDeviceResult> {

  try {
    const response = await fetch("https://api.fonnte.com/device", {
      method: "POST",
      headers: { Authorization: token },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    const data = await response.json().catch(() => null) as {
      status?: boolean
      device_status?: string
      device?: string
      reason?: string
      detail?: string
    } | null
    if (!response.ok || data?.status !== true) {
      return {
        configured: true,
        connected: false,
        status: null,
        valid: false,
        error: String(data?.reason || data?.detail || `Fonnte merespons HTTP ${response.status}`).split(token).join("[token]").slice(0, 500),
      }
    }
    const status = data.device_status?.toLowerCase() ?? null
    const senderPhone = typeof data.device === "string" ? normalizeWhatsAppPhone(data.device) : null
    return { configured: true, connected: status === "connect", status, senderPhone, valid: Boolean(senderPhone), error: senderPhone ? null : "Token tidak mengembalikan nomor perangkat yang valid" }
  } catch {
    return {
      configured: true,
      connected: false,
      status: null,
      valid: false,
      error: "Koneksi ke Fonnte gagal atau melewati batas waktu",
    }
  }
}

// Kompatibilitas notifikasi stok lama pada startup 4-3. Nomor utama tetap
// dibaca dari Organization.ownerPhone; variabel ini hanya menjadi cadangan.
export function ownerPhone(): string {
  return process.env.OWNER_PHONE ?? ""
}
