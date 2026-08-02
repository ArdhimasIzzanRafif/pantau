"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, ArrowLeftRight, Package } from "lucide-react"

type TransferItem = {
  id: string
  quantity: number | string
  receivedQty: number | string | null
  item: { name: string; unit: string }
}
type Transfer = {
  id: string; status: string; notes: string | null; createdAt: string
  fromLocation: { name: string }; toLocation: { name: string }
  items: TransferItem[]
}

const STATUS: Record<string, { label: string; color: string }> = {
  SENT:     { label: "Terkirim", color: "bg-blue-100 text-blue-700" },
  RECEIVED: { label: "Diterima", color: "bg-green-100 text-green-700" },
  PENDING:  { label: "Menunggu", color: "bg-yellow-100 text-yellow-700" },
  REJECTED: { label: "Ditolak",  color: "bg-red-100 text-red-700" },
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const [data, setData]       = useState<Transfer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    fetch(`/api/transfers/${id}`)
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

  const st = STATUS[data.status] ?? { label: data.status, color: "bg-slate-100 text-slate-600" }
  const isReceived = data.status === "RECEIVED"
  const totalQty = data.items.reduce((s, i) => s + Number(i.quantity), 0)
  const totalReceived = isReceived
    ? data.items.reduce((s, i) => s + (i.receivedQty != null ? Number(i.receivedQty) : Number(i.quantity)), 0)
    : 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Transfer Barang</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
          </div>
          <p className="text-sm text-slate-400">{fmtDate(data.createdAt)}</p>
        </div>
      </div>

      {/* Route */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-400 mb-0.5">Dari</div>
            <div className="text-sm font-semibold text-slate-800">{data.fromLocation.name}</div>
          </div>
          <ArrowLeftRight className="w-5 h-5 text-slate-300 shrink-0" />
          <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-400 mb-0.5">Ke</div>
            <div className="text-sm font-semibold text-slate-800">{data.toLocation.name}</div>
          </div>
        </div>
        {data.notes && (
          <div className="mt-3 text-xs text-slate-400">Catatan: {data.notes}</div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Item yang Ditransfer</span>
          </div>
          <span className="text-xs text-slate-400">
            {data.items.length} jenis · {isReceived ? `Dikirim ${totalQty} · Diterima ${totalReceived}` : `${totalQty} total`} unit
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          <div className="px-5 py-2 flex text-xs font-medium text-slate-400">
            <span className="flex-1">Item</span>
            {isReceived ? (
              <>
                <span className="w-24 text-right">Dikirim</span>
                <span className="w-24 text-right">Diterima</span>
                <span className="w-20 text-right">Selisih</span>
              </>
            ) : (
              <span className="w-28 text-right">Jumlah</span>
            )}
          </div>
          {data.items.map((i) => {
            const sent = Number(i.quantity)
            const recv = i.receivedQty != null ? Number(i.receivedQty) : sent
            const diff = recv - sent
            return (
              <div key={i.id} className="px-5 py-3 flex items-center">
                <div className="flex-1 flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  <span className="text-sm text-slate-800">{i.item.name}</span>
                </div>
                {isReceived ? (
                  <>
                    <span className="w-24 text-right text-sm text-slate-500">
                      {sent} {i.item.unit}
                    </span>
                    <span className="w-24 text-right text-sm font-semibold text-slate-800">
                      {recv} {i.item.unit}
                    </span>
                    <span className={`w-20 text-right text-sm font-semibold ${diff < 0 ? "text-red-500" : diff > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                      {diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${diff}`}
                    </span>
                  </>
                ) : (
                  <span className="w-28 text-right text-sm font-semibold text-slate-800">
                    {sent} {i.item.unit}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
