"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, ShoppingCart, Send, MessageSquare, UserCheck, Truck, GitBranch,
} from "lucide-react"
import { InfoRow } from "@/components/ui/info-card"

type Kejadian = {
  waktu: string
  jenis: "PESANAN_DIBUAT" | "PESAN_KELUAR" | "BALASAN_SUPPLIER" | "KEPUTUSAN" | "BARANG_MASUK" | "ESKALASI"
  judul: string
  keterangan?: string
  orderCode: string
  kutipan?: string
}
type Pesanan = {
  id: string; orderCode: string; status: string
  supplier: { id: string; name: string; phone: string | null }
  prioritas: number
  dipesan: number; dijanjikan: number | null; dikirim: number | null; diterima: number
  satuanMasukan: string | null; faktorKonversi: number | null
  balasanTerakhir: string | null; balasanTerakhirPada: string | null
  statusPesan: string; galatPesan: string | null
  dilanjutkanDari: string | null; alasanPenutupan: string | null
  dibuatPada: string
}
type Berkas = {
  chainId: string
  ringkasan: {
    item: { name: string; unit: string }
    lokasi: { id: string; name: string }
    percobaan: number
    totalDipesan: number; totalDikirim: number; totalDiterima: number; sisa: number
    statusTerakhir: string; balasanTerakhir: string; labelBalasanTerakhir: string
    sudahDikirim: boolean
  }
  pesanan: Pesanan[]
  kejadian: Kejadian[]
  jumlahPesanMasuk: number
  jumlahPenerimaan: number
}

const GAYA_KEJADIAN = {
  PESANAN_DIBUAT:   { icon: ShoppingCart,  warna: "bg-blue-100 text-blue-700" },
  ESKALASI:         { icon: GitBranch,     warna: "bg-violet-100 text-violet-700" },
  PESAN_KELUAR:     { icon: Send,          warna: "bg-slate-100 text-slate-600" },
  BALASAN_SUPPLIER: { icon: MessageSquare, warna: "bg-emerald-100 text-emerald-700" },
  KEPUTUSAN:        { icon: UserCheck,     warna: "bg-amber-100 text-amber-800" },
  BARANG_MASUK:     { icon: Truck,         warna: "bg-green-100 text-green-700" },
} as const

/// Status pengiriman pesan WhatsApp ke supplier — terpisah dari status
/// pengadaannya. Pesan gagal terkirim tidak berarti pengadaannya batal.
const LABEL_PESAN: Record<string, [string, string]> = {
  PENDING:    ["WA: menunggu dikirim",   "bg-slate-100 text-slate-600"],
  PROCESSING: ["WA: sedang dikirim",     "bg-slate-100 text-slate-600"],
  SENT:       ["WA: terkirim",           "bg-emerald-50 text-emerald-700"],
  FAILED:     ["WA: gagal",              "bg-red-50 text-red-700"],
  UNCERTAIN:  ["WA: tidak pasti",        "bg-amber-50 text-amber-800"],
  DEAD:       ["WA: berhenti dicoba",    "bg-red-50 text-red-700"],
}

const GAYA_STATUS: Record<string, string> = {
  ACTIVE:    "bg-blue-100 text-blue-700",
  FULFILLED: "bg-green-100 text-green-700",
  FAILED:    "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
}
const LABEL_STATUS: Record<string, string> = {
  ACTIVE: "Berjalan", FULFILLED: "Terpenuhi", FAILED: "Gagal", CANCELLED: "Dibatalkan",
}

const angka = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 3 })
const waktuPanjang = (nilai: string) => new Date(nilai).toLocaleString("id-ID", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
})

