"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle, CalendarClock, Camera, ChevronDown, ClipboardMinus, Gift, ImageIcon,
  Loader2, MapPin, PackageX, Plus, SearchX, Trash2, TrendingDown, User, X,
} from "lucide-react"
import { getRoleName } from "@/lib/utils"
import { compressImage } from "@/lib/compress-image"
import { useCanEdit, DISABLED_ACTION_CLASS, NO_EDIT_PERMISSION_TITLE } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { StableDraftInput } from "@/components/ui/stable-draft-input"
import { STOCK_ADJUSTMENT_NOTE_MAX_LENGTH } from "@/lib/stock-adjustment-validation"
import { AppDatePicker } from "@/components/ui/app-date-picker"
import { FormAlert } from "@/components/ui/form-alert"

type Location = { id: string; name: string }
type Item = { id: string; name: string; unit: string; sku: string | null; isTrackable: boolean; isMenuItem: boolean }
type Batch = { id: string; batchNumber: string; quantity: number | string; expiryDate: string | null }
type Adjustment = {
  id: string
  type: string
  quantity: number | string
  totalCost: number | string | null
  note: string
  evidenceUrl: string | null
  createdAt: string
  item: { name: string; unit: string; isTrackable: boolean; isMenuItem: boolean }
  location: Location
  batch: { batchNumber: string; expiryDate: string | null } | null
  createdBy: { name: string | null; email: string; role: string | null } | null
}

// Tiap jenis kejadian punya warna dan ikonnya sendiri supaya sekali lihat
// terbaca bedanya: barang rusak tidak sama beratnya dengan complimentary.
const TYPE_META = {
  DAMAGE:        { label: "Rusak",        icon: PackageX,      accent: "bg-red-50 text-red-600",         chip: "bg-red-50 text-red-700",         bar: "bg-red-400" },
  WASTE:         { label: "Terbuang",     icon: Trash2,        accent: "bg-orange-50 text-orange-600",   chip: "bg-orange-50 text-orange-700",   bar: "bg-orange-400" },
  LOSS:          { label: "Hilang",       icon: SearchX,       accent: "bg-rose-50 text-rose-600",       chip: "bg-rose-50 text-rose-700",       bar: "bg-rose-400" },
  COMPLIMENTARY: { label: "Complimentary", icon: Gift,          accent: "bg-blue-50 text-blue-600",       chip: "bg-blue-50 text-blue-700",       bar: "bg-blue-400" },
  EXPIRED:       { label: "Kedaluwarsa",  icon: CalendarClock, accent: "bg-violet-50 text-violet-600",   chip: "bg-violet-50 text-violet-700",   bar: "bg-violet-400" },
} as const

const TYPE_OPTIONS = (Object.keys(TYPE_META) as (keyof typeof TYPE_META)[])
  .map((value) => ({ value, label: TYPE_META[value].label }))

const typeMeta = (type: string) => TYPE_META[type as keyof typeof TYPE_META] ?? TYPE_META.DAMAGE

const rupiah = (value: number) => `Rp ${Math.round(value).toLocaleString("id-ID")}`

// Mengikuti kontrol formulir Barang Masuk: tinggi, label, dan fokus seragam.
const FORM_SELECT_CLASS = "h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-11 text-sm text-slate-900 transition-shadow focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
const FORM_CHEVRON_CLASS = "pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"

function localDate(daysAgo = 0) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const dateHeading = (iso: string) => {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(date, today)) return "Hari ini"
  if (sameDay(date, yesterday)) return "Kemarin"
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
}

