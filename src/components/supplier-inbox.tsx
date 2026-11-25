"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Inbox, Paperclip } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { RincianPesanan } from "@/components/purchase-order-detail"

type Perintah = "READY" | "PARTIAL" | "UNAVAILABLE" | "SHIPPED"
type PerintahBaris = { lineId: string; command: Perintah; quantity: number | null }
type Usulan =
  | { tipe: "PERINTAH"; orderId: string; perintah: PerintahBaris[]; alasan: string }
  | { tipe: "PILIH_PESANAN"; orderIds: string[]; perintahSemua: Perintah | null; alasan: string }
  | { tipe: "BAYAR"; orderId: string; nominal: number | null; alasan: string }
  | { tipe: "TANYA"; orderId: string; alasan: string }
  | { tipe: "LAMPIRAN"; orderId: string | null; alasan: string }
  | { tipe: "TAUTKAN_NOMOR"; supplierId: string | null; alasan: string }

type Pesan = {
  id: string; message: string; receivedAt: string; senderName: string | null; senderPhone: string
  processingStatus: "RECEIVED" | "MATCHED" | "NEEDS_REVIEW" | "REJECTED" | "CLOSED"
  processingNote: string | null; kind: string | null; attachmentUrl: string | null
  purchaseOrderId: string | null; suggestion: Usulan | null
  supplier: { id: string; name: string } | null
  purchaseRequest: { id: string; orderCode: string; purchaseOrderId: string | null; item: { name: string } } | null
  reviewAction: string | null
}
type Baris = { id: string; quantity: string | number; inputQuantity: string | number | null; inputUnit: string | null; supplierReplyStatus: string; item: { name: string; unit: string } }
type Pesanan = { id: string; shortCode: string; supplierId: string; supplier: { name: string }; location: { name: string }; lines: Baris[] }
type Data = { items: Pesan[]; total: number; pages: number; counts: { review: number }; orders: Pesanan[]; suppliers: Array<{ id: string; name: string }> }

const waktu = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })
const LABEL: Record<Perintah, string> = { READY: "Siap", PARTIAL: "Sebagian", UNAVAILABLE: "Kosong", SHIPPED: "Sudah dikirim" }
const satuan = (line: Baris) => line.inputUnit ?? line.item.unit
const fmt = (n: number | string) => Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 })

function ringkasPerintah(order: Pesanan, perintah: PerintahBaris[]) {
  return perintah.map((p) => {
    const line = order.lines.find((l) => l.id === p.lineId)
    if (!line) return null
    const jumlah = p.quantity != null ? ` ${fmt(p.quantity)} ${satuan(line)}` : ""
    return `${line.item.name} → ${LABEL[p.command].toLowerCase()}${jumlah}`
  }).filter(Boolean).join(" · ")
}

/** Editor keputusan per bahan; tombol cepat untuk semua bahan sekaligus. */
function EditorPerintah({ order, awal, busy, onApply, onBatal }: {
  order: Pesanan; awal: PerintahBaris[]; busy: boolean; onApply: (perintah: PerintahBaris[]) => void; onBatal?: () => void
}) {
  const [isian, setIsian] = useState<Record<string, { command: Perintah | ""; quantity: string }>>(() =>
    Object.fromEntries(order.lines.map((line) => {
      const p = awal.find((row) => row.lineId === line.id)
      return [line.id, { command: p?.command ?? "", quantity: p?.quantity != null ? String(p.quantity) : "" }]
    })))
  const semua = (command: Perintah) => setIsian(Object.fromEntries(order.lines.map((line) => [line.id, { command, quantity: "" }])))
  const perintah: PerintahBaris[] = order.lines.flatMap((line) => {
    const v = isian[line.id]
    return v?.command ? [{ lineId: line.id, command: v.command, quantity: v.quantity.trim() ? Number(v.quantity) : null }] : []
  })
  const salah = perintah.some((p) => (p.command === "PARTIAL" && !(Number(p.quantity) > 0)) || (p.quantity != null && !(p.quantity > 0)))
  return <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap gap-1.5">
      <span className="text-xs text-slate-500">Semua bahan:</span>
      {(["READY", "UNAVAILABLE", "SHIPPED"] as Perintah[]).map((c) => (
        <button key={c} type="button" onClick={() => semua(c)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">{LABEL[c]}</button>
      ))}
    </div>
    {order.lines.map((line) => {
      const v = isian[line.id] ?? { command: "", quantity: "" }
      return <div key={line.id} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_9rem_6rem]">
        <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{line.item.name}</p>
          <p className="text-[11px] text-slate-500">dipesan {fmt(line.inputQuantity ?? line.quantity)} {satuan(line)}</p></div>
        <select value={v.command} aria-label={`Tindakan ${line.item.name}`} onChange={(e) => setIsian({ ...isian, [line.id]: { ...v, command: e.target.value as Perintah | "" } })}
          className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-xs">
          <option value="">Tidak berubah</option>
          {(Object.keys(LABEL) as Perintah[]).map((c) => <option key={c} value={c}>{LABEL[c]}</option>)}
        </select>
        {(v.command === "PARTIAL" || v.command === "SHIPPED") && (
          <input type="number" min="0" step="0.001" inputMode="decimal" value={v.quantity} placeholder={v.command === "SHIPPED" ? "semua" : "jumlah"}
            aria-label={`Jumlah ${line.item.name} (${satuan(line)})`} onChange={(e) => setIsian({ ...isian, [line.id]: { ...v, quantity: e.target.value } })}
            className="col-span-2 h-10 rounded-lg border border-slate-200 px-2 text-sm sm:col-span-1" />
        )}
      </div>
    })}
    {salah && <p className="text-xs text-red-600">Isi jumlah lebih dari 0 untuk bahan “Sebagian”.</p>}
    <div className="flex flex-wrap gap-2 pt-1">
      <button type="button" disabled={busy || perintah.length === 0 || salah} onClick={() => onApply(perintah)}
        className="min-h-10 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-50">Terapkan ke #{order.shortCode}</button>
      {onBatal && <button type="button" onClick={onBatal} className="min-h-10 rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-600">Batal</button>}
    </div>
  </div>
}

