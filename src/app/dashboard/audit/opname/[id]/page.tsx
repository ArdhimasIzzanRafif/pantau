"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { ArrowLeft, ClipboardList, Package } from "lucide-react"

type OpnameItem = {
  id: string; systemQty: number; physicalQty: number | null; difference: number | null
  estimatedLoss: number | null; notes: string | null
  item: { name: string; unit: string }
}
type Opname = {
  id: string; status: string; shift: string | null
  periodStart: string; periodEnd: string; createdAt: string
  location: { name: string }; items: OpnameItem[]
}

const STATUS: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: "Draf",     color: "bg-slate-100 text-slate-600" },
  SUBMITTED: { label: "Diajukan", color: "bg-green-100 text-green-700" },
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}
function fmtShort(s: string) {
  return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}
function formatRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}

export default function OpnameDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isSupervisor = role === "SUPERVISOR"

  const [data, setData]       = useState<Opname | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    fetch(`/api/opnames/${id}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError("Data tidak ditemukan"))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !data) return (
    <div className="max-w-3xl mx-auto py-16 text-center text-slate-400">{error || "Tidak ditemukan"}</div>
  )

  const st        = STATUS[data.status] ?? { label: data.status, color: "bg-slate-100 text-slate-600" }
  const selisih   = data.items.filter((i) => i.difference !== null && i.difference !== 0)
  const totalLoss = selisih.reduce((s, i) => s + Number(i.estimatedLoss ?? 0), 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Opname Fisik</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
          </div>
          <p className="text-sm text-slate-400">{data.location.name} · {fmtDate(data.createdAt)}</p>
        </div>
      </div>

      {/* Summary — Supervisor hanya lihat jumlah item */}
      <div className={`grid gap-3 ${isSupervisor ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-xs text-slate-400 mb-1">Total Item</div>
          <div className="text-lg font-bold text-slate-800">{data.items.length}</div>
        </div>
        {!isSupervisor && <>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 mb-1">Selisih Item</div>
            <div className={`text-lg font-bold ${selisih.length > 0 ? "text-red-600" : "text-slate-800"}`}>{selisih.length}</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 mb-1">Est. Kerugian</div>
            <div className={`text-lg font-bold ${totalLoss > 0 ? "text-red-600" : "text-slate-800"}`}>
              {totalLoss > 0 ? formatRp(totalLoss) : "—"}
            </div>
          </div>
        </>}
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 text-slate-700 mb-3">
          <ClipboardList className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium">Info Opname</span>
        </div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-slate-400">Lokasi</span>
          <span className="text-slate-800 font-medium">{data.location.name}</span>
          <span className="text-slate-400">Periode</span>
          <span className="text-slate-800">{fmtShort(data.periodStart)} – {fmtShort(data.periodEnd)}</span>
          {data.shift && <>
            <span className="text-slate-400">Shift</span>
            <span className="text-slate-800">{data.shift}</span>
          </>}
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Hasil Penghitungan</span>
        </div>
        <div className="divide-y divide-slate-100 overflow-x-auto">
          <div className={`px-5 py-2 grid text-xs font-medium text-slate-400 min-w-90 grid-cols-4`}>
            <span className="col-span-2">Item</span>
            <span className="text-right">Stok Sistem</span>
            <span className="text-right">Stok Fisik</span>
          </div>
          {data.items.map((i) => {
            const diff   = i.difference
            const hasGap = !isSupervisor && diff !== null && diff !== 0
            return (
              <div key={i.id} className={`px-5 py-3 grid grid-cols-4 items-start min-w-90 ${hasGap ? "bg-red-50/40" : ""}`}>
                <div className="col-span-2">
                  <div className="text-sm text-slate-800">{i.item.name}</div>
                  {i.notes && <div className="text-xs text-slate-400 mt-0.5">{i.notes}</div>}
                </div>
                <span className="text-right text-sm text-slate-500">{Number(i.systemQty)} {i.item.unit}</span>
                <div className="text-right">
                  <div className={`text-sm font-medium ${
                    !isSupervisor && hasGap ? (diff! < 0 ? "text-red-600" : "text-green-600") : "text-slate-800"
                  }`}>
                    {i.physicalQty !== null ? `${i.physicalQty} ${i.item.unit}` : "—"}
                  </div>
                  {!isSupervisor && hasGap && (
                    <div className={`text-xs ${diff! < 0 ? "text-red-400" : "text-green-400"}`}>
                      {diff! > 0 ? "+" : ""}{diff}
                      {diff! < 0 && Number(i.estimatedLoss) > 0 && (
                        <span className="ml-1">({formatRp(Number(i.estimatedLoss))})</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
