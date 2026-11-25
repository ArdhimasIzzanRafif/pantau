import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { normalizeWhatsAppPhone, sendWhatsApp } from "@/lib/whatsapp"

export async function POST(req: Request) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang dapat menguji WhatsApp bisnis", 403)
  const body = await req.json().catch(() => null)
  const phone = typeof body?.phone === "string" ? normalizeWhatsAppPhone(body.phone) : null
  if (!phone) return err("Masukkan nomor penerima pesan uji yang valid")
  const organization = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } })
  const result = await sendWhatsApp(user.organizationId, phone,
    `[Pantau] Pesan uji WhatsApp\n\nIntegrasi WhatsApp bisnis ${organization?.name ?? "Anda"} telah digunakan untuk mengirim pesan ini.\nPesan ini hanya untuk pengujian; tidak membuat pesanan atau mengubah stok.`)
  if (!result.ok) return err(result.error ?? "Pengiriman pesan uji gagal", 502)
  await prisma.auditLog.create({ data: {
    organizationId: user.organizationId, userId: user.id,
    action: "TEST_WHATSAPP", entity: "OrganizationWhatsApp", entityId: user.organizationId,
    after: { phone, providerMessageId: result.providerMessageId },
  } })
  return ok({ accepted: true, message: "Pesan uji diterima Fonnte untuk dikirim. Periksa WhatsApp nomor tujuan untuk memastikan pesan masuk." })
}
