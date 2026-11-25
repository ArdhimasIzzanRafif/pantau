import { NextRequest } from "next/server"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"
import { prisma } from "@/lib/db"
import { OPNAME_QUIET_MS } from "@/lib/opname-lock"

// GET /api/opnames/activity?locationId=xxx&since=<ISO cutoff>
// Dipakai halaman opname untuk mendeteksi aktivitas stok yang terjadi SETELAH
// cutoff (penjualan POS di outlet, atau barang masuk/transfer di gudang):
//  - changedItemIds : item yang stoknya bergerak sejak cutoff (perlu hitung ulang)
//  - secondsRemaining: hitung mundur masa tenang dari aktivitas TERAKHIR (reset
//    otomatis setiap ada aktivitas baru)
//  - locationType   : untuk menyesuaikan teks (transaksi vs barang masuk/transfer)
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const url = new URL(req.url)
  const locationId = url.searchParams.get("locationId")
  const since = url.searchParams.get("since")
  if (!locationId || !since) return err("locationId dan since diperlukan")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  const sinceDate = new Date(since)
  if (!Number.isFinite(sinceDate.getTime())) return err("Format since tidak valid")

  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: user.organizationId },
    select: { type: true },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)

  const movements = await prisma.stockMovement.findMany({
    where: {
      organizationId: user.organizationId,
      locationId,
      type: { notIn: ["OPNAME_CORRECTION", "INITIAL_STOCK"] },
      createdAt: { gt: sinceDate },
    },
    select: { itemId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  const changedItemIds = [...new Set(movements.map((m) => m.itemId))]
  const lastAt = movements[0]?.createdAt
  const secondsRemaining = lastAt
    ? Math.max(0, Math.ceil((OPNAME_QUIET_MS - (Date.now() - lastAt.getTime())) / 1000))
    : 0

  return ok({ locationType: location.type, changedItemIds, secondsRemaining })
}
