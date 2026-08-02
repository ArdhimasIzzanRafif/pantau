import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse } from "@/lib/api-helpers"
import * as XLSX from "xlsx"

const STATUS_LABEL: Record<string, string> = {
  PAID: "Lunas", VOID: "Batal", OPEN: "Terbuka",
}
const METHOD_LABEL: Record<string, string> = {
  CASH: "TUNAI", QRIS: "QRIS", TRANSFER: "TRANSFER", CARD: "KARTU",
}

function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`
}
function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const from       = searchParams.get("from")
  const to         = searchParams.get("to")
  const locationId = searchParams.get("locationId")
  const type       = searchParams.get("type") ?? "transaction" // "transaction" | "product"

  const where: Record<string, unknown> = {
    organizationId: user.organizationId,
    status: "CLOSED",
  }
  if (locationId) where.locationId = locationId
  if (from || to) {
    where.closedAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to   ? { lte: new Date(to + "T23:59:59") } : {}),
    }
  }

  const shifts = await prisma.pOSShift.findMany({
    where,
    include: {
      cashier:  { select: { name: true, email: true } },
      location: { select: { name: true } },
      orders: {
        where: { status: "PAID" },
        include: {
          items:    { include: { menuItem: { select: { category: true, sku: true } } } },
          payments: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { openedAt: "asc" },
  })

  const rangeLabel = from && to
    ? `${from}_sd_${to}`
    : from ? `dari_${from}`
    : to   ? `sd_${to}`
    : "semua"

  // ── Detail Transaksi ─────────────────────────────────────────────────────────
  if (type === "transaction") {
    const rows: Record<string, string | number>[] = []

    for (const shift of shifts) {
      const kasirName  = shift.cashier.name ?? shift.cashier.email
      const outletName = shift.location.name

      for (const order of shift.orders) {
        const createdAt = new Date(order.createdAt)
        const methods   = order.payments
          .map((p) => METHOD_LABEL[p.method] ?? p.method).join(", ")

        for (const item of order.items) {
          rows.push({
            "No. Struk":             order.orderNumber,
            "Tanggal":               fmtDate(createdAt),
            "Jam":                   fmtTime(createdAt),
            "Nama Outlet":           outletName,
            "Nama Kasir":            kasirName,
            "Nama Pelanggan":        order.customerName ?? "",
            "Produk":                item.name,
            "Opsi Tambahan":         "",
            "Jumlah Produk":         Number(item.qty),
            "Jumlah Dibatalkan":     0,
            "Harga Per Produk":      Number(item.price),
            "Subtotal":              Number(item.subtotal),
            "Tipe Harga":            "Normal",
            "Diskon Produk":         0,
            "Tipe Diskon Produk":    "",
            "Diskon Transaksi":      Number(order.discountAmount),
            "Tipe Diskon Transaksi": order.discountType ?? "",
            "Redeem Poin":           0,
            "Pajak":                 Number(order.taxAmount),
            "Total":                 Number(order.total),
            "Status":                STATUS_LABEL[order.status] ?? order.status,
            "Kode Pembayaran":       "",
            "Metode Pembayaran":     methods,
            "No. Referensi":         "",
          })
        }
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    ws["!cols"] = [14,12,10,16,16,16,20,12,14,16,14,12,10,12,14,16,18,12,10,12,10,14,18,14].map((w) => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Detail Transaksi")
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="detail_transaksi_${rangeLabel}.xlsx"`,
      },
    })
  }

  // ── Per Outlet / Gudang ─────────────────────────────────────────────────────
  if (type === "location") {
    type LocRow = {
      nama: string
      jumlahShift: number
      jumlahTransaksi: number
      penjualanKotor: number
      pajak: number
      penjualanBersih: number
    }
    const locMap = new Map<string, LocRow>()

    for (const shift of shifts) {
      const nama = shift.location.name
      const existing = locMap.get(nama)
      const shiftKotor  = shift.orders.reduce((s, o) => s + Number(o.subtotal), 0)
      const shiftPajak  = shift.orders.reduce((s, o) => s + Number(o.taxAmount), 0)
      const shiftBersih = shift.orders.reduce((s, o) => s + Number(o.total), 0)

      if (existing) {
        existing.jumlahShift++
        existing.jumlahTransaksi += shift.orders.length
        existing.penjualanKotor  += shiftKotor
        existing.pajak           += shiftPajak
        existing.penjualanBersih += shiftBersih
      } else {
        locMap.set(nama, {
          nama,
          jumlahShift:      1,
          jumlahTransaksi:  shift.orders.length,
          penjualanKotor:   shiftKotor,
          pajak:            shiftPajak,
          penjualanBersih:  shiftBersih,
        })
      }
    }

    const sorted = [...locMap.values()].sort((a, b) => b.penjualanBersih - a.penjualanBersih)
    const totShift  = sorted.reduce((s, r) => s + r.jumlahShift, 0)
    const totTx     = sorted.reduce((s, r) => s + r.jumlahTransaksi, 0)
    const totKotor  = sorted.reduce((s, r) => s + r.penjualanKotor, 0)
    const totPajak  = sorted.reduce((s, r) => s + r.pajak, 0)
    const totBersih = sorted.reduce((s, r) => s + r.penjualanBersih, 0)

    const locRows = [
      ...sorted.map((r) => ({
        "Nama Outlet / Gudang":  r.nama,
        "Jumlah Shift":          r.jumlahShift,
        "Jumlah Transaksi":      r.jumlahTransaksi,
        "Penjualan Kotor":       r.penjualanKotor,
        "Pajak":                 r.pajak,
        "Penjualan Bersih":      r.penjualanBersih,
      })),
      { "Nama Outlet / Gudang": "", "Jumlah Shift": "", "Jumlah Transaksi": "", "Penjualan Kotor": "", "Pajak": "", "Penjualan Bersih": "" },
      {
        "Nama Outlet / Gudang": "TOTAL",
        "Jumlah Shift":         totShift,
        "Jumlah Transaksi":     totTx,
        "Penjualan Kotor":      totKotor,
        "Pajak":                totPajak,
        "Penjualan Bersih":     totBersih,
      },
    ]

    const ws = XLSX.utils.json_to_sheet(locRows)
    ws["!cols"] = [24, 14, 16, 18, 12, 18].map((w) => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Per Outlet")
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="per_outlet_${rangeLabel}.xlsx"`,
      },
    })
  }

  // ── Per Produk ───────────────────────────────────────────────────────────────
  type ProductRow = {
    nama: string
    kategori: string
    sku: string
    qty: number
    penjualanKotor: number
    pajak: number
    penjualanBersih: number
  }
  const productMap = new Map<string, ProductRow>()

  for (const shift of shifts) {
    for (const order of shift.orders) {
      const taxRatio = Number(order.total) > 0
        ? Number(order.taxAmount) / Number(order.total)
        : 0

      for (const item of order.items) {
        const gross    = Number(item.subtotal)
        const itemTax  = Math.round(gross * taxRatio)
        const existing = productMap.get(item.name)

        if (existing) {
          existing.qty            += Number(item.qty)
          existing.penjualanKotor += gross
          existing.pajak          += itemTax
          existing.penjualanBersih = existing.penjualanKotor - existing.pajak
        } else {
          productMap.set(item.name, {
            nama:            item.name,
            kategori:        item.menuItem?.category ?? "",
            sku:             item.menuItem?.sku ?? "",
            qty:             Number(item.qty),
            penjualanKotor:  gross,
            pajak:           itemTax,
            penjualanBersih: gross - itemTax,
          })
        }
      }
    }
  }

  const sorted = [...productMap.values()].sort((a, b) => b.penjualanKotor - a.penjualanKotor)

  const totalQty    = sorted.reduce((s, p) => s + p.qty, 0)
  const totalKotor  = sorted.reduce((s, p) => s + p.penjualanKotor, 0)
  const totalPajak  = sorted.reduce((s, p) => s + p.pajak, 0)
  const totalBersih = sorted.reduce((s, p) => s + p.penjualanBersih, 0)

  const blankRow = {
    "Nama Produk": "", "Kategori": "", "Kode Produk (SKU)": "",
    "Jumlah Terjual (Unit)": "", "Penjualan Kotor": "", "Pajak": "", "Penjualan Bersih": "",
  }

  const productRows = [
    ...sorted.map((p) => ({
      "Nama Produk":           p.nama,
      "Kategori":              p.kategori,
      "Kode Produk (SKU)":     p.sku,
      "Jumlah Terjual (Unit)": p.qty,
      "Penjualan Kotor":       p.penjualanKotor,
      "Pajak":                 p.pajak,
      "Penjualan Bersih":      p.penjualanBersih,
    })),
    blankRow,
    {
      "Nama Produk":           "TOTAL",
      "Kategori":              "",
      "Kode Produk (SKU)":     "",
      "Jumlah Terjual (Unit)": totalQty,
      "Penjualan Kotor":       totalKotor,
      "Pajak":                 totalPajak,
      "Penjualan Bersih":      totalBersih,
    },
  ]

  const ws = XLSX.utils.json_to_sheet(productRows)
  ws["!cols"] = [28, 16, 16, 20, 18, 12, 18].map((w) => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Per Produk")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="per_produk_${rangeLabel}.xlsx"`,
    },
  })
}
