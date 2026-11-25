"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import * as Select from "@radix-ui/react-select"
import { AppDatePicker } from "@/components/ui/app-date-picker"
import { HPP_STATUS_LABELS, type HppStockVarianceReport } from "@/lib/hpp-stock-variance"
import {
  AlertCircle,
  ArrowLeft,
  BadgeDollarSign,
  Boxes,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  PackageMinus,
  Store,
  TrendingUp,
} from "lucide-react"

type Outlet = { id: string; name: string }

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function formatRp(value: number) {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${value.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
}

export default function HppStockVarianceReportPage() {
  const today = jakartaToday()
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`)
  const [to, setTo] = useState(today)
  const [locationId, setLocationId] = useState("")
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [report, setReport] = useState<HppStockVarianceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/locations?type=OUTLET", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((data: Outlet[]) => setOutlets(Array.isArray(data) ? data : []))
  }, [])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError("")
    const params = new URLSearchParams({ from, to })
    if (locationId) params.set("locationId", locationId)
    try {
      const response = await fetch(`/api/reports/hpp-stock-variance?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Laporan gagal dimuat")
      setReport(data)
    } catch (cause) {
      setReport(null)
      setError(cause instanceof Error ? cause.message : "Laporan gagal dimuat")
    } finally {
      setLoading(false)
    }
  }, [from, to, locationId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadReport() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadReport])

  async function downloadReport() {
    if (!report) return
    setDownloading(true)
    setError("")
    try {
      const params = new URLSearchParams({ ...report.period, format: "xlsx" })
      if (locationId) params.set("locationId", locationId)
      const response = await fetch(`/api/reports/hpp-stock-variance?${params}`, { cache: "no-store" })
      if (!response.ok) throw new Error("Ekspor laporan gagal. Coba lagi.")
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `hpp-selisih-${report.period.from}-${report.period.to}.xlsx`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ekspor laporan gagal")
    } finally {
      setDownloading(false)
    }
  }

  const summary = report?.summary
  const cards = [
    { label: "Omzet", value: formatRp(summary?.revenue ?? 0), icon: BadgeDollarSign, tone: "bg-blue-50 text-blue-700" },
    { label: "HPP Bahan", value: formatRp(summary?.cogs ?? 0), icon: Boxes, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Laba Kotor", value: formatRp(summary?.grossProfit ?? 0), icon: TrendingUp, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Selisih Stok", value: formatRp(summary?.stockVariance ?? 0), icon: PackageMinus, tone: "bg-amber-50 text-amber-700" },
    { label: "Persentase Selisih", value: formatPercent(summary?.variancePercentage), icon: CircleDollarSign, tone: "bg-rose-50 text-rose-700" },
    { label: "Kerugian Tercatat", value: formatRp(summary?.knownLosses ?? 0), icon: ClipboardCheck, tone: "bg-slate-100 text-slate-700" },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <div>
          <Link href="/dashboard/owner" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">HPP & Selisih Stok</h1>
          <p className="mt-1 text-sm text-slate-500">Ringkasan biaya bahan dan selisih stok.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Filter laporan</h2>
          <button type="button" onClick={() => void downloadReport()} disabled={loading || downloading || !report} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-4 w-4" /> {downloading ? "Mengunduh…" : "Ekspor Excel"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.25fr]">
          <div className="min-w-0 space-y-2">
            <div className="text-sm font-medium text-slate-600">Dari tanggal</div>
            <AppDatePicker value={from} max={to} onChange={setFrom} ariaLabel="Dari tanggal" clearable={false} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="text-sm font-medium text-slate-600">Sampai tanggal</div>
            <AppDatePicker value={to} min={from} max={today} onChange={setTo} ariaLabel="Sampai tanggal" clearable={false} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" />
          </div>
          <div className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-1">
            <label htmlFor="report-outlet" className="block text-sm font-medium text-slate-600">Outlet</label>
            <Select.Root value={locationId || "all"} onValueChange={(value) => setLocationId(value === "all" ? "" : value)}>
              <Select.Trigger id="report-outlet" className="group flex h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 data-[state=open]:border-blue-500 data-[state=open]:ring-2 data-[state=open]:ring-blue-500/15">
                <Store aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate"><Select.Value /></span>
                <Select.Icon asChild><ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180" /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content position="popper" align="start" sideOffset={6} collisionPadding={16} className="z-50 max-h-[min(360px,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <Select.Viewport className="overscroll-contain">
                    {[{ id: "all", name: "Semua outlet" }, ...outlets].map((outlet, index) => (
                      <Select.Item key={outlet.id} value={outlet.id} className={`relative flex min-h-11 cursor-pointer select-none items-center rounded-lg py-3 pl-3 pr-10 text-sm text-slate-700 outline-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700 data-[state=checked]:font-medium data-[state=checked]:text-blue-700 ${index > 0 ? "border-t border-slate-100" : ""}`}>
                        <Select.ItemText>{outlet.name}</Select.ItemText>
                        <Select.ItemIndicator className="absolute right-3 text-blue-600"><Check className="h-4 w-4" /></Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-xl ${card.tone}`}><Icon className="h-4 w-4" /></div>
              <div className="text-lg font-semibold tracking-tight text-slate-900">{loading ? "…" : card.value}</div>
              <div className="mt-1 text-xs font-medium text-slate-500">{card.label}</div>
              {card.label === "Persentase Selisih" && !loading && summary && summary.calculationStatus !== "CALCULATED" && (
                <div className="mt-2 text-xs font-medium text-amber-700">{HPP_STATUS_LABELS[summary.calculationStatus]}</div>
              )}
            </div>
          )
        })}
      </div>

      {!loading && summary?.calculationStatus === "INCOMPLETE" && (
        <details className="group rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
            <AlertCircle className="h-4 w-4 shrink-0" /> Data belum lengkap
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal">Rincian <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></span>
          </summary>
          <div className="mt-3 space-y-1 border-t border-amber-200/70 pt-3 text-xs leading-relaxed">
            {summary.incompleteCogsOrders > 0 && <p>{summary.incompleteCogsOrders} transaksi belum memiliki HPP lengkap. HPP dan laba kotor masih parsial.</p>}
            {summary.unvaluedVarianceItems > 0 && <p>{summary.unvaluedVarianceItems} item selisih tanpa harga historis. Nilai selisih masih parsial.</p>}
            {summary.incompleteOpnames > 0 && <p>{summary.incompleteOpnames} opname belum lengkap.</p>}
            {report?.locations.some((row) => row.opnameCount === 0) && <p>Ada outlet yang belum melakukan opname.</p>}
            <p>Persentase ditampilkan setelah komponen hitungan lengkap.</p>
          </div>
        </details>
      )}
      {!loading && (summary?.unvaluedAdjustments ?? 0) > 0 && <p className="text-sm text-amber-700">{summary?.unvaluedAdjustments} pengurangan stok belum memiliki biaya. Kerugian tercatat yang tampil masih parsial.</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold text-slate-800">Per Outlet</h2>
            <span className="text-xs text-slate-400">{report?.locations.length ?? 0} outlet</span>
          </div>
          <details className="group mt-2 text-xs text-slate-500">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-blue-600 [&::-webkit-details-marker]:hidden">Cara hitung <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
            <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 leading-relaxed">
              <p>HPP = kebutuhan bahan resep dan modifier × biaya bahan. Tidak termasuk tenaga kerja dan overhead.</p>
              <p>Selisih = total nilai absolut stok kurang dan lebih dari opname item terlacak. Waste yang sudah dicatat tampil terpisah.</p>
              <p>Persentase = selisih ÷ HPP × 100%. Tanda — berarti belum dapat dihitung.</p>
              <p>Untuk penelitian, samakan bahan dan batas waktu dengan siklus opname.</p>
            </div>
          </details>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-245 w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Outlet</th>
                <th className="px-4 py-3 text-right font-semibold">Omzet</th>
                <th className="px-4 py-3 text-right font-semibold">HPP Bahan</th>
                <th className="px-4 py-3 text-right font-semibold">Laba Kotor</th>
                <th className="px-4 py-3 text-right font-semibold">Selisih Stok</th>
                <th className="px-4 py-3 text-right font-semibold">% Selisih</th>
                <th className="px-5 py-3 text-right font-semibold">Kerugian Tercatat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">Memuat laporan…</td></tr>
              ) : !report?.locations.length ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">Belum ada outlet.</td></tr>
              ) : report.locations.map((row) => (
                <tr key={row.locationId} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-800">{row.locationName}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{row.paidOrders} transaksi · {row.opnameCount} opname</div>
                    <div className={`mt-2 text-xs font-medium ${row.calculationStatus === "CALCULATED" ? "text-emerald-700" : "text-amber-700"}`}>{HPP_STATUS_LABELS[row.calculationStatus]}</div>
                  </td>
                  <td className="px-4 py-4 text-right text-slate-700">{formatRp(row.revenue)}</td>
                  <td className="px-4 py-4 text-right text-slate-700">{formatRp(row.cogs)}</td>
                  <td className="px-4 py-4 text-right font-medium text-emerald-700">{formatRp(row.grossProfit)}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="font-medium text-amber-700">{formatRp(row.stockVariance)}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">Kurang {formatRp(row.shortageValue)} · Lebih {formatRp(row.surplusValue)}</div>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-rose-700">{formatPercent(row.variancePercentage)}</td>
                  <td className="px-5 py-4 text-right text-slate-700">{formatRp(row.knownLosses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
