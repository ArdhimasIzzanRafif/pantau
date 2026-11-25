import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { getWhatsAppDeviceStatus, inspectWhatsAppToken, normalizeWhatsAppPhone } from "@/lib/whatsapp"
import { decryptWhatsAppToken, encryptWhatsAppToken } from "@/lib/whatsapp-token-crypto"

function webhookUrl(req: Request, secret: string, path = "/api/whatsapp/webhook") {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "")
  // Di balik tunnel atau proxy, req.url sering me-resolve ke localhost. Alamat
  // seperti itu tidak berguna untuk Fonnte, jadi host aslinya dibaca dari
  // header yang diteruskan proxy.
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host")
  const forwardedProto = req.headers.get("x-forwarded-proto")
    || (forwardedHost?.startsWith("localhost") || forwardedHost?.startsWith("127.") ? "http" : "https")
  const asal = configured
    || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(req.url).origin)
  const url = new URL(`${asal}${path}`)
  url.searchParams.set("secret", secret)
  return url.toString()
}

async function webhookState(organizationId: string) {
  const integration = await prisma.organizationWhatsApp.findUnique({
    where: { organizationId },
    select: { encryptedWebhookSecret: true, webhookConfiguredAt: true },
  })
  return {
    webhookConfigured: Boolean(integration?.encryptedWebhookSecret),
    webhookConfiguredAt: integration?.webhookConfiguredAt ?? null,
    // URL lengkap mengandung kunci rahasia dan hanya dikembalikan sesaat
    // setelah dibuat/dirotasi. Nilainya tidak dibuka ulang lewat GET.
    webhookUrl: null,
    messageStatusWebhookUrl: null,
  }
}

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang dapat mengatur WhatsApp bisnis", 403)
  return ok({ ...(await getWhatsAppDeviceStatus(user.organizationId)), ...(await webhookState(user.organizationId)) })
}

export async function PUT(req: Request) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang dapat mengatur WhatsApp bisnis", 403)
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === "string" ? body.token.trim() : ""
  const senderPhone = typeof body?.senderPhone === "string" ? normalizeWhatsAppPhone(body.senderPhone) : null
  if (!token || token.length > 512 || /\s/.test(token)) return err("Masukkan token perangkat Fonnte yang valid")
  if (!senderPhone) return err("Masukkan nomor WhatsApp pengirim yang terdaftar di Fonnte")

  const device = await inspectWhatsAppToken(token)
  if (!device.valid) return err(device.error ?? "Token tidak dapat diverifikasi")
  if (device.senderPhone !== senderPhone) {
    return err(`Token ini milik nomor +${device.senderPhone}, bukan +${senderPhone}. Salin token perangkat yang sesuai.`)
  }

  let encryptedToken: string
  try {
    encryptedToken = encryptWhatsAppToken(token, user.organizationId)
  } catch {
    return err("Enkripsi WhatsApp server belum siap. Hubungi pengelola Pantau.", 503)
  }
  await prisma.$transaction(async (tx) => {
    await tx.organizationWhatsApp.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId, encryptedToken, senderPhone },
      update: { encryptedToken, senderPhone },
    })
    // Nomor pengirim adalah nomor owner operasional. Sinkronkan di transaksi
    // yang sama supaya seluruh link kebutuhan dan notifikasi owner langsung
    // mengikuti nomor baru setelah Validasi & Simpan berhasil.
    await tx.organization.update({
      where: { id: user.organizationId },
      data: { ownerPhone: senderPhone },
    })
    await tx.auditLog.create({ data: {
      organizationId: user.organizationId, userId: user.id,
      action: "CONFIGURE_WHATSAPP", entity: "OrganizationWhatsApp", entityId: user.organizationId,
      after: { senderPhone },
    } })
  })
  return ok({ ...device, ...(await webhookState(user.organizationId)) })
}

export async function POST(req: Request) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang dapat mengatur WhatsApp bisnis", 403)
  const integration = await prisma.organizationWhatsApp.findUnique({ where: { organizationId: user.organizationId } })
  if (!integration) return err("Simpan token perangkat Fonnte terlebih dahulu", 409)

  const body = await req.json().catch(() => null) as { action?: unknown } | null
  const rotate = body?.action === "ROTATE"
  let secret: string
  let configuredAt = integration.webhookConfiguredAt ?? new Date()
  let harusDisimpan = rotate || !integration.encryptedWebhookSecret
  try {
    // Menampilkan ulang URL tidak boleh diam-diam membatalkan URL yang sudah
    // terpasang di Fonnte. Kunci baru hanya dibuat lewat aksi ROTATE eksplisit.
    secret = harusDisimpan
      ? randomBytes(24).toString("base64url")
      : decryptWhatsAppToken(integration.encryptedWebhookSecret!, `${user.organizationId}:webhook`)
  } catch {
    // Cipher lama tidak dapat dibaca (mis. kunci server pernah berubah): buat
    // kunci baru dan beri URL pengganti yang dapat dipasang pengguna.
    secret = randomBytes(24).toString("base64url")
    configuredAt = new Date()
    harusDisimpan = true
  }

  if (harusDisimpan) {
    let encryptedWebhookSecret: string
    try {
      encryptedWebhookSecret = encryptWhatsAppToken(secret, `${user.organizationId}:webhook`)
    } catch {
      return err("Enkripsi WhatsApp server belum siap. Hubungi pengelola Pantau.", 503)
    }
    configuredAt = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.organizationWhatsApp.update({
        where: { organizationId: user.organizationId },
        data: { encryptedWebhookSecret, webhookConfiguredAt: configuredAt },
      })
      await tx.auditLog.create({ data: {
        organizationId: user.organizationId, userId: user.id,
        action: rotate ? "ROTATE_WHATSAPP_WEBHOOK_SECRET" : "CONFIGURE_WHATSAPP_WEBHOOK",
        entity: "OrganizationWhatsApp", entityId: user.organizationId,
      } })
    })
  }
  return ok({
    webhookConfigured: true,
    webhookConfiguredAt: configuredAt,
    webhookUrl: webhookUrl(req, secret),
    messageStatusWebhookUrl: webhookUrl(req, secret, "/api/whatsapp/message-status"),
  })
}

export async function DELETE() {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang dapat mengatur WhatsApp bisnis", 403)
  await prisma.$transaction(async (tx) => {
    await tx.organizationWhatsApp.deleteMany({ where: { organizationId: user.organizationId } })
    await tx.auditLog.create({ data: {
      organizationId: user.organizationId, userId: user.id,
      action: "REMOVE_WHATSAPP", entity: "OrganizationWhatsApp", entityId: user.organizationId,
    } })
  })
  return ok({ configured: false, connected: false, senderPhone: null, status: null, error: null })
}
