"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { FileText, MessageCircle, PackageCheck, RotateCcw, Search, Plus } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { useConfirm } from "@/components/ui/use-confirm"
import { PesananSupplierCard, statusBaris, jumlahDipesan, type PesananSupplier } from "@/components/purchase-order-card"
import { RincianPesanan } from "@/components/purchase-order-detail"
import { FormPesananManual } from "@/components/manual-order-form"

type Kelompok = PesananSupplier["kelompok"]
type Aksi = "ESCALATE" | "STOP" | "CANCEL"

/** Data tambahan per baris dari /api/purchase-requests (supplier berikutnya, sisa). */
export type InfoBaris = { id: string; nextSupplier: { name: string } | null; outstandingQuantity: number; lastReminderStatus: string | null }

const TAB: Array<{ key: Kelompok | null; label: string }> = [
  { key: "PERLU_TINDAKAN", label: "Perlu tindakan" },
  { key: "MENUNGGU", label: "Menunggu supplier" },
  { key: "PENGIRIMAN", label: "Dalam pengiriman" },
  { key: "SELESAI", label: "Selesai" },
  { key: null, label: "Semua" },
]

/**
 * Daftar pesanan supplier (banyak bahan per pesanan) dengan filter status.
 * Tindakan per bahan (alihkan/hentikan/batalkan) memakai fungsi yang sama
 * dengan daftar pesanan lama, supaya aturannya tidak bercabang.
 */
