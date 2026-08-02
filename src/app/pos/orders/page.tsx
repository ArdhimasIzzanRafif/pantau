"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Search,
  Clock,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react"

type OrderItem = {
  id: string
  name: string
  qty: number
  price: number
  subtotal: number
}

type Payment = {
  id: string
  method: string
  amount: number
  change: number
}

type Order = {
  id: string
  orderNumber: string
  orderType: string
  tableNumber: string | null
  customerName: string | null
  status: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  paidAt: string | null
  createdAt: string
  items: OrderItem[]
  payments: Payment[]
  cashier: { name: string | null } | null
}

type Location = {
  id: string
  name: string
}

function formatRp(amount: number) {
  return "Rp " + Math.round(amount).toLocaleString("id-ID")
}

const STATUS_COLORS: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  OPEN: "bg-yellow-100 text-yellow-700",
  VOID: "bg-red-100 text-red-600",
  HELD: "bg-slate-100 text-slate-600",
}

const STATUS_LABELS: Record<string, string> = {
  PAID: "Lunas",
  OPEN: "Terbuka",
  VOID: "Batal",
  HELD: "Ditahan",
}

export default function POSOrdersPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const sessionUser = session?.user as { role?: string; locationIds?: string[] } | undefined
  const isKasir = sessionUser?.role === "KASIR"

  const [orders, setOrders] = useState<Order[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>(searchParams.get("locationId") ?? "")
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [dateFilter, setDateFilter] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  })

  const [detailOrder, setDetailOrder] = useState<Order | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ date: dateFilter })
    if (selectedLocation) params.set("locationId", selectedLocation)
    const res = await fetch(`/api/pos/orders?${params}`)
    if (res.ok) setOrders(await res.json())
    setLoading(false)
  }, [selectedLocation, dateFilter])

  useEffect(() => {
    async function fetchLocations() {
      const res = await fetch("/api/locations")
      if (!res.ok) return
      const all: Location[] = await res.json()
      const ids = sessionUser?.locationIds ?? []
      const filtered = isKasir && ids.length > 0 ? all.filter((l) => ids.includes(l.id)) : all
      setLocations(filtered)
      if (isKasir && filtered.length === 1) {
        setSelectedLocation(filtered[0].id)
      }
    }
    fetchLocations()
  }, [isKasir, sessionUser?.locationIds?.join(",")])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const filtered = orders.filter((o) =>
    o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
    (o.customerName?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
    (o.tableNumber?.toLowerCase().includes(search.toLowerCase()) ?? false)
  )

  const totalSales = orders.filter((o) => o.status === "PAID").reduce((sum, o) => sum + Number(o.total), 0)
  const totalOrders = orders.filter((o) => o.status === "PAID").length

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-3 shrink-0">
        <Link
          href="/pos"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-white font-bold">Riwayat Pesanan</h1>
      </header>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nomor, nama pelanggan, meja..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {!isKasir && (
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Lokasi</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fetchOrders}
              className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 mb-1">Total Penjualan</div>
            <div className="text-xl font-bold text-slate-900">{formatRp(totalSales)}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 mb-1">Jumlah Transaksi</div>
            <div className="text-xl font-bold text-slate-900">{totalOrders}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-400 mb-1">Rata-rata</div>
            <div className="text-xl font-bold text-slate-900">
              {totalOrders > 0 ? formatRp(totalSales / totalOrders) : "Rp 0"}
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <div className="text-slate-500 font-medium">Belum ada pesanan</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-50" />
                  <col className="w-50" />
                  <col className="w-50" />
                  <col className="w-50" />
                  <col className="w-50" />
                  <col className="w-50" />
                </colgroup>
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-4">No. Pesanan</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-4">Waktu</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-4">Tipe</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-4">Item</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-4">Total</th>
                    <th className="text-center text-xs font-medium text-slate-500 px-4 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => setDetailOrder(order)}
                          className="font-mono font-medium text-blue-600 hover:text-blue-700"
                        >
                          {order.orderNumber}
                        </button>
                        {order.customerName && (
                          <div className="text-xs text-slate-400">{order.customerName}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center text-slate-500 text-xs">
                        {new Date(order.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col gap-0.5 items-center">
                          <span className="text-xs text-slate-600">
                            {order.orderType === "DINE_IN" ? "Dine In" : order.orderType === "TAKEAWAY" ? "Takeaway" : "Delivery"}
                          </span>
                          {order.tableNumber && (
                            <span className="text-xs text-slate-400">Meja {order.tableNumber}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-slate-500 text-xs">
                        {order.items.slice(0, 2).map((i) => `${i.name} ×${i.qty}`).join(", ")}
                        {order.items.length > 2 && ` +${order.items.length - 2} lagi`}
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-slate-900">
                        {formatRp(Number(order.total))}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-500"}`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetailOrder(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{detailOrder.orderNumber}</h2>
                <div className="text-xs text-slate-400">
                  {new Date(detailOrder.createdAt).toLocaleString("id-ID")}
                </div>
              </div>
              <button onClick={() => setDetailOrder(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="flex gap-3 text-sm">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detailOrder.status]}`}>
                  {STATUS_LABELS[detailOrder.status]}
                </span>
                <span className="text-slate-500">
                  {detailOrder.orderType === "DINE_IN" ? "Dine In" : detailOrder.orderType === "TAKEAWAY" ? "Takeaway" : "Delivery"}
                  {detailOrder.tableNumber ? ` · Meja ${detailOrder.tableNumber}` : ""}
                </span>
              </div>
              <div className="space-y-2">
                {detailOrder.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-slate-700">{item.name} <span className="text-slate-400">×{item.qty}</span></span>
                    <span className="font-medium">{formatRp(Number(item.subtotal))}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatRp(Number(detailOrder.subtotal))}</span>
                </div>
                {Number(detailOrder.discountAmount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Diskon</span>
                    <span>-{formatRp(Number(detailOrder.discountAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Total</span>
                  <span>{formatRp(Number(detailOrder.total))}</span>
                </div>
              </div>
              {detailOrder.payments.map((p) => (
                <div key={p.id} className="border-t border-slate-100 pt-3 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>Bayar ({p.method})</span>
                    <span>{formatRp(Number(p.amount))}</span>
                  </div>
                  {Number(p.change) > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Kembalian</span>
                      <span>{formatRp(Number(p.change))}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
