"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Clock, ShoppingBag, Download } from "lucide-react"

type OrderItem = { id: string; name: string; qty: number; price: number; subtotal: number }
type Payment   = { id: string; method: string; amount: number; change: number }
type Order     = {
  id: string; orderNumber: string; orderType: string; status: string
  total: number; createdAt: string; voidReason: string | null
  items: OrderItem[]; payments: Payment[]
}
type Shift = {
  id: string; shiftNumber: string; status: string
  openingBalance: number; closingBalance: number | null
  totalSales: number; totalOrders: number
  openedAt: string; closedAt: string | null; notes: string | null
  cashier: { name: string | null }; location: { name: string }
  orders: Order[]
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN: "Dine In", TAKEAWAY: "Takeaway", DELIVERY: "Delivery",
}

function formatRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}
function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

export default function ShiftDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const [shift, setShift]         = useState<Shift | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState("")
  const [downloading, setDownloading] = useState(false)

  async function downloadExcel() {
    setDownloading(true)
    const res = await fetch(`/api/pos/shifts/${id}/export`)
    if (res.ok) {
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `${shift?.shiftNumber ?? id}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    }
    setDownloading(false)
  }

  useEffect(() => {
    fetch(`/api/pos/shifts/${id}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setShift)
      .catch(() => setError("Data tidak ditemukan"))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !shift) return (
    <div className="max-w-3xl mx-auto py-16 text-center text-slate-400">{error || "Tidak ditemukan"}</div>
  )

  const dur = shift.closedAt
    ? Math.round((new Date(shift.closedAt).getTime() - new Date(shift.openedAt).getTime()) / 60000)
    : null

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{shift.shiftNumber}</h1>
          <p className="text-sm text-slate-400">{shift.location.name}</p>
        </div>
        <button
          onClick={downloadExcel}
          disabled={downloading}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Download className="w-4 h-4" />
          {downloading ? "Mengunduh..." : "Download Excel"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Penjualan", value: formatRp(Number(shift.totalSales)), color: "text-blue-600" },
          { label: "Jumlah Order",    value: String(shift.totalOrders),           color: "text-slate-800" },
          { label: "Kas Awal",        value: formatRp(Number(shift.openingBalance)), color: "text-slate-800" },
          { label: "Kas Akhir",       value: shift.closingBalance !== null ? formatRp(Number(shift.closingBalance)) : "—", color: "text-slate-800" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 mb-1">{c.label}</div>
            <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center gap-2 text-slate-700">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium">Info Shift</span>
        </div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-slate-400">Kasir</span>
          <span className="text-slate-800 font-medium">{shift.cashier.name ?? "—"}</span>
          <span className="text-slate-400">Buka</span>
          <span className="text-slate-800">{fmtDate(shift.openedAt)}</span>
          <span className="text-slate-400">Tutup</span>
          <span className="text-slate-800">{shift.closedAt ? fmtDate(shift.closedAt) : "Belum ditutup"}</span>
          <span className="text-slate-400">Durasi</span>
          <span className="text-slate-800">
            {dur !== null ? (dur >= 60 ? `${Math.floor(dur / 60)} jam ${dur % 60} menit` : `${dur} menit`) : "—"}
          </span>
          {shift.notes && <>
            <span className="text-slate-400">Catatan</span>
            <span className="text-slate-800">{shift.notes}</span>
          </>}
        </div>
      </div>

      {/* Orders */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Transaksi dalam Shift</span>
          </div>
          <span className="text-xs text-slate-400">{shift.orders.length} order</span>
        </div>
        {shift.orders.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Tidak ada transaksi</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {shift.orders.map((o) => {
              const isVoid = o.status === "VOID"
              return (
                <div key={o.id} className={`px-5 py-3 ${isVoid ? "bg-red-50/40" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-mono font-semibold ${isVoid ? "text-slate-400 line-through" : "text-slate-800"}`}>
                          {o.orderNumber}
                        </span>
                        <span className="text-xs text-slate-400">{ORDER_TYPE_LABELS[o.orderType] ?? o.orderType}</span>
                        {isVoid && (
                          <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded-full">Void</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                      </div>
                      {isVoid && o.voidReason && (
                        <div className="text-xs text-red-500 mt-0.5">Alasan: {o.voidReason}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${isVoid ? "text-slate-300 line-through" : "text-slate-900"}`}>
                        {formatRp(Number(o.total))}
                      </div>
                      <div className="text-xs text-slate-400">{fmtTime(o.createdAt)}</div>
                    </div>
                  </div>
                  {!isVoid && (
                    <div className="mt-1 flex gap-3 text-xs text-slate-400 flex-wrap">
                      {o.payments.map((p) => (
                        <span key={p.id}>
                          {p.method === "CASH" ? "Tunai" : p.method} {formatRp(Number(p.amount))}
                          {Number(p.change) > 0 && ` · Kembalian ${formatRp(Number(p.change))}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="px-5 py-3 flex justify-between text-sm font-semibold text-slate-800 bg-slate-50">
              <span>Total Penjualan</span>
              <span>{formatRp(shift.orders.reduce((s, o) => s + Number(o.total), 0))}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
