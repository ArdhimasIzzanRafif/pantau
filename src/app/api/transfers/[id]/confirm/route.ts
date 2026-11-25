import { NextRequest } from "next/server"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { confirmTransferReceipt, PenerimaanTransferDitolak } from "@/lib/transfer-receipt"

// Seluruh logika penerimaan (barang baik/rusak/tidak tiba, retur ke asal,
// sisa kebutuhan outlet, alert) ada di lib/transfer-receipt.ts.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (!["OWNER", "SUPERVISOR"].includes(user.role)) {
    return err("Hanya owner atau supervisor yang dapat mengonfirmasi transfer", 403)
  }
  const forbidden = await denyUnlessCanEdit(user, "TRANSFER")
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return err("Data konfirmasi tidak terbaca")

  try {
    const hasil = await confirmTransferReceipt(
      user, id, body as Record<string, unknown>,
      (locationId) => canAccessLocation(user, locationId),
    )
    return ok(hasil)
  } catch (error) {
    if (error instanceof PenerimaanTransferDitolak) return err(error.message, 409)
    console.error("Confirm transfer failed:", error)
    return err("Gagal memproses penerimaan transfer", 500)
  }
}
