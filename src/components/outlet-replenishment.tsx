"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { AppPortal } from "@/components/ui/app-portal"
import { useCanEdit } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { Pagination } from "@/components/ui/pagination"
import { AlertTriangle, ArrowRight, ChevronDown, Clock, Loader2, Package, X } from "lucide-react"

export type Need = {
  itemId: string; locationId: string; itemName: string; unit: string; outletName: string
  quantity: number; minStock: number; warehouseId: string | null; warehouseName: string | null
  activeTransferId: string | null; needsConfirmation: boolean
  stockUpdatedAt: string; alertCreatedAt: string | null
  packSize: number | null; packUnit: string | null
  warehouseQuantity: number | null
  /// Stok gudang dikurangi reservasi aktif — batas jumlah yang boleh dikirim.
  warehouseAvailable?: number | null
  /// Sisa barang yang masih aktif dipesan ke supplier untuk gudang ini.
  onOrderQuantity?: number
  /// NEW_NEED      stok menipis dan belum pernah diajukan — outlet mengisi jumlah.
  /// OUTSTANDING_NEED  sudah diajukan, belum diterima seluruhnya — jumlahnya
  ///   sudah diketahui sistem, jadi outlet TIDAK diminta mengisi ulang.
  kind: "NEW_NEED" | "OUTSTANDING_NEED"
  outstandingQuantity: number
}
type NeedsPage = { items: Need[]; total: number; page: number; pages: number; perPage: number }

const needDateFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric",
})
const needTimeFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
})

function NeedTimestamps({ need }: { need: Need }) {
  function timestamp(value: string | null) {
    const date = value ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) return "Belum tercatat"
    return <time dateTime={value!}>{needDateFormat.format(date)} · {needTimeFormat.format(date)} WIB</time>
  }
  return <dl className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
    <div><dt className="inline font-medium">Peringatan dibuat: </dt><dd className="inline">{timestamp(need.alertCreatedAt)}</dd></div>
    <div><dt className="inline font-medium">Stok diperbarui: </dt><dd className="inline">{timestamp(need.stockUpdatedAt)}</dd></div>
  </dl>
}

type Isian = { qty: string; unit: "base" | "pack" }
const fmt = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 3 })

/** Hitungan jumlah kebutuhan yang diketik PIC outlet. */
function hitungBaris(need: Need, isian: Isian) {
  const factor = isian.unit === "pack" ? Number(need.packSize ?? 1) : 1
  const baseQuantity = Number(isian.qty) * factor
  const stokTersedia = need.warehouseAvailable ?? need.warehouseQuantity ?? null
  const terisi = isian.qty.trim() !== ""
  const qtyValid = !terisi || (Number.isFinite(baseQuantity) && baseQuantity > 0)
  const stokHabis = stokTersedia != null && stokTersedia <= 0
  return { factor, baseQuantity, stokTersedia, terisi, qtyValid, stokHabis }
}

/**
 * Isi kebutuhan BANYAK bahan untuk satu outlet dalam satu form. Bahan yang
 * kebutuhannya dikosongkan tidak ikut diajukan.
 */
