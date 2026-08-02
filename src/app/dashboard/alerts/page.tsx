"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { AlertTriangle, CheckCircle, Filter, Clock } from "lucide-react"

type Alert = {
  id: string
  type: string
  severity: "CRITICAL" | "WARNING" | "INFO"
  title: string
  message: string
  isResolved: boolean
  createdAt: string
  locationId?: string | null
}

export default function AlertsPage() {
  const { data: session } = useSession()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)

  const role = (session?.user as { role?: string })?.role
  const isAdminGudang = role === "ADMIN_GUDANG"

  async function fetchAlerts() {
    setLoading(true)
    const params = new URLSearchParams({ resolved: String(showResolved) })
    if (isAdminGudang) params.set("type", "LOW_STOCK")
    const res = await fetch(`/api/alerts?${params}`)
    if (res.ok) setAlerts(await res.json())
    setLoading(false)
  }

  async function resolve(id: string) {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    fetchAlerts()
    window.dispatchEvent(new Event("alert-resolved"))
  }

  useEffect(() => { fetchAlerts() }, [showResolved, isAdminGudang])

  const severityConfig = {
    CRITICAL: { color: "border-red-200 bg-red-50",     badge: "bg-red-100 text-red-700",    dot: "bg-red-500"    },
    WARNING:  { color: "border-orange-200 bg-orange-50", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
    INFO:     { color: "border-blue-200 bg-blue-50",    badge: "bg-blue-100 text-blue-700",  dot: "bg-blue-500"   },
  }

  const critical = alerts.filter((a) => a.severity === "CRITICAL").length
  const warning  = alerts.filter((a) => a.severity === "WARNING").length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">
            {isAdminGudang ? "Peringatan Stok Menipis" : "Peringatan"}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {!showResolved ? `${alerts.length} peringatan aktif` : `${alerts.length} peringatan selesai`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              showResolved ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Filter className="w-4 h-4" />
            {showResolved ? "Lihat Aktif" : "Lihat Selesai"}
          </button>
        </div>
      </div>

      {!showResolved && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-light tracking-tight text-red-600">{critical}</div>
            <div className="text-xs text-slate-500 mt-0.5">Kritis</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-light tracking-tight text-orange-600">{warning}</div>
            <div className="text-xs text-slate-500 mt-0.5">Perhatian</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
            <div className="text-2xl font-light tracking-tight text-slate-700">{alerts.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">Total Aktif</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <div className="font-semibold text-slate-700">
            {showResolved ? "Belum ada peringatan yang diselesaikan" : "Tidak ada peringatan aktif"}
          </div>
          <div className="text-slate-400 text-sm mt-1">
            {!showResolved && "Semua kondisi outlet dalam keadaan baik"}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const cfg = severityConfig[alert.severity] ?? severityConfig.INFO
            return (
              <div key={alert.id} className={`rounded-2xl border-2 p-5 ${cfg.color}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-slate-900">{alert.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                          {alert.severity === "CRITICAL" ? "Kritis" : alert.severity === "WARNING" ? "Perhatian" : "Info"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{alert.message}</p>
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
                        <Clock className="w-3 h-3" />
                        {new Date(alert.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric", month: "long", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                  {!showResolved && (
                    <button
                      onClick={() => resolve(alert.id)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-green-50 border border-slate-200 hover:border-green-300 text-slate-600 hover:text-green-700 text-xs font-medium rounded-xl transition-all"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Selesaikan
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
