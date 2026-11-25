"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { InfoRow, InfoNote } from "@/components/ui/info-card"
import { useSession } from "next-auth/react"
import { ArrowLeft, ClipboardList, Package } from "lucide-react"

type OpnameItem = {
  // Kolom Decimal tiba sebagai string lewat JSON, bukan number — jangan
  // dibandingkan langsung dengan angka.
  id: string; systemQty: number | string; physicalQty: number | string | null; difference: number | string | null
  estimatedLoss: number | null; notes: string | null
  item: { name: string; unit: string; isTrackable: boolean }
}
type Opname = {
  id: string; status: string; shift: string | null
  periodStart: string; periodEnd: string; createdAt: string
  reviewedAt: string | null; reviewNotes: string | null
  location: { name: string }; items: OpnameItem[]
}

const STATUS: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: "Sedang dilakukan", color: "bg-amber-100 text-amber-700" },
  SUBMITTED: { label: "Data Lama", color: "bg-slate-100 text-slate-600" },
  REVIEWED:  { label: "Selesai", color: "bg-green-100 text-green-700" },
  REJECTED:  { label: "Tidak Dibukukan", color: "bg-red-100 text-red-700" },
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
  const searchParams = useSearchParams()
  const historyQuery = searchParams.get("scope") === "history" ? "?history=1" : ""
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isSupervisor = role === "SUPERVISOR"

  const [data, setData]       = useState<Opname | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  useEffect(() => {
    fetch(`/api/opnames/${id}${historyQuery}`)
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

  const st        = STATUS[data.status] ?? { label: data.status, color: "bg-slate-100 text-slate-600" }
  const selisih   = data.items.filter((i) => i.item.isTrackable && i.difference !== null && Number(i.difference) !== 0)
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
      {/* Tetap sebaris di layar HP; angka yang kepanjangan dipotong dengan elipsis
          supaya kartunya tidak melebar dan memaksa geser ke samping. */}
      <div className={`grid gap-2 sm:gap-3 ${isSupervisor ? "grid-cols-1" : "grid-cols-3"}`}>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="truncate text-xs text-slate-400 mb-1">Total Item</div>
          <div className="truncate text-base font-bold text-slate-800 sm:text-lg">{data.items.length}</div>
        </div>
        {!isSupervisor && <>
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="truncate text-xs text-slate-400 mb-1">Selisih Item</div>
            <div className={`truncate text-base font-bold sm:text-lg ${selisih.length > 0 ? "text-red-600" : "text-slate-800"}`}>{selisih.length}</div>
          </div>
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="truncate text-xs text-slate-400 mb-1">Est. Kerugian</div>
            {/* Nilai rupiah jauh lebih panjang dari angka hitungan, jadi di layar
                sempit dikecilkan dulu sebelum terpaksa dipotong. */}
            <div
              title={totalLoss > 0 ? formatRp(totalLoss) : undefined}
              className={`truncate text-sm font-bold sm:text-lg ${totalLoss > 0 ? "text-red-600" : "text-slate-800"}`}
            >
              {totalLoss > 0 ? formatRp(totalLoss) : "—"}
            </div>
          </div>
        </>}
      </div>

      {/* Info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2 text-slate-700">
          <ClipboardList className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold">Info Opname</span>
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          <InfoRow label="Lokasi" value={data.location.name} />
          <InfoRow label="Periode" value={<><span className="whitespace-nowrap">{fmtShort(data.periodStart)}</span>{" – "}<span className="whitespace-nowrap">{fmtShort(data.periodEnd)}</span></>} />
          {data.shift && <InfoRow label="Shift" value={data.shift} />}
          {data.reviewedAt && <InfoRow label="Diselesaikan" value={fmtDate(data.reviewedAt)} />}
        </dl>
        {data.status === "REJECTED" && data.reviewNotes && (
          <div className="mt-3">
            <InfoNote label="Catatan">{data.reviewNotes}</InfoNote>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Hasil Penghitungan</span>
        </div>
        {/* Tiga kolom dengan lebar sama. Nama item yang panjang dipotong elipsis,
            bukan melebarkan tabel — di HP tidak ada geser ke samping. */}
        <div className="divide-y divide-slate-100">
          <div className="grid grid-cols-3 gap-2 px-4 py-2 text-xs font-medium text-slate-400 sm:px-5">
            <span className="truncate">Item</span>
            <span className="truncate text-right">Stok Sistem</span>
            <span className="truncate text-right">Stok Fisik</span>
          </div>
          {data.items.map((i) => {
            const diff   = i.difference === null ? null : Number(i.difference)
            const hasGap = !isSupervisor && i.item.isTrackable && diff !== null && diff !== 0
            const isBalanceUpdate = !i.item.isTrackable && diff !== null && diff !== 0
            return (
              <div key={i.id} className={`grid grid-cols-3 items-start gap-2 px-4 py-3 sm:px-5 ${hasGap ? "bg-red-50/40" : ""}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-800" title={i.item.name}>{i.item.name}</div>
                  {i.notes && <div className="truncate text-xs text-slate-400 mt-0.5" title={i.notes}>{i.notes}</div>}
                </div>
                <span className="min-w-0 truncate text-right text-sm text-slate-500">{Number(i.systemQty)} {i.item.unit}</span>
                <div className="min-w-0 text-right">
                  <div className={`truncate text-sm font-medium ${
                    !isSupervisor && hasGap ? (diff! < 0 ? "text-red-600" : "text-green-600") : "text-slate-800"
                  }`}>
                    {i.physicalQty !== null ? `${i.physicalQty} ${i.item.unit}` : "—"}
                  </div>
                  {!isSupervisor && hasGap && (
                    <div className={`truncate text-xs ${diff! < 0 ? "text-red-400" : "text-green-400"}`}>
                      {diff! > 0 ? "+" : ""}{diff}
                      {diff! < 0 && Number(i.estimatedLoss) > 0 && (
                        <span className="ml-1">({formatRp(Number(i.estimatedLoss))})</span>
                      )}
                    </div>
                  )}
                  {!isSupervisor && isBalanceUpdate && (
                    <div className="truncate text-xs text-blue-500">Stok diperbarui</div>
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
