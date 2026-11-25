import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/db"
import { normalizeWhatsAppPhone } from "@/lib/whatsapp"
import { decryptWhatsAppToken } from "@/lib/whatsapp-token-crypto"
import { recordSupplierMessageStatus } from "@/lib/supplier-message-tracking"

export const runtime = "nodejs"

type WebhookPayload = Record<string, unknown>

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function readPayload(req: Request): Promise<WebhookPayload | null> {
  const raw = await req.text()
  if (!raw || raw.length > 32_000) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as WebhookPayload : null
  } catch {
    const params = new URLSearchParams(raw)
    return Object.fromEntries(params.entries())
  }
}

export async function GET() {
  return Response.json({ status: true })
}

export async function POST(req: Request) {
  const body = await readPayload(req)
  if (!body) return Response.json({ status: false }, { status: 400 })

  const devicePhone = normalizeWhatsAppPhone(String(body.device ?? ""))
  const suppliedSecret = String(
    new URL(req.url).searchParams.get("secret")
      ?? req.headers.get("x-fonnte-secret")
      ?? body.secret
      ?? body.secretKey
      ?? body.secret_key
      ?? "",
  )
  if (!devicePhone || !suppliedSecret || (body.id == null && body.stateid == null)) {
    return Response.json({ status: false }, { status: 400 })
  }

  const integration = await prisma.organizationWhatsApp.findFirst({
    where: { senderPhone: devicePhone, encryptedWebhookSecret: { not: null } },
    select: { organizationId: true, encryptedWebhookSecret: true },
  })
  if (!integration?.encryptedWebhookSecret) return Response.json({ status: false }, { status: 401 })

  let expectedSecret: string
  try {
    expectedSecret = decryptWhatsAppToken(integration.encryptedWebhookSecret, `${integration.organizationId}:webhook`)
  } catch {
    return Response.json({ status: false }, { status: 401 })
  }
  if (!safeEqual(suppliedSecret, expectedSecret)) return Response.json({ status: false }, { status: 401 })

  try {
    const result = await recordSupplierMessageStatus({
      organizationId: integration.organizationId,
      payload: body,
    })
    // Fonnte menganggap webhook berhasil bila mendapat HTTP 200. NOT_FOUND
    // tetap diakui agar kejadian lama/non-Pantau tidak dikirim ulang terus.
    return Response.json({ status: true, result: result.outcome })
  } catch (error) {
    console.error("Gagal memproses webhook status WhatsApp supplier", error)
    return Response.json({ status: false }, { status: 500 })
  }
}
