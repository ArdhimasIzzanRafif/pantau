import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { getFeatureAccess } from "@/lib/feature-access"
import { getWhatsAppDeviceStatus } from "@/lib/whatsapp"

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (await getFeatureAccess(user, "SUPPLIERS") === null) return err("Tidak diizinkan", 403)
  return ok(await getWhatsAppDeviceStatus(user.organizationId))
}
