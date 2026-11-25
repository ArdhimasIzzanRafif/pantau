import { NextRequest } from "next/server"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"
import { getPosCooldown } from "@/lib/opname-lock"

// GET /api/pos/opname-lock?locationId=xxx
// Dipakai POS untuk mengetahui apakah transaksi sedang ditahan karena opname
// baru saja disimpan (masa tenang 30 detik).
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const locationId = new URL(req.url).searchParams.get("locationId")
  if (!locationId) return err("locationId diperlukan")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke outlet ini", 403)

  const state = await getPosCooldown(user.organizationId, locationId)
  return ok(state)
}
