"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Plus, CheckCircle, AlertTriangle, Clock, ArrowDown, ArrowUp, Minus, Loader2, Calendar } from "lucide-react"

type Location = { id: string; name: string }
type InventoryItem = {
  id: string; name: string; sku: string | null; unit: string
  packSize: number | null; packUnit: string | null
  costPrice: number | null; isTrackable: boolean
}

type OpnameListItem = {
  id: string
  status: string
  periodStart: string
  periodEnd: string
  shift: string | null
  submittedAt: string | null
  location: { name: string }
  items: Array<{ difference: number; estimatedLoss: number }>
}

type OpnameDetail = {
  id: string
  status: string
  periodStart: string
  periodEnd: string
  shift: string | null
  location: { name: string }
  items: Array<{
    systemQty: number
    physicalQty: number
    difference: number
    estimatedLoss: number
    item: { name: string; unit: string; sku: string | null; costPrice: number | null }
  }>
}

export default function OpnamePage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isOwner = role === "OWNER"
  const canSeeResult = isOwner

  const [opnames, setOpnames] = useState<OpnameListItem[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [selectedOpname, setSelectedOpname] = useState<OpnameDetail | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const [locationId, setLocationId] = useState("")

  // Gunakan waktu lokal (WIB), bukan UTC dari toISOString()
  const nowDate = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  const nowTime = () => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }
  // Sertakan timezone offset saat kirim ke server supaya Node.js tidak salah baca sebagai UTC
  const tzOffset = () => {
    const o = -new Date().getTimezoneOffset()
    const sign = o >= 0 ? "+" : "-"
    const hh = String(Math.floor(Math.abs(o) / 60)).padStart(2, "0")
    const mm = String(Math.abs(o) % 60).padStart(2, "0")
    return `${sign}${hh}:${mm}`
  }

  const [startDate, setStartDate] = useState(nowDate)
  const [startTime, setStartTime] = useState(nowTime)
  const [endDate, setEndDate] = useState(nowDate)
  const [endTime, setEndTime] = useState(nowTime)
  const [physicalQtys, setPhysicalQtys] = useState<Record<string, string>>({})
  const [physicalInputUnit, setPhysicalInputUnit] = useState<Record<string, "base" | "pack">>({})
  const [filterFrom, setFilterFrom] = useState("")
  const [filterTo, setFilterTo] = useState("")
  const [stockBalances, setStockBalances] = useState<Record<string, number>>({})

  const formatRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`

  async function fetchOpnames() {
    setLoading(true)
    const res = await fetch("/api/opnames")
    if (res.ok) setOpnames(await res.json())
    setLoading(false)
  }

  async function fetchSetup() {
    const [lRes, iRes] = await Promise.all([fetch("/api/locations"), fetch("/api/inventory")])
    if (lRes.ok) {
      const locs = await lRes.json()
      setLocations(locs)
      if (locs.length > 0) setLocationId(locs[0].id)
    }
    if (iRes.ok) {
      const inv = await iRes.json()
      setInventoryItems(inv.filter((i: InventoryItem) => i.isTrackable))
    }
  }

  async function fetchBalances(locId: string, asOf?: string) {
    if (!locId) return
    const url = asOf
      ? `/api/stock-balances?locationId=${locId}&asOf=${encodeURIComponent(asOf)}`
      : `/api/stock-balances?locationId=${locId}`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      const map: Record<string, number> = {}
      for (const b of data) map[b.itemId] = Number(b.quantity)
      setStockBalances(map)
    }
  }

  useEffect(() => { fetchOpnames(); fetchSetup() }, [])

  useEffect(() => {
    if (showNew && locationId) fetchBalances(locationId, `${endDate}T${endTime}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNew, locationId, endDate, endTime])

  async function openDetail(id: string) {
    const res = await fetch(`/api/opnames?id=${id}`)
    if (res.ok) {
      const data = await res.json()
      const detail = Array.isArray(data) ? null : data
      if (!detail) {
        const all = data as OpnameListItem[]
        setSelectedOpname(all.find((o) => o.id === id) as unknown as OpnameDetail ?? null)
        return
      }
      setSelectedOpname(detail)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError("")
    try {
      const items = inventoryItems
        .filter((item) => physicalQtys[item.id] !== undefined && physicalQtys[item.id] !== "")
        .map((item) => {
          const inputVal = Number(physicalQtys[item.id])
          const inPack = physicalInputUnit[item.id] === "pack"
          const physicalQty = inPack && item.packSize ? inputVal * item.packSize : inputVal
          return { itemId: item.id, physicalQty }
        })

      if (new Date(`${endDate}T${endTime}`) > new Date()) {
        setError("Periode Hingga tidak boleh melebihi waktu sekarang")
        setSubmitting(false)
        return
      }

      if (items.length === 0) {
        setError("Isi minimal 1 item fisik")
        setSubmitting(false)
        return
      }

      const res = await fetch("/api/opnames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          periodStart: `${startDate}T${startTime}:00${tzOffset()}`,
          periodEnd: `${endDate}T${endTime}:00${tzOffset()}`,
          submit: true,
          items,
        }),
      })

      if (res.ok) {
        setShowNew(false)
        setPhysicalQtys({})
        fetchOpnames()
      } else {
        const d = await res.json()
        setError(d.error ?? "Gagal submit opname")
      }
    } catch {
      setError("Koneksi gagal, coba lagi")
    } finally {
      setSubmitting(false)
    }
  }

  if (showNew) {
    const trackable = inventoryItems.filter((i) => i.isTrackable)
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <button onClick={() => { setShowNew(false); setPhysicalQtys({}); setPhysicalInputUnit({}) }} className="text-sm text-slate-500 hover:text-slate-700">
          ← Batal
        </button>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-900 text-lg mb-1">Opname Baru</h2>
          <p className="text-sm text-slate-500 mb-6">Hitung stok fisik dan bandingkan dengan data sistem</p>

          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>
          )}

          <div className="space-y-4 mb-6 pb-6 border-b border-slate-100">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Lokasi</label>
              <select
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value)
                  setPhysicalQtys({})
                  setPhysicalInputUnit({})
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                { label: "Periode Dari", date: startDate, time: startTime, setDate: setStartDate, setTime: setStartTime },
                { label: "Periode Hingga", date: endDate, time: endTime, setDate: setEndDate, setTime: setEndTime },
              ] as const).map((f) => (
                <div key={f.label}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{f.label}</label>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-600 transition-all">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="date"
                      value={f.date}
                      max={nowDate()}
                      onChange={(e) => f.setDate(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-slate-900 focus:outline-none min-w-0"
                    />
                    <div className="w-px h-4 bg-slate-200 shrink-0" />
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="time"
                      value={f.time}
                      max={f.date === nowDate() ? nowTime() : undefined}
                      onChange={(e) => f.setTime(e.target.value)}
                      className="bg-transparent text-sm text-slate-900 focus:outline-none w-20"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-medium text-slate-900 mb-2">Input Stok Fisik</h3>
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900">
                    <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3">Nama Item</th>
                    {isOwner && (
                      <th className="text-center text-xs font-semibold text-slate-300 px-4 py-3 w-28">
                        Stok Sistem
                        <div className="text-[10px] font-normal text-slate-500 mt-0.5">s/d {endDate} {endTime}</div>
                      </th>
                    )}
                    <th className="text-center text-xs font-semibold text-slate-300 px-4 py-3 w-52">Stok Fisik</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trackable.map((item) => {
                    const v = physicalQtys[item.id] ?? ""
                    const physical = parseFloat(v)
                    const hasValue = !isNaN(physical)
                    const hasPack = !!(item.packSize && item.packUnit)
                    const inPack = physicalInputUnit[item.id] === "pack"
                    const sysQtyPcs = stockBalances[item.id] ?? 0
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-400">
                            {item.unit}
                            {hasPack && (
                              <span className="ml-1.5 text-blue-600">1 {item.packUnit}={item.packSize}</span>
                            )}
                            {item.sku ? ` · ${item.sku}` : ""}
                          </div>
                        </td>
                        {isOwner && (
                          <td className="px-4 py-2 text-center">
                            <div className="font-semibold text-slate-700">{sysQtyPcs}</div>
                            {hasPack && item.packSize && sysQtyPcs > 0 && (
                              <div className="text-xs text-slate-400">
                                = {Math.floor(sysQtyPcs / item.packSize)} {item.packUnit}
                                {sysQtyPcs % item.packSize > 0 ? ` +${sysQtyPcs % item.packSize}` : ""}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              placeholder="0"
                              min="0"
                              value={v}
                              onChange={(e) => setPhysicalQtys({ ...physicalQtys, [item.id]: e.target.value })}
                              className="flex-1 px-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-600 text-base text-center focus:outline-none font-semibold min-w-0"
                            />
                            {hasPack ? (
                              <select
                                value={physicalInputUnit[item.id] ?? "base"}
                                onChange={(e) =>
                                  setPhysicalInputUnit({ ...physicalInputUnit, [item.id]: e.target.value as "base" | "pack" })
                                }
                                className="w-20 px-2 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                              >
                                <option value="base">{item.unit}</option>
                                <option value="pack">{item.packUnit}</option>
                              </select>
                            ) : (
                              <span className="text-sm text-slate-400 shrink-0">{item.unit}</span>
                            )}
                          </div>
                          {hasPack && inPack && hasValue && item.packSize && (
                            <div className="text-xs text-blue-600 mt-1 text-center">
                              = {physical * item.packSize} {item.unit}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {hasValue
                            ? <span className="text-green-500 text-base">✓</span>
                            : <span className="text-slate-200 text-base">—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowNew(false)}
              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : <><CheckCircle className="w-4 h-4" /> Submit Opname</>}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (selectedOpname) {
    const op = selectedOpname as OpnameDetail
    const totalItems   = op.items?.length ?? 0
    const shortageItems = op.items?.filter((i) => Number(i.difference) < 0).length ?? 0
    const surplusItems  = op.items?.filter((i) => Number(i.difference) > 0).length ?? 0
    const totalLossAmt  = op.items?.reduce((s, i) => s + Number(i.estimatedLoss ?? 0), 0) ?? 0
    const totalSurplusAmt = op.items?.reduce((s, i) => {
      const diff = Number(i.difference ?? 0)
      if (diff <= 0) return s
      return s + diff * Number(i.item?.costPrice ?? 0)
    }, 0) ?? 0

    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <button onClick={() => setSelectedOpname(null)} className="text-sm text-slate-500 hover:text-slate-700">
          ← Kembali ke daftar
        </button>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-bold text-slate-900 text-lg">
                {(op as { location?: { name: string } }).location?.name ?? "Outlet"} · {op.id.slice(0, 8)}
              </h2>
              <p className="text-sm text-slate-500">
                {new Date(op.periodStart).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} –{" "}
                {new Date(op.periodEnd).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
              {op.status === "SUBMITTED" ? "Diajukan" : op.status === "DRAFT" ? "Draf" : op.status}
            </span>
          </div>

          {/* Summary cards — non-owner hanya lihat total item */}
          <div className={`grid gap-3 mb-6 ${isOwner ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1"}`}>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-light text-slate-900 tracking-tight">{totalItems}</div>
              <div className="text-xs text-slate-500 mt-0.5">Item Diperiksa</div>
            </div>
            {isOwner && <>
              <div className={`rounded-xl p-4 text-center ${shortageItems > 0 ? "bg-orange-50" : "bg-slate-50"}`}>
                <div className={`text-2xl font-light tracking-tight ${shortageItems > 0 ? "text-orange-600" : "text-slate-400"}`}>{shortageItems}</div>
                <div className="text-xs text-slate-500 mt-0.5">Item Kurang</div>
              </div>
              <div className={`rounded-xl p-4 text-center ${surplusItems > 0 ? "bg-green-50" : "bg-slate-50"}`}>
                <div className={`text-2xl font-light tracking-tight ${surplusItems > 0 ? "text-green-600" : "text-slate-400"}`}>{surplusItems}</div>
                <div className="text-xs text-slate-500 mt-0.5">Item Lebih</div>
              </div>
              <div className="rounded-xl p-4 text-center bg-slate-50 space-y-1">
                {totalLossAmt > 0 && <div className="text-sm font-bold text-red-600">− {formatRp(totalLossAmt)}</div>}
                {totalSurplusAmt > 0 && <div className="text-sm font-bold text-green-600">+ {formatRp(totalSurplusAmt)}</div>}
                {totalLossAmt === 0 && totalSurplusAmt === 0 && <div className="text-sm font-bold text-slate-400">Rp 0</div>}
                <div className="text-xs text-slate-500">Est. Nilai Selisih</div>
              </div>
            </>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900">
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5">Item</th>
                  {isOwner && <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Stok Sistem</th>}
                  <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Stok Fisik</th>
                  {isOwner && <>
                    <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Selisih</th>
                    <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Est. Nilai</th>
                  </>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(op.items ?? []).map((row, idx) => {
                  const diff = Number(row.difference ?? 0)
                  const loss = Number(row.estimatedLoss ?? 0)
                  const surplus = diff > 0 ? diff * Number(row.item?.costPrice ?? 0) : 0
                  const hasGap = isOwner && diff !== 0
                  return (
                    <tr key={idx} className={`hover:bg-blue-50/30 transition-colors ${hasGap ? "bg-red-50/30" : idx % 2 !== 0 ? "bg-slate-50/50" : ""}`}>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 text-[13px]">{row.item?.name ?? "—"}</div>
                        <div className="text-xs text-slate-400">{row.item?.unit}</div>
                      </td>
                      {isOwner && <td className="px-5 py-3.5 text-right text-slate-700 text-[13px]">{row.systemQty}</td>}
                      <td className="px-5 py-3.5 text-right text-slate-700 text-[13px]">{row.physicalQty}</td>
                      {isOwner && <>
                        <td className="px-5 py-3.5 text-right">
                          <div className={`flex items-center justify-end gap-1 font-bold text-[13px] ${
                            diff < 0 ? "text-red-600" : diff > 0 ? "text-emerald-600" : "text-slate-300"
                          }`}>
                            {diff < 0 ? <ArrowDown className="w-3 h-3" /> : diff > 0 ? <ArrowUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {diff > 0 ? "+" : ""}{diff}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {loss > 0 ? (
                            <span className="text-red-600 font-bold text-[13px]">− {formatRp(loss)}</span>
                          ) : surplus > 0 ? (
                            <span className="text-emerald-600 font-bold text-[13px]">+ {formatRp(surplus)}</span>
                          ) : (
                            <span className="text-slate-300 text-[13px]">Rp 0</span>
                          )}
                        </td>
                      </>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Opname Fisik</h1>
          <p className="text-slate-500 text-sm mt-0.5">{opnames.length} sesi opname</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
        >
          <Plus className="w-4 h-4" />
          Mulai Opname Baru
        </button>
      </div>

      {!loading && opnames.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-600 shrink-0">Filter tanggal:</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-sm">—</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {(filterFrom || filterTo) && (
            <button
              onClick={() => { setFilterFrom(""); setFilterTo("") }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : opnames.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-slate-400" />
          </div>
          <div className="text-slate-600 font-semibold">Belum ada opname</div>
          <div className="text-slate-400 text-sm mt-1">Mulai opname baru untuk mencatat stok fisik</div>
        </div>
      ) : (() => {
        const filtered = (filterFrom || filterTo)
          ? opnames.filter((op) => {
              const start = new Date(op.periodStart)
              if (filterFrom && start < new Date(filterFrom)) return false
              if (filterTo && start > new Date(filterTo + "T23:59:59")) return false
              return true
            })
          : opnames
        return filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-12 text-center">
            <div className="text-slate-500 text-sm">Tidak ada opname pada tanggal tersebut</div>
            <button onClick={() => { setFilterFrom(""); setFilterTo("") }} className="text-xs text-blue-600 hover:text-blue-700 mt-1 underline">Hapus filter</button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((op) => {
              const diffItems    = op.items?.filter((i) => Number(i.difference) !== 0).length ?? 0
              const totalLossAmt = op.items?.reduce((s, i) => s + Number(i.estimatedLoss ?? 0), 0) ?? 0
              const hasLoss = diffItems > 0
              return (
                <button
                  key={op.id}
                  onClick={() => openDetail(op.id)}
                  className={`w-full bg-white rounded-2xl border overflow-hidden hover:shadow-sm transition-all text-left group ${
                    canSeeResult && hasLoss ? "border-orange-200 hover:border-orange-300" : "border-slate-200 hover:border-blue-200"
                  }`}
                >
                  <div className={`h-1 ${canSeeResult && hasLoss ? "bg-orange-400" : canSeeResult ? "bg-emerald-400" : "bg-slate-200"}`} />
                  <div className="p-5 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        canSeeResult && hasLoss ? "bg-orange-100" : canSeeResult ? "bg-emerald-100" : "bg-slate-100"
                      }`}>
                        {canSeeResult && hasLoss
                          ? <AlertTriangle className="w-5 h-5 text-orange-600" />
                          : canSeeResult
                          ? <CheckCircle className="w-5 h-5 text-emerald-600" />
                          : <CheckCircle className="w-5 h-5 text-slate-400" />
                        }
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-[14px] mb-0.5">{op.location.name}</div>
                        <div className="text-xs text-slate-400">
                          {new Date(op.periodStart).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} –{" "}
                          {new Date(op.periodEnd).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{op.items?.length ?? 0} item</span>
                          {isOwner && (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              hasLoss ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {hasLoss ? `${diffItems} selisih` : "Semua cocok"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {isOwner && totalLossAmt > 0 && (
                        <span className="text-sm font-bold text-red-600">− {formatRp(totalLossAmt)}</span>
                      )}
                      {op.submittedAt && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(op.submittedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                        {op.status === "SUBMITTED" ? "Diajukan" : op.status === "DRAFT" ? "Draf" : op.status}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )
      })()}
    </div>
  )
}
