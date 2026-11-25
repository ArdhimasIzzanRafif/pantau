"use client"

import { useState, useEffect } from "react"
import { ListPagination } from "@/components/ui/list-pagination"
import { Search, Warehouse, Store, TrendingDown, AlertTriangle } from "lucide-react"

type StockBalance = {
  id: string
  quantity: number
  /// Sudah dikunci untuk transfer yang disetujui tetapi belum dikirim.
  reservedQuantity?: number
  /// Nama outlet tujuan transfer yang mengunci stok ini.
  reservedFor?: string[]
  item: {
    id: string
    name: string
    sku: string | null
    unit: string
    category: string | null
    minStock: number | null
    locationSettings: { locationId: string; minStock: number }[]
  }
  location: {
    id: string
    name: string
    type: string
  }
}

type ItemRow = {
  itemId: string
  name: string
  sku: string | null
  unit: string
  category: string | null
  locationMinStock: Record<string, number>
  byLocation: Record<string, number>
  reservedByLocation: Record<string, number>
  reservedForByLocation: Record<string, string[]>
}

type Location = { id: string; name: string; type: string }
const PAGE_SIZE = 5
const stockNumber = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 })

/**
 * "250 dikunci untuk Outlet Cabang 2 (belum dikirim) · bebas 0" — stok yang
 * sudah disetujui untuk dikirim ke outlet tetapi barangnya belum berangkat.
 * Hanya tampil bila ada stok yang dikunci.
 */
function InfoDikunci({ qty, dikunci, tujuan }: { qty: number; dikunci: number; tujuan: string[] }) {
  if (dikunci <= 0) return null
  const bebas = Math.max(0, qty - dikunci)
  return (
    <p className="text-[10px] font-semibold text-indigo-600">
      {stockNumber.format(dikunci)} dikunci untuk {tujuan.length ? tujuan.join(", ") : "transfer"} (belum dikirim) · bebas {stockNumber.format(bebas)}
    </p>
  )
}

