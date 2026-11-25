import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { StockError } from "@/lib/stock-ledger"
import { approveTransfer, cancelApprovedTransfer, extendTransferReservation, rejectTransfer } from "@/lib/transfer-flow"
import { parseTransferQuantity } from "@/lib/transfer-quantity"
import { convertToBase, UnitError } from "@/lib/unit-conversion"

// Alur transfer:
//   approve → APPROVED: stok gudang DIRESERVASI (belum berkurang)
//   dispatch (route terpisah) → SENT: stok gudang berkurang
//   reject → REJECTED dari PENDING; cancel → REJECTED dari APPROVED (reservasi dilepas)
//   extend → memperpanjang tenggat reservasi transfer APPROVED
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "TRANSFER")
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json() as Record<string, unknown>
  const action = ["approve", "reject", "cancel", "extend"].includes(body.action as string)
    ? body.action as "approve" | "reject" | "cancel" | "extend"
    : null
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null
  if (!action) return err("Aksi review tidak valid")

  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { items: { include: { item: { select: { name: true, unit: true, packSize: true, packUnit: true } } } } },
  })
  if (!transfer) return err("Transfer tidak ditemukan", 404)
  // Admin gudang boleh memproses permintaan otomatis dari outlet ke gudangnya.
  const canReviewRole = ["OWNER", "SUPERVISOR"].includes(user.role)
    || (user.role === "ADMIN_GUDANG" && transfer.autoReplenishment)
  if (!canReviewRole) return err("Tidak diizinkan mereview transfer ini", 403)
  // Membatalkan hanya berlaku untuk transfer yang sudah disetujui tetapi belum
  // berangkat — di situlah ada reservasi yang perlu dilepaskan.
  const diperlukan = action === "cancel" || action === "extend" ? "APPROVED" : "PENDING"
  if (transfer.status !== diperlukan) {
    return err(action === "cancel" || action === "extend"
      ? "Hanya transfer yang sudah disetujui dan belum dikirim yang dapat diproses"
      : "Transfer sudah direview", 409)
  }
  // Keputusan jumlah kirim, reservasi, pembatalan, dan perpanjangan adalah
  // tanggung jawab gudang asal. Akses ke outlet tujuan saja tidak cukup.
  const canAccessSource = await canAccessLocation(user, transfer.fromLocationId)
  if (!canAccessSource) {
    return err("Hanya penanggung jawab gudang asal yang dapat memproses transfer ini", 403)
  }
  if ((action === "cancel" || action === "extend") && !notes) {
    return err(action === "cancel" ? "Alasan pembatalan wajib diisi" : "Alasan perpanjangan wajib diisi")
  }
  if (action === "approve" && transfer.autoReplenishment && !transfer.outletRequested) {
    return err("Jumlah permintaan lama belum dikonfirmasi outlet. Isi kebutuhan melalui akun petugas outlet terlebih dahulu.", 409)
  }
  const quantities = new Map<string, number>()
  if (action === "approve" && transfer.outletRequested) {
    if (!Array.isArray(body.sentItems) || body.sentItems.length !== transfer.items.length) return err("Isi jumlah yang dikirim untuk setiap bahan")
    for (const raw of body.sentItems) {
      if (!raw || typeof raw !== "object") return err("Jumlah pengiriman tidak valid")
      const input = raw as { id?: unknown; quantity?: unknown; inputUnit?: unknown }
      const transferItem = transfer.items.find((i) => i.id === input.id)
      if (typeof input.id !== "string" || !transferItem || quantities.has(input.id)) {
        return err("Bahan pengiriman tidak valid atau duplikat")
      }
      // Konversi lewat satu pintu yang sama dengan seluruh aplikasi, memakai
      // faktor dari master bahan — bukan angka yang dikirim peramban.
      let quantity: number | null
      try {
        quantity = parseTransferQuantity(
          convertToBase(transferItem.item, input.quantity, input.inputUnit ?? "base").baseQuantity)
      } catch (error) {
        if (error instanceof UnitError) return err(error.message)
        throw error
      }
      if (quantity == null) return err("Jumlah kirim maksimal 3 angka desimal")
      quantities.set(input.id, quantity)
    }
    if (!notes && transfer.items.some((i) => quantities.get(i.id) !== Number(i.requestedQuantity ?? i.quantity))) {
      return err("Catatan alasan wajib diisi jika jumlah kirim berbeda dari permintaan outlet")
    }
  }

  try {
    if (action === "approve") await approveTransfer(user, id, quantities, notes)
    else if (action === "cancel") await cancelApprovedTransfer(user, id, notes!)
    else if (action === "extend") await extendTransferReservation(user, id, notes!)
    else await rejectTransfer(user, id, notes)
  } catch (error) {
    if (error instanceof StockError) return err(error.message, 409)
    throw error
  }

  if (action === "extend") return ok({ message: "Tenggat reservasi diperpanjang" })
  return ok({ message: action === "approve"
    ? "Transfer disetujui. Stok gudang direservasi dan akan berkurang saat barang dikirim."
    : action === "cancel"
      ? "Transfer dibatalkan dan reservasi stok dilepas"
      : "Permintaan transfer ditolak" })
}
