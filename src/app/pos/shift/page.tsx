"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { ArrowLeft, X, Loader2, Clock, TrendingUp, DollarSign, ShoppingBag, MapPin, ChevronDown } from "lucide-react"
import { StableDraftInput } from "@/components/ui/stable-draft-input"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { canReviewShiftCash } from "@/lib/shift-cash-visibility"

type Shift = {
  id: string
  cashierId: string
  shiftNumber: string
  openingBalance: number
  closingBalance: number | null
  expectedCash: number | null
  totalSales: number
  totalOrders: number
  notes: string | null
  openedAt: string
  closedAt: string | null
  status: string
  cashier: { name: string | null; email: string }
  location: { name: string }
}

type Location = {
  id: string
  name: string
}

function formatRp(amount: number) {
  return "Rp " + Math.round(amount).toLocaleString("id-ID")
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function elapsedTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 0) return `${h} jam ${m} menit`
  return `${m} menit`
}

function ShiftTime({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>
  const date = new Date(value)
  return <div className="whitespace-nowrap tabular-nums">
    <div>{date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</div>
    <div className="mt-1 text-xs text-slate-400">{date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
  </div>
}

export default function POSShiftPage() {
  const { data: session } = useSession()
  const sessionUser = session?.user as { role?: string; locationIds?: string[] } | undefined
  const isKasir = sessionUser?.role === "KASIR"
  const showCashVariance = canReviewShiftCash(sessionUser?.role)

  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>("")
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(false)

  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closingBalance, setClosingBalance] = useState("")
  const [closeNotes, setCloseNotes] = useState("")
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState("")

  const openShift = shifts.find((s) => s.status === "OPEN" && s.cashierId === session?.user?.id)
  const otherOpenShifts = shifts.filter((s) => s.status === "OPEN" && s.cashierId !== session?.user?.id)

  const fetchShifts = useCallback(async (showLoading = true) => {
    if (!selectedLocation) return
    if (showLoading) setLoading(true)
    // Kasir hanya lihat shift mereka sendiri; owner/supervisor lihat semua shift lokasi
    const mineParam = isKasir ? "&mine=true" : ""
    const res = await fetch(`/api/pos/shifts?locationId=${selectedLocation}${mineParam}`)
    if (res.ok) {
      const data = await res.json()
      setShifts(Array.isArray(data) ? data : data.items ?? [])
    }
    setLoading(false)
  }, [selectedLocation, isKasir])

  useLiveRefresh(() => { void fetchShifts(false) })

  useEffect(() => {
    if (sessionUser === undefined) return
    async function fetchLocations() {
      const res = await fetch("/api/locations?type=OUTLET")
      if (!res.ok) return
      const all: Location[] = await res.json()
      const ids = sessionUser?.locationIds ?? []
      const filtered = isKasir && ids.length > 0 ? all.filter((l) => ids.includes(l.id)) : all
      setLocations(filtered)
      if (filtered.length > 0) setSelectedLocation(filtered[0].id)
    }
    fetchLocations()
  }, [isKasir, sessionUser?.locationIds?.join(",")])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchShifts() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchShifts])

  async function handleCloseShift() {
    if (!openShift || openShift.cashierId !== session?.user?.id) return
    setClosing(true)
    setCloseError("")
    try {
      const res = await fetch(`/api/pos/shifts/${openShift.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closingBalance: Number(closingBalance) || 0,
          notes: closeNotes || null,
        }),
      })
      if (res.ok) {
        setShowCloseModal(false)
        setClosingBalance("")
        setCloseNotes("")
        fetchShifts()
      } else {
        const d = await res.json()
        setCloseError(d.error ?? "Gagal menutup shift")
      }
    } catch {
      setCloseError("Tidak dapat terhubung ke server")
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-y-auto">
      <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-3 shrink-0">
        <Link
          href="/pos"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-white font-bold">Manajemen Shift</h1>
        <div className="ml-auto">
          {isKasir && locations.length <= 1 ? (
            <div className="flex items-center gap-1.5 text-slate-300 text-sm px-3 py-1.5 bg-slate-800 rounded-lg">
              <MapPin className="w-3.5 h-3.5" />
              <span>{locations[0]?.name ?? "..."}</span>
            </div>
          ) : (
            // Safari mengabaikan padding & sudut bulat <select> tanpa appearance-none,
            // jadi panahnya digambar sendiri.
            <div className="relative">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="h-9 appearance-none rounded-lg border border-slate-600 bg-slate-800 pl-3 pr-8 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          )}
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-6xl mx-auto w-full">
        {/* Open Shift Card */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : openShift ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="bg-linear-to-r from-blue-600 to-blue-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-blue-100 text-xs mb-1">Shift Aktif Kamu</div>
                  <div className="text-white font-bold text-xl">{openShift.shiftNumber}</div>
                  <div className="text-blue-100 text-sm mt-0.5">
                    Kasir: {openShift.cashier.name ?? openShift.cashier.email}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-blue-100 text-xs mb-1">Dibuka</div>
                  <div className="text-white text-sm">{formatDateTime(openShift.openedAt)}</div>
                  <div className="text-blue-100 text-xs mt-0.5">{elapsedTime(openShift.openedAt)} lalu</div>
                </div>
              </div>
            </div>

            {!isKasir && (
              <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                <div className="p-4 text-center">
                  <TrendingUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
                  <div className="text-xs text-slate-400 mb-0.5">Total Penjualan</div>
                  <div className="font-bold text-slate-900">{formatRp(Number(openShift.totalSales))}</div>
                </div>
                <div className="p-4 text-center">
                  <ShoppingBag className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <div className="text-xs text-slate-400 mb-0.5">Transaksi</div>
                  <div className="font-bold text-slate-900">{openShift.totalOrders}</div>
                </div>
                <div className="p-4 text-center">
                  <DollarSign className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                  <div className="text-xs text-slate-400 mb-0.5">Modal Awal</div>
                  <div className="font-bold text-slate-900">{formatRp(Number(openShift.openingBalance))}</div>
                </div>
              </div>
            )}

            <div className="p-4">
              <button
                onClick={() => setShowCloseModal(true)}
                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors"
              >
                Tutup Shift
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <div className="text-slate-700 font-semibold mb-1">Kamu belum punya shift aktif</div>
            <div className="text-slate-400 text-sm mb-4">Buka shift dari halaman kasir untuk mulai menerima pesanan</div>
            <Link
              href="/pos"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Ke Halaman Kasir
            </Link>
          </div>
        )}

        {!isKasir && otherOpenShifts.length > 0 && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Shift Aktif Kasir Lain</h2>
            <p className="mt-1 text-xs text-slate-500">Setiap shift hanya dapat ditutup oleh akun yang membukanya.</p>
          </div>
          <div className="divide-y divide-slate-100">{otherOpenShifts.map(shift => <div key={shift.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div><p className="text-sm font-semibold text-slate-800">{shift.cashier.name ?? shift.cashier.email}</p><p className="mt-1 text-xs text-slate-400">{shift.shiftNumber} · {formatDateTime(shift.openedAt)}</p></div>
            <span className="inline-flex shrink-0 items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Aktif</span>
          </div>)}</div>
        </div>}

        {/* History */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Riwayat Shift</h2>
          </div>
          {shifts.filter((s) => s.status === "CLOSED").length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">Belum ada riwayat shift</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Shift</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Kasir</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Dibuka</th>
                    <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Ditutup</th>
                    {!isKasir && <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Penjualan</th>}
                    {!isKasir && <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Transaksi</th>}
                    <th className="whitespace-nowrap text-right text-xs font-medium text-slate-500 px-4 py-3">Kas Aktual</th>
                    {showCashVariance && <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Ekspektasi</th>}
                    {showCashVariance && <th className="text-center text-xs font-medium text-slate-500 px-4 py-3">Selisih</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts.filter((s) => s.status === "CLOSED").map((shift) => {
                    const diff = shift.closingBalance != null && shift.expectedCash != null
                      ? Number(shift.closingBalance) - Number(shift.expectedCash)
                      : null
                    return (
                      <tr key={shift.id} className="hover:bg-slate-50 transition-colors">
                        <td className="whitespace-nowrap px-4 py-4 text-xs font-medium tabular-nums text-slate-700">{shift.shiftNumber}</td>
                        <td className="min-w-40 px-4 py-4 text-slate-600">{shift.cashier.name ?? shift.cashier.email}</td>
                        <td className="px-4 py-4 text-slate-500"><ShiftTime value={shift.openedAt} /></td>
                        <td className="px-4 py-4 text-slate-500"><ShiftTime value={shift.closedAt} /></td>
                        {!isKasir && <td className="whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums text-slate-900">{formatRp(Number(shift.totalSales))}</td>}
                        {!isKasir && <td className="px-4 py-3 text-right text-slate-600">{shift.totalOrders}</td>}
                        <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-slate-600">
                          {shift.closingBalance != null ? formatRp(Number(shift.closingBalance)) : "—"}
                        </td>
                        {showCashVariance && (
                          <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-slate-600">
                            {shift.expectedCash != null ? formatRp(Number(shift.expectedCash)) : "—"}
                          </td>
                        )}
                        {showCashVariance && (
                          <td className="px-4 py-4 text-center">
                            {diff != null ? (
                              <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                                diff === 0 ? "bg-green-100 text-green-700" :
                                diff > 0 ? "bg-blue-100 text-blue-700" :
                                "bg-red-100 text-red-600"
                              }`}>
                                {diff < 0 ? "−" : diff > 0 ? "+" : ""}{formatRp(Math.abs(diff))}
                              </span>
                            ) : "—"}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Close Shift Modal */}
      {showCloseModal && openShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCloseModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Tutup Shift</h2>
              <button onClick={() => setShowCloseModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Kas Aktual (opsional)</label>
                <StableDraftInput
                  type="text"
                  inputMode="numeric"
                  placeholder="Jumlah uang tunai di laci"
                  value={closingBalance.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                  formatValue={value => value.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                  onCommit={value => setClosingBalance(value.replace(/\D/g, ""))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {/* Blind count: the expected cash is intentionally hidden from
                    whoever closes the shift so the drawer is counted honestly.
                    The server records expectedCash; the discrepancy is shown to
                    managers afterwards in the closed-shift history, not here. */}
                <p className="mt-1.5 text-xs text-slate-400">Hitung uang tunai di laci apa adanya. Selisih akan tercatat otomatis.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Catatan (opsional)</label>
                <input
                  type="text"
                  placeholder="Catatan penutupan shift"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {closeError && (
              <div className="mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {closeError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCloseModal(false); setCloseError(""); setClosingBalance(""); setCloseNotes("") }}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleCloseShift}
                disabled={closing}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl"
              >
                {closing ? "Menutup..." : "Tutup Shift"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
