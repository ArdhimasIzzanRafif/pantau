"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { InfoCard, InfoRow, InfoNote } from "@/components/ui/info-card"
import { ArrowLeft, Truck, Package, ImageIcon } from "lucide-react"

type ReceiptItem = {
  id: string
  quantity: number
  costPrice: number | null
  purchaseQuantity: number
  purchaseUnit: string
  purchaseUnitCost: number | null
  lineTotal: number | null
  packSizeSnapshot: number | null
  batchNumber: string | null
  expiryDate: string | null
  item: { name: string; unit: string }
}
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
  const searchParams = useSearchParams()
  const historyQuery = searchParams.get("scope") === "history" ? "?history=1" : ""
  const [data, setData]       = useState<GoodsReceipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    fetch(`/api/goods-receipts/${id}${historyQuery}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError("Data tidak ditemukan"))
      .finally(() => setLoading(false))
  }, [historyQuery, id])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (error || !data) return (
    <div className="max-w-3xl mx-auto py-16 text-center text-slate-400">{error || "Tidak ditemukan"}</div>
  )

  const totalQty  = data.items.reduce((s, i) => s + Number(i.quantity), 0)
  const totalCost = data.items.reduce((sum, item) => {
    if (item.lineTotal != null) return sum + Number(item.lineTotal)
    return sum + (item.costPrice ? Number(item.costPrice) * Number(item.quantity) : 0)
  }, 0)

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
      {/* Sebaris di HP seperti halaman rincian lain, bukan bertumpuk ke bawah. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: "Lokasi Tujuan",  value: data.location.name },
          { label: "Total Unit",     value: String(totalQty) },
          { label: "Est. Total Cost",value: totalCost > 0 ? formatRp(totalCost) : "—" },
        ].map((c) => (
          <div key={c.label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="truncate text-xs text-slate-400 mb-1">{c.label}</div>
            <div className="truncate text-sm font-bold leading-tight text-slate-800" title={c.value}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Info */}
      <InfoCard icon={<Truck className="w-4 h-4 text-slate-400" />} title="Info Penerimaan">
        <InfoRow label="Supplier" value={data.supplier || <span className="font-normal text-slate-400">—</span>} />
        {data.receiptNumber && <InfoRow label="No. Surat Jalan" value={data.receiptNumber} />}
        {data.notes && <InfoNote label="Catatan">{data.notes}</InfoNote>}
      </InfoCard>

      {/* Foto Struk */}
      {data.imageUrl && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Foto Struk</span>
          </div>
          <div className="p-4">
            <a href={data.imageUrl} target="_blank" rel="noopener noreferrer">
              {/* Bukti penerimaan memakai URL unggahan dinamis yang harus dapat dibuka apa adanya. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
        {/* Tanpa geser ke samping: nama item yang panjang dipotong elipsis,
            sama seperti tabel di rincian opname. */}
        <div className="divide-y divide-slate-100">
          <div className="grid grid-cols-3 gap-2 px-4 py-2 text-xs font-medium text-slate-400 sm:px-5">
            <span className="col-span-2 truncate">Item</span>
            <span className="truncate text-right">Jumlah</span>
          </div>
          {data.items.map((i) => (
            <div key={i.id} className="grid grid-cols-3 items-center gap-2 px-4 py-3 sm:px-5">
              <div className="col-span-2 min-w-0">
                <div className="truncate text-sm text-slate-800" title={i.item.name}>{i.item.name}</div>
                {i.purchaseUnitCost !== null && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {formatRp(Number(i.purchaseUnitCost))} / {i.purchaseUnit}
                    {" · "} Subtotal {formatRp(Number(i.lineTotal ?? Number(i.purchaseQuantity) * Number(i.purchaseUnitCost)))}
                  </div>
                )}
                {(i.batchNumber || i.expiryDate) && (
                  <div className="text-xs text-amber-600 mt-1">
                    {i.batchNumber ? `Lot ${i.batchNumber}` : "Lot otomatis"}
                    {i.expiryDate ? ` · kedaluwarsa ${new Date(i.expiryDate).toLocaleDateString("id-ID")}` : ""}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-800">
                  {i.purchaseQuantity} {i.purchaseUnit}
                </div>
                {i.purchaseUnit !== i.item.unit && (
                  <div className="text-xs text-slate-400 mt-0.5">{i.quantity} {i.item.unit} masuk stok</div>
                )}
              </div>
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
