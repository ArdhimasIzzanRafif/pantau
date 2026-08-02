"use client"

import { useEffect, useState, useCallback } from "react"
import { Cpu, Database, Server, RefreshCw, Loader2, Activity } from "lucide-react"

type SystemData = {
  server: { platform: string; arch: string; nodeVersion: string; uptimeSeconds: number; hostname: string }
  memory: { totalMb: number; usedMb: number; freeMb: number; percentUsed: number; nodeHeapMb: number; nodeHeapTotalMb: number; nodeRssMb: number }
  cpu: { count: number; model: string; load1m: number; load5m: number; load15m: number }
  database: { sizeMb: number; activeConnections: number; tables: { name: string; rows: number }[] }
}

function uptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full bg-slate-100 rounded-full h-2">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

function loadColor(v: number) {
  return v > 80 ? "text-red-600" : v > 50 ? "text-amber-600" : "text-green-600"
}

function barColor(v: number) {
  return v > 80 ? "bg-red-500" : v > 50 ? "bg-amber-500" : "bg-blue-600"
}

export default function SystemPage() {
  const [data, setData] = useState<SystemData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    const res = await fetch("/api/admin/system")
    if (res.ok) { setData(await res.json()); setLastUpdated(new Date()) }
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(true), 30000)
    return () => clearInterval(t)
  }, [load])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  )
  if (!data) return null

  return (
    <div className="p-7 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">System Monitor</h1>
          <p className="text-slate-400 text-sm mt-0.5">Auto-refresh 30s · {lastUpdated?.toLocaleTimeString("id-ID") ?? "—"}</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm rounded-xl transition-colors">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Server info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-slate-400" />
          <h2 className="text-slate-900 font-semibold text-sm">Server Info</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["Platform", data.server.platform],
            ["Arch", data.server.arch],
            ["Node.js", data.server.nodeVersion],
            ["Hostname", data.server.hostname],
            ["Uptime", uptime(data.server.uptimeSeconds)],
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <div className="text-slate-400 text-xs mb-1">{label}</div>
              <div className="text-slate-900 font-medium text-sm">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* CPU */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-slate-400" />
            <h2 className="text-slate-900 font-semibold text-sm">CPU</h2>
            <span className="text-xs text-slate-400">· {data.cpu.count} core</span>
          </div>
          <div className="text-slate-400 text-xs mb-5 truncate">{data.cpu.model}</div>
          <div className="flex justify-around mb-5">
            {[["1m", data.cpu.load1m], ["5m", data.cpu.load5m], ["15m", data.cpu.load15m]].map(([label, v]) => (
              <div key={label} className="text-center">
                <div className={`text-xl font-bold ${loadColor(Number(v))}`}>{v}%</div>
                <div className="text-slate-400 text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          <Bar pct={data.cpu.load1m} color={barColor(data.cpu.load1m)} />
        </div>

        {/* Memory */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-5">
            <Activity className="w-4 h-4 text-slate-400" />
            <h2 className="text-slate-900 font-semibold text-sm">Memory</h2>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-500">System RAM</span>
                <span className="text-slate-700 font-medium">{data.memory.usedMb} / {data.memory.totalMb} MB ({data.memory.percentUsed}%)</span>
              </div>
              <Bar pct={data.memory.percentUsed} color={barColor(data.memory.percentUsed)} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-500">Node.js Heap</span>
                <span className="text-slate-700 font-medium">{data.memory.nodeHeapMb} / {data.memory.nodeHeapTotalMb} MB</span>
              </div>
              <Bar pct={Math.round((data.memory.nodeHeapMb / data.memory.nodeHeapTotalMb) * 100)} color="bg-indigo-500" />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>RSS</span><span className="text-slate-600">{data.memory.nodeRssMb} MB</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>Free RAM</span><span className="text-slate-600">{data.memory.freeMb} MB</span>
            </div>
          </div>
        </div>
      </div>

      {/* Database */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-5">
          <Database className="w-4 h-4 text-slate-400" />
          <h2 className="text-slate-900 font-semibold text-sm">Database PostgreSQL</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <div className="text-slate-400 text-xs mb-1">Ukuran DB</div>
            <div className="text-slate-900 font-bold text-xl">{data.database.sizeMb} <span className="text-sm font-normal text-slate-400">MB</span></div>
          </div>
          <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <div className="text-slate-400 text-xs mb-1">Koneksi Aktif</div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${data.database.activeConnections > 10 ? "bg-amber-500" : "bg-green-500"} animate-pulse`} />
              <div className="text-slate-900 font-bold text-xl">{data.database.activeConnections}</div>
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400 font-medium mb-3">Row Count per Tabel</div>
          <div className="space-y-2">
            {data.database.tables.map((t) => {
              const pct = Math.round((t.rows / (data.database.tables[0]?.rows || 1)) * 100)
              return (
                <div key={t.name} className="flex items-center gap-3">
                  <div className="text-slate-500 text-xs w-40 truncate shrink-0">{t.name}</div>
                  <div className="flex-1"><Bar pct={pct} color="bg-blue-600" /></div>
                  <div className="text-slate-600 text-xs w-16 text-right shrink-0">{t.rows.toLocaleString("id-ID")}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
