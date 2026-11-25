"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, CheckCircle, Clock, Lock, PackageCheck, ShoppingCart, Truck, X } from "lucide-react"
import { AppPortal } from "@/components/ui/app-portal"

/** Satu baris (bahan) dalam pesanan supplier, seperti dikirim API. */
export type BarisPesanan = {
  id: string
  itemId: string
  status: "ACTIVE" | "FULFILLED" | "FAILED" | "CANCELLED"
  supplierReplyStatus: "WAITING" | "READY" | "PARTIAL" | "SHIPPED" | "UNAVAILABLE" | "NEEDS_REVIEW"
  messageStatus: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "UNCERTAIN" | "DEAD"
  lastMessageError: string | null
  providerDeliveryStatus: "UNKNOWN" | "PROVIDER_ACCEPTED" | "WHATSAPP_SENT" | "DELIVERED" | "READ" | "UNDELIVERED"
  responseDueAt: string | null
  responseOverdueAt: string | null
  // Angka Decimal dikirim Prisma sebagai string.
  quantity: string | number
  receivedQuantity: string | number
  promisedQuantity: string | number | null
  shippedQuantity: string | number | null
  supplierShippedAt: string | null
  inputQuantity: string | number | null
  inputUnit: string | null
  conversionFactor: string | number | null
  orderCode: string
  supplierLastMessage: string | null
  supplierLastMessageAt: string | null
  item: { id: string; name: string; unit: string }
}

export type PesananSupplier = {
  id: string
  shortCode: string
  urgency: "NORMAL" | "URGENT"
  notes: string | null
  createdAt: string
  supplier: { id: string; name: string; phone: string | null }
  location: { id: string; name: string }
  lines: BarisPesanan[]
  kelompok: "PERLU_TINDAKAN" | "MENUNGGU" | "PENGIRIMAN" | "SELESAI"
  label: string
  /// Supplier sudah memastikan barangnya (atau dikonfirmasi manual / pesanan manual).
  dikonfirmasi: boolean
  isManual: boolean
  manualConfirmedAt: string | null
  manualConfirmNote: string | null
  _count?: { documents: number }
}

const angka = (value: string | number | null) => value == null ? "-" : Number(value).toLocaleString("id-ID", { maximumFractionDigits: 3 })

// Warna & ikon mengikuti kartu transfer: kotak ikon dan badge status sewarna.
const gayaKelompok: Record<PesananSupplier["kelompok"], { badge: string; kotak: string; ikon: string; Ikon: typeof Clock }> = {
  PERLU_TINDAKAN: { badge: "bg-amber-50 text-amber-700", kotak: "bg-amber-50", ikon: "text-amber-600", Ikon: AlertTriangle },
  MENUNGGU: { badge: "bg-slate-100 text-slate-600", kotak: "bg-slate-100", ikon: "text-slate-500", Ikon: Clock },
  PENGIRIMAN: { badge: "bg-blue-50 text-blue-700", kotak: "bg-blue-50", ikon: "text-blue-600", Ikon: Truck },
  SELESAI: { badge: "bg-emerald-50 text-emerald-700", kotak: "bg-emerald-50", ikon: "text-emerald-600", Ikon: CheckCircle },
}
const waktuSingkat = (value: string) => new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

/** Jumlah dipesan, dalam satuan beli supplier bila ada: "2 dus (200 pcs)". */
export function jumlahDipesan(line: BarisPesanan) {
  const dasar = `${angka(line.quantity)} ${line.item.unit}`
  const faktor = Number(line.conversionFactor ?? 1)
  if (line.inputUnit && line.inputQuantity != null && faktor !== 1) return `${angka(line.inputQuantity)} ${line.inputUnit} (${dasar})`
  return dasar
}

