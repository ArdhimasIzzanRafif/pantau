import { NextRequest } from "next/server"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { getFeatureAccess } from "@/lib/feature-access"
import { isAssignedToLocation } from "@/lib/location-access"
import { getLowStockTransferContext } from "@/lib/low-stock-transfer-context"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (!['OWNER', 'SUPERVISOR', 'ADMIN_GUDANG'].includes(user.role)) return err("Tidak memiliki akses membuat transfer", 403)
  if (await getFeatureAccess(user, "TRANSFER") === null) return err("Tidak memiliki akses ke Transfer Barang", 403)

  const alertIds = [...new Set((req.nextUrl.searchParams.get("alerts") ?? "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 50)
  // Bedakan tautan kedaluwarsa milik bisnis sendiri dari tautan milik bisnis
  // lain. Yang pertama boleh hilang diam-diam; yang kedua harus ditolak jelas.
  const linkOwners = await prisma.alert.findMany({
    where: { id: { in: alertIds }, type: "LOW_STOCK" },
    select: { organizationId: true },
  })
  if (linkOwners.some((alert) => alert.organizationId !== user.organizationId)) {
    return err("Tautan ini bukan untuk akun atau bisnis yang sedang digunakan", 403)
  }
  const context = await getLowStockTransferContext(user.organizationId, alertIds)
  if (!context) return err("Tautan stok tidak berlaku atau outlet belum memiliki gudang pemenuhan", 410)
  // Owner bisnis tetap mempunyai akses penuh. Selain Owner, tautan WA hanya
  // boleh diproses Admin Gudang yang memang ditugaskan ke gudang penerima.
  const authorizedRecipient = user.role === "OWNER"
    || (user.role === "ADMIN_GUDANG" && await isAssignedToLocation(user, context.warehouse.id))
  if (!authorizedRecipient) {
    return err("Tautan ini hanya dapat dibuka oleh Owner atau Admin Gudang yang ditugaskan ke gudang penerima", 403)
  }
  if (context.lines.length === 0) {
    return err("Semua stok pada tautan ini sudah pulih atau sedang diproses dalam transfer lain", 409)
  }

  return ok(context)
}
