"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Pagination } from "@/components/ui/pagination"
import { AppDatePicker } from "@/components/ui/app-date-picker"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowDown, ArrowUp, CalendarDays, ChevronDown, Layers3, Loader2,
  MapPin, PackageSearch, UserRound,
} from "lucide-react"
import { getRoleName } from "@/lib/utils"
import { stockMovementPresentation } from "@/lib/stock-movement-presentation"

type Item = { id: string; name: string; sku: string | null; unit: string; isTrackable: boolean }
type Location = { id: string; name: string }
type Movement = {
  id: string
  type: string
  quantity: number
  affectsBalance: boolean
  runningBalance: number
  effectiveAt: string
  note: string | null
  referenceId: string | null
  location: Location
  batch: { batchNumber: string; expiryDate: string | null } | null
  createdBy: { name: string | null; email: string; role: string | null } | null
  // Hanya terisi pada mode seluruh item.
  item?: { id: string; name: string; sku: string | null; unit: string }
}
type Batch = {
  id: string
  batchNumber: string
  quantity: number | string
  expiryDate: string | null
  location: Location
}
type CardData = {
  // null saat menampilkan seluruh item — saldo dan batch tidak bermakna
  // lintas item karena satuannya berbeda-beda.
  item: { id: string; name: string; sku: string | null; unit: string } | null
  summary: { opening: number; incoming: number; outgoing: number; closing: number } | null
  movements: Movement[]
  batches: Batch[]
  truncated: boolean
  total: number
  page: number
  pages: number
}

const MOVEMENT_LABELS: Record<string, string> = {
  GOODS_IN: "Barang masuk",
  GOODS_OUT: "Barang keluar",
  TRANSFER_OUT: "Transfer keluar",
  TRANSFER_IN: "Transfer masuk",
  TRANSFER_RETURN: "Retur transfer",
  TRANSFER_VARIANCE: "Selisih transfer",
  OPNAME_CORRECTION: "Koreksi opname",
  WASTE: "Terbuang",
  DAMAGE: "Rusak",
  LOSS: "Hilang",
  COMPLIMENTARY: "Complimentary",
  EXPIRED: "Kedaluwarsa",
  POS_SALE: "Penjualan POS",
  INITIAL_STOCK: "Stok awal",
  PRODUCTION_IN: "Hasil produksi",
  PRODUCTION_OUT: "Pemakaian bahan produksi",
}