export default function AdjustmentsPage() {
  const canEdit = useCanEdit("ADJUSTMENTS")
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [locationId, setLocationId] = useState("")
  const [itemId, setItemId] = useState("")
  const [batchId, setBatchId] = useState("")
  const [type, setType] = useState("WASTE")
  const [quantity, setQuantity] = useState("")
  const [note, setNote] = useState("")
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null)
  const [filterLocation, setFilterLocation] = useState("")
  const [filterType, setFilterType] = useState("")
  const [filterFrom, setFilterFrom] = useState(localDate(30))
  const [filterTo, setFilterTo] = useState(localDate())

  const fetchAdjustments = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    const params = new URLSearchParams()
    if (filterLocation) params.set("locationId", filterLocation)
    if (filterType) params.set("type", filterType)
    if (filterFrom) params.set("from", filterFrom)
    if (filterTo) params.set("to", filterTo)
    const response = await fetch(`/api/stock-adjustments?${params}`)
    if (response.ok) setAdjustments(await response.json())
    setLoading(false)
  }, [filterLocation, filterType, filterFrom, filterTo])

  async function fetchSetup() {
    const [locationRes, itemRes] = await Promise.all([
      fetch("/api/locations"),
      fetch("/api/inventory?includeMenuItems=1"),
    ])
    if (locationRes.ok) {
      const list = await locationRes.json() as Location[]
      setLocations(list)
      setLocationId((current) => current || list[0]?.id || "")
    }
    if (itemRes.ok) {
      // Barang rusak tidak mengenal batas: bahan baku, menu jadi, yang stoknya
      // dilacak maupun tidak — semuanya bisa dicatat di sini.
      const list = await itemRes.json() as Item[]
      setItems(list)
      setItemId((current) => current || list[0]?.id || "")
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchSetup() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchAdjustments() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchAdjustments])

  // Pencatatan waste dari pengguna lain ikut muncul tanpa memuat ulang halaman.
  useLiveRefresh(() => { void fetchAdjustments({ silent: true }) })

  useEffect(() => {
    // Item tanpa pelacakan stok tidak punya batch, jadi tidak perlu diminta.
    if (!locationId || !itemId || !items.find((item) => item.id === itemId)?.isTrackable) {
      return
    }
    const controller = new AbortController()
    fetch(`/api/stock-batches?locationId=${encodeURIComponent(locationId)}&itemId=${encodeURIComponent(itemId)}`, { signal: controller.signal })
      .then(async (response) => setBatches(response.ok ? await response.json() : []))
      .catch((fetchError) => { if (fetchError.name !== "AbortError") setBatches([]) })
    return () => controller.abort()
  }, [locationId, itemId, items])

  async function uploadEvidence(file: File) {
    setUploading(true)
    // Foto kamera HP (HEIC / 3-5 MB) dikecilkan & diubah ke JPEG dulu
    const upload = await compressImage(file)
    const form = new FormData()
    form.append("file", upload)
    form.append("folder", "stock-adjustments")
    const response = await fetch("/api/upload", { method: "POST", body: form })
    if (response.ok) setEvidenceUrl((await response.json()).url)
    else {
      const reason = await response.json().then((d) => d?.error).catch(() => null)
      setError(reason ? `Gagal mengunggah bukti foto: ${reason}` : "Gagal mengunggah bukti foto")
    }
    setUploading(false)
  }

  async function submit() {
    setSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, itemId, batchId: batchId || null, type, quantity: Number(quantity), note, evidenceUrl }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "Gagal menyimpan kejadian stok")
      setAdjustments((current) => [body, ...current])
      setQuantity("")
      setNote("")
      setBatchId("")
      setEvidenceUrl(null)
      setShowForm(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal menyimpan kejadian stok")
    } finally {
      setSubmitting(false)
    }
  }

  const label = (value: string) => TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value

  // Item yang paling sering kena — pertanyaan pertama owner saat melihat waste.
  const topItem = (() => {
    const tally = new Map<string, number>()
    for (const row of adjustments) tally.set(row.item.name, (tally.get(row.item.name) ?? 0) + 1)
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1])
    return sorted[0] ?? null
  })()

  // Kejadian dikelompokkan per hari supaya deretannya terbaca sebagai catatan.
  const groupedByDay = adjustments.reduce<{ heading: string; rows: Adjustment[] }[]>((groups, row) => {
    const heading = dateHeading(row.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.heading === heading) last.rows.push(row)
    else groups.push({ heading, rows: [row] })
    return groups
  }, [])
  const formatQty = (value: number | string) => Number(value).toLocaleString("id-ID", { maximumFractionDigits: 3 })
  const selectedItem = items.find((item) => item.id === itemId)
  const totalLoss = adjustments.reduce((sum, row) => sum + Number(row.totalCost ?? 0), 0)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Waste & Penyesuaian</h1>
          <p className="mt-1 text-sm text-slate-500">Pantau barang rusak, terbuang, hilang, complimentary, dan kedaluwarsa.</p>
        </div>
        {!showForm && <button onClick={() => { setShowForm(true); setError("") }} disabled={!canEdit} title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700 sm:self-auto ${DISABLED_ACTION_CLASS} disabled:hover:bg-blue-600`}><Plus className="h-4 w-4" />Catat Kejadian</button>}
      </div>

      {showForm && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:space-y-6 sm:p-6 lg:p-7" aria-labelledby="adjustment-form-title">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id="adjustment-form-title" className="text-lg font-bold text-slate-900">Catat Pengurangan Stok</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">Lengkapi informasi kejadian dan barang yang berkurang.</p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Tutup formulir" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"><X className="h-4.5 w-4.5" strokeWidth={2.5} /></button>
          </div>
          <FormAlert message={error} onClose={() => setError("")} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="min-w-0">
              <span className="mb-2 block text-sm font-medium text-slate-700">Lokasi <span className="text-red-500">*</span></span>
              <span className="relative block">
                <select value={locationId} onChange={(event) => { setLocationId(event.target.value); setBatchId("") }} className={FORM_SELECT_CLASS}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
                <ChevronDown className={FORM_CHEVRON_CLASS} />
              </span>
            </label>
            <label className="min-w-0">
              <span className="mb-2 block text-sm font-medium text-slate-700">Jenis kejadian <span className="text-red-500">*</span></span>
              <span className="relative block">
                <select value={type} onChange={(event) => setType(event.target.value)} className={FORM_SELECT_CLASS}>
                  {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown className={FORM_CHEVRON_CLASS} />
              </span>
            </label>
            <label className="min-w-0">
              <span className="mb-2 block text-sm font-medium text-slate-700">Item <span className="text-red-500">*</span></span>
              <span className="relative block">
              <select value={itemId} onChange={(event) => { setItemId(event.target.value); setBatchId("") }} className={FORM_SELECT_CLASS}>
                {[
                  { label: "Bahan & Inventori", list: items.filter((item) => !item.isMenuItem) },
                  { label: "Menu", list: items.filter((item) => item.isMenuItem) },
                ].filter((group) => group.list.length > 0).map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.list.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}{item.sku ? ` · ${item.sku}` : ""}{item.isTrackable ? "" : " · stok tidak dilacak"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
                <ChevronDown className={FORM_CHEVRON_CLASS} />
              </span>
            </label>
            <label className="min-w-0">
              <span className="mb-2 block text-sm font-medium text-slate-700">Jumlah <span className="text-red-500">*</span></span>
              <span className="relative block">
                <StableDraftInput type="number" min="0.001" step="0.001" value={quantity} onCommit={setQuantity} className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-4 pr-16 text-sm tabular-nums text-slate-900 transition-shadow [appearance:textfield] placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" placeholder="0" />
                <span className="pointer-events-none absolute right-4 top-1/2 max-w-12 -translate-y-1/2 truncate text-sm text-slate-500">{selectedItem?.unit ?? "unit"}</span>
              </span>
            </label>
            {selectedItem?.isTrackable !== false && (
              <label className="min-w-0 md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">Batch / lot <span className="font-normal text-slate-400">(opsional)</span></span>
                <span className="relative block">
                  <select value={batchId} onChange={(event) => setBatchId(event.target.value)} className={FORM_SELECT_CLASS}><option value="">Pilih otomatis (FEFO)</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {formatQty(batch.quantity)} tersedia{batch.expiryDate ? ` · exp ${new Date(batch.expiryDate).toLocaleDateString("id-ID")}` : ""}</option>)}</select>
                  <ChevronDown className={FORM_CHEVRON_CLASS} />
                </span>
                <span className="mt-1.5 block text-xs text-slate-500">Jika tidak dipilih, sistem menggunakan batch yang paling dekat kedaluwarsa.</span>
              </label>
            )}
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">Keterangan <span className="text-red-500">*</span></span>
              <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={STOCK_ADJUSTMENT_NOTE_MAX_LENGTH} aria-describedby="adjustment-note-hint" className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 transition-shadow placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50" placeholder="Jelaskan penyebab dan kronologi singkat" />
              <span id="adjustment-note-hint" className="mt-1.5 flex justify-between gap-3 text-xs text-slate-500">
                <span>Minimal 3, maksimal {STOCK_ADJUSTMENT_NOTE_MAX_LENGTH} karakter.</span>
                <span className={`shrink-0 tabular-nums ${note.length >= STOCK_ADJUSTMENT_NOTE_MAX_LENGTH ? "font-medium text-amber-600" : ""}`}>{note.length}/{STOCK_ADJUSTMENT_NOTE_MAX_LENGTH}</span>
              </span>
            </label>
          </div>
          <div className="space-y-5 sm:space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-700">Bukti foto <span className="font-normal text-slate-400">(opsional)</span></h3>
              {evidenceUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={evidenceUrl} alt="Bukti penyesuaian" className="h-36 w-full object-cover" />
                  <button type="button" onClick={() => setEvidenceUrl(null)} aria-label="Hapus foto bukti" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-slate-500 shadow-sm transition hover:text-red-600"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <label className="flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/40 sm:min-h-40">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(file) }} />
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">{uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}</span>
                  <span><span className="block text-sm font-medium text-slate-700">{uploading ? "Mengunggah..." : "Tambah foto bukti"}</span><span className="mt-1 block text-xs text-slate-500">JPG, PNG, atau WebP</span></span>
                </label>
              )}
            </div>
            <div className={`flex items-start gap-2.5 rounded-xl border p-4 text-sm ${selectedItem && !selectedItem.isTrackable ? "border-slate-200 bg-slate-50 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="leading-relaxed">{selectedItem && !selectedItem.isTrackable
                ? "Saldo tidak dikurangi karena stok item ini tidak dilacak. Kejadian tetap masuk riwayat dan audit."
                : "Setelah disimpan, stok langsung berkurang dan tercatat pada kartu stok serta audit."}</p>
            </div>
          </div>
          <div className="dialog-actions grid grid-cols-1 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting || uploading || !canEdit}
              title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
              {submitting ? "Menyimpan..." : selectedItem && !selectedItem.isTrackable ? "Simpan Catatan" : "Simpan & Kurangi Stok"}
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100/70">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ClipboardMinus className="h-5 w-5" /></span>
          <div className="min-w-0"><div className="text-xl font-bold tabular-nums text-slate-950">{adjustments.length}</div><div className="text-xs text-slate-500">Kejadian pada periode ini</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-white p-4 shadow-sm shadow-red-50/70">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><TrendingDown className="h-5 w-5" /></span>
          <div className="min-w-0"><div className="truncate text-xl font-bold tabular-nums text-red-600">{rupiah(totalLoss)}</div><div className="text-xs text-slate-500">Nilai kerugian</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100/70">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><PackageX className="h-5 w-5" /></span>
          <div className="min-w-0"><div className="truncate text-xl font-bold text-slate-950">{topItem ? topItem[0] : "—"}</div><div className="text-xs text-slate-500">{topItem ? `Paling sering · ${topItem[1]} kejadian` : "Belum ada data"}</div></div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100/70 sm:p-5" aria-label="Filter riwayat waste dan penyesuaian">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.4fr)]">
          <label className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><MapPin className="h-3.5 w-3.5 text-slate-400" />Lokasi</span>
            <span className="relative block">
              <select
                value={filterLocation}
                onChange={(event) => setFilterLocation(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              >
                <option value="">Semua lokasi</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </span>
          </label>

          <div className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><CalendarClock className="h-3.5 w-3.5 text-slate-400" />Periode</span>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <AppDatePicker value={filterFrom} max={filterTo || undefined} onChange={setFilterFrom} ariaLabel="Dari tanggal" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
              <span className="text-xs font-medium text-slate-400">s/d</span>
              <AppDatePicker value={filterTo} min={filterFrom || undefined} onChange={setFilterTo} ariaLabel="Sampai tanggal" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <span className="mb-2 block text-xs font-semibold text-slate-600">Jenis kejadian</span>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {[{ value: "", label: "Semua" }, ...TYPE_OPTIONS].map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                onClick={() => setFilterType(option.value)}
                aria-pressed={filterType === option.value}
                className={`min-h-9 min-w-0 rounded-lg px-2 text-xs font-semibold transition-colors sm:text-sm ${
                  filterType === option.value
                    ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70"
                    : "text-slate-500 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
      ) : adjustments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
          <ClipboardMinus className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <div className="font-semibold text-slate-600">
            Tidak ada kejadian pada periode ini
          </div>
          <div className="mt-1 text-sm text-slate-400">
            Lebarkan rentang tanggal atau longgarkan penyaring untuk melihat kejadian lain.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDay.map((group) => {
            const dayLoss = group.rows.reduce((sum, row) => sum + Number(row.totalCost ?? 0), 0)
            return (
              <div key={group.heading} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{group.heading}</h2>
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400">
                    {group.rows.length} kejadian{dayLoss > 0 ? ` · ${rupiah(dayLoss)}` : ""}
                  </span>
                </div>

                {group.rows.map((adjustment) => {
                  const meta = typeMeta(adjustment.type)
                  const TypeIcon = meta.icon
                  return (
                    <article key={adjustment.id} className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-100/60 transition hover:border-slate-300 hover:shadow-md">
                      <div className={`w-1 shrink-0 ${meta.bar}`} />
                      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 px-4 py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_minmax(7.5rem,auto)] sm:gap-4 sm:px-5 sm:py-4">
                        <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${meta.accent}`}>
                          <TypeIcon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-slate-900">{adjustment.item.name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>{label(adjustment.type)}</span>
                            {adjustment.item.isMenuItem && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Menu</span>}
                            {!adjustment.item.isTrackable && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Stok tidak dilacak</span>}
                          </div>

                          <div className="mt-1 text-xs text-slate-500">
                            {adjustment.location.name}
                            {" · "}
                            {new Date(adjustment.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                            {adjustment.batch ? ` · Lot ${adjustment.batch.batchNumber}` : ""}
                          </div>

                          <p className="mt-1.5 text-sm leading-5 text-slate-600">{adjustment.note}</p>

                          <div className="mt-2.5 inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
                            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            Dicatat oleh
                            <strong className="font-semibold text-slate-700">
                              {adjustment.createdBy ? adjustment.createdBy.name || adjustment.createdBy.email.split("@")[0] : "Sistem"}
                            </strong>
                            {adjustment.createdBy?.role && <span className="text-slate-400">· {getRoleName(adjustment.createdBy.role)}</span>}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-end justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-col sm:items-end sm:justify-between sm:border-0 sm:pt-0">
                          <div className="text-right">
                            <div className="text-lg font-bold tabular-nums text-slate-900">
                              −{formatQty(adjustment.quantity)} <span className="text-sm font-semibold text-slate-400">{adjustment.item.unit}</span>
                            </div>
                            {adjustment.totalCost != null && (
                              <div className="mt-0.5 text-xs font-semibold text-red-600">{rupiah(Number(adjustment.totalCost))}</div>
                            )}
                          </div>
                          {adjustment.evidenceUrl && (
                            <a
                              href={adjustment.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Lihat bukti foto"
                              className="group relative block h-12 w-12 overflow-hidden rounded-xl border border-slate-200"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={adjustment.evidenceUrl} alt="Bukti kejadian" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                              <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white transition-colors group-hover:bg-slate-900/40">
                                <ImageIcon className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                              </span>
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
