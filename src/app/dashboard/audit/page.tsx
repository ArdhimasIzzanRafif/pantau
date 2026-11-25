"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { Pagination } from "@/components/ui/pagination"
import { AppDatePicker } from "@/components/ui/app-date-picker"
import {
  Clock, ChevronRight, ClipboardList, ArrowLeftRight, Truck, Download, ChevronDown,
} from "lucide-react"

// Sama dengan `take` di API riwayat.
const PER_PAGE = 30

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

// Kolom Decimal tiba sebagai string lewat JSON, bukan number.
type OpnameItem = { id: string; difference: number | string | null }
type Opname = {
  id: string; status: string; createdAt: string
  location: { name: string }; items: OpnameItem[]
}

type ReceiptItem = {
  id: string
  quantity: number
  costPrice?: number | null
  purchaseQuantity: number
  purchaseUnit: string
  purchaseUnitCost: number | null
  lineTotal: number | null
  item: { name: string; unit: string }
}
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
  DRAFT:     { label: "Sedang dilakukan", color: "bg-amber-100 text-amber-700" },
  SUBMITTED: { label: "Data Lama", color: "bg-slate-100 text-slate-600" },
  REVIEWED:  { label: "Selesai", color: "bg-green-100 text-green-700" },
  REJECTED:  { label: "Tidak Dibukukan", color: "bg-red-100 text-red-700" },
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
    <a
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:gap-4 sm:px-5 sm:py-4"
    >
      {children}
      <ChevronRight className="ml-auto hidden h-4 w-4 shrink-0 text-slate-300 sm:block" />
    </a>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

// Input tanggal dengan placeholder sendiri — input date bawaan tampil kosong
// total di iOS, dan punya lebar minimum yang membuatnya meluber di layar kecil.
const FIELD = "h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-slate-500">{children}</label>
}

