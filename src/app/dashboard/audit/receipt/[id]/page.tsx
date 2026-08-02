"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Truck, Package, ImageIcon } from "lucide-react"

type ReceiptItem = { id: string; quantity: number; costPrice: number | null; item: { name: string; unit: string } }
type GoodsReceipt = {
  id: string; supplier: string | null; receiptNumber: string | null
  notes: string | null; imageUrl: string | null; createdAt: string
  location: { name: string }; items: ReceiptItem[]
}

function formatRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const [data, setData]       = useState<GoodsReceipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    fetch(`/api/goods-receipts/${id}`)
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

  const totalQty  = data.items.reduce((s, i) => s + Number(i.quantity), 0)
  const totalCost = data.items.reduce((s, i) => s + (i.costPrice ? Number(i.costPrice) * Number(i.quantity) : 0), 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Penerimaan Barang</h1>
            <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">Diterima</span>
          </div>
          <p className="text-sm text-slate-400">{fmtDate(data.createdAt)}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Lokasi Tujuan",  value: data.location.name },
          { label: "Total Unit",     value: String(totalQty) },
          { label: "Est. Total Cost",value: totalCost > 0 ? formatRp(totalCost) : "—" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-400 mb-1">{c.label}</div>
            <div className="text-sm font-bold text-slate-800 leading-tight">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 text-slate-700 mb-3">
          <Truck className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium">Info Penerimaan</span>
        </div>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-slate-400">Supplier</span>
          <span className="text-slate-800 font-medium">{data.supplier || "—"}</span>
          {data.receiptNumber && <>
            <span className="text-slate-400">No. Surat Jalan</span>
            <span className="text-slate-800">{data.receiptNumber}</span>
          </>}
          {data.notes && <>
            <span className="text-slate-400">Catatan</span>
            <span className="text-slate-800">{data.notes}</span>
          </>}
        </div>
      </div>

      {/* Foto Struk */}
      {data.imageUrl && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Foto Struk</span>
          </div>
          <div className="p-4">
            <a href={data.imageUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={data.imageUrl}
                alt="Foto struk"
                className="w-full max-h-80 object-contain rounded-xl border border-slate-100 hover:opacity-90 transition-opacity"
              />
            </a>
            <p className="text-xs text-slate-400 mt-2 text-center">Klik foto untuk buka ukuran penuh</p>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Item Diterima</span>
        </div>
        <div className="divide-y divide-slate-100 overflow-x-auto">
          <div className="px-5 py-2 grid grid-cols-3 text-xs font-medium text-slate-400 min-w-72">
            <span className="col-span-2">Item</span>
            <span className="text-right">Jumlah</span>
          </div>
          {data.items.map((i) => (
            <div key={i.id} className="px-5 py-3 grid grid-cols-3 items-center min-w-72">
              <div className="col-span-2">
                <div className="text-sm text-slate-800">{i.item.name}</div>
                {i.costPrice !== null && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {formatRp(Number(i.costPrice))} / {i.item.unit}
                    {" · "} Subtotal {formatRp(Number(i.costPrice) * Number(i.quantity))}
                  </div>
                )}
              </div>
              <span className="text-right text-sm font-semibold text-slate-800">
                {i.quantity} {i.item.unit}
              </span>
            </div>
          ))}
          {totalCost > 0 && (
            <div className="px-5 py-3 flex justify-between text-sm font-semibold text-slate-800 bg-slate-50">
              <span>Total Nilai Barang</span>
              <span>{formatRp(totalCost)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
