"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Clock, ChevronRight, ClipboardList, ArrowLeftRight, Truck, Download,
} from "lucide-react"

function formatRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

// ── Types ────────────────────────────────────────────────────────────────────

type POSShift = {
  id: string; shiftNumber: string
  totalSales: number; totalOrders: number
  openedAt: string; closedAt: string | null
  cashier: { name: string | null }; location: { name: string }
}

type TransferItem = { id: string; quantity: number; item: { name: string; unit: string } }
type Transfer = {
  id: string; status: string; notes: string | null; createdAt: string
  fromLocation: { name: string }; toLocation: { name: string }
  items: TransferItem[]
}

type OpnameItem = { id: string; difference: number | null }
type Opname = {
  id: string; status: string; createdAt: string
  location: { name: string }; items: OpnameItem[]
}

type ReceiptItem = { id: string; quantity: number; costPrice?: number | null; item: { name: string; unit: string } }
type GoodsReceipt = {
  id: string; supplier: string | null; receiptNumber: string | null; notes: string | null; createdAt: string
  location: { id: string; name: string }; items: ReceiptItem[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRANSFER_STATUS: Record<string, { label: string; color: string }> = {
  SENT:     { label: "Terkirim", color: "bg-blue-100 text-blue-700" },
  RECEIVED: { label: "Diterima", color: "bg-green-100 text-green-700" },
  PENDING:  { label: "Menunggu", color: "bg-yellow-100 text-yellow-700" },
  REJECTED: { label: "Ditolak",  color: "bg-red-100 text-red-700" },
}
const OPNAME_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: "Draf",     color: "bg-slate-100 text-slate-600" },
  SUBMITTED: { label: "Diajukan", color: "bg-green-100 text-green-700" },
}

const TABS = [
  { key: "shift",        label: "Tutup Shift",  icon: Clock },
  { key: "opname",       label: "Opname",        icon: ClipboardList },
  { key: "transfer",     label: "Transfer",       icon: ArrowLeftRight },
  { key: "barang_masuk", label: "Barang Masuk",  icon: Truck },
]

// ── Shared ───────────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="py-20 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <div className="text-slate-500 font-medium">{text}</div>
    </div>
  )
}

