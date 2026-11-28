import type { Prisma } from "@prisma/client"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"
import { getHistoryScope } from "@/lib/history-scope"
import { memberJoinedAt } from "@/lib/membership"
import { recordGoodsReceipt, PenerimaanDitolak } from "@/lib/goods-receipt-intake"
import { createStyledExcelReport } from "@/lib/excel-report"
import { isStockTransactionTimeout } from "@/lib/stock-transaction"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const accessibleLocationIds = await getAccessibleLocationIds(user)

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const from       = searchParams.get("from")
  const to         = searchParams.get("to")
  // Export butuh seluruh baris yang cocok, bukan hanya halaman yang tampil.
  const exportExcel = searchParams.get("format") === "xlsx"
  const all        = exportExcel || searchParams.get("all") === "1"
  const page       = Math.max(1, Number(searchParams.get("page") ?? 1))
  const take       = 30
  // Barang masuk adalah tanggung jawab lokasi. Siapa yang mencatat tidak
  // membatasi riwayat selama lokasinya masih ditugaskan kepada pengguna.
  const historyScope = await getHistoryScope(user, searchParams.get("history") === "1", "LOCATION")
  if (!historyScope.allowed) return err("Tidak memiliki akses ke Riwayat", 403)
  const joinedAt = await memberJoinedAt(user)

  const where: Prisma.GoodsReceiptWhereInput = {
    organizationId: user.organizationId,
    ...(historyScope.actorId && { createdById: historyScope.actorId }),
    // AND, bukan spread — kalau locationId ditulis ulang, batas akses lokasi hilang.
    AND: [
      // Barang masuk selalu catatan final, jadi dipotong tepat sejak anggota
      // ini bergabung.
      ...(joinedAt ? [{ createdAt: { gte: joinedAt } }] : []),
      ...(accessibleLocationIds ? [{ locationId: { in: accessibleLocationIds } }] : []),
      ...(locationId ? [{ locationId }] : []),
    ],
    ...(from || to ? {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to + "T23:59:59.999Z") }),
      },
    } : {}),
  }

  const [total, receipts] = await Promise.all([
    prisma.goodsReceipt.count({ where }),
    prisma.goodsReceipt.findMany({
      where,
      include: { location: true, items: { include: { item: true, batch: true } } },
      orderBy: { createdAt: "desc" },
      ...(all ? {} : { skip: (page - 1) * take, take }),
    }),
  ])
  if (exportExcel) {
    const headers = ["Tanggal", "Lokasi", "Supplier", "No. Surat Jalan", "Item", "Satuan Beli", "Qty Beli", "Qty Masuk Stok", "Satuan Stok", "Harga Beli/Unit (Rp)", "Total (Rp)", "Catatan"]
    const rows = receipts.flatMap((receipt) => receipt.items.map((item) => ({
      "Tanggal": new Date(receipt.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
      "Lokasi": receipt.location.name,
      "Supplier": receipt.supplier ?? "—",
      "No. Surat Jalan": receipt.receiptNumber ?? "—",
      "Item": item.item.name,
      "Satuan Beli": item.purchaseUnit,
      "Qty Beli": Number(item.purchaseQuantity),
      "Qty Masuk Stok": Number(item.quantity),
      "Satuan Stok": item.item.unit,
      "Harga Beli/Unit (Rp)": item.purchaseUnitCost != null ? Number(item.purchaseUnitCost) : "—",
      "Total (Rp)": item.lineTotal != null ? Number(item.lineTotal) : "—",
      "Catatan": receipt.notes ?? "",
    })))
    const buffer = await createStyledExcelReport({
      title: "Riwayat Barang Masuk", sheetName: "Barang Masuk", rows, headers,
      widths: [26, 24, 24, 24, 28, 18, 16, 20, 18, 26, 20, 36],
      currencyHeaders: ["Harga Beli/Unit (Rp)", "Total (Rp)"],
    })
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="barang-masuk-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    } })
  }
  return ok({
    items: receipts,
    total,
    page: all ? 1 : page,
    pages: all ? 1 : Math.ceil(total / take),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "GOODS_RECEIPT")
  if (forbidden) return forbidden

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return err("Data penerimaan tidak terbaca")

  const locationId = typeof body.locationId === "string" ? body.locationId : ""
  if (!locationId) return err("Lokasi dan item wajib diisi")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  try {
    const hasil = await recordGoodsReceipt(user, body)
    return ok(hasil.receipt, hasil.created ? 201 : 200)
  } catch (error) {
    if (error instanceof PenerimaanDitolak) return err(error.message)
    console.error("Create goods receipt failed:", error)
    if (isStockTransactionTimeout(error)) return err("Penerimaan belum tersimpan karena proses terlalu lama. Silakan coba lagi.", 503)
    return err("Gagal menyimpan penerimaan barang", 500)
  }
}