export default function StokPage() {
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")
  const [activeLocationId, setActiveLocationId] = useState("Semua")
  const [locationSearch, setLocationSearch] = useState("")
  const [locationPage, setLocationPage] = useState(1)
  const [showAllLocations, setShowAllLocations] = useState(false)
  const [itemPage, setItemPage] = useState(1)
  const [showAllItems, setShowAllItems] = useState(false)

  async function fetchData(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true)
    try {
      const [bRes, lRes] = await Promise.all([
        fetch("/api/stock-balances"),
        fetch("/api/locations"),
      ])
      if (bRes.ok) setBalances(await bRes.json())
      if (lRes.ok) setLocations(await lRes.json())
      setLastUpdated(new Date())
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchData() }, 0)
    // Auto-refresh: polling berkala + saat tab kembali difokuskan, tanpa
    // spinner penuh agar stok terlihat "realtime" tanpa klik Refresh manual.
    const intervalId = window.setInterval(() => { void fetchData({ silent: true }) }, 15_000)
    const onFocus = () => { void fetchData({ silent: true }) }
    const onVisible = () => { if (document.visibilityState === "visible") void fetchData({ silent: true }) }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  const itemMap = new Map<string, ItemRow>()
  for (const b of balances) {
    if (!itemMap.has(b.item.id)) {
      const locationMinStock: Record<string, number> = {}
      for (const s of b.item.locationSettings) {
        locationMinStock[s.locationId] = Number(s.minStock)
      }
      itemMap.set(b.item.id, {
        itemId: b.item.id,
        name: b.item.name,
        sku: b.item.sku,
        unit: b.item.unit,
        category: b.item.category,
        locationMinStock,
        byLocation: {},
        reservedByLocation: {},
        reservedForByLocation: {},
      })
    }
    itemMap.get(b.item.id)!.byLocation[b.location.id] = Number(b.quantity)
    itemMap.get(b.item.id)!.reservedByLocation[b.location.id] = Number(b.reservedQuantity ?? 0)
    itemMap.get(b.item.id)!.reservedForByLocation[b.location.id] = b.reservedFor ?? []
  }
  const items = Array.from(itemMap.values())

  const categories = ["Semua", ...Array.from(new Set(items.map((i) => i.category ?? "Lainnya")))]

  const matchingLocations = locations.filter((location) => location.name.toLocaleLowerCase("id-ID").includes(locationSearch.trim().toLocaleLowerCase("id-ID")))
  const locationPages = Math.max(1, Math.ceil(matchingLocations.length / PAGE_SIZE))
  const currentLocationPage = Math.min(locationPage, locationPages)
  const pagedLocations = showAllLocations
    ? matchingLocations
    : matchingLocations.slice((currentLocationPage - 1) * PAGE_SIZE, currentLocationPage * PAGE_SIZE)
  const shownLocations = activeLocationId === "Semua"
    ? pagedLocations
    : locations.filter((location) => location.id === activeLocationId)

  const filtered = items.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku?.toLowerCase().includes(search.toLowerCase()) ?? false)
    const matchCat = category === "Semua" || item.category === category
    return matchSearch && matchCat
  })
  const itemPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentItemPage = Math.min(itemPage, itemPages)
  const pagedItems = showAllItems
    ? filtered
    : filtered.slice((currentItemPage - 1) * PAGE_SIZE, currentItemPage * PAGE_SIZE)

  function effectiveMin(item: ItemRow, locId: string): number | null {
    if (locId in item.locationMinStock) return item.locationMinStock[locId]
    return null
  }

  function qtyColor(qty: number, min: number | null) {
    if (!min) return "text-slate-700"
    if (qty === 0) return "text-red-600 font-bold"
    if (qty < min) return "text-orange-600 font-semibold"
    return "text-slate-700"
  }

  function qtyBg(qty: number, min: number | null) {
    if (!min) return ""
    if (qty === 0) return "bg-red-50"
    if (qty < min) return "bg-orange-50"
    return ""
  }

  function lowStockCount(locId: string) {
    return items.filter((item) => {
      const qty = item.byLocation[locId] ?? 0
      const min = effectiveMin(item, locId)
      return min != null && qty < min
    }).length
  }

  function zeroStockCount(locId: string) {
    return items.filter((item) => {
      const qty = item.byLocation[locId] ?? 0
      const min = effectiveMin(item, locId)
      return min != null && qty === 0
    }).length
  }

  const totalLow = activeLocationId === "Semua"
    ? locations.reduce((sum, l) => sum + lowStockCount(l.id), 0)
    : lowStockCount(activeLocationId)

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Stok per Lokasi</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {items.length} item
            {lastUpdated && ` · Diperbarui ${lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Alert banner */}
          {totalLow > 0 && (
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3.5">
              <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <span className="text-sm font-semibold text-orange-800">{totalLow} item di bawah stok minimum</span>
                <span className="text-sm text-orange-600 ml-1.5">— perlu ditindaklanjuti segera</span>
              </div>
            </div>
          )}

          {/* Location selector */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={locationSearch}
              onChange={(event) => {
                setLocationSearch(event.target.value)
                setLocationPage(1)
                setActiveLocationId("Semua")
              }}
              placeholder="Cari outlet atau gudang..."
              aria-label="Cari outlet atau gudang"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
            <button
              onClick={() => setActiveLocationId("Semua")}
              className={`group w-36 shrink-0 rounded-2xl border-2 p-4 text-left transition-all sm:w-auto ${
                activeLocationId === "Semua"
                  ? "border-slate-800 bg-slate-900"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
                activeLocationId === "Semua" ? "bg-white/15" : "bg-slate-100"
              }`}>
                <Warehouse className={`w-4 h-4 ${activeLocationId === "Semua" ? "text-white" : "text-slate-600"}`} />
              </div>
              <div className={`text-sm font-semibold leading-tight ${activeLocationId === "Semua" ? "text-white" : "text-slate-900"}`}>
                Semua
              </div>
              <div className={`text-xs mt-0.5 ${activeLocationId === "Semua" ? "text-slate-400" : "text-slate-400"}`}>
                {locations.length} lokasi
              </div>
            </button>

            {pagedLocations.map((loc) => {
              const isWarehouse = loc.type === "WAREHOUSE"
              const active = activeLocationId === loc.id
              const low = lowStockCount(loc.id)
              const zero = zeroStockCount(loc.id)
              return (
                <button
                  key={loc.id}
                  onClick={() => setActiveLocationId(active ? "Semua" : loc.id)}
                  className={`group w-36 shrink-0 rounded-2xl border-2 p-4 text-left transition-all sm:w-auto ${
                    active
                      ? isWarehouse
                        ? "border-blue-600 bg-blue-600"
                        : "border-blue-600 bg-blue-600"
                      : "border-slate-200 bg-white hover:border-blue-200"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
                    active ? "bg-white/20" : isWarehouse ? "bg-blue-50" : "bg-orange-50"
                  }`}>
                    {isWarehouse
                      ? <Warehouse className={`w-4 h-4 ${active ? "text-white" : "text-blue-600"}`} />
                      : <Store className={`w-4 h-4 ${active ? "text-white" : "text-orange-500"}`} />
                    }
                  </div>
                  <div className={`text-sm font-semibold leading-tight truncate ${active ? "text-white" : "text-slate-900"}`}>
                    {loc.name.replace("Outlet ", "").replace("Gudang ", "")}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {zero > 0 ? (
                      <span className={`text-xs flex items-center gap-1 ${active ? "text-red-200" : "text-red-500"}`}>
                        <TrendingDown className="w-3 h-3" /> {zero} habis
                      </span>
                    ) : low > 0 ? (
                      <span className={`text-xs ${active ? "text-yellow-200" : "text-orange-500"}`}>
                        {low} rendah
                      </span>
                    ) : (
                      <span className={`text-xs ${active ? "text-green-200" : "text-emerald-600"}`}>
                        Normal
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          {matchingLocations.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">Lokasi tidak ditemukan.</p>
          )}
          <ListPagination
            label="lokasi"
            total={matchingLocations.length}
            page={currentLocationPage}
            showAll={showAllLocations}
            onPageChange={(page) => { setLocationPage(page); setActiveLocationId("Semua") }}
            onShowAllChange={(showAll) => { setShowAllLocations(showAll); setLocationPage(1); setActiveLocationId("Semua") }}
          />

          {/* Search + category filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama item atau SKU..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setItemPage(1) }}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setCategory(cat); setItemPage(1) }}
                  className={`px-3.5 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    category === cat
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 text-xs text-slate-400 pl-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-red-300" />
              <span>Habis</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-orange-300" />
              <span>Stok rendah</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-slate-200" />
              <span>Normal</span>
            </div>
          </div>

          {activeLocationId === "Semua" && locations.length > PAGE_SIZE && (
            <p className="text-xs text-slate-500">
              Stok per lokasi menampilkan {showAllLocations ? "semua lokasi" : "lokasi pada halaman aktif"}. Total item tetap mencakup seluruh lokasi.
            </p>
          )}

          {/* Kartu stok untuk HP/tablet: setiap lokasi terbaca tanpa tabel menyempit. */}
          <div className="space-y-3 xl:hidden">
            {matchingLocations.length === 0 && activeLocationId === "Semua" ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">Cari lokasi lain untuk melihat stok.</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
                Tidak ada item ditemukan
              </div>
            ) : pagedItems.map((item) => {
              const total = locations.reduce((sum, loc) => sum + (item.byLocation[loc.id] ?? 0), 0)
              return (
                <article key={item.itemId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
                    <div className="min-w-0">
                      <p className="break-words text-base font-bold text-slate-900">
                        {item.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.unit}{item.category ? ` · ${item.category}` : ""}{item.sku ? ` · ${item.sku}` : ""}
                      </p>
                    </div>
                    {activeLocationId === "Semua" && (
                      <div className="shrink-0 rounded-xl bg-blue-50 px-3 py-2 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Total</p>
                        <p className="text-base font-bold tabular-nums text-blue-800">{stockNumber.format(total)}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    {shownLocations.map((loc) => {
                      const qty = item.byLocation[loc.id] ?? 0
                      const min = effectiveMin(item, loc.id)
                      const low = min != null && qty < min
                      return (
                        <div key={loc.id}
                          className={`flex min-h-16 items-center justify-between gap-3 rounded-xl px-3 py-2.5 ${qtyBg(qty, min) || "bg-slate-50"}`}>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${loc.type === "WAREHOUSE" ? "bg-blue-100 text-blue-600" : "bg-orange-100 text-orange-600"}`}>
                              {loc.type === "WAREHOUSE" ? <Warehouse className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">{loc.name}</p>
                              <p className="text-[11px] text-slate-500">{min == null ? "Minimum belum diatur" : `Min. ${stockNumber.format(min)} ${item.unit}`}</p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`text-base font-bold tabular-nums ${qtyColor(qty, min)}`}>{stockNumber.format(qty)}</p>
                            {low && <p className={`text-[10px] font-semibold ${qty === 0 ? "text-red-600" : "text-orange-600"}`}>{qty === 0 ? "Habis" : "Rendah"}</p>}
                            <InfoDikunci qty={qty} dikunci={item.reservedByLocation[loc.id] ?? 0} tujuan={item.reservedForByLocation[loc.id] ?? []} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>

          {/* Tabel tetap tersedia saat layar desktop cukup lebar. */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white xl:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="bg-slate-900">
                    <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5 w-52 sticky left-0 bg-slate-900">
                      Item
                    </th>
                    {shownLocations.map((loc) => (
                      <th key={loc.id} className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5 min-w-32">
                        <div className="flex items-center justify-end gap-1.5">
                          {loc.type === "WAREHOUSE"
                            ? <Warehouse className="w-3 h-3 text-blue-400" />
                            : <Store className="w-3 h-3 text-orange-400" />
                          }
                          {loc.name.replace("Outlet ", "").replace("Gudang ", "")}
                        </div>
                        <div className="mt-1 text-[10px] font-normal text-slate-500">
                          Stok / Minimum
                        </div>
                      </th>
                    ))}
                    {activeLocationId === "Semua" && (
                      <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Total</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchingLocations.length === 0 && activeLocationId === "Semua" || filtered.length === 0 ? (
                    <tr>
                      <td colSpan={shownLocations.length + 2} className="px-5 py-16 text-center text-slate-400 text-sm">
                        {matchingLocations.length === 0 ? "Cari lokasi lain untuk melihat stok." : "Tidak ada item ditemukan"}
                      </td>
                    </tr>
                  ) : (
                    pagedItems.map((item, idx) => {
                      const total = locations.reduce((sum, loc) => sum + (item.byLocation[loc.id] ?? 0), 0)
                      return (
                        <tr key={item.itemId} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                          <td className="px-5 py-3.5 sticky left-0 bg-inherit">
                            <span className="font-semibold text-slate-900 text-[13px]">{item.name}</span>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {item.unit}
                              {item.category ? ` · ${item.category}` : ""}
                            </div>
                          </td>
                          {shownLocations.map((loc) => {
                            const qty = item.byLocation[loc.id] ?? 0
                            const min = effectiveMin(item, loc.id)
                            return (
                              <td key={loc.id} className={`px-5 py-3.5 text-right ${qtyBg(qty, min)}`}>
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className={`text-[13px] ${qtyColor(qty, min)}`}>
                                    {stockNumber.format(qty)}
                                  </span>
                                  <span className={`text-[10px] ${min == null ? "text-slate-300" : "text-slate-400"}`}>
                                    {min == null ? "Min. belum diatur" : `Min. ${stockNumber.format(min)} ${item.unit}`}
                                  </span>
                                  <InfoDikunci qty={qty} dikunci={item.reservedByLocation[loc.id] ?? 0} tujuan={item.reservedForByLocation[loc.id] ?? []} />
                                </div>
                              </td>
                            )
                          })}
                          {activeLocationId === "Semua" && (
                            <td className="px-5 py-3.5 text-right">
                              <span className="text-[13px] font-bold text-slate-900">{stockNumber.format(total)}</span>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <ListPagination
            label="item"
            total={filtered.length}
            page={currentItemPage}
            showAll={showAllItems}
            onPageChange={setItemPage}
            onShowAllChange={(showAll) => { setShowAllItems(showAll); setItemPage(1) }}
          />
        </>
      )}
    </div>
  )
}
