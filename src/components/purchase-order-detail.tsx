"use client"

import { useCallback, useEffect, useState } from "react"
import { FileText, ImageIcon, Loader2, Upload, X } from "lucide-react"
import { AppPortal } from "@/components/ui/app-portal"
import { jumlahDipesan, statusBaris, type PesananSupplier } from "@/components/purchase-order-card"

type Dokumen = { id: string; kind: "INVOICE" | "FOTO" | "LAINNYA"; url: string; fileName: string | null; source: "WA" | "UPLOAD"; createdAt: string }
type Pesan = { id: string; message: string; receivedAt: string; senderName: string | null; processingStatus: string; processingNote: string | null; kind: string | null; attachmentUrl: string | null }
type Rincian = PesananSupplier & { documents: Dokumen[]; messages: Pesan[] }

const waktu = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })
const labelDokumen: Record<Dokumen["kind"], string> = { INVOICE: "Invoice", FOTO: "Foto", LAINNYA: "Dokumen" }
const labelStatus: Record<string, [string, string]> = {
  MATCHED: ["Diproses", "bg-emerald-50 text-emerald-700"],
  NEEDS_REVIEW: ["Perlu ditinjau", "bg-amber-50 text-amber-800"],
  CLOSED: ["Selesai", "bg-slate-100 text-slate-500"],
  REJECTED: ["Ditolak", "bg-red-50 text-red-700"],
  RECEIVED: ["Diterima", "bg-slate-100 text-slate-500"],
}

/** Rincian satu pesanan: bahan, percakapan dengan supplier, dan dokumennya. */
export function RincianPesanan({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [data, setData] = useState<Rincian | null>(null)
  const [error, setError] = useState("")
  const [jenis, setJenis] = useState<Dokumen["kind"]>("INVOICE")
  const [mengunggah, setMengunggah] = useState(false)

  const muat = useCallback(async () => {
    const res = await fetch(`/api/purchase-orders/${orderId}`, { cache: "no-store" }).catch(() => null)
    if (!res?.ok) { setError("Rincian pesanan belum dapat dimuat"); return }
    setData(await res.json())
  }, [orderId])
  useEffect(() => {
    const timer = window.setTimeout(() => { void muat() }, 0)
    return () => window.clearTimeout(timer)
  }, [muat])

  async function unggah(file: File) {
    setMengunggah(true); setError("")
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("folder", "purchase-docs")
      const up = await fetch("/api/upload", { method: "POST", body: form })
      const hasil = await up.json().catch(() => ({})) as { url?: string; error?: string }
      if (!up.ok || !hasil.url) { setError(hasil.error ?? "Gagal mengunggah file"); return }
      const res = await fetch(`/api/purchase-orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADD_DOCUMENT", url: hasil.url, kind: jenis, fileName: file.name }) })
      if (!res.ok) { setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Gagal menyimpan dokumen"); return }
      await muat()
    } finally { setMengunggah(false) }
  }

  return <AppPortal><div className="app-overlay mobile-fullscreen-dialog z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-4" role="dialog" aria-modal="true">
    <button type="button" aria-label="Tutup" className="absolute inset-0 bg-slate-950/55" onClick={onClose} />
    <div className="mobile-dialog-panel relative z-10 flex max-h-[calc(100%-3rem)] min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{data ? `Pesanan #${data.shortCode}` : "Rincian pesanan"}</h2>
          {data && <p className="mt-1 text-sm text-slate-500">{data.supplier.name} → {data.location.name} · {data.label}</p>}
        </div>
        <button type="button" aria-label="Tutup" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <div className="mobile-dialog-scroll space-y-5 overflow-y-auto overscroll-contain p-4">
        {!data && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {data && <>
          <section>
            <h3 className="text-sm font-semibold text-slate-800">Bahan</h3>
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {data.lines.map((line) => {
                const status = statusBaris(line)
                return <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{line.item.name}</p><p className="text-xs text-slate-500">{jumlahDipesan(line)}</p></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.warna}`}>{status.teks}</span>
                </li>
              })}
            </ul>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Dokumen ({data.documents.length})</h3>
              <div className="flex items-center gap-2">
                <select value={jenis} onChange={(e) => setJenis(e.target.value as Dokumen["kind"])} aria-label="Jenis dokumen" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs">
                  <option value="INVOICE">Invoice</option><option value="FOTO">Foto nota/barang</option><option value="LAINNYA">Lainnya</option>
                </select>
                <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white ${mengunggah ? "opacity-50" : ""}`}>
                  {mengunggah ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Unggah
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={mengunggah}
                    onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void unggah(file) }} />
                </label>
              </div>
            </div>
            {data.documents.length === 0
              ? <p className="mt-2 text-xs text-slate-500">Belum ada dokumen. Invoice dari WhatsApp tersimpan otomatis bila paket Fonnte meneruskan file; selain itu unggah di sini (JPG/PNG/PDF, maks 5MB).</p>
              : <ul className="mt-2 space-y-1.5">{data.documents.map((doc) => (
                <li key={doc.id}><a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm text-blue-700 hover:bg-slate-50">
                  {doc.url.endsWith(".pdf") || doc.kind === "INVOICE" ? <FileText className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{labelDokumen[doc.kind]}{doc.fileName ? ` · ${doc.fileName}` : ""}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{doc.source === "WA" ? "dari WA" : "diunggah"} · {waktu.format(new Date(doc.createdAt))}</span>
                </a></li>
              ))}</ul>}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-800">Percakapan dengan supplier</h3>
            {data.messages.length === 0
              ? <p className="mt-2 text-xs text-slate-500">Belum ada balasan dari supplier untuk pesanan ini.</p>
              : <ul className="mt-2 space-y-2">{data.messages.map((m) => {
                const [label, warna] = labelStatus[m.processingStatus] ?? labelStatus.RECEIVED
                return <li key={m.id} className="rounded-2xl rounded-tl-sm bg-slate-50 p-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{m.message}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                    <span>{m.senderName ?? "Supplier"} · {waktu.format(new Date(m.receivedAt))}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${warna}`}>{label}</span>
                  </div>
                  {m.processingNote && <p className="mt-1 text-[11px] text-slate-500">{m.processingNote}</p>}
                </li>
              })}</ul>}
          </section>
        </>}
      </div>
    </div>
  </div></AppPortal>
}