function KartuPesan({ pesan, data, canManage, onSelesai }: { pesan: Pesan; data: Data; canManage: boolean; onSelesai: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [ubah, setUbah] = useState(false)
  const [pilihan, setPilihan] = useState<string>("")
  const [supplierId, setSupplierId] = useState(pesan.suggestion?.tipe === "TAUTKAN_NOMOR" ? pesan.suggestion.supplierId ?? "" : "")
  const [rincian, setRincian] = useState<string | null>(null)
  const u = pesan.suggestion
  const orderId = pesan.purchaseOrderId ?? pesan.purchaseRequest?.purchaseOrderId ?? (u && "orderId" in u ? u.orderId : null)
  const order = data.orders.find((o) => o.id === (pilihan || orderId))
  const tinjau = pesan.processingStatus === "NEEDS_REVIEW"

  async function kirim(body: Record<string, unknown>) {
    setBusy(true); setError("")
    const res = await fetch(`/api/supplier-inbox/${pesan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
    const hasil = res ? await res.json().catch(() => ({})) as { error?: string } : { error: "Koneksi terputus" }
    setBusy(false)
    if (!res?.ok) { setError(hasil.error ?? "Gagal memproses"); return }
    onSelesai()
  }
  const terapkan = (perintah: PerintahBaris[], id = order?.id) => id && kirim({ action: "TERAPKAN", orderId: id, perintah })
  const selesai = (note: string) => kirim({ action: "SELESAI", note })
  const labelSelesai = u?.tipe === "TANYA" ? "Sudah dijawab" : u?.tipe === "BAYAR" ? "Sudah dicatat" : u?.tipe === "LAMPIRAN" ? "Sudah ditangani" : "Abaikan"

  return <article className={`space-y-3 rounded-2xl border bg-white p-4 ${tinjau ? "border-amber-200" : "border-slate-200"}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{pesan.supplier?.name ?? "Nomor belum terdaftar"}
          <span className="ml-1.5 font-normal text-slate-500">+{pesan.senderPhone}{pesan.senderName ? ` · ${pesan.senderName}` : ""}</span></p>
        <p className="text-xs text-slate-500">{waktu.format(new Date(pesan.receivedAt))}{order ? ` · pesanan #${order.shortCode} (${order.location.name})` : ""}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tinjau ? "bg-amber-50 text-amber-800" : pesan.processingStatus === "MATCHED" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
        {tinjau ? "Perlu ditinjau" : pesan.processingStatus === "MATCHED" ? "Diproses" : "Selesai"}
      </span>
    </div>
    <p className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-50 px-3 py-2 text-sm text-slate-800">{pesan.message}</p>
    {pesan.attachmentUrl && <a href={pesan.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600"><Paperclip className="h-3.5 w-3.5" /> Buka lampiran</a>}
    {(u?.alasan || pesan.processingNote) && <p className="text-xs text-slate-600">{u?.alasan ?? pesan.processingNote}</p>}

    {tinjau && canManage && <div className="space-y-2">
      {/* Usulan sistem: satu klik. */}
      {u?.tipe === "PERINTAH" && order && !ubah && (
        <div className="rounded-xl bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-900">Usulan: {ringkasPerintah(order, u.perintah)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => terapkan(u.perintah, u.orderId)} className="min-h-10 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-50">Terapkan usulan</button>
            <button type="button" onClick={() => setUbah(true)} className="min-h-10 rounded-full border border-blue-200 bg-white px-4 text-xs font-semibold text-blue-700">Ubah</button>
          </div>
        </div>
      )}
      {u?.tipe === "PILIH_PESANAN" && (
        <div className="space-y-1.5 rounded-xl bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-900">Pesanan yang dimaksud:</p>
          {u.orderIds.map((id) => data.orders.find((o) => o.id === id)).filter((o): o is Pesanan => Boolean(o)).map((o) => (
            <label key={o.id} className="flex items-start gap-2 text-xs text-slate-700">
              <input type="radio" name={`pilih-${pesan.id}`} checked={pilihan === o.id} onChange={() => { setPilihan(o.id); setUbah(true) }} className="mt-0.5" />
              <span><b>#{o.shortCode}</b> · {o.location.name} · {o.lines.map((l) => l.item.name).join(", ")}</span>
            </label>
          ))}
        </div>
      )}
      {u?.tipe === "TAUTKAN_NOMOR" && !pesan.supplier && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blue-50 p-3">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier pemilik nomor" className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-xs">
            <option value="">Pilih supplier</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" disabled={busy || !supplierId} onClick={() => kirim({ action: "TAUTKAN_NOMOR", supplierId })} className="min-h-10 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white disabled:opacity-50">Tautkan nomor ke supplier</button>
        </div>
      )}
      {/* Keputusan sendiri per bahan, bila usulan kurang tepat atau tidak ada. */}
      {order && ubah && (
        <EditorPerintah key={order.id} order={order} busy={busy}
          awal={u?.tipe === "PERINTAH" ? u.perintah
            : u?.tipe === "PILIH_PESANAN" && u.perintahSemua ? order.lines.map((l) => ({ lineId: l.id, command: u.perintahSemua!, quantity: null })) : []}
          onApply={(perintah) => terapkan(perintah)} onBatal={() => setUbah(false)} />
      )}
      {order && !ubah && u?.tipe !== "PERINTAH" && u?.tipe !== "PILIH_PESANAN" && (
        <button type="button" onClick={() => setUbah(true)} className="text-xs font-semibold text-blue-600">Ubah status bahan pesanan ini…</button>
      )}
      <div className="flex flex-wrap gap-2">
        {orderId && <button type="button" onClick={() => setRincian(orderId)} className="min-h-10 rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-700">{u?.tipe === "LAMPIRAN" ? "Unggah dokumen di pesanan" : "Buka pesanan"}</button>}
        <button type="button" disabled={busy} onClick={() => selesai(labelSelesai === "Abaikan" ? "Diabaikan" : labelSelesai)} className="min-h-10 rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-600 disabled:opacity-50">{labelSelesai}</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>}
    {rincian && <RincianPesanan orderId={rincian} onClose={() => setRincian(null)} />}
  </article>
}

/**
 * Kotak masuk supplier: semua pesan dari supplier, terutama yang menunggu
 * keputusan. "Fleksibel di depan, tegas di belakang" — tidak ada pesan yang
 * hilang, dan tidak ada perubahan pesanan dari tebakan.
 */
export function SupplierInbox({ canManage, onBerubah }: { canManage: boolean; onBerubah?: () => void }) {
  const [filter, setFilter] = useState<"review" | "all">("review")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const muat = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const res = await fetch(`/api/supplier-inbox?${new URLSearchParams({ filter, page: String(page) })}`, { cache: "no-store" }).catch(() => null)
    if (res?.ok) setData(await res.json())
    setLoading(false)
  }, [filter, page])
  useEffect(() => {
    const timer = window.setTimeout(() => { void muat() }, 0)
    return () => window.clearTimeout(timer)
  }, [muat])
  useLiveRefresh(() => { void muat(true) }, 10_000)

  const tab = (key: typeof filter, label: string, jumlah?: number) => (
    <button type="button" onClick={() => { setFilter(key); setPage(1) }}
      className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${filter === key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
      {label}{jumlah ? <span className={`ml-1.5 rounded-full px-1.5 ${filter === key ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{jumlah}</span> : null}
    </button>
  )

  return <div className="space-y-3" ref={listRef}>
    <div>
      <h2 className="font-semibold text-slate-900">Balasan supplier</h2>
      <p className="mt-1 text-sm text-slate-500">Periksa balasan yang membutuhkan konfirmasi Anda.</p>
    </div>
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {tab("review", "Perlu ditinjau", data?.counts.review)}
      {tab("all", "Semua pesan")}
    </div>
    <div className={`space-y-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      {data && data.items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center">
          <Inbox className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">{filter === "review" ? "Tidak ada yang perlu ditinjau" : "Belum ada pesan"}</p>
          <p className="mt-1 text-sm text-slate-400">Balasan supplier lewat WhatsApp akan muncul di sini.</p>
        </div>
      ) : data?.items.map((pesan) => (
        <KartuPesan key={`${pesan.id}:${pesan.processingStatus}`} pesan={pesan} data={data} canManage={canManage}
          onSelesai={() => { void muat(true); onBerubah?.() }} />
      ))}
    </div>
    {data && data.pages > 1 && (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Pagination page={page} pages={data.pages} total={data.total} perPage={15} label="pesan" loading={loading} scrollToRef={listRef} onPageChange={setPage} />
      </div>
    )}
  </div>
}