function FormBanyakBahan({ awal, alertIds, onClose, onDone }: {
  awal: Need[]; alertIds: string[]; onClose: () => void; onDone: (pesan: string) => void
}) {
  const canEdit = useCanEdit("TRANSFER")
  const [items, setItems] = useState<Need[]>(awal)
  const [isian, setIsian] = useState<Record<string, Isian>>(() => Object.fromEntries(awal.map((need) => [need.itemId,
    { qty: "", unit: need.packSize && need.packSize > 0 && need.packUnit ? "pack" as const : "base" as const }])))
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const outlet = awal[0]
  const itemsRef = useRef(awal)

  // Stok gudang diperbarui berkala; bahan yang sudah diisi orang lain hilang dari form.
  useLiveRefresh(() => {
    if (busy) return
    const query = new URLSearchParams({ outletId: outlet.locationId, unsubmitted: "true", semua: "true" })
    void fetch(`/api/replenishment?${query}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return
      const fresh = (await response.json() as NeedsPage).items
      const next = itemsRef.current.flatMap((need) => fresh.find((row) => row.itemId === need.itemId) ?? [])
      itemsRef.current = next
      if (next.length === 0) {
        onDone("Kebutuhan outlet sudah terpenuhi. Form pengiriman ditutup otomatis.")
        return
      }
      setItems(next)
    }).catch(() => { /* Server tetap memeriksa ulang saat disimpan. */ })
  }, 3000)
  useEffect(() => {
    const main = document.querySelector("main")
    const old = main?.style.overflowY ?? ""
    if (main) main.style.overflowY = "hidden"
    return () => { if (main) main.style.overflowY = old }
  }, [])

  const ubah = (itemId: string, patch: Partial<Isian>) => setIsian((current) => ({ ...current, [itemId]: { ...current[itemId], ...patch } }))
  const baris = items.map((need) => ({ need, isi: isian[need.itemId], h: hitungBaris(need, isian[need.itemId]) }))
  const terisi = baris.filter((row) => row.h.terisi)
  const adaSalah = terisi.some((row) => !row.h.qtyValid || row.h.stokHabis)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || terisi.length === 0 || adaSalah) return
    setBusy(true); setError("")
    try {
      const res = await fetch("/api/replenishment", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: outlet.locationId, notes, alertIds,
          lines: terisi.map(({ need, isi }) => ({ itemId: need.itemId, quantity: isi.qty, inputUnit: isi.unit })) }) })
      const data = await res.json() as { error?: string; requested?: number }
      if (!res.ok) { setError(data.error ?? "Permintaan gagal disimpan"); return }
      onDone(`Permintaan ${data.requested ?? terisi.length} bahan dikirim ke gudang untuk ditinjau.`)
    } catch { setError("Koneksi terputus. Periksa daftar permintaan sebelum mencoba kembali.") }
    finally { setBusy(false) }
  }

  return <AppPortal>
    <div className="app-overlay mobile-fullscreen-dialog z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="outlet-multi-title">
      <button type="button" aria-label="Tutup kebutuhan" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={() => { if (!busy) onClose() }} />
      <form onSubmit={submit} className="mobile-dialog-panel relative z-10 flex max-h-[calc(100%-3rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/60 bg-white shadow-2xl sm:max-h-[calc(100%-2rem)] sm:rounded-3xl">
        <div className="h-1.5 shrink-0 bg-blue-600" />
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <h2 id="outlet-multi-title" className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Isi kebutuhan outlet</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:mt-1 sm:text-sm">Isi jumlah yang dibutuhkan. Gudang akan memeriksa dan menyetujui jumlah kirim.</p>
            </div>
            <button type="button" disabled={busy} aria-label="Tutup formulir" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50">
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="mobile-dialog-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="truncate">{outlet.warehouseName}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{outlet.outletName}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">Gudang asal dan outlet tujuan sudah ditentukan dari peringatan stok.</p>

            <div className="mt-3 space-y-2.5">
              {items.length === 0 && <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">Semua kebutuhan di form ini sudah diproses. Tutup form untuk melihat daftar terbaru.</p>}
              {baris.map(({ need, isi, h }, index) => {
                const hasPack = Boolean(need.packSize && need.packSize > 0 && need.packUnit)
                const salah = h.terisi && (!h.qtyValid || h.stokHabis)
                return <div key={need.itemId} className={`rounded-xl border bg-white p-3 ${salah ? "border-red-300" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Barang {index + 1}</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{need.itemName}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${need.quantity <= 0 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>{need.quantity <= 0 ? "Habis" : "Menipis"}</span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs sm:grid-cols-3">
                    <div><p className="text-slate-400">Stok outlet</p><p className="mt-0.5 font-semibold text-slate-700">{fmt(need.quantity)} {need.unit}</p></div>
                    <div><p className="text-slate-400">Ambang</p><p className="mt-0.5 font-semibold text-slate-700">{fmt(need.minStock)} {need.unit}</p></div>
                    <div className="col-span-2 sm:col-span-1"><p className="text-slate-400">Stok gudang tersedia</p><p className="mt-0.5 font-semibold text-blue-700">{h.stokTersedia == null ? "—" : `${fmt(h.stokTersedia)} ${need.unit}`}</p></div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <label className="min-w-0">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Jumlah kebutuhan</span>
                      <input type="number" inputMode="decimal" min="0.001" step="0.001" value={isi.qty} placeholder="0"
                        onChange={(event) => ubah(need.itemId, { qty: event.target.value })}
                        className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold outline-none transition-shadow focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                    </label>
                    <div className="min-w-0">
                      <span className="mb-1 block text-[11px] font-medium text-slate-500">Satuan</span>
                      {hasPack ? <div className="relative">
                        <select aria-label={`Satuan ${need.itemName}`} value={isi.unit} onChange={(event) => ubah(need.itemId, { unit: event.target.value as "base" | "pack" })}
                          className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm outline-none transition-shadow focus:border-blue-400 focus:ring-4 focus:ring-blue-50">
                          <option value="base">{need.unit}</option><option value="pack">{need.packUnit}</option>
                        </select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      </div> : <input aria-label={`Satuan ${need.itemName}`} readOnly value={need.unit} className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500" />}
                    </div>
                  </div>
                  {hasPack && h.terisi && h.qtyValid && <p className="mt-2 text-xs text-blue-700">Total kebutuhan: <strong>{fmt(h.baseQuantity)} {need.unit}</strong> · 1 {need.packUnit} = {need.packSize} {need.unit}</p>}
                  {!h.qtyValid && <p role="alert" className="mt-2 text-xs font-medium text-red-600">Kebutuhan harus lebih dari 0.</p>}
                  {h.stokHabis && <p role="alert" className="mt-2 text-xs font-medium text-red-600">Stok gudang sudah tidak tersedia. Muat ulang form.</p>}
                </div>
              })}
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Catatan <span className="font-normal text-slate-400">(opsional)</span></label>
            <textarea maxLength={500} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contoh: untuk persiapan akhir pekan" className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition-shadow focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
          </div>

          {error && <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>}
        </div>

        <div className="mobile-dialog-actions grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-xl border border-slate-200 px-2 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50">Batal</button>
          <button type="submit" disabled={busy || !canEdit || terisi.length === 0 || adaSalah} className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-2 py-3 text-center text-xs font-semibold leading-tight text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengajukan...</> : terisi.length ? `Ajukan kebutuhan (${terisi.length})` : "Ajukan kebutuhan"}
          </button>
        </div>
      </form>
    </div>
  </AppPortal>
}

export function OutletReplenishment({ onSubmitted, active = true, refreshKey = 0, providedNeeds, renderList }: { onSubmitted: () => void; active?: boolean; refreshKey?: number; providedNeeds?: Need[]; renderList?: (renderNeed: (need: Need) => ReactNode) => ReactNode }) {
  const canEdit = useCanEdit("TRANSFER")
  const [needs, setNeeds] = useState<Need[]>([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, perPage: 5 })
  const [loading, setLoading] = useState(providedNeeds === undefined)
  const pageRef = useRef(1)
  const loadSequence = useRef(0)
  const sectionRef = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<Need | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [inputUnit, setInputUnit] = useState<"base" | "pack">("base")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [message, setMessage] = useState("")
  const [continuingKey, setContinuingKey] = useState<string | null>(null)
  const [linkAlertId, setLinkAlertId] = useState<string | null>(null)
  // Form banyak bahan: kebutuhan satu outlet yang diisi sekaligus.
  const [grup, setGrup] = useState<{ items: Need[]; alertIds: string[] } | null>(null)
  const handledLink = useRef(false)

  /** Buka form untuk bahan ini + kebutuhan baru lain di outlet & gudang yang sama. */
  const bukaGrup = useCallback(async (need: Need, alertIds: string[] = [], dariTautan?: Need[]) => {
    let semua = dariTautan ?? []
    if (!dariTautan) {
      const query = new URLSearchParams({ outletId: need.locationId, unsubmitted: "true", semua: "true" })
      const res = await fetch(`/api/replenishment?${query}`, { cache: "no-store" }).catch(() => null)
      semua = res?.ok ? (await res.json() as NeedsPage).items : []
    }
    const bisaDiisi = (row: Need) => row.kind === "NEW_NEED" && !row.activeTransferId && row.warehouseId === need.warehouseId
    const lain = semua.filter((row) => row.itemId !== need.itemId && bisaDiisi(row))
    setGrup({ items: [need, ...lain], alertIds })
  }, [])
  const load = useCallback(async (nextPage = pageRef.current, silent = false) => {
    const sequence = ++loadSequence.current
    if (!silent) setLoading(true)
    try {
      let data: NeedsPage
      if (providedNeeds !== undefined) {
        data = { items: providedNeeds, total: providedNeeds.length, page: 1, pages: 1, perPage: 5 }
      } else {
        const res = await fetch(`/api/replenishment?page=${nextPage}&unsubmitted=true`, { cache: "no-store" })
        if (!res.ok) throw new Error("Kebutuhan outlet belum dapat dimuat")
        data = await res.json() as NeedsPage
      }
      if (sequence !== loadSequence.current) return
      setNeeds(data.items)
      setPagination({ total: data.total, page: data.page, pages: data.pages, perPage: data.perPage })
      pageRef.current = data.page
      setLoadError("")
    } catch { if (sequence === loadSequence.current) setLoadError("Kebutuhan outlet belum dapat dimuat. Muat ulang halaman.") }
    finally { if (sequence === loadSequence.current) setLoading(false) }
  }, [providedNeeds])
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => { void load(pageRef.current, providedNeeds !== undefined) }, 0)
    return () => window.clearTimeout(timer)
  }, [load, active, refreshKey, providedNeeds])
  // Pemrosesan tautan dipisahkan dari pemuatan daftar. Daftar diperbarui tiap
  // beberapa detik; bila keduanya memakai sequence yang sama, respons tautan
  // yang sedikit lambat dapat dianggap usang setelah OPEN_NEED_LINK tersimpan,
  // sehingga kartu muncul tetapi formulir tidak pernah terbuka.
  useEffect(() => {
    if (!active || handledLink.current) return
    const query = new URLSearchParams(window.location.search)
    const outletId = query.get("outletId")
    const itemId = query.get("itemId")
    const alertId = query.get("alertId")
    const alertIds = query.get("alertIds")
    if (!outletId || (!itemId && !alertIds)) return
    handledLink.current = true
    let cancelled = false
    void (async () => {
      try {
        if (alertIds) {
          const target = new URLSearchParams({ outletId, alertIds, fromLink: "true", semua: "true" })
          const response = await fetch(`/api/replenishment?${target}`, { cache: "no-store" })
          if (cancelled) return
          if (response.status === 410) {
            setMessage("Semua bahan di tautan ini sudah diproses atau tautannya tidak berlaku. Gunakan daftar terbaru di bawah.")
            return
          }
          if (!response.ok) throw new Error("Kebutuhan pada tautan belum dapat dimuat")
          const bahan = (await response.json() as NeedsPage).items.filter((need) => need.kind === "NEW_NEED" && !need.activeTransferId && need.warehouseId)
          if (cancelled) return
          if (bahan.length) await bukaGrup(bahan[0], alertIds.split(","), bahan)
          else setMessage("Stok sudah berubah atau permintaan sudah aktif. Periksa daftar kebutuhan di bawah.")
          return
        }

        const target = new URLSearchParams({ outletId, itemId: itemId!, fromLink: "true", alertId: alertId ?? "" })
        const response = await fetch(`/api/replenishment?${target}`, { cache: "no-store" })
        if (cancelled) return
        if (response.status === 410) {
          setMessage("Kebutuhan ini sudah diproses atau tautannya tidak berlaku. Gunakan daftar terbaru di bawah.")
          return
        }
        if (!response.ok) throw new Error("Kebutuhan pada tautan belum dapat dimuat")
        const found = (await response.json() as NeedsPage).items[0]
        if (cancelled) return
        if (found && !found.activeTransferId && found.warehouseId) {
          setLinkAlertId(alertId)
          // Tautan satu bahan tetap membuka satu form yang juga memuat bahan
          // lain dari outlet dan gudang yang sama.
          await bukaGrup(found, alertId ? [alertId] : [])
        } else {
          setMessage(found?.activeTransferId
            ? "Permintaan bahan ini sudah aktif. Lihat permintaan di bawah."
            : "Stok sudah berubah atau outlet belum memiliki gudang pemenuhan. Periksa daftar kebutuhan di bawah.")
        }
      } catch {
        if (!cancelled) setLoadError("Kebutuhan pada tautan belum dapat dimuat. Muat ulang halaman.")
      }
    })()
    return () => { cancelled = true }
  }, [active, bukaGrup])
  useLiveRefresh(() => { if (active && providedNeeds === undefined) void load(pageRef.current, true) }, 3000)
  const selectedRef = useRef(selected)
  useEffect(() => { selectedRef.current = selected }, [selected])
  useLiveRefresh(() => {
    const current = selectedRef.current
    if (!active || !current) return
    const query = new URLSearchParams({ itemId: current.itemId, outletId: current.locationId })
    void fetch(`/api/replenishment?${query}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return
      const fresh = (await response.json() as NeedsPage).items[0]
      if (fresh) setSelected((previous) => previous?.itemId === fresh.itemId && previous.locationId === fresh.locationId ? fresh : previous)
      else {
        setSelected(null)
        setMessage("Kebutuhan outlet sudah terpenuhi. Form ditutup otomatis.")
      }
    }).catch(() => { /* Keep the last snapshot; submission revalidates stock. */ })
  }, 3000)
  useEffect(() => {
    if (!selected) return
    const main = document.querySelector("main")
    const old = main?.style.overflowY ?? ""
    if (main) main.style.overflowY = "hidden"
    return () => { if (main) main.style.overflowY = old }
  }, [selected])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || busy) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/replenishment", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selected.itemId, locationId: selected.locationId, quantity, inputUnit, notes,
          ...(rejecting ? { action: "reject" } : {}), ...(linkAlertId ? { fromLink: true, alertId: linkAlertId } : {}) }) })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? "Permintaan gagal disimpan"); return }
      setSelected(null)
      setLinkAlertId(null)
      const url = new URL(window.location.href)
      if (url.searchParams.has("outletId")) {
        for (const key of ["outletId", "itemId", "alertId"]) url.searchParams.delete(key)
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
      }
      setMessage(rejecting ? "" : "Permintaan kebutuhan dikirim ke gudang untuk ditinjau. Stok baru dikunci setelah gudang menyetujui jumlah kirim.")
      onSubmitted()
      await load()
    } catch { setError("Koneksi terputus. Periksa daftar permintaan sebelum mencoba kembali.") }
    finally { setBusy(false) }
  }

  const hasPack = Boolean(selected?.packSize && selected.packSize > 0 && selected.packUnit)
  const factor = inputUnit === "pack" ? Number(selected?.packSize ?? 1) : 1
  const baseQuantity = Number(quantity) * factor
  const stokTersedia = selected?.warehouseAvailable ?? selected?.warehouseQuantity ?? null
  const stokGudangHabis = !rejecting && stokTersedia != null && stokTersedia <= 0

  const renderNeed = (need: Need) => <div key={`${need.locationId}:${need.itemId}`} className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Package className="h-5 w-5 text-slate-500" /></div>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-semibold text-slate-900">
            <span>{need.warehouseName ?? "Gudang belum dipasangkan"}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span>{need.outletName}</span>
          </p>
        </div>
        {need.kind === "OUTSTANDING_NEED" ? (
          // Jumlahnya sudah pernah diisi outlet dan belum terpenuhi. Sistem
          // yang membawanya sampai selesai — outlet tidak mengisi ulang, dan
          // tidak boleh menolak kebutuhan yang sudah berjalan.
          <>
            {(() => {
              const tersedia = Math.max(0, need.warehouseAvailable ?? need.warehouseQuantity ?? 0)
              const bisaDikirim = Math.min(need.outstandingQuantity, tersedia)
              const dipesan = Math.max(0, need.onOrderQuantity ?? 0)
              const belumTercakup = Math.max(0, need.outstandingQuantity - tersedia - dipesan)
              const key = `${need.locationId}:${need.itemId}`
              const lanjutkan = async () => {
                if (continuingKey) return
                setContinuingKey(key); setMessage("")
                try {
                  const response = await fetch("/api/replenishment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "continue_outstanding", locationId: need.locationId, itemId: need.itemId }),
                  })
                  const data = await response.json() as { error?: string; message?: string }
                  if (!response.ok) { setMessage(data.error ?? "Pengiriman lanjutan belum dapat dibuat."); return }
                  setMessage(data.message ?? "Pengiriman lanjutan dibuat.")
                  onSubmitted()
                  await load(pageRef.current, true)
                } catch { setMessage("Koneksi terputus. Muat ulang halaman sebelum mencoba kembali.") }
                finally { setContinuingKey(null) }
              }
              const status = need.activeTransferId
                ? "Pengiriman lanjutan aktif"
                : bisaDikirim >= need.outstandingQuantity
                  ? "Stok siap diproses"
                  : bisaDikirim > 0
                    ? "Sebagian stok siap dikirim"
                    : dipesan > 0
                      ? "Menunggu barang supplier"
                      : "Stok gudang belum tersedia"
              return <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700"><Clock className="h-3 w-3" />
              {status}
            </span>
            <p className="text-sm font-semibold text-slate-800">{need.itemName}</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-slate-500">Sisa kebutuhan</p><p className="mt-0.5 font-semibold text-slate-900">{fmt(need.outstandingQuantity)} {need.unit}</p></div>
              <div><p className="text-xs text-slate-500">Bisa dikirim</p><p className="mt-0.5 font-semibold text-blue-700">{fmt(bisaDikirim)} {need.unit}</p></div>
              <div><p className="text-xs text-slate-500">Dipesan supplier</p><p className="mt-0.5 font-semibold text-slate-900">{fmt(dipesan)} {need.unit}</p></div>
              <div><p className="text-xs text-slate-500">Belum tercakup</p><p className={`mt-0.5 font-semibold ${belumTercakup > 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt(belumTercakup)} {need.unit}</p></div>
            </div>
            <NeedTimestamps need={need} />
            <p className="text-xs text-slate-500">Jumlah kebutuhan tetap tercatat. Stok yang tersedia dapat dibuatkan pengiriman sebagian; sisanya tetap menunggu tanpa perlu diisi ulang.</p>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {need.activeTransferId ? <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-semibold text-white" href={`/dashboard/audit/transfer/${need.activeTransferId}`}>Lihat pengiriman aktif</Link>
                : bisaDikirim > 0 && <button type="button" disabled={!canEdit || continuingKey !== null} onClick={() => { void lanjutkan() }} className="min-h-11 w-full rounded-full bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50">
                  {continuingKey === key ? "Membuat pengiriman…" : `Buat pengiriman ${fmt(bisaDikirim)} ${need.unit}`}
                </button>}
              {dipesan > 0 && <Link href="/dashboard/suppliers?view=orders" className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-200 px-5 text-sm font-semibold text-slate-700">Lihat pesanan supplier</Link>}
            </div>
              </>
            })()}
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700"><Clock className="h-3 w-3" />Menunggu diisi outlet</span>
            <p className="text-sm font-semibold text-slate-800">{need.itemName}</p>
            <p className="text-sm text-slate-500">Sisa {need.quantity} {need.unit} · Ambang {need.minStock} {need.unit}</p>
            {need.warehouseQuantity != null && <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">Stok gudang: <strong>{need.warehouseQuantity.toLocaleString("id-ID")} {need.unit}</strong></p>}
            <NeedTimestamps need={need} />
            <p className="text-xs text-slate-500">Stok outlet menipis dan stok gudang tersedia. Isi jumlah kebutuhan; gudang akan menentukan jumlah kirim.</p>
            <div className="flex gap-2">{need.activeTransferId ? <Link className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-blue-600" href={`/dashboard/audit/transfer/${need.activeTransferId}`}>Lihat permintaan aktif</Link>
              : need.warehouseId ? <button type="button" disabled={!canEdit || loading} className="min-h-11 w-full rounded-full bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => { void bukaGrup(need) }}>Isi kebutuhan</button>
                : <p className="mt-2 text-sm text-amber-700">Owner perlu memasangkan gudang melalui Manajemen → Outlet.</p>}
            {!need.activeTransferId && need.warehouseId && <button type="button" disabled={!canEdit || loading} className="min-h-11 shrink-0 rounded-full border border-red-200 px-4 text-sm font-semibold text-red-600 disabled:opacity-50" onClick={() => { setSelected(need); setLinkAlertId(null); setRejecting(true); setQuantity(""); setInputUnit("base"); setNotes(""); setError("") }}>Tolak</button>}
            </div>
          </>
        )}
      </div>

  function selesaiGrup(pesan: string) {
    setGrup(null)
    const url = new URL(window.location.href)
    if (url.searchParams.has("outletId")) {
      for (const key of ["outletId", "itemId", "alertId", "alertIds"]) url.searchParams.delete(key)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    }
    setMessage(pesan)
    onSubmitted()
    void load()
  }

  return <>
    {grup && <FormBanyakBahan key={grup.items.map((need) => need.itemId).join(",")} awal={grup.items} alertIds={grup.alertIds}
      onClose={() => setGrup(null)} onDone={selesaiGrup} />}
    <section ref={sectionRef} aria-label={renderList ? "Daftar pengiriman" : "Menunggu pengisian kebutuhan"} className="scroll-mt-24">
      {loadError && <p role="alert" className="mt-3 text-sm text-red-600">{loadError}</p>}
      {message && <p role="status" className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}
      {loading && <p role="status" className="mt-3 text-sm text-slate-500">Memuat kebutuhan…</p>}
      {renderList ? renderList(renderNeed) : <div className={`space-y-3 ${loading ? "opacity-50" : ""}`} aria-busy={loading}>{needs.map(renderNeed)}</div>}
      {providedNeeds === undefined && pagination.total > 0 && <Pagination {...pagination} loading={loading} label="kebutuhan belum diajukan" scrollToRef={sectionRef}
        onPageChange={(nextPage) => { pageRef.current = nextPage; void load(nextPage) }} />}
    </section>
    {selected && <AppPortal><div className="app-overlay mobile-fullscreen-dialog z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="outlet-need-title">
      <button type="button" aria-label="Tutup kebutuhan" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={() => { if (!busy) setSelected(null) }} />
      <form onSubmit={submit} className="mobile-dialog-panel relative z-10 flex max-h-[calc(100%-3rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/60 bg-white shadow-2xl sm:max-h-[calc(100%-2rem)] sm:rounded-3xl">
        <div className={`h-1.5 shrink-0 ${rejecting ? "bg-red-500" : "bg-blue-600"}`} />
        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="min-w-0 flex-1"><h2 id="outlet-need-title" className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{rejecting ? "Tolak kebutuhan outlet" : "Isi kebutuhan outlet"}</h2><p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:mt-1 sm:text-sm">{rejecting ? "Isi alasan penolakan. Tidak ada permintaan yang dibuat." : "Isi jumlah yang dibutuhkan. Gudang akan memeriksa dan menyetujui jumlah kirim."}</p></div>
            <button type="button" disabled={busy} aria-label="Tutup formulir" onClick={() => setSelected(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"><X className="h-4 w-4" strokeWidth={2.5} /></button>
          </div>
        </div>
        <div className="mobile-dialog-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><dt className="text-xs font-semibold text-slate-500">Dari</dt><dd className="mt-1 font-semibold text-slate-900">{selected.warehouseName}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Ke</dt><dd className="mt-1 font-semibold text-slate-900">{selected.outletName}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">Gudang asal dan outlet tujuan sudah ditentukan dari kebutuhan ini.</p>
            <p className="mt-2">Sisa stok outlet: {selected.quantity} {selected.unit}</p>
            {selected.warehouseQuantity != null && <p className="mt-1">Stok gudang: <strong>{selected.warehouseQuantity.toLocaleString("id-ID")} {selected.unit}</strong></p>}
            <p className="mt-1 text-xs text-slate-500">Ketersediaan gudang diperiksa lagi saat permintaan diajukan dan saat gudang menyetujuinya.</p>
            <NeedTimestamps need={selected} />
          </div>
          {selected.needsConfirmation && <p className="text-sm text-amber-700">Permintaan lama memakai perkiraan sistem. Isi ulang sesuai kebutuhan outlet saat ini.</p>}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <div><p className="mb-1 text-xs font-semibold text-slate-500">Barang</p>
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800">{selected.itemName}</p>
              <p className="mt-1 text-xs text-slate-500">Terpilih dari bahan yang stoknya menipis.</p>
            </div>
            {!rejecting && <><div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 text-sm font-medium text-slate-700">Kebutuhan outlet
                <input required type="number" inputMode="decimal" min="0.001" step="0.001" max="999999999999.999" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 p-3 text-base" />
              </label>
              <div className="min-w-0">
                <label htmlFor="outlet-need-unit" className="text-sm font-medium text-slate-700">Satuan</label>
                {hasPack ? <div className="relative mt-1">
                  <select id="outlet-need-unit" value={inputUnit} onChange={(e) => setInputUnit(e.target.value as "base" | "pack")} className="w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white p-3 pr-8 text-base">
                    <option value="base">{selected.unit}</option><option value="pack">{selected.packUnit}</option>
                  </select><ChevronDown className="pointer-events-none absolute right-2 top-4 h-4 w-4 text-slate-400" />
                </div> : <input id="outlet-need-unit" readOnly value={selected.unit} className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-500" />}
              </div>
            </div>
            {hasPack && <p className="text-xs text-slate-500">1 {selected.packUnit} = {selected.packSize} {selected.unit}</p>}
            {quantity && Number.isFinite(baseQuantity) && baseQuantity > 0 && <p className="rounded-lg bg-blue-50 p-2 text-sm text-blue-700">Total kebutuhan: <strong>{baseQuantity.toLocaleString("id-ID", { maximumFractionDigits: 3 })} {selected.unit}</strong></p>}
            {stokTersedia != null && <p className="text-xs text-slate-500">Stok gudang tersedia saat ini: <strong>{stokTersedia.toLocaleString("id-ID", { maximumFractionDigits: 3 })} {selected.unit}</strong>{selected.warehouseQuantity != null && selected.warehouseQuantity > stokTersedia ? ` (sebagian stok sudah direservasi)` : ""}.</p>}
            {stokGudangHabis && <p role="alert" className="text-sm font-medium text-red-600">Stok gudang sudah tidak tersedia. Muat ulang halaman.</p>}
            </>}
          </div>
          <label className="block text-sm font-medium text-slate-700">{rejecting ? "Alasan penolakan" : "Catatan (opsional)"}
            <textarea required={rejecting} maxLength={500} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={rejecting ? "Jelaskan mengapa kebutuhan belum perlu diajukan" : "Contoh: untuk kebutuhan besok atau persiapan akhir pekan"} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base" />
          </label>
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
        </div>
        <div className="mobile-dialog-actions grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
          <button type="button" disabled={busy} onClick={() => setSelected(null)} className="min-h-12 rounded-xl border border-slate-200 px-2 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50">Batal</button>
          <button type="submit" disabled={busy || !canEdit || stokGudangHabis} className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl ${rejecting ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"} px-2 py-3 text-center text-xs font-semibold leading-tight text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm`}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses...</> : rejecting ? "Tolak kebutuhan" : "Ajukan kebutuhan"}</button>
        </div>
      </form>
    </div></AppPortal>}
  </>
}
