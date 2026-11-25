import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { StockError } from "@/lib/stock-ledger"
import { dispatchTransfer } from "@/lib/transfer-flow"

/**
 * Memberangkatkan transfer yang sudah disetujui.
 *
 * Inilah satu-satunya titik stok gudang benar-benar berkurang. Persetujuan
 * sebelumnya hanya memesan stoknya; kalau transfer dibatalkan sebelum sampai
 * ke sini, tidak ada stok yang pernah berpindah.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "TRANSFER")
  if (forbidden) return forbidden

  const { id } = await params
  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { items: { include: { item: { select: { name: true } } } } },
  })
  if (!transfer) return err("Transfer tidak ditemukan", 404)

  const bolehKirim = ["OWNER", "SUPERVISOR"].includes(user.role)
    || (user.role === "ADMIN_GUDANG" && transfer.autoReplenishment)
  if (!bolehKirim) return err("Tidak diizinkan mengirim transfer ini", 403)
  if (transfer.status !== "APPROVED") return err("Transfer belum disetujui atau sudah dikirim", 409)
  // Barang hanya dapat diberangkatkan oleh penanggung jawab gudang asal.
  if (!(await canAccessLocation(user, transfer.fromLocationId))) {
    return err("Hanya penanggung jawab gudang asal yang dapat mengirim transfer ini", 403)
  }

  try {
    await dispatchTransfer(user, id)
  } catch (error) {
    if (error instanceof StockError) return err(error.message, 409)
    throw error
  }

  return ok({ message: "Transfer dikirim dan stok gudang berkurang" })
}