export default function DetailPengadaanPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<Berkas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/purchase-requests/${id}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError("Riwayat pengadaan tidak ditemukan"))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  )
  if (error || !data) return (
    <div className="mx-auto max-w-3xl py-16 text-center text-slate-400">{error || "Tidak ditemukan"}</div>
  )

  const { ringkasan } = data

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <button onClick={() => router.back()} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </button>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{ringkasan.item.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{ringkasan.lokasi.name}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${GAYA_STATUS[ringkasan.statusTerakhir] ?? "bg-slate-100 text-slate-600"}`}>
            {LABEL_STATUS[ringkasan.statusTerakhir] ?? ringkasan.statusTerakhir}
          </span>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          <InfoRow label="Percobaan ke supplier" value={`${ringkasan.percobaan}`} />
          <InfoRow label="Total dipesan" value={`${angka(ringkasan.totalDipesan)} ${ringkasan.item.unit}`} />
          {ringkasan.sudahDikirim && <InfoRow label="Dinyatakan dikirim supplier" value={`${angka(ringkasan.totalDikirim)} ${ringkasan.item.unit}`} />}
          <InfoRow label="Total diterima baik" value={`${angka(ringkasan.totalDiterima)} ${ringkasan.item.unit}`} />
          <InfoRow label="Sisa belum diterima" value={`${angka(ringkasan.sisa)} ${ringkasan.item.unit}`} />
          <InfoRow label="Balasan supplier terakhir" value={ringkasan.labelBalasanTerakhir} />
        </div>
      </section>

      {/* Satu rantai bisa memuat beberapa pesanan ke supplier berbeda. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Pesanan dalam rantai ini</h2>
        {data.pesanan.map((pesanan, urutan) => (
          <article key={pesanan.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{pesanan.orderCode}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Percobaan {urutan + 1} · {pesanan.supplier.name} (prioritas {pesanan.prioritas})
                  {pesanan.supplier.phone ? ` · +${pesanan.supplier.phone}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${GAYA_STATUS[pesanan.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {LABEL_STATUS[pesanan.status] ?? pesanan.status}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${(LABEL_PESAN[pesanan.statusPesan] ?? ["", "bg-slate-100 text-slate-600"])[1]}`}>
                  {(LABEL_PESAN[pesanan.statusPesan] ?? [pesanan.statusPesan])[0]}
                </span>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              {[
                ["Dipesan", angka(pesanan.dipesan)],
                ["Dijanjikan", pesanan.dijanjikan == null ? "—" : angka(pesanan.dijanjikan)],
                ["Dikirim", pesanan.dikirim == null ? "—" : angka(pesanan.dikirim)],
                ["Diterima", angka(pesanan.diterima)],
              ].map(([label, nilai]) => (
                <div key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-0.5 font-semibold text-slate-800">{nilai} {ringkasan.item.unit}</dd>
                </div>
              ))}
            </dl>

            {pesanan.dilanjutkanDari && (
              <p className="mt-2 text-xs text-violet-700">
                Lanjutan dari pesanan sebelumnya karena supplier terdahulu tidak dapat memenuhi.
              </p>
            )}
            {pesanan.balasanTerakhir && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Balasan template terakhir: “{pesanan.balasanTerakhir}”
                {pesanan.balasanTerakhirPada ? ` · ${waktuPanjang(pesanan.balasanTerakhirPada)}` : ""}
              </p>
            )}
            {pesanan.satuanMasukan && pesanan.satuanMasukan !== ringkasan.item.unit && (
              <p className="mt-2 text-xs text-slate-500">
                Dipesan dalam satuan {pesanan.satuanMasukan}, faktor konversi saat itu {pesanan.faktorKonversi} {ringkasan.item.unit} per {pesanan.satuanMasukan}.
              </p>
            )}
            {pesanan.galatPesan && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{pesanan.galatPesan}</p>}
            {pesanan.alasanPenutupan && <p className="mt-2 text-xs text-slate-600">Alasan penutupan: {pesanan.alasanPenutupan}</p>}
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          Riwayat kejadian <span className="font-normal text-slate-400">({data.kejadian.length})</span>
        </h2>
        <ol className="space-y-3">
          {data.kejadian.map((kejadian, urutan) => {
            const gaya = GAYA_KEJADIAN[kejadian.jenis]
            const Ikon = gaya.icon
            return (
              <li key={`${kejadian.waktu}-${urutan}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${gaya.warna}`}>
                    <Ikon className="h-4 w-4" />
                  </span>
                  {urutan < data.kejadian.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
                </div>
                <div className="min-w-0 flex-1 pb-3">
                  <p className="text-sm font-medium text-slate-900">{kejadian.judul}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{waktuPanjang(kejadian.waktu)} · {kejadian.orderCode}</p>
                  {kejadian.keterangan && <p className="mt-1 text-xs text-slate-600">{kejadian.keterangan}</p>}
                  {kejadian.kutipan && (
                    <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">“{kejadian.kutipan}”</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