export function SupplierOrders({ canManage, refreshKey, infoBaris, busyId, onDecide, onUpdate }: {
  canManage: boolean
  refreshKey: number
  infoBaris: Map<string, InfoBaris>
  busyId: string | null
  onDecide: (lineId: string, action: Aksi) => void
  onUpdate: (lineId: string, action: "RETRY_MESSAGE" | "REMIND_SUPPLIER") => Promise<void> | void
}) {
  const [kelompok, setKelompok] = useState<Kelompok | null>("PERLU_TINDAKAN")
  const [cari, setCari] = useState("")
  const [cariDebounced, setCariDebounced] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ items: PesananSupplier[]; total: number; pages: number; counts: Record<Kelompok, number> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [dibuka, setDibuka] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pilihanAwal = useRef(false)
  const { ask, dialog } = useConfirm()
  const [rincian, setRincian] = useState<string | null>(null)
  const [formManual, setFormManual] = useState(false)
  const [info, setInfo] = useState("")

  // Tautan "Lihat pesanan" dari halaman lain membuka satu pesanan saja.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("orderId")
    if (!id) return
    const timer = window.setTimeout(() => { setOrderId(id); setDibuka(id) }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { setCariDebounced(cari.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [cari])

  const muat = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const params = new URLSearchParams({ page: String(page), perPage: "10" })
    if (orderId) params.set("id", orderId)
    else {
      if (kelompok) params.set("group", kelompok)
      if (cariDebounced) params.set("q", cariDebounced)
    }
    const response = await fetch(`/api/purchase-orders?${params}`, { cache: "no-store" }).catch(() => null)
    if (response?.ok) {
      const hasil = await response.json()
      setData(hasil)
      // Saat pertama dibuka dan tidak ada yang perlu ditindak, langsung tampilkan yang menunggu.
      if (!pilihanAwal.current && !orderId) {
        pilihanAwal.current = true
        if (kelompok === "PERLU_TINDAKAN" && hasil.counts.PERLU_TINDAKAN === 0 && hasil.total === 0) setKelompok(null)
      }
    }
    setLoading(false)
  }, [page, kelompok, cariDebounced, orderId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void muat() }, 0)
    return () => window.clearTimeout(timer)
  }, [muat, refreshKey])
  useLiveRefresh(() => { void muat(true) }, 10_000)

  function tampilkanSemua() {
    setOrderId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("orderId")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
  }

  return <div className="space-y-3" ref={listRef}>
    {dialog}
    {rincian && <RincianPesanan orderId={rincian} onClose={() => setRincian(null)} />}
    {formManual && <FormPesananManual onClose={() => setFormManual(false)} onDone={(kode) => {
      setFormManual(false); setInfo(`Pesanan manual #${kode} tersimpan dan langsung terkonfirmasi. Catat Barang Masuk saat barangnya tiba.`); void muat()
    }} />}
    {info && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{info}</p>}
    {orderId ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <span>Menampilkan satu pesanan.</span>
        <button type="button" onClick={tampilkanSemua} className="font-semibold underline">Tampilkan semua pesanan</button>
      </div>
    ) : (
      // Toolbar sama dengan tab Data Supplier: cari + filter tersegmen.
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={cari} onChange={(event) => setCari(event.target.value)} placeholder="Cari pesanan, supplier, atau bahan…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" />
          </div>
          {canManage && (
            <button type="button" onClick={() => setFormManual(true)}
              title="Untuk pesanan yang dibuat di luar Pantau (mis. lewat WA pribadi), supaya Barang Masuk dan stoknya tetap tertaut."
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              <Plus className="h-4 w-4" /> Catat pesanan manual
            </button>
          )}
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {TAB.map((tab) => {
            const aktif = kelompok === tab.key
            const jumlah = tab.key ? data?.counts[tab.key] : undefined
            return <button key={tab.label} type="button" onClick={() => { setKelompok(tab.key); setPage(1) }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition sm:flex-1 sm:justify-center sm:py-1.5 ${aktif ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              {tab.label}
              {jumlah ? <span className={`rounded-full px-1.5 text-[10px] ${tab.key === "PERLU_TINDAKAN" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"}`}>{jumlah}</span> : null}
            </button>
          })}
        </div>
      </div>
    )}

    <div className={`space-y-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      {data && data.items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <PackageCheck className="h-7 w-7 text-slate-400" />
          </div>
          <p className="mt-4 font-semibold text-slate-700">{cariDebounced ? "Pesanan tidak ditemukan" : "Tidak ada pesanan di sini"}</p>
          <p className="mt-1 text-sm text-slate-400">{cariDebounced ? "Coba kata pencarian lain." : "Buat pesanan dari bahan yang perlu dibeli."}</p>
        </div>
      ) : data?.items.map((order) => {
        const aktif = order.lines.filter((line) => line.status === "ACTIVE")
        const pertama = aktif[0]
        const waGagal = pertama && ["FAILED", "DEAD"].includes(pertama.messageStatus)
        const waTidakPasti = pertama?.messageStatus === "UNCERTAIN"
        const perluPengingat = pertama && aktif.some((line) => line.supplierReplyStatus === "WAITING" && line.responseOverdueAt)
        const pengingatBerjalan = pertama && ["PENDING", "PROCESSING"].includes(infoBaris.get(pertama.id)?.lastReminderStatus ?? "")
        const sibuk = order.lines.some((line) => line.id === busyId)
        return <div key={order.id} className="space-y-2">
          <PesananSupplierCard order={order} onBerubah={() => { void muat(true) }} actions={<>
            <button type="button" onClick={() => setRincian(order.id)} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"><FileText className="h-4 w-4" />Rincian &amp; dokumen</button>
            {canManage && waGagal && (
              <button type="button" disabled={sibuk} onClick={() => void onUpdate(pertama.id, "RETRY_MESSAGE")}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-blue-600 disabled:opacity-50">
                <RotateCcw className={`h-4 w-4 ${sibuk ? "animate-spin" : ""}`} /> Periksa koneksi &amp; kirim ulang
              </button>
            )}
            {canManage && waTidakPasti && (
              <button type="button" disabled={sibuk} onClick={() => ask({
                title: "Periksa WhatsApp dahulu",
                message: `Buka WhatsApp dan pastikan pesanan #${order.shortCode} benar-benar belum sampai ke ${order.supplier.name}. Kalau ternyata sudah ada, jangan kirim ulang — supplier bisa mengira ada dua pesanan.`,
                confirmLabel: "Sudah diperiksa, kirim ulang",
                cancelLabel: "Batal",
                onConfirm: () => onUpdate(pertama.id, "RETRY_MESSAGE"),
              })} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-amber-700 disabled:opacity-50">
                <MessageCircle className="h-4 w-4" /> Periksa WA, lalu kirim ulang
              </button>
            )}
            {canManage && perluPengingat && !waGagal && (
              <button type="button" disabled={sibuk || pengingatBerjalan} onClick={() => void onUpdate(pertama.id, "REMIND_SUPPLIER")}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-amber-700 disabled:opacity-50">
                <MessageCircle className="h-4 w-4" /> Kirim pengingat
              </button>
            )}
            {canManage && aktif.length > 0 && (
              <button type="button" onClick={() => setDibuka(dibuka === order.id ? null : order.id)}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-600">
                {dibuka === order.id ? "Tutup kelola" : "Kelola bahan"}
              </button>
            )}
          </>} />
          {canManage && dibuka === order.id && aktif.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
              <p className="text-xs text-slate-600">
                Keputusan per bahan. Bahan lain di pesanan ini tidak ikut berubah.
              </p>
              {aktif.map((line) => {
                const info = infoBaris.get(line.id)
                const status = statusBaris(line)
                const bolehAlih = line.supplierReplyStatus === "UNAVAILABLE"
                  || line.supplierReplyStatus === "WAITING" && Boolean(line.responseOverdueAt)
                  || line.supplierReplyStatus === "PARTIAL" && line.promisedQuantity != null
                    && Number(line.receivedQuantity) >= Number(line.promisedQuantity)
                return <div key={line.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{line.item.name}</p>
                      <p className="text-xs text-slate-500">{jumlahDipesan(line)} · <Link href={`/dashboard/audit/purchase/${line.id}`} className="font-semibold text-blue-600">Riwayat</Link></p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.warna}`}>{status.teks}</span>
                  </div>
                  {info?.nextSupplier && !bolehAlih && (
                    <p className="mt-2 text-xs text-slate-500">
                      {line.supplierReplyStatus === "WAITING"
                        ? `Tunggu batas balasan${line.responseDueAt ? ` sampai ${new Date(line.responseDueAt).toLocaleString("id-ID")}` : " dimulai setelah WA terkirim"}.`
                        : line.supplierReplyStatus === "NEEDS_REVIEW"
                          ? "Tinjau balasan supplier sebelum beralih."
                          : line.supplierReplyStatus === "PARTIAL" && line.promisedQuantity != null
                            ? `Terima dahulu ${Number(line.promisedQuantity).toLocaleString("id-ID")} ${line.item.unit} yang disanggupi supplier.`
                          : "Supplier sudah menyanggupi atau mengirim bahan ini."}
                    </p>
                  )}
                  {info?.nextSupplier && bolehAlih && (
                    <p className="mt-2 text-xs text-slate-500">Pantau membatalkan bahan ini ke supplier lama dahulu, lalu menghubungi {info.nextSupplier.name}.</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={line.id === busyId || !info?.nextSupplier || !bolehAlih}
                      title={!info?.nextSupplier ? "Tidak ada supplier berikutnya untuk bahan ini"
                        : !bolehAlih ? "Pergantian tersedia setelah tenggat balasan atau jawaban stok kosong" : undefined}
                      onClick={() => onDecide(line.id, "ESCALATE")}
                      className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                      {info?.nextSupplier ? `Alihkan ke ${info.nextSupplier.name}` : "Tidak ada supplier lain"}
                    </button>
                    <button type="button" disabled={line.id === busyId} onClick={() => onDecide(line.id, "STOP")}
                      className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                      {(info?.outstandingQuantity ?? 1) > 0 ? "Hentikan" : "Tutup, sudah lengkap"}
                    </button>
                    <button type="button" disabled={line.id === busyId} onClick={() => onDecide(line.id, "CANCEL")}
                      className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">
                      Batalkan
                    </button>
                  </div>
                </div>
              })}
              <Link href={`/dashboard/goods-receipt?purchaseOrderId=${order.id}`} className="inline-flex text-xs font-semibold text-emerald-700">
                {order.dikonfirmasi ? "Catat Barang Masuk" : "Barang sudah tiba tanpa konfirmasi supplier? Catat Barang Masuk"}
              </Link>
            </div>
          )}
        </div>
      })}
    </div>
    {data && data.pages > 1 && (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Pagination page={page} pages={data.pages} total={data.total} perPage={10} label="pesanan" loading={loading} scrollToRef={listRef} onPageChange={setPage} />
      </div>
    )}
  </div>
}
