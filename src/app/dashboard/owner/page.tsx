"use client"

import { useState, useEffect } from "react"
import {
  TrendingDown, AlertTriangle, Store, ClipboardCheck,
  ChevronRight, Bell, Boxes, PackageMinus, ChartColumn,
} from "lucide-react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"

type Stats = {
  activeLocations: number
  openAlertsCount: number
  criticalAlertsCount: number
  estimatedLoss: number
  opnamesCount: number
}

type Alert = {
  id: string
  severity: "CRITICAL" | "WARNING" | "INFO"
  title: string
  message: string
  createdAt: string
}

type DailySale  = { date: string; label: string; total: number; orders: number }
type HourlySale = { hour: number; label: string; orders: number }
type TopProduct = { name: string; qty: number; revenue: number }
type ChartData  = {
  dailySales: DailySale[]
  hourlySales: HourlySale[]
  topProducts: TopProduct[]
  totalRevenue: number
  totalOrders: number
  avgOrder: number
}

type HppSummary = {
  cogs: number
  stockVariance: number
  variancePercentage: number | null
  incompleteCogsOrders: number
}

function formatRp(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function formatRpShort(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}rb`
  return `Rp ${n}`
}

function formatYTick(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}rb`
  return `${n}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl shadow-xl px-3 py-2.5 text-xs">
      <div className="font-medium text-slate-300 mb-1.5">{label}</div>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <div key={i} className="text-white font-semibold">
          {p.name === "total" || p.name === "omzet" ? formatRp(p.value) : `${p.value} ${p.name}`}
        </div>
      ))}
    </div>
  )
}

export default function OwnerDashboard() {
  const { data: session } = useSession()
  const sessionUser = session?.user as { name?: string | null; businessName?: string } | undefined
  const businessName = sessionUser?.businessName ?? "Bisnis Anda"

  const [stats,  setStats]  = useState<Stats | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [hppSummary, setHppSummary] = useState<HppSummary | null>(null)
  const [loading, setLoading] = useState(true)

  // ── per-chart independent state ──
  const [trenDays,  setTrenDays]  = useState(14)
  const [produkDays, setProdukDays] = useState(14)
  const [jamDays,   setJamDays]   = useState(14)

  const [trenData,   setTrenData]   = useState<Pick<ChartData, "dailySales"|"totalRevenue"|"totalOrders"|"avgOrder"> | null>(null)
  const [produkData, setProdukData] = useState<TopProduct[]>([])
  const [jamData,    setJamData]    = useState<HourlySale[]>([])

  const [loadingTren,   setLoadingTren]   = useState(true)
  const [loadingProduk, setLoadingProduk] = useState(true)
  const [loadingJam,    setLoadingJam]    = useState(true)

  useEffect(() => {
    async function load() {
      const jakartaToday = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date())
      const reportParams = new URLSearchParams({ from: `${jakartaToday.slice(0, 7)}-01`, to: jakartaToday })
      const [statsRes, alertsRes, hppRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/alerts?resolved=false"),
        fetch(`/api/reports/hpp-stock-variance?${reportParams}`, { cache: "no-store" }),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (alertsRes.ok) setAlerts((await alertsRes.json()).slice(0, 4))
      if (hppRes.ok) setHppSummary((await hppRes.json()).summary)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLoadingTren(true)
      fetch(`/api/dashboard/charts?days=${trenDays}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: ChartData | null) => { if (d) setTrenData({ dailySales: d.dailySales, totalRevenue: d.totalRevenue, totalOrders: d.totalOrders, avgOrder: d.avgOrder }) })
        .finally(() => setLoadingTren(false))
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [trenDays])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLoadingProduk(true)
      fetch(`/api/dashboard/charts?days=${produkDays}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: ChartData | null) => { if (d) setProdukData(d.topProducts) })
        .finally(() => setLoadingProduk(false))
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [produkDays])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLoadingJam(true)
      fetch(`/api/dashboard/charts?days=${jamDays}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: ChartData | null) => { if (d) setJamData(d.hourlySales) })
        .finally(() => setLoadingJam(false))
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [jamDays])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const DAYS_OPT = [7, 14, 30]
  const maxRevenue = Math.max(...produkData.map((p) => p.revenue), 1)

  const allSales = trenData?.dailySales ?? []
  const firstNonZeroIdx = allSales.findIndex((d) => d.total > 0)
  const chartSales = firstNonZeroIdx > 0 ? allSales.slice(Math.max(0, firstNonZeroIdx - 1)) : allSales

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* ── Hero ── */}
      <div className="relative bg-linear-to-br from-slate-900 via-slate-800 to-blue-950 rounded-3xl overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-72 h-72 bg-blue-700/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:"radial-gradient(circle,#fff 1px,transparent 1px)",backgroundSize:"24px 24px"}} />

        <div className="relative z-10 px-4 py-5 sm:px-8 sm:py-7">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-8">
            {/* Left: name + operational stats */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-blue-400 text-[11px] font-semibold uppercase tracking-widest">Owner Dashboard</span>
              </div>
              <h1 className="text-3xl font-light text-white tracking-tight leading-tight">{businessName}</h1>
              <p className="text-slate-400 text-sm mt-1.5 capitalize">{today}</p>
            </div>

            {/* Right: big omzet callout */}
            <div className="sm:shrink-0 bg-white/6 border border-white/10 rounded-2xl px-7 py-6 sm:text-right">
              <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-3">
                Omzet {trenDays} Hari
              </div>
              <div className="text-4xl font-thin text-white tracking-tight leading-none">
                {loadingTren
                  ? <span className="text-slate-500 text-2xl">···</span>
                  : formatRpShort(trenData?.totalRevenue ?? 0)
                }
              </div>
              <div className="mt-4 space-y-1.5">
                <div className="text-xs text-slate-400">
                  {loadingTren ? "—" : `${trenData?.totalOrders ?? 0} transaksi`}
                </div>
                <div className="text-xs text-emerald-400 font-medium">
                  {loadingTren ? "" : `Avg ${formatRpShort(trenData?.avgOrder ?? 0)} / order`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── HPP & selisih bulan berjalan ── */}
      <Link
        href="/dashboard/reports/hpp-stock-variance"
        className="group grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><ChartColumn className="h-5 w-5" /></div>
          <div>
            <div className="font-semibold text-slate-800">HPP & Selisih Bulan Ini</div>
            <div className="text-xs text-slate-400">Klik untuk rincian per outlet dan periode</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:block sm:text-right">
          <Boxes className="h-4 w-4 text-indigo-500 sm:hidden" />
          <div className="text-xs text-slate-400">HPP</div>
          <div className="font-semibold text-slate-800">{hppSummary ? formatRpShort(hppSummary.cogs) : "—"}</div>
        </div>
        <div className="flex items-center gap-2 sm:block sm:text-right">
          <PackageMinus className="h-4 w-4 text-amber-500 sm:hidden" />
          <div className="text-xs text-slate-400">Selisih Stok</div>
          <div className="font-semibold text-amber-700">{hppSummary ? formatRpShort(hppSummary.stockVariance) : "—"}</div>
        </div>
        <div className="flex items-center gap-2 sm:block sm:text-right">
          <div className="text-xs text-slate-400">Selisih / HPP</div>
          <div className="font-semibold text-rose-700">{hppSummary?.variancePercentage != null ? `${hppSummary.variancePercentage.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%` : "—"}</div>
        </div>
      </Link>

      {/* ── Main: big chart (left 2/3) + sidebar (right 1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Area chart */}
        <div className="lg:col-span-2 flex flex-col rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-5 shrink-0">
            <div>
              <div className="font-semibold text-slate-800">Tren Penjualan</div>
              <div className="text-xs text-slate-400 mt-0.5">Revenue harian</div>
            </div>
            <div className="flex gap-1">
              {DAYS_OPT.map((d) => (
                <button
                  key={d}
                  onClick={() => setTrenDays(d)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    trenDays === d ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {d}h
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-50">
            {loadingTren ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSales} margin={{ top: 4, right: 0, bottom: 0, left: -8 }}>
                  <defs>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis
                    axisLine={false} tickLine={false} width={40}
                    // Label rata kiri di x=0 supaya sejajar dengan huruf awal judul kartu.
                    tick={({ y, payload }) => (
                      <text x={0} y={y} dy="0.355em" textAnchor="start" fontSize={10} fill="#94a3b8">
                        {formatYTick(Number(payload.value))}
                      </text>
                    )}
                  />
                  <Tooltip content={<ChartTip />} />
                  <Area
                    type="monotone" dataKey="total" name="total"
                    stroke="#2563eb" strokeWidth={2.5}
                    fill="url(#blueGrad)" dot={false}
                    activeDot={{ r: 5, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {/* 2×2 mini stat cards */}
          <div className="grid grid-cols-2 gap-3">
            {stats && [
              { label: "Outlet",     value: String(stats.activeLocations), icon: Store,         bg: "bg-blue-50",    iconBg: "bg-blue-600",    color: "text-blue-700"    },
              { label: "Peringatan", value: String(stats.openAlertsCount),  icon: AlertTriangle, bg: "bg-orange-50",  iconBg: "bg-orange-500",  color: "text-orange-700"  },
              { label: "Opname",     value: String(stats.opnamesCount),     icon: ClipboardCheck,bg: "bg-emerald-50", iconBg: "bg-emerald-500", color: "text-emerald-700" },
              { label: "Est. Rugi",  value: stats.estimatedLoss > 0 ? formatRpShort(stats.estimatedLoss) : "—", icon: TrendingDown, bg: "bg-red-50", iconBg: "bg-red-500", color: "text-red-700" },
            ].map((s) => {
              const Icon = s.icon
              return (
                <div key={s.label} className={`${s.bg} rounded-2xl p-4 border border-slate-100`}>
                  <div className={`w-7 h-7 ${s.iconBg} rounded-lg flex items-center justify-center mb-3`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className={`text-xl font-light tracking-tight ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5 font-medium">{s.label}</div>
                </div>
              )
            })}
          </div>

          {/* Mini alerts */}
          <div className="bg-white rounded-2xl border border-slate-200 flex-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">Peringatan Aktif</span>
                {alerts.length > 0 && (
                  <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">{alerts.length}</span>
                )}
              </div>
              <Link href="/dashboard/alerts" className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                Semua <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-sm text-slate-400">Semua kondisi aman</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {alerts.map((a) => (
                  <div key={a.id} className="px-4 py-3 flex gap-2.5 items-start">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      a.severity === "INFO" ? "bg-blue-500" : "bg-red-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-800 leading-snug">{a.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{a.message}</div>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 leading-none ${
                      a.severity === "INFO" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                    }`}>
                      {a.severity === "INFO" ? "Info" : "Kritis"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom: ranked products + hourly ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* Top products ranked list */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="font-semibold text-slate-800">Produk Terlaris</div>
            </div>
            <div className="flex gap-1">
              {DAYS_OPT.map((d) => (
                <button key={d} onClick={() => setProdukDays(d)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${produkDays === d ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{d}h</button>
              ))}
            </div>
          </div>
          {loadingProduk ? (
            <div className="flex items-center justify-center h-44">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !produkData.length ? (
            <div className="text-center text-slate-400 text-sm py-12">Belum ada data penjualan</div>
          ) : (
            <div className="space-y-4">
              {produkData.slice(0, 5).map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? "bg-blue-600 text-white" : i === 1 ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-slate-800 truncate pr-3">{p.name}</span>
                      <span className="text-sm font-semibold text-slate-700 shrink-0">{formatRpShort(p.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${i === 0 ? "bg-blue-500" : i === 1 ? "bg-blue-400" : "bg-slate-300"}`}
                        style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hourly sales */}
        <div className="flex min-h-80 flex-col rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="font-semibold text-slate-800">Jam Tersibuk</div>
              <div className="text-xs text-slate-400 mt-0.5">Jumlah order per jam</div>
            </div>
            <div className="flex gap-1">
              {DAYS_OPT.map((d) => (
                <button key={d} onClick={() => setJamDays(d)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${jamDays === d ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{d}h</button>
              ))}
            </div>
          </div>
          {loadingJam ? (
            <div className="flex min-h-52 flex-1 items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="min-h-52 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={jamData.filter((h) => h.hour >= 6 && h.hour <= 22)}
                  margin={{ top: 4, right: 0, bottom: 0, left: -8 }}
                >
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#3b82f6" stopOpacity={1}   />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} interval={2} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="orders" name="order" fill="url(#barGrad)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