// Safari iOS mengabaikan padding pada <select> tanpa appearance-none, jadi
// panahnya digambar sendiri supaya tingginya sama dengan kolom tanggal.
function FilterSelect({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD} appearance-none pl-3 pr-9`}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  )
}

function ExportDateField({ value, onChange, placeholder, min, max }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  min?: string
  max?: string
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{placeholder}</FieldLabel>
      <AppDatePicker
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        placeholder="Pilih tanggal"
        ariaLabel={placeholder}
        className={`${FIELD} px-3`}
      />
    </div>
  )
}

function ExportCard({ title, desc, onDownload, downloading, disabled }: {
  title: string
  desc: string
  onDownload: () => void
  downloading: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <div className="mb-0.5 text-sm font-semibold text-slate-800">{title}</div>
        <div className="text-xs leading-relaxed text-slate-400">{desc}</div>
      </div>
      <button
        onClick={onDownload}
        disabled={disabled ?? downloading}
        className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        <Download className="w-3.5 h-3.5" />
        {downloading ? "Mengunduh..." : "Download Excel"}
      </button>
    </div>
  )
}

// Satu bentuk filter untuk semua tab riwayat: lokasi + rentang tanggal + reset.
function FilterBar({ locationLabel, locationPlaceholder, location, onLocation, locations, from, onFrom, to, onTo, onReset, count }: {
  locationLabel: string
  locationPlaceholder: string
  location: string
  onLocation: (value: string) => void
  locations: { id: string; name: string }[]
  from: string
  onFrom: (value: string) => void
  to: string
  onTo: (value: string) => void
  onReset: () => void
  count: number
}) {
  const today = new Date().toISOString().slice(0, 10)
  const hasFilter = !!(from || to || location)
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-800">Filter Riwayat</span>
        <span className="text-xs text-slate-400">{count} catatan</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <FilterSelect label={locationLabel} value={location} onChange={onLocation}>
          <option value="">{locationPlaceholder}</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </FilterSelect>
        <ExportDateField value={draftFrom} onChange={setDraftFrom} placeholder="Dari tanggal" max={draftTo || today} />
        <ExportDateField value={draftTo} onChange={setDraftTo} placeholder="Sampai tanggal" min={draftFrom || undefined} max={today} />
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
          <button
            type="button"
            onClick={() => { onFrom(draftFrom); onTo(draftTo) }}
            disabled={draftFrom === from && draftTo === to}
            className="h-11 rounded-xl bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-400"
          >
            Terapkan
          </button>
          <button
            type="button"
            onClick={() => { setDraftFrom(""); setDraftTo(""); onReset() }}
            disabled={!hasFilter && !draftFrom && !draftTo}
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AuditPage() {
  const { data: session, status: sessionStatus } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isOwner = role === "OWNER"
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
  const [trPage,  setTrPage]  = useState(1)
  const [trPages, setTrPages] = useState(1)
  const [opPage,  setOpPage]  = useState(1)
  const [opPages, setOpPages] = useState(1)
  const [grPage,  setGrPage]  = useState(1)
  const [grPages, setGrPages] = useState(1)
  // Total dari server — jumlah baris yang sudah dimuat bukan jumlah sebenarnya.
  const [totals, setTotals] = useState<Record<string, number>>({})
  const listRef = useRef<HTMLDivElement>(null)
  const [exportLocations, setExportLocations] = useState<{ id: string; name: string }[]>([])
  const [downloading,  setDownloading]  = useState<"transaction" | "product" | null>(null)

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

  const visibleTabs = isOwner ? TABS : TABS.filter((item) => item.key !== "shift")
  const activeTab = !isOwner && tab === "shift" ? "opname" : tab

  const fetchData = useCallback(async (page = 1) => {
    if (sessionStatus === "loading" || !role) return
    setLoading(true)
    if (activeTab === "shift") {
      const shiftParams = new URLSearchParams({ status: "CLOSED", page: String(page), history: "1" })
      if (shiftLocation) shiftParams.set("locationId", shiftLocation)
      if (shiftFrom)     shiftParams.set("from",       shiftFrom)
      if (shiftTo)       shiftParams.set("to",         shiftTo)
      const res = await fetch(`/api/pos/shifts?${shiftParams}`)
      if (res.ok) {
        const data = await res.json()
        setShifts(data.items)
        setShiftPage(data.page)
        setShiftPages(data.pages)
        setTotals((prev) => ({ ...prev, shift: data.total }))
      }
    } else if (activeTab === "transfer") {
      const p = new URLSearchParams({ history: "1" })
      if (trFrom)     p.set("from",       trFrom)
      if (trTo)       p.set("to",         trTo)
      if (trLocation) p.set("locationId", trLocation)
      p.set("page", String(page))
      const res = await fetch(`/api/transfers?${p}`)
      if (res.ok) {
        const data = await res.json()
        setTransfers(data.items)
        setTrPage(data.page); setTrPages(data.pages)
        setTotals((prev) => ({ ...prev, transfer: data.total }))
      }
    } else if (activeTab === "opname") {
      const p = new URLSearchParams({ history: "1" })
      if (opFrom)     p.set("from",       opFrom)
      if (opTo)       p.set("to",         opTo)
      if (opLocation) p.set("locationId", opLocation)
      p.set("page", String(page))
      const res = await fetch(`/api/opnames?${p}`)
      if (res.ok) {
        const data = await res.json()
        setOpnames(data.items)
        setOpPage(data.page); setOpPages(data.pages)
        setTotals((prev) => ({ ...prev, opname: data.total }))
      }
    } else if (activeTab === "barang_masuk") {
      const p = new URLSearchParams({ history: "1" })
      if (grFrom)     p.set("from",       grFrom)
      if (grTo)       p.set("to",         grTo)
      if (grLocation) p.set("locationId", grLocation)
      p.set("page", String(page))
      const res = await fetch(`/api/goods-receipts?${p}`)
      if (res.ok) {
        const data = await res.json()
        setReceipts(data.items)
        setGrPage(data.page); setGrPages(data.pages)
        setTotals((prev) => ({ ...prev, barang_masuk: data.total }))
      }
    }
    setLoading(false)
  }, [sessionStatus, role, activeTab, shiftLocation, shiftFrom, shiftTo, trFrom, trTo, trLocation, opFrom, opTo, opLocation, grFrom, grTo, grLocation])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchData() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchData])

  useEffect(() => {
    if (exportLocations.length === 0) {
      fetch("/api/locations").then((r) => r.ok ? r.json() : []).then(setExportLocations)
    }
  }, [exportLocations.length])

  async function exportGoodsReceipt() {
    setGrDownloading(true)
    const p = new URLSearchParams({ format: "xlsx", history: "1" })
    if (grFrom)     p.set("from",       grFrom)
    if (grTo)       p.set("to",         grTo)
    if (grLocation) p.set("locationId", grLocation)
    try {
      const exportRes = await fetch(`/api/goods-receipts?${p}`)
      if (!exportRes.ok) return
      const url = URL.createObjectURL(await exportRes.blob())
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `barang-masuk-${new Date().toISOString().slice(0, 10)}.xlsx`
      anchor.click()
      URL.revokeObjectURL(url)
    } finally {
      setGrDownloading(false)
    }
  }

  async function downloadExcel(type: "transaction" | "product") {
    setDownloading(type)
    const params = new URLSearchParams({ type, history: "1" })
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
        ?? `riwayat_penjualan_${type}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    }
    setDownloading(null)
  }

  const count = totals[activeTab] ?? 0
  const hasActiveFilter = (activeTab === "transfer" && (trFrom || trTo || trLocation)) ||
    (activeTab === "opname" && (opFrom || opTo || opLocation)) ||
    (activeTab === "barang_masuk" && (grFrom || grTo || grLocation)) ||
    (activeTab === "shift" && (shiftFrom || shiftTo || shiftLocation))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-light text-slate-900 tracking-tight">
          {isOwner ? "Riwayat Operasional" : "Riwayat Lokasi Saya"}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {count} catatan{hasActiveFilter ? " (terfilter)" : ""}
          {!isOwner && " · aktivitas pada lokasi tanggung jawab Anda"}
        </p>
      </div>

      {/* Keempat tab memenuhi baris — dua kolom di HP supaya labelnya terbaca,
          sebaris penuh di layar besar. Tidak lagi digeser ke samping. */}
      <div className={`grid grid-cols-2 gap-1.5 ${isOwner ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {visibleTabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex min-w-0 items-center justify-center gap-2 px-3 py-2.5 rounded-full text-xs font-semibold transition-colors ${
                activeTab === t.key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Transfer filter */}
      {activeTab === "transfer" && (
        <FilterBar
          key="transfer"
          locationLabel="Lokasi" locationPlaceholder="Semua Lokasi"
          location={trLocation} onLocation={setTrLocation} locations={exportLocations}
          from={trFrom} onFrom={setTrFrom} to={trTo} onTo={setTrTo}
          onReset={() => { setTrFrom(""); setTrTo(""); setTrLocation("") }}
          count={totals.transfer ?? 0}
        />
      )}

      {/* Opname filter */}
      {activeTab === "opname" && (
        <FilterBar
          key="opname"
          locationLabel="Lokasi" locationPlaceholder="Semua Lokasi"
          location={opLocation} onLocation={setOpLocation} locations={exportLocations}
          from={opFrom} onFrom={setOpFrom} to={opTo} onTo={setOpTo}
          onReset={() => { setOpFrom(""); setOpTo(""); setOpLocation("") }}
          count={totals.opname ?? 0}
        />
      )}

      {/* Barang Masuk: filter + ekspor */}
      {activeTab === "barang_masuk" && (
        <>
          <FilterBar
            key="barang-masuk"
            locationLabel="Lokasi" locationPlaceholder="Semua Lokasi"
            location={grLocation} onLocation={setGrLocation} locations={exportLocations}
            from={grFrom} onFrom={setGrFrom} to={grTo} onTo={setGrTo}
            onReset={() => { setGrFrom(""); setGrTo(""); setGrLocation("") }}
            count={totals.barang_masuk ?? 0}
          />
          <ExportCard
            title="Detail Barang Masuk"
            desc="Rincian setiap penerimaan barang dari supplier — lokasi, item, jumlah, dan harga beli"
            onDownload={exportGoodsReceipt}
            downloading={grDownloading}
            disabled={grDownloading || (totals.barang_masuk ?? 0) === 0}
          />
        </>
      )}

      {/* Shift: filter + ekspor */}
      {activeTab === "shift" && (
        <>
          <FilterBar
            key="shift"
            locationLabel="Outlet" locationPlaceholder="Semua Outlet"
            location={shiftLocation} onLocation={setShiftLocation} locations={exportLocations}
            from={shiftFrom} onFrom={setShiftFrom} to={shiftTo} onTo={setShiftTo}
            onReset={() => { setShiftFrom(""); setShiftTo(""); setShiftLocation("") }}
            count={totals.shift ?? 0}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ExportCard
              title="Riwayat Penjualan"
              desc="Rincian setiap transaksi lengkap dengan produk, harga, dan metode bayar"
              onDownload={() => downloadExcel("transaction")}
              downloading={downloading === "transaction"}
              disabled={downloading !== null || (totals.shift ?? 0) === 0}
            />
            <ExportCard
              title="Per Produk"
              desc="Produk mana yang paling laku dan berapa total omzetnya"
              onDownload={() => downloadExcel("product")}
              downloading={downloading === "product"}
              disabled={downloading !== null || (totals.shift ?? 0) === 0}
            />
          </div>
        </>
      )}

      <div ref={listRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>

        ) : activeTab === "shift" ? (
          shifts.length === 0
            ? <EmptyState icon={Clock} text={hasActiveFilter ? "Tidak ada shift pada filter ini" : "Belum ada shift yang ditutup"} />
            : <>
                <div className="divide-y divide-slate-100">
                  {shifts.map((shift) => (
                    <RowLink key={shift.id} href={`/dashboard/audit/shift/${shift.id}?scope=history`}>
                      <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">{shift.shiftNumber}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-400">{shift.location.name} · {shift.cashier.name ?? "—"}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="whitespace-nowrap text-sm font-semibold text-slate-800">{formatRp(Number(shift.totalSales))}</div>
                        <div className="whitespace-nowrap text-xs text-slate-400">{shift.closedAt && fmtDate(shift.closedAt)}</div>
                      </div>
                    </RowLink>
                  ))}
                </div>
                <Pagination page={shiftPage} pages={shiftPages} total={totals.shift} perPage={PER_PAGE} label="shift" loading={loading} scrollToRef={listRef} onPageChange={fetchData} />
              </>

        ) : activeTab === "transfer" ? (
          transfers.length === 0
            ? <EmptyState icon={ArrowLeftRight} text={hasActiveFilter ? "Tidak ada transfer pada filter ini" : "Belum ada transfer di lokasi tugas Anda"} />
            : <>
                <div className="divide-y divide-slate-100">
                  {transfers.map((tr) => {
                  const st = TRANSFER_STATUS[tr.status] ?? { label: tr.status, color: "bg-slate-100 text-slate-600" }
                  return (
                    <RowLink key={tr.id} href={`/dashboard/audit/transfer/${tr.id}?scope=history`}>
                      <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">{tr.fromLocation.name} → {tr.toLocation.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          <span className="text-xs text-slate-400">{tr.items.length} item</span>
                        </div>
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-right text-xs text-slate-400">{fmtDate(tr.createdAt)}</div>
                    </RowLink>
                  )
                  })}
                </div>
                <Pagination page={trPage} pages={trPages} total={totals.transfer} perPage={PER_PAGE} label="transfer" loading={loading} scrollToRef={listRef} onPageChange={fetchData} />
              </>

        ) : activeTab === "opname" ? (
          opnames.length === 0
            ? <EmptyState icon={ClipboardList} text={hasActiveFilter ? "Tidak ada opname pada filter ini" : "Belum ada opname di lokasi tugas Anda"} />
            : <>
                <div className="divide-y divide-slate-100">
                  {opnames.map((op) => {
                  const st      = OPNAME_STATUS[op.status] ?? { label: op.status, color: "bg-slate-100 text-slate-600" }
                  // Decimal tiba sebagai string, jadi harus dikonversi dulu.
                  const selisih = op.items.filter((i) => i.difference !== null && Number(i.difference) !== 0)
                  return (
                    <RowLink key={op.id} href={`/dashboard/audit/opname/${op.id}?scope=history`}>
                      <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                        <ClipboardList className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">{op.location.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          {selisih.length > 0
                            ? <span className="text-xs text-red-500">{selisih.length} selisih</span>
                            : <span className="text-xs text-slate-400">{op.items.length} item</span>}
                        </div>
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-right text-xs text-slate-400">{fmtDate(op.createdAt)}</div>
                    </RowLink>
                  )
                  })}
                </div>
                <Pagination page={opPage} pages={opPages} total={totals.opname} perPage={PER_PAGE} label="opname" loading={loading} scrollToRef={listRef} onPageChange={fetchData} />
              </>

        ) : (
          receipts.length === 0
            ? <EmptyState icon={Truck} text={hasActiveFilter ? "Tidak ada penerimaan pada filter ini" : "Belum ada penerimaan di lokasi tugas Anda"} />
            : <>
                <div className="divide-y divide-slate-100">
                  {receipts.map((gr) => (
                    <RowLink key={gr.id} href={`/dashboard/audit/receipt/${gr.id}?scope=history`}>
                      <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">{gr.location.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {gr.supplier ? `dari ${gr.supplier} · ` : ""}{gr.items.length} item
                        </div>
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-right text-xs text-slate-400">{fmtDate(gr.createdAt)}</div>
                    </RowLink>
                  ))}
                </div>
                <Pagination page={grPage} pages={grPages} total={totals.barang_masuk} perPage={PER_PAGE} label="penerimaan" loading={loading} scrollToRef={listRef} onPageChange={fetchData} />
              </>
        )}
      </div>
    </div>
  )
}
