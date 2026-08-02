"use client"

import { useState, useEffect } from "react"
import { Search, Warehouse, Store, RefreshCw, TrendingDown, AlertTriangle, Info } from "lucide-react"
import Link from "next/link"

type StockBalance = {
  id: string
  quantity: number
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
  minStock: number | null
  locationMinStock: Record<string, number>
  byLocation: Record<string, number>
}

type Location = { id: string; name: string; type: string }

export default function StokPage() {
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")
  const [activeLocationId, setActiveLocationId] = useState("Semua")

  async function fetchData() {
    setLoading(true)
    const [bRes, lRes] = await Promise.all([
      fetch("/api/stock-balances"),
      fetch("/api/locations"),
    ])
    if (bRes.ok) setBalances(await bRes.json())
    if (lRes.ok) setLocations(await lRes.json())
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

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
        minStock: b.item.minStock,
        locationMinStock,
        byLocation: {},
      })
    }
    itemMap.get(b.item.id)!.byLocation[b.location.id] = Number(b.quantity)
  }
  const items = Array.from(itemMap.values())

  const categories = ["Semua", ...Array.from(new Set(items.map((i) => i.category ?? "Lainnya")))]

  const shownLocations = activeLocationId === "Semua"
    ? locations
    : locations.filter((l) => l.id === activeLocationId)

  const filtered = items.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku?.toLowerCase().includes(search.toLowerCase()) ?? false)
    const matchCat = category === "Semua" || item.category === category
    return matchSearch && matchCat
  })

  function effectiveMin(item: ItemRow, locId: string): number | null {
    if (locId in item.locationMinStock) return item.locationMinStock[locId]
    return item.minStock
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
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm rounded-full transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* How-to callout */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-700">
              Jumlah stok tidak bisa diedit langsung. Untuk menyesuaikan stok fisik, gunakan{" "}
              <Link href="/dashboard/opname" className="font-semibold underline hover:text-blue-900">Opname Fisik</Link>.
              Transfer antar lokasi menggunakan{" "}
              <Link href="/dashboard/transfer" className="font-semibold underline hover:text-blue-900">Transfer Barang</Link>.
            </p>
          </div>

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button
              onClick={() => setActiveLocationId("Semua")}
              className={`group p-4 rounded-2xl border-2 text-left transition-all ${
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

            {locations.map((loc) => {
              const isWarehouse = loc.type === "WAREHOUSE"
              const active = activeLocationId === loc.id
              const low = lowStockCount(loc.id)
              const zero = zeroStockCount(loc.id)
              return (
                <button
                  key={loc.id}
                  onClick={() => setActiveLocationId(active ? "Semua" : loc.id)}
                  className={`group p-4 rounded-2xl border-2 text-left transition-all ${
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

          {/* Search + category filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama item atau SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
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

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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
                      </th>
                    ))}
                    {activeLocationId === "Semua" && (
                      <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Total</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={shownLocations.length + 2} className="px-5 py-16 text-center text-slate-400 text-sm">
                        Tidak ada item ditemukan
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item, idx) => {
                      const total = shownLocations.reduce((s, l) => s + (item.byLocation[l.id] ?? 0), 0)
                      return (
                        <tr key={item.itemId} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                          <td className="px-5 py-3.5 sticky left-0 bg-inherit">
                            <div className="font-semibold text-slate-900 text-[13px]">{item.name}</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {item.unit}
                              {item.category ? ` · ${item.category}` : ""}
                              {(item.minStock != null || Object.keys(item.locationMinStock).length > 0) && (
                                <span className="ml-1.5 text-slate-300">
                                  {Object.keys(item.locationMinStock).length > 0 ? "min per lokasi" : `min ${item.minStock}`}
                                </span>
                              )}
                            </div>
                          </td>
                          {shownLocations.map((loc) => {
                            const qty = item.byLocation[loc.id] ?? 0
                            const min = effectiveMin(item, loc.id)
                            return (
                              <td key={loc.id} className={`px-5 py-3.5 text-right ${qtyBg(qty, min)}`}>
                                <span className={`text-[13px] ${qtyColor(qty, min)}`}>{qty}</span>
                              </td>
                            )
                          })}
                          {activeLocationId === "Semua" && (
                            <td className="px-5 py-3.5 text-right">
                              <span className="text-[13px] font-bold text-slate-900">{total}</span>
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
        </>
      )}
    </div>
  )
}
