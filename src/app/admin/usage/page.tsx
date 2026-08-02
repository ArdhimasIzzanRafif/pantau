"use client"

import { useEffect, useState } from "react"
import { ShoppingBag, PackagePlus, ArrowLeftRight, ClipboardList, Bell, Loader2, Building2, TrendingUp } from "lucide-react"

type UsageData = {
  thisMonth: {
    posOrders: number; goodsReceipts: number; stockTransfers: number
    stockOpnames: number; alerts: number; orgsUsingPos: number; orgsRunningOpname: number
  }
  features: { name: string; count: number; icon: string; trend?: number }[]
  byOrg: {
    id: string; name: string; plan: string
    posOrders: number; goodsReceipts: number; stockTransfers: number; opnames: number; alerts: number
  }[]
}

const ICONS: Record<string, React.ElementType> = { ShoppingBag, PackagePlus, ArrowLeftRight, ClipboardList, Bell }
const FEATURE_CFG: Record<string, { bg: string; color: string; border: string }> = {
  ShoppingBag:    { bg: "bg-emerald-50",  color: "text-emerald-600", border: "border-emerald-100" },
  PackagePlus:    { bg: "bg-blue-50",     color: "text-blue-600",    border: "border-blue-100" },
  ArrowLeftRight: { bg: "bg-indigo-50",   color: "text-indigo-600",  border: "border-indigo-100" },
  ClipboardList:  { bg: "bg-amber-50",    color: "text-amber-600",   border: "border-amber-100" },
  Bell:           { bg: "bg-red-50",      color: "text-red-500",     border: "border-red-100" },
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/usage").then((r) => r.ok ? r.json() : null).then((d) => {
      setData(d); setLoading(false)
    })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  )
  if (!data) return null

  const maxOrders = Math.max(...data.byOrg.map((o) => o.posOrders), 1)

  return (
    <div className="p-7 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Usage Analytics</h1>
        <p className="text-slate-400 text-sm mt-0.5">Aktivitas fitur platform bulan ini</p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {data.features.map((f) => {
          const Icon = ICONS[f.icon] ?? Bell
          const cfg = FEATURE_CFG[f.icon] ?? { bg: "bg-slate-50", color: "text-slate-500", border: "border-slate-100" }
          return (
            <div key={f.name} className={`bg-white rounded-2xl border ${cfg.border} p-4`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${cfg.bg}`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{f.count.toLocaleString("id-ID")}</div>
              <div className="text-slate-400 text-[11px] mt-0.5 leading-tight">{f.name}</div>
            </div>
          )
        })}
      </div>

      {/* Aktif bisnis */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400 text-xs">Bisnis aktif pakai POS</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{data.thisMonth.orgsUsingPos}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-slate-400 text-xs">Bisnis jalankan opname</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{data.thisMonth.orgsRunningOpname}</div>
        </div>
      </div>

      {/* Per-org usage */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-slate-900 text-sm font-semibold">Aktivitas per Bisnis</h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <TrendingUp className="w-3.5 h-3.5" />
            Bulan ini
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {["Bisnis", "POS Orders", "Brg Masuk", "Transfer", "Opname", "Alert"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.byOrg.map((o) => (
              <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 text-[11px] font-bold shrink-0">
                      {o.name[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-slate-700 text-[13px] font-medium">{o.name}</div>
                      <div className="text-slate-400 text-[11px]">{o.plan}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${(o.posOrders / maxOrders) * 100}%` }} />
                    </div>
                    <span className="text-slate-600 text-[12px] font-medium">{o.posOrders}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500 text-[12px]">{o.goodsReceipts}</td>
                <td className="px-4 py-3 text-slate-500 text-[12px]">{o.stockTransfers}</td>
                <td className="px-4 py-3 text-slate-500 text-[12px]">{o.opnames}</td>
                <td className="px-4 py-3">
                  {o.alerts > 0
                    ? <span className="text-red-500 text-[12px] font-medium">{o.alerts}</span>
                    : <span className="text-slate-300 text-[12px]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.byOrg.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">Belum ada data</div>
        )}
      </div>
    </div>
  )
}
