"use client"

import { useEffect, useState } from "react"
import { Activity, AlertTriangle, TrendingDown, HeartPulse, Loader2, Building2, MapPin, ShoppingBag, Users, CalendarClock, RefreshCw } from "lucide-react"

type Org = {
  id: string; name: string; plan: string; status: string
  trialEndsAt: string | null; createdAt: string
  owner: { email: string; name: string | null } | null
  counts: { users: number; locations: number; orders: number }
  isRecentlyActive: boolean; health: string; daysOld: number
}

const HEALTH_CFG = {
  churn_risk: {
    label: "Churn Risk",
    desc: "Perlu tindakan segera",
    Icon: HeartPulse,
    cardBorder: "border-red-200",
    headerBg: "bg-red-50",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    chip: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
  at_risk: {
    label: "At Risk",
    desc: "Perlu follow up",
    Icon: AlertTriangle,
    cardBorder: "border-amber-200",
    headerBg: "bg-amber-50",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    chip: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  inactive: {
    label: "Inactive",
    desc: "Belum ada aktivitas",
    Icon: TrendingDown,
    cardBorder: "border-slate-200",
    headerBg: "bg-slate-50",
    iconBg: "bg-slate-100",
    iconColor: "text-slate-500",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
  },
  healthy: {
    label: "Healthy",
    desc: "Aktif dan sehat",
    Icon: Activity,
    cardBorder: "border-green-200",
    headerBg: "bg-green-50",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    chip: "bg-green-100 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
}

function daysUntil(d: string) {
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: `Trial habis ${Math.abs(days)} hari lalu`, urgent: true }
  if (days === 0) return { text: "Trial habis hari ini", urgent: true }
  if (days <= 3) return { text: `Trial ${days} hari lagi`, urgent: true }
  return { text: `Trial ${days} hari lagi`, urgent: false }
}

export default function HealthPage() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    const data = await fetch("/api/admin/businesses").then((r) => r.ok ? r.json() : [])
    setOrgs(data); setLoading(false); setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  )

  const grouped = {
    churn_risk: orgs.filter((o) => o.health === "churn_risk"),
    at_risk:    orgs.filter((o) => o.health === "at_risk"),
    inactive:   orgs.filter((o) => o.health === "inactive"),
    healthy:    orgs.filter((o) => o.health === "healthy"),
  }

  return (
    <div className="p-7 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Customer Health</h1>
          <p className="text-slate-400 text-sm mt-0.5">Monitor keterlibatan dan risiko churn tiap bisnis</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {(Object.keys(HEALTH_CFG) as (keyof typeof HEALTH_CFG)[]).map((key) => {
          const { label, desc, Icon, chip, dot } = HEALTH_CFG[key]
          const count = grouped[key].length
          return (
            <div key={key} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${chip}`}>
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <div>
                <div className="font-bold text-sm leading-none">{count}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Groups */}
      {(Object.keys(HEALTH_CFG) as (keyof typeof HEALTH_CFG)[]).map((key) => {
        const group = grouped[key]
        if (group.length === 0) return null
        const { label, desc, Icon, cardBorder, headerBg, iconBg, iconColor } = HEALTH_CFG[key]

        return (
          <div key={key} className={`border rounded-2xl overflow-hidden ${cardBorder}`}>
            {/* Group header */}
            <div className={`flex items-center gap-3 px-5 py-3.5 ${headerBg}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>
                <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
              </div>
              <div>
                <span className="text-slate-900 text-sm font-semibold">{label}</span>
                <span className="text-slate-400 text-xs ml-2">· {group.length} bisnis · {desc}</span>
              </div>
            </div>

            {/* Org rows */}
            <div className="divide-y divide-slate-50">
              {group.map((org) => {
                const trial = org.trialEndsAt && org.status === "TRIAL" ? daysUntil(org.trialEndsAt) : null
                return (
                  <div key={org.id} className="bg-white px-5 py-3.5 flex items-center gap-4">
                    <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 text-slate-500 text-xs font-bold">
                      {org.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-900 font-semibold text-sm">{org.name}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          org.plan === "PRO" ? "bg-indigo-100 text-indigo-700" :
                          org.plan === "STARTER" ? "bg-blue-100 text-blue-700" :
                          "bg-slate-100 text-slate-500"
                        }`}>{org.plan}</span>
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-3 flex-wrap">
                        <span>{org.owner?.email ?? "no owner"}</span>
                        {trial && (
                          <span className={`flex items-center gap-1 ${trial.urgent ? "text-red-500" : "text-amber-500"}`}>
                            <CalendarClock className="w-3 h-3" />{trial.text}
                          </span>
                        )}
                        {!org.isRecentlyActive && org.daysOld > 3 && (
                          <span className="text-slate-400">Tidak aktif {org.daysOld > 30 ? `${Math.floor(org.daysOld / 30)}bln` : `${org.daysOld}h`}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{org.counts.locations}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{org.counts.users}</span>
                      <span className="flex items-center gap-1"><ShoppingBag className="w-3 h-3" />{org.counts.orders} order</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {orgs.length === 0 && (
        <div className="text-center py-20 text-slate-400 text-sm">Belum ada bisnis</div>
      )}
    </div>
  )
}