/** Keadaan satu bahan dalam pesanan, dibaca dari fakta penerimaan lebih dulu. */
export function statusBaris(line: BarisPesanan): { teks: string; warna: string } {
  const dipesan = Number(line.quantity), diterima = Number(line.receivedQuantity), unit = line.item.unit
  if (line.status === "FULFILLED" || (dipesan > 0 && diterima >= dipesan)) return { teks: "Diterima", warna: "bg-emerald-50 text-emerald-700" }
  if (line.status === "CANCELLED") return { teks: "Dibatalkan", warna: "bg-slate-100 text-slate-500" }
  if (line.status === "FAILED") return { teks: "Dihentikan", warna: "bg-slate-100 text-slate-500" }
  if (diterima > 0) return { teks: `Diterima ${angka(diterima)} dari ${angka(dipesan)} ${unit}`, warna: "bg-amber-50 text-amber-800" }
  if (line.supplierShippedAt != null || line.shippedQuantity != null) {
    return { teks: line.shippedQuantity != null ? `Dikirim ${angka(line.shippedQuantity)} ${unit}` : "Dikirim", warna: "bg-blue-50 text-blue-700" }
  }
  switch (line.supplierReplyStatus) {
    case "READY": return { teks: "Siap", warna: "bg-emerald-50 text-emerald-700" }
    case "PARTIAL": return { teks: `Sanggup ${angka(line.promisedQuantity)} ${unit}`, warna: "bg-orange-50 text-orange-700" }
    case "UNAVAILABLE": return { teks: "Kosong", warna: "bg-red-50 text-red-700" }
    case "NEEDS_REVIEW": return { teks: "Perlu ditinjau", warna: "bg-violet-50 text-violet-700" }
    default: return { teks: "Menunggu", warna: "bg-slate-100 text-slate-600" }
  }
}

// Sama dengan tombol footer dialog Pantau (Batal | Konfirmasi Diterima).
const tombolTerima = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
/** Gaya tombol pendamping (putih berbingkai), dipakai halaman lewat prop `aksiSekunder`. */
export const tombolSekunder = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"

/** Penerimaan normal boleh dicatat setelah supplier mengonfirmasi (lihat sudahDikonfirmasi di server). */
export function sisaTerkonfirmasi(line: BarisPesanan) {
  const ordered = Number(line.quantity)
  const received = Number(line.receivedQuantity)
  const orderRemaining = Math.max(0, ordered - received)
  const supplierLimit = line.shippedQuantity != null
    ? Number(line.shippedQuantity)
    : line.promisedQuantity != null ? Number(line.promisedQuantity) : ordered
  return Math.min(orderRemaining, Math.max(0, supplierLimit - received))
}

export function bisaDiterima(order: PesananSupplier) {
  return order.dikonfirmasi && order.lines.some((line) => line.status === "ACTIVE" && sisaTerkonfirmasi(line) > 0)
}

/**
 * "Tandai sudah dikonfirmasi": supplier memastikan lewat telepon/WA pribadi.
 * Wajib menulis caranya, supaya tercatat siapa yang menandai dan atas dasar apa.
 */