function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
    >
      {children}
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 ml-auto" />
    </Link>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [tab, setTab] = useState("shift")
  const [loading, setLoading] = useState(true)

  const [shifts,    setShifts]    = useState<POSShift[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [opnames,   setOpnames]   = useState<Opname[]>([])
  const [receipts,  setReceipts]  = useState<GoodsReceipt[]>([])

  // Shift date range + location filter + pagination
  const [shiftFrom,     setShiftFrom]     = useState("")
  const [shiftTo,       setShiftTo]       = useState("")
  const [shiftLocation, setShiftLocation] = useState("")
  const [shiftPage,     setShiftPage]     = useState(1)
  const [shiftPages,    setShiftPages]    = useState(1)
  const [exportLocations, setExportLocations] = useState<{ id: string; name: string }[]>([])
  const [downloading,  setDownloading]  = useState<"transaction" | "product" | null>(null)
  const [loadingMore,  setLoadingMore]  = useState(false)

  // Transfer filter
  const [trFrom,     setTrFrom]     = useState("")
  const [trTo,       setTrTo]       = useState("")
  const [trLocation, setTrLocation] = useState("")

  // Opname filter
  const [opFrom,     setOpFrom]     = useState("")
  const [opTo,       setOpTo]       = useState("")
  const [opLocation, setOpLocation] = useState("")

  // Barang masuk filter + export
  const [grFrom,        setGrFrom]        = useState("")
  const [grTo,          setGrTo]          = useState("")
  const [grLocation,    setGrLocation]    = useState("")
  const [grDownloading, setGrDownloading] = useState(false)

  const fetchData = useCallback(async (page = 1) => {
    if (page === 1) setLoading(true)
    else setLoadingMore(true)
    if (tab === "shift") {
      const shiftParams = new URLSearchParams({ status: "CLOSED", page: String(page) })
      if (shiftLocation) shiftParams.set("locationId", shiftLocation)
      const res = await fetch(`/api/pos/shifts?${shiftParams}`)
      if (res.ok) {
        const data = await res.json()
        if (page === 1) {
          setShifts(data.items)
        } else {
          setShifts((prev) => [...prev, ...data.items])
        }
        setShiftPage(data.page)
        setShiftPages(data.pages)
      }
    } else if (tab === "transfer") {
      const p = new URLSearchParams()
      if (trFrom)     p.set("from",       trFrom)
      if (trTo)       p.set("to",         trTo)
      if (trLocation) p.set("locationId", trLocation)
      const res = await fetch(`/api/transfers?${p}`)
      if (res.ok) setTransfers(await res.json())
    } else if (tab === "opname") {
      const p = new URLSearchParams()
      if (opFrom)     p.set("from",       opFrom)
      if (opTo)       p.set("to",         opTo)
      if (opLocation) p.set("locationId", opLocation)
      const res = await fetch(`/api/opnames?${p}`)
      if (res.ok) setOpnames(await res.json())
    } else if (tab === "barang_masuk") {
      const res = await fetch("/api/goods-receipts")
      if (res.ok) setReceipts(await res.json())
    }
    setLoading(false)
    setLoadingMore(false)
  }, [tab, shiftLocation, trFrom, trTo, trLocation, opFrom, opTo, opLocation])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (exportLocations.length === 0) {
      fetch("/api/locations").then((r) => r.ok ? r.json() : []).then(setExportLocations)
    }
  }, [])

  const filteredReceipts = receipts.filter((r) => {
    const localDate = new Date(r.createdAt).toLocaleDateString("en-CA")
    if (grFrom && localDate < grFrom) return false
    if (grTo   && localDate > grTo)   return false
    if (grLocation && r.location.id !== grLocation) return false
    return true
  })

  async function exportGoodsReceipt() {
    setGrDownloading(true)
    const XLSX = await import("xlsx")
    const filtered = filteredReceipts
    const xlRows: Record<string, string | number>[] = []
    for (const r of filtered) {
      for (const it of r.items) {
        const cost = it.costPrice
        const qty  = Number(it.quantity)
        xlRows.push({
          "Tanggal":              new Date(r.createdAt).toLocaleString("id-ID"),
          "Lokasi":               r.location.name,
          "Supplier":             r.supplier ?? "—",
          "No. Surat Jalan":      r.receiptNumber ?? "—",
          "Item":                 it.item.name,
          "Satuan":               it.item.unit,
          "Qty Masuk":            qty,
          "Harga Beli/Unit (Rp)": cost != null ? cost : "—",
          "Total (Rp)":           cost != null ? Math.round(qty * cost) : "—",
          "Catatan":              r.notes ?? "",
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(xlRows)
    ws["!cols"] = [18, 18, 20, 20, 24, 8, 12, 20, 16, 30].map((w) => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Barang Masuk")
    XLSX.writeFile(wb, `barang-masuk-${new Date().toISOString().slice(0, 10)}.xlsx`)
    setGrDownloading(false)
  }

  async function downloadExcel(type: "transaction" | "product") {
    setDownloading(type)
    const params = new URLSearchParams({ type })
    if (shiftFrom)     params.set("from",       shiftFrom)
    if (shiftTo)       params.set("to",         shiftTo)
    if (shiftLocation) params.set("locationId", shiftLocation)
    const res = await fetch(`/api/pos/shifts/export?${params}`)
    if (res.ok) {
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1]
        ?? `laporan_${type}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    }
    setDownloading(null)
  }

  const filteredShifts = (shiftFrom || shiftTo)
    ? shifts.filter((s) => {
        const d = new Date(s.closedAt ?? s.openedAt)
        if (shiftFrom && d < new Date(shiftFrom)) return false
        if (shiftTo   && d > new Date(shiftTo + "T23:59:59")) return false
        return true
      })
    : shifts

  const count = tab === "shift" ? shifts.length
    : tab === "transfer" ? transfers.length
    : tab === "opname" ? opnames.length
    : filteredReceipts.length
  const hasActiveFilter = (tab === "transfer" && (trFrom || trTo || trLocation)) ||
    (tab === "opname" && (opFrom || opTo || opLocation))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-light text-slate-900 tracking-tight">Riwayat Aktivitas</h1>
        <p className="text-slate-500 text-sm mt-0.5">{count} catatan{hasActiveFilter ? " (terfilter)" : ""}</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Transfer filter */}
      {tab === "transfer" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={trLocation}
              onChange={(e) => setTrLocation(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Semua Lokasi</option>
              {exportLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <input type="date" value={trFrom} onChange={(e) => setTrFrom(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-sm">—</span>
            <input type="date" value={trTo} onChange={(e) => setTrTo(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(trFrom || trTo || trLocation) && (
              <button onClick={() => { setTrFrom(""); setTrTo(""); setTrLocation("") }}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Opname filter */}
      {tab === "opname" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={opLocation}
              onChange={(e) => setOpLocation(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Semua Lokasi</option>
              {exportLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <input type="date" value={opFrom} onChange={(e) => setOpFrom(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-sm">—</span>
            <input type="date" value={opTo} onChange={(e) => setOpTo(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {(opFrom || opTo || opLocation) && (
              <button onClick={() => { setOpFrom(""); setOpTo(""); setOpLocation("") }}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Barang Masuk: ekspor laporan */}
      {tab === "barang_masuk" && receipts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">Ekspor Laporan</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={grLocation}
                onChange={(e) => setGrLocation(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Semua Lokasi</option>
                {exportLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <input type="date" value={grFrom} onChange={(e) => setGrFrom(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-sm">—</span>
              <input type="date" value={grTo} onChange={(e) => setGrTo(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {(grFrom || grTo || grLocation) && (
                <button onClick={() => { setGrFrom(""); setGrTo(""); setGrLocation("") }}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800 mb-0.5">Detail Barang Masuk</div>
              <div className="text-xs text-slate-400 leading-relaxed">
                Rincian setiap penerimaan barang dari supplier — lokasi, item, jumlah, dan harga beli
              </div>
            </div>
            <button
              onClick={exportGoodsReceipt}
              disabled={grDownloading}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {grDownloading ? "Mengunduh..." : "Download Excel"}
            </button>
          </div>
        </div>
      )}

      {/* Shift: ekspor laporan */}
      {tab === "shift" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">Ekspor Laporan</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={shiftLocation}
                onChange={(e) => setShiftLocation(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Semua Outlet</option>
                {exportLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={shiftFrom}
                onChange={(e) => setShiftFrom(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-sm">—</span>
              <input
                type="date"
                value={shiftTo}
                onChange={(e) => setShiftTo(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {(shiftFrom || shiftTo || shiftLocation) && (
                <button
                  onClick={() => { setShiftFrom(""); setShiftTo(""); setShiftLocation("") }}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              {
                type: "transaction" as const,
                title: "Detail Transaksi",
                desc: "Rincian setiap transaksi lengkap dengan produk, harga, dan metode bayar",
              },
              {
                type: "product" as const,
                title: "Per Produk",
                desc: "Produk mana yang paling laku dan berapa total omzetnya",
              },
            ].map((item) => (
              <div key={item.type} className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800 mb-0.5">{item.title}</div>
                  <div className="text-xs text-slate-400 leading-relaxed">{item.desc}</div>
                </div>
                <button
                  onClick={() => downloadExcel(item.type)}
                  disabled={downloading !== null}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading === item.type ? "Mengunduh..." : "Download"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>

        ) : tab === "shift" ? (
          filteredShifts.length === 0
            ? <EmptyState icon={Clock} text={shifts.length === 0 ? "Belum ada shift yang ditutup" : "Tidak ada shift pada rentang tanggal ini"} />
            : <>
                <div className="divide-y divide-slate-100">
                  {filteredShifts.map((shift) => (
                    <RowLink key={shift.id} href={`/dashboard/audit/shift/${shift.id}`}>
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{shift.shiftNumber}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{shift.location.name} · {shift.cashier.name ?? "—"}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-slate-800">{formatRp(Number(shift.totalSales))}</div>
                        <div className="text-xs text-slate-400">{shift.closedAt && fmtDate(shift.closedAt)}</div>
                      </div>
                    </RowLink>
                  ))}
                </div>
                {shiftPage < shiftPages && (
                  <div className="p-4 border-t border-slate-100 text-center">
                    <button
                      onClick={() => fetchData(shiftPage + 1)}
                      disabled={loadingMore}
                      className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                    >
                      {loadingMore ? "Memuat..." : "Muat lebih banyak"}
                    </button>
                  </div>
                )}
              </>

        ) : tab === "transfer" ? (
          transfers.length === 0
            ? <EmptyState icon={ArrowLeftRight} text={hasActiveFilter ? "Tidak ada transfer pada filter ini" : "Belum ada transfer barang"} />
            : <div className="divide-y divide-slate-100">
                {transfers.map((tr) => {
                  const st = TRANSFER_STATUS[tr.status] ?? { label: tr.status, color: "bg-slate-100 text-slate-600" }
                  return (
                    <RowLink key={tr.id} href={`/dashboard/audit/transfer/${tr.id}`}>
                      <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{tr.fromLocation.name} → {tr.toLocation.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          <span className="text-xs text-slate-400">{tr.items.length} item</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 shrink-0 text-right">{fmtDate(tr.createdAt)}</div>
                    </RowLink>
                  )
                })}
              </div>

        ) : tab === "opname" ? (
          opnames.length === 0
            ? <EmptyState icon={ClipboardList} text={hasActiveFilter ? "Tidak ada opname pada filter ini" : "Belum ada opname fisik"} />
            : <div className="divide-y divide-slate-100">
                {opnames.map((op) => {
                  const st      = OPNAME_STATUS[op.status] ?? { label: op.status, color: "bg-slate-100 text-slate-600" }
                  const selisih = op.items.filter((i) => i.difference !== null && i.difference !== 0)
                  return (
                    <RowLink key={op.id} href={`/dashboard/audit/opname/${op.id}`}>
                      <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <ClipboardList className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{op.location.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          {selisih.length > 0
                            ? <span className="text-xs text-red-500">{selisih.length} selisih</span>
                            : <span className="text-xs text-slate-400">{op.items.length} item</span>}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 shrink-0 text-right">{fmtDate(op.createdAt)}</div>
                    </RowLink>
                  )
                })}
              </div>

        ) : (
          filteredReceipts.length === 0
            ? <EmptyState icon={Truck} text="Belum ada penerimaan barang" />
            : <div className="divide-y divide-slate-100">
                {filteredReceipts.map((gr) => {
                  const totalQty = gr.items.reduce((s, i) => s + Number(i.quantity), 0)
                  return (
                    <RowLink key={gr.id} href={`/dashboard/audit/receipt/${gr.id}`}>
                      <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{gr.location.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {gr.supplier ? `dari ${gr.supplier} · ` : ""}{gr.items.length} item
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 shrink-0 text-right">{fmtDate(gr.createdAt)}</div>
                    </RowLink>
                  )
                })}
              </div>
        )}
      </div>
    </div>
  )
}