function localDate(daysAgo = 0) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function ExpandableNote({ text, className = "" }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const measureRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = measureRef.current
    if (!element) return
    let active = true
    const measure = () => {
      if (active) setCanExpand(element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight)
    }
    // Ukur versi satu baris pada lebar penuh, tanpa ruang tombol panah.
    // Tetap bisa diukur saat catatan dibuka atau ukuran layar berubah.
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    void document.fonts.ready.then(measure)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [text])

  return (
    <div className={`relative min-w-0 text-xs leading-5 text-slate-500 ${className}`}>
      <span ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 block h-5 overflow-hidden whitespace-pre">{text}</span>
      {canExpand ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Ringkas" : "Buka"} keterangan: ${text}`}
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full min-w-0 items-start gap-1.5 rounded text-left transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className={`min-w-0 flex-1 ${expanded ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "truncate"}`}>{text}</span>
          <ChevronDown aria-hidden="true" className={`mt-1 h-3 w-3 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      ) : <span className="block truncate">{text}</span>}
    </div>
  )
}

function MovementNote({ movement, className = "" }: { movement: Movement; className?: string }) {
  const { text, link } = stockMovementPresentation(movement)

  return (
    <div className={className}>
      <ExpandableNote text={text} />
      {link && (
        <Link href={link.href} prefetch={false}
          className="mt-1 inline-flex rounded text-xs font-medium text-blue-600 underline-offset-4 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {link.label}
        </Link>
      )}
    </div>
  )
}

function StockCardContent() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [itemId, setItemId] = useState(searchParams.get("itemId") ?? "")
  const [locationId, setLocationId] = useState(searchParams.get("locationId") ?? "")
  const [from, setFrom] = useState(searchParams.get("from") ?? localDate(30))
  const [to, setTo] = useState(searchParams.get("to") ?? localDate())
  const [data, setData] = useState<CardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const movementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([fetch("/api/inventory?includeMenuItems=1"), fetch("/api/locations")]).then(async ([itemRes, locationRes]) => {
      if (itemRes.ok) {
        // Dibuka sebagai catatan seluruh item; pemilih item hanya penyaring.
        setItems((await itemRes.json() as Item[]).filter((item) => item.isTrackable))
      }
      if (locationRes.ok) setLocations(await locationRes.json())
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setError("")
      const query = new URLSearchParams({ from, to, page: "1" })
      if (itemId) query.set("itemId", itemId)
      if (locationId) query.set("locationId", locationId)
      fetch(`/api/stock-movements?${query}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json()
          if (!response.ok) throw new Error(body.error ?? "Gagal memuat kartu stok")
          setData(body)
        })
        .catch((fetchError) => {
          if (fetchError.name !== "AbortError") setError(fetchError.message)
        })
        .finally(() => setLoading(false))
    }, 0)
    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [itemId, locationId, from, to])

  // Saldo berjalan tiap baris dihitung server dari awal periode, jadi tiap
  // halaman sudah benar berdiri sendiri.
  async function goToMovementPage(nextPage: number) {
    if (!data) return
    setLoadingMore(true)
    const query = new URLSearchParams({ from, to, page: String(nextPage) })
    if (itemId) query.set("itemId", itemId)
    if (locationId) query.set("locationId", locationId)
    try {
      const response = await fetch(`/api/stock-movements?${query}`)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "Gagal memuat pergerakan")
      setData(body)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat pergerakan")
    } finally {
      setLoadingMore(false)
    }
  }

  const selectedUnit = useMemo(() => items.find((item) => item.id === itemId)?.unit ?? "unit", [items, itemId])
  const fmt = (value: number | string) => Number(value).toLocaleString("id-ID", { maximumFractionDigits: 3 })

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Kartu Stok</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
          {itemId
            ? "Telusuri setiap transaksi yang membentuk saldo item ini."
            : "Seluruh pergerakan stok dari semua item dan lokasi. Pilih item untuk melihat saldo berjalannya."}
        </p>
      </div>

      <section aria-label="Filter kartu stok" className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-100/70 sm:p-4">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <label className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><PackageSearch className="h-3.5 w-3.5 text-slate-400" />Item</span>
            <span className="relative block">
              <select value={itemId} onChange={(event) => setItemId(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15">
                <option value="">Semua item</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </span>
          </label>

          <label className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><MapPin className="h-3.5 w-3.5 text-slate-400" />Lokasi</span>
            <span className="relative block">
              <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15">
                <option value="">Semua lokasi</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </span>
          </label>

          <div className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />Dari tanggal</span>
            <AppDatePicker value={from} max={to || undefined} onChange={setFrom} ariaLabel="Dari tanggal" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
          </div>
          <div className="min-w-0">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />Sampai tanggal</span>
            <AppDatePicker value={to} min={from || undefined} onChange={setTo} ariaLabel="Sampai tanggal" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
          </div>
        </div>
      </section>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>
      ) : data ? (
        <>
          {data.summary && data.item && (
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
              {[
                ["Saldo awal", data.summary.opening, "text-slate-900", "bg-slate-100"],
                ["Masuk", data.summary.incoming, "text-emerald-600", "bg-emerald-50"],
                ["Keluar", data.summary.outgoing, "text-red-600", "bg-red-50"],
                ["Saldo akhir", data.summary.closing, "text-blue-600", "bg-blue-50"],
              ].map(([label, value, color, surface]) => (
                <div key={String(label)} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-100/60 sm:p-4">
                  <div className={`inline-flex max-w-full rounded-lg px-2 py-1 text-xl font-bold tabular-nums sm:text-2xl ${color} ${surface}`}><span className="truncate">{fmt(value)}</span></div>
                  <div className="mt-2 text-xs font-medium text-slate-500">{label} · {data.item!.unit}</div>
                </div>
              ))}
            </div>
          )}

          {data.batches.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100/60 sm:p-5">
              <div className="mb-3 flex items-center gap-2"><Layers3 className="h-4 w-4 text-amber-600" /><h2 className="font-semibold text-slate-900">Batch aktif</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{data.batches.length}</span></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.batches.map((batch) => {
                  const expired = batch.expiryDate && new Date(batch.expiryDate) < new Date()
                  return <div key={batch.id} className={`rounded-xl border px-3.5 py-3 text-xs ${expired ? "border-red-200 bg-red-50 text-red-700" : "border-amber-100 bg-amber-50 text-amber-800"}`}>
                    <div className="truncate font-semibold">{batch.batchNumber}</div>
                    <div className="mt-1 font-bold tabular-nums">{fmt(batch.quantity)} {selectedUnit}</div>
                    <div className="mt-0.5 truncate opacity-80">{batch.location.name}{batch.expiryDate ? ` · exp ${new Date(batch.expiryDate).toLocaleDateString("id-ID")}` : " · tanpa kedaluwarsa"}</div>
                  </div>
                })}
              </div>
            </div>
          )}

          <div ref={movementRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-100/60">
            <div className="flex flex-col items-start justify-between gap-2 border-b border-slate-100 px-4 py-3.5 min-[380px]:flex-row min-[380px]:items-center sm:px-5">
              <div className="min-w-0"><h2 className="font-semibold text-slate-900">Riwayat pergerakan</h2><p className="mt-0.5 text-xs text-slate-400">Urutan terbaru berdasarkan waktu transaksi</p></div>
              {/* Rentang baris halaman ini sudah ditampilkan bar pagination di bawah. */}
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{data.total} transaksi</span>
            </div>

            {data.movements.length === 0 ? (
              <div className="px-4 py-16 text-center text-slate-400"><PackageSearch className="mx-auto mb-2 h-8 w-8 text-slate-300" /><p className="font-medium text-slate-500">Belum ada transaksi stok.</p></div>
            ) : (
              <>
                <div className={`hidden overflow-x-auto transition-opacity lg:block ${loadingMore ? "opacity-60" : ""}`}>
                  <table className="w-full min-w-[960px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Waktu</th>
                    <th className="px-4 py-3 text-left">Transaksi</th>
                    {!data.item && <th className="px-4 py-3 text-left">Item</th>}
                    <th className="px-4 py-3 text-left">Lokasi / Lot</th>
                    <th className="px-4 py-3 text-left">Oleh</th>
                    <th className="px-4 py-3 text-right">Masuk</th>
                    <th className="px-4 py-3 text-right">Keluar</th>
                    {data.item && <th className="px-4 py-3 text-right">Saldo</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.movements.map((movement) => (
                    <tr key={movement.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500"><div className="font-medium text-slate-600">{new Date(movement.effectiveAt).toLocaleDateString("id-ID")}</div><div className="mt-0.5 text-slate-400">{new Date(movement.effectiveAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div></td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-900">{MOVEMENT_LABELS[movement.type] ?? movement.type}{!movement.affectsBalance && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">memo</span>}</div><MovementNote movement={movement} className="mt-1 max-w-xs" /></td>
                      {!data.item && (
                        <td className="px-4 py-3 text-xs">
                          <div className="font-semibold text-slate-700">{movement.item?.name ?? "—"}</div>
                          <div className="text-slate-400">{[movement.item?.sku, movement.item?.unit].filter(Boolean).join(" · ")}</div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-xs text-slate-600"><div>{movement.location.name}</div><div className="font-mono text-slate-400">{movement.batch?.batchNumber ?? "tanpa lot"}</div></td>
                      <td className="px-4 py-3 text-xs">
                        {movement.createdBy ? (
                          <>
                            <div className="font-medium text-slate-700">{movement.createdBy.name || movement.createdBy.email.split("@")[0]}</div>
                            {movement.createdBy.role && <div className="text-slate-400">{getRoleName(movement.createdBy.role)}</div>}
                          </>
                        ) : (
                          // Pergerakan dari pesanan QR pelanggan dan data awal
                          // tidak punya pencatat.
                          <span className="text-slate-400">Sistem</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{movement.affectsBalance && movement.quantity > 0 ? <span className="inline-flex items-center gap-1"><ArrowUp className="w-3 h-3" />{fmt(movement.quantity)}</span> : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{movement.affectsBalance && movement.quantity < 0 ? <span className="inline-flex items-center gap-1"><ArrowDown className="w-3 h-3" />{fmt(Math.abs(movement.quantity))}</span> : !movement.affectsBalance ? <span className="text-amber-600">{movement.quantity > 0 ? "+" : ""}{fmt(movement.quantity)}</span> : "—"}</td>
                      {data.item && <td className="px-4 py-3 text-right font-bold text-slate-900">{fmt(movement.runningBalance)}</td>}
                    </tr>
                  ))}
                </tbody>
                  </table>
                </div>

                <div className={`space-y-3 bg-slate-50/60 p-1 transition-opacity sm:p-2.5 lg:hidden ${loadingMore ? "opacity-60" : ""}`}>
                  {data.movements.map((movement) => {
                    const actorName = movement.createdBy?.name || movement.createdBy?.email.split("@")[0] || "Sistem"
                    const incoming = movement.affectsBalance && movement.quantity > 0
                    const outgoing = movement.affectsBalance && movement.quantity < 0
                    return (
                      <article key={movement.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3 className="text-sm font-semibold leading-5 text-slate-900">{MOVEMENT_LABELS[movement.type] ?? movement.type}</h3>
                              {!movement.affectsBalance && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">memo</span>}
                            </div>
                            <p className="mt-0.5 text-xs leading-4 text-slate-400">{new Date(movement.effectiveAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p>
                          </div>
                          <div className="max-w-[42%] shrink-0 text-right text-sm">
                            {incoming ? <div className="inline-flex items-center gap-1 font-bold tabular-nums text-emerald-600"><ArrowUp className="h-3.5 w-3.5" />{fmt(movement.quantity)}</div>
                              : outgoing ? <div className="inline-flex items-center gap-1 font-bold tabular-nums text-red-600"><ArrowDown className="h-3.5 w-3.5" />{fmt(Math.abs(movement.quantity))}</div>
                                : <div className="font-bold tabular-nums text-amber-600">{movement.quantity > 0 ? "+" : ""}{fmt(movement.quantity)}</div>}
                            <div className="text-[11px] leading-4 text-slate-400">{movement.item?.unit ?? data.item?.unit ?? selectedUnit}</div>
                          </div>
                        </div>

                        {(!data.item || movement.note || movement.referenceId) && (
                          <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3">
                            {!data.item && (
                              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <div className="text-[13px] font-semibold leading-5 text-slate-700">{movement.item?.name ?? "—"}</div>
                                <div className="truncate text-[11px] leading-4 text-slate-400">{[movement.item?.sku, movement.item?.unit].filter(Boolean).join(" · ") || "Tanpa SKU"}</div>
                              </div>
                            )}
                            {(movement.note || movement.referenceId) && <MovementNote movement={movement} className={!data.item ? "mt-2 border-t border-slate-200/70 pt-2" : ""} />}
                          </div>
                        )}

                        <div className="mt-3 grid grid-cols-1 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-xs md:grid-cols-2 md:divide-x md:divide-y-0">
                          <div className="flex min-w-0 items-start gap-3 px-3.5 py-3">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <div className="min-w-0"><div className="text-[11px] leading-4 text-slate-400">Lokasi / lot</div><div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2"><span className="truncate font-semibold leading-4 text-slate-700">{movement.location.name}</span><span className="truncate font-mono text-[10px] leading-4 text-slate-400">{movement.batch?.batchNumber ?? "tanpa lot"}</span></div></div>
                          </div>
                          <div className="flex min-w-0 items-start gap-3 px-3.5 py-3">
                            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <div className="min-w-0"><div className="text-[11px] leading-4 text-slate-400">Dicatat oleh</div><div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2"><span className="truncate font-semibold leading-4 text-slate-700">{actorName}</span><span className="truncate text-[10px] leading-4 text-slate-400">{movement.createdBy?.role ? getRoleName(movement.createdBy.role) : "Sistem"}</span></div></div>
                          </div>
                        </div>

                        {data.item && <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px]"><span className="font-medium text-blue-600">Saldo setelah transaksi</span><span className="font-bold tabular-nums text-blue-700">{fmt(movement.runningBalance)} {data.item.unit}</span></div>}
                      </article>
                    )
                  })}
                </div>
              </>
            )}
            <Pagination page={data.page} pages={data.pages} total={data.total} perPage={50}
              label="transaksi" loading={loadingMore} scrollToRef={movementRef}
              onPageChange={goToMovementPage} />
            {data.truncated && <div className="px-4 py-3 bg-amber-50 text-xs text-amber-700">Tampilan dibatasi pada 2.000 transaksi terbaru. Persempit rentang tanggal untuk melihat seluruh pergerakan.</div>}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function StockCardPage() {
  return <Suspense fallback={<div className="py-20 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>}><StockCardContent /></Suspense>
}