export function DialogKonfirmasiManual({ order, onClose, onDone }: { order: PesananSupplier; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function simpan(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError("")
    const res = await fetch(`/api/purchase-orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONFIRM_MANUAL", note }) }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) as { error?: string } : { error: "Koneksi terputus" }
    setBusy(false)
    if (!res?.ok) { setError(data.error ?? "Gagal menyimpan"); return }
    onDone()
  }
  return <AppPortal><div className="app-overlay z-[9000] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
    <button type="button" aria-label="Tutup" className="absolute inset-0 bg-slate-950/55" onClick={() => { if (!busy) onClose() }} />
    <form onSubmit={simpan} className="relative z-10 w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Tandai sudah dikonfirmasi</h2>
          <p className="mt-1 text-sm text-slate-500">Pesanan #{order.shortCode} ke {order.supplier.name}. Bahan yang belum dijawab dianggap disanggupi penuh.</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Tutup" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <label className="block text-sm font-medium text-slate-700">Supplier mengonfirmasi lewat apa?
        <input value={note} onChange={(e) => setNote(e.target.value)} required minLength={3} maxLength={300} placeholder="mis. lewat telepon dengan Pak Budi"
          className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-base" />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-slate-200 text-sm font-semibold">Batal</button>
        <button type="submit" disabled={busy || note.trim().length < 3} className="min-h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Tandai dikonfirmasi"}</button>
      </div>
    </form>
  </div></AppPortal>
}

function statusWa(order: PesananSupplier) {
  const aktif = order.lines.filter((line) => line.status === "ACTIVE")
  const line = aktif[0] ?? order.lines[0]
  if (!line) return null
  if (["FAILED", "DEAD"].includes(line.messageStatus)) return { teks: `WA gagal terkirim${line.lastMessageError ? `: ${line.lastMessageError}` : ""}`, warna: "text-red-600" }
  if (line.messageStatus === "UNCERTAIN") return { teks: "Status WA tidak pasti. Periksa WhatsApp sebelum mengirim ulang.", warna: "text-amber-700" }
  if (["PENDING", "PROCESSING"].includes(line.messageStatus)) return { teks: "WA sedang dikirim…", warna: "text-slate-500" }
  const tahap: Record<BarisPesanan["providerDeliveryStatus"], string> = {
    UNKNOWN: "WA terkirim",
    PROVIDER_ACCEPTED: "WA diterima Fonnte",
    WHATSAPP_SENT: "WA terkirim ke supplier",
    DELIVERED: "WA sampai ke supplier",
    READ: "WA dibaca supplier",
    UNDELIVERED: "WA tidak sampai ke supplier",
  }
  return { teks: tahap[line.providerDeliveryStatus], warna: line.providerDeliveryStatus === "UNDELIVERED" ? "text-red-600" : "text-slate-500" }
}

/**
 * Kartu SATU pesanan supplier berisi banyak bahan. Dipakai di Transfer,
 * Supplier (tab Pesanan), dan Barang Masuk supaya tampilannya sama di mana pun.
 */
export function PesananSupplierCard({ order, actions, aksiSekunder, onTerima, onDarurat, onBerubah }: {
  order: PesananSupplier
  /// Tautan/aksi kecil di bawah kartu.
  actions?: React.ReactNode
  /// Tombol pendamping yang berdampingan sama lebar dengan "Catat penerimaan".
  aksiSekunder?: React.ReactNode
  /// Bila diisi, tombol "Catat penerimaan" membuka formulir di halaman ini (bukan tautan).
  onTerima?: () => void
  /// Sama, untuk jalur darurat "barang sudah datang tanpa konfirmasi".
  onDarurat?: () => void
  /// Dipanggil setelah pesanan ditandai dikonfirmasi manual.
  onBerubah?: () => void
}) {
  const [konfirmasi, setKonfirmasi] = useState(false)
  const wa = order.isManual ? { teks: "Dicatat manual — tidak ada WA ke supplier", warna: "text-slate-500" } : statusWa(order)
  const belumDibalas = order.lines.some((line) => line.status === "ACTIVE" && line.responseOverdueAt != null)
  const batasBalasan = order.lines.find((line) => line.status === "ACTIVE" && line.supplierReplyStatus === "WAITING")?.responseDueAt
  const balasanTerakhir = order.lines
    .filter((line) => line.supplierLastMessageAt)
    .sort((a, b) => b.supplierLastMessageAt!.localeCompare(a.supplierLastMessageAt!))[0]

  const tampilTerima = order.kelompok !== "SELESAI" && bisaDiterima(order)
  const gaya = gayaKelompok[order.kelompok]

  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-sm">
    <div className="space-y-3.5 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-3.5 sm:flex-1">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${gaya.kotak}`}>
            <ShoppingCart className={`h-5 w-5 ${gaya.ikon}`} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-slate-900">
              <span>{order.supplier.name}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{order.location.name}</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              #{order.shortCode} · {order.lines.length} bahan · {waktuSingkat(order.createdAt)}
              {order._count?.documents ? <> · {order._count.documents} dokumen</> : null}
            </div>
            {(order.urgency === "URGENT" || order.isManual) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {order.urgency === "URGENT" && <span className="inline-flex rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">Mendesak</span>}
                {order.isManual && <span className="inline-flex rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">Pesanan manual</span>}
              </div>
            )}
          </div>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${gaya.badge}`}>
          <gaya.Ikon className="h-3 w-3" />
          {order.label}
        </span>
      </div>

      {/* Bahan sebagai pil, sama seperti barang pada kartu transfer. */}
      <div className="flex flex-wrap gap-2">
        {order.lines.map((line) => {
          const status = statusBaris(line)
          const tidakAktif = line.status === "CANCELLED" || line.status === "FAILED"
          return <span key={line.id} className={`rounded-full px-3 py-1.5 text-xs font-medium ${status.warna} ${tidakAktif ? "line-through opacity-60" : ""}`}>
            {line.item.name} <strong>{jumlahDipesan(line)}</strong> · {status.teks}
          </span>
        })}
      </div>

      {balasanTerakhir && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Balasan supplier</span>
          <span className="text-slate-400"> · {waktuSingkat(balasanTerakhir.supplierLastMessageAt!)}</span>
          <p className="mt-0.5 text-sm text-slate-800">“{balasanTerakhir.supplierLastMessage}”</p>
        </div>
      )}
      {order.notes && <p className="text-xs italic text-slate-500">Catatan: {order.notes}</p>}

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
        {wa && <span className={wa.warna}>{wa.teks}</span>}
        {order.manualConfirmedAt && !order.isManual && <span>· Dikonfirmasi manual: {order.manualConfirmNote}</span>}
        {!belumDibalas && batasBalasan && <span>· Batas balasan {waktuSingkat(batasBalasan)}</span>}
      </div>
      {belumDibalas && <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">Belum dibalas sampai batas waktu. Ingatkan supplier atau coba supplier lain.</div>}

      {order.kelompok !== "SELESAI" && !order.dikonfirmasi && (
        // Penerimaan dikunci sampai supplier memastikan barangnya. Barang yang
        // ternyata sudah datang tetap bisa dicatat lewat jalur darurat.
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Lock className="h-3.5 w-3.5" /> Catat penerimaan terkunci — menunggu konfirmasi supplier</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setKonfirmasi(true)} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50">Tandai sudah dikonfirmasi</button>
            {onDarurat
              ? <button type="button" onClick={onDarurat} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50">Barang sudah datang tanpa konfirmasi</button>
              : <Link href={`/dashboard/goods-receipt?purchaseOrderId=${order.id}&darurat=1`} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-50">Barang sudah datang tanpa konfirmasi</Link>}
          </div>
        </div>
      )}
      {konfirmasi && <DialogKonfirmasiManual order={order} onClose={() => setKonfirmasi(false)} onDone={() => { setKonfirmasi(false); onBerubah?.() }} />}

      {/* Dua tombol sama lebar: pendamping di kiri, Catat penerimaan di kanan. */}
      {(tampilTerima || aksiSekunder) && (
        <div className={`grid gap-3 ${tampilTerima && aksiSekunder ? "grid-cols-2" : "grid-cols-1"}`}>
          {aksiSekunder}
          {tampilTerima && onTerima && <button type="button" onClick={onTerima} className={tombolTerima}><PackageCheck className="h-4 w-4" />Catat penerimaan</button>}
          {tampilTerima && !onTerima && <Link href={`/dashboard/goods-receipt?purchaseOrderId=${order.id}`} className={tombolTerima}><PackageCheck className="h-4 w-4" />Catat penerimaan</Link>}
        </div>
      )}
      {actions && <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{actions}</div>}
    </div>
  </div>
}
