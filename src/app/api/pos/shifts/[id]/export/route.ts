import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, err } from "@/lib/api-helpers"
import * as XLSX from "xlsx"

const STATUS_LABEL: Record<string, string> = {
  PAID: "Lunas",
  VOID: "Batal",
  OPEN: "Terbuka",
}

const METHOD_LABEL: Record<string, string> = {
  CASH: "TUNAI",
  QRIS: "QRIS",
  TRANSFER: "TRANSFER",
  CARD: "KARTU",
}

function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`
}
function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { id } = await params

  const shift = await prisma.pOSShift.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      cashier:  { select: { name: true, email: true } },
      location: { select: { name: true } },
      orders: {
        include: {
          items:    true,
          payments: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!shift) return err("Shift tidak ditemukan", 404)

  const kasirName  = shift.cashier.name ?? shift.cashier.email
  const outletName = shift.location.name

  const rows: Record<string, string | number>[] = []

  for (const order of shift.orders) {
    const createdAt = new Date(order.createdAt)
    const tgl       = fmtDate(createdAt)
    const jam       = fmtTime(createdAt)
    const status    = STATUS_LABEL[order.status] ?? order.status
    const methods   = order.payments
      .map((p) => METHOD_LABEL[p.method] ?? p.method)
      .join(", ")
    const diskonTx  = Number(order.discountAmount)
    const pajak     = Number(order.taxAmount)
    const total     = Number(order.total)

    // One row per item — order-level fields repeated on every row
    for (const item of order.items) {
      rows.push({
        "No. Struk":           order.orderNumber,
        "Tanggal":             tgl,
        "Jam":                 jam,
        "Nama Outlet":         outletName,
        "Nama Kasir":          kasirName,
        "Nama Pelanggan":      order.customerName ?? "",
        "Produk":              item.name,
        "Opsi Tambahan":       "",
        "Jumlah Produk":       Number(item.qty),
        "Jumlah Dibatalkan":   0,
        "Harga Per Produk":    Number(item.price),
        "Subtotal":            Number(item.subtotal),
        "Tipe Harga":          "Normal",
        "Diskon Produk":       0,
        "Tipe Diskon Produk":  "",
        "Diskon Transaksi":    diskonTx,
        "Tipe Diskon Transaksi": order.discountType ?? "",
        "Redeem Poin":         0,
        "Pajak":               pajak,
        "Total":               total,
        "Status":              status,
        "Kode Pembayaran":     "",
        "Metode Pembayaran":   methods,
        "No. Referensi":       "",
      })
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  ws["!cols"] = [14, 12, 10, 16, 16, 16, 20, 12, 14, 16, 14, 12, 10, 12, 14, 16, 18, 12, 10, 12, 10, 14, 18, 14]
    .map((w) => ({ wch: w }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Detail Transaksi")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const filename = `${shift.shiftNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.xlsx`

  return new NextResponse(buf, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
