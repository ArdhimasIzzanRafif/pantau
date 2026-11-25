"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { AppPortal } from "@/components/ui/app-portal"
import { parseTransferQuantity } from "@/lib/transfer-quantity"

type Opsi = { id: string; name: string }
type Bahan = { id: string; name: string; unit: string; isTrackable: boolean; isActive: boolean }
type Pemetaan = { itemId: string; supplierItemName: string | null; purchaseUnit: string | null; purchaseUnitSize: string | number | null }

/**
 * "Catat pesanan manual": untuk pesanan yang dibuat DI LUAR Pantau (mis. owner
 * memesan lewat WA pribadi). Tidak ada WA yang dikirim; pesanan langsung
 * terkonfirmasi supaya Barang Masuk, stok, dan pembayarannya tetap tercatat.
 */
export function FormPesananManual({ onClose, onDone }: { onClose: () => void; onDone: (shortCode: string) => void }) {
  const [suppliers, setSuppliers] = useState<Opsi[]>([])
  const [gudang, setGudang] = useState<Opsi[]>([])
  const [bahan, setBahan] = useState<Bahan[]>([])
  const [pemetaan, setPemetaan] = useState<Pemetaan[]>([])
  const [supplierId, setSupplierId] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [baris, setBaris] = useState<Array<{ itemId: string; quantity: string }>>([{ itemId: "", quantity: "" }])
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    void Promise.all([
      fetch("/api/suppliers?active=true").then((r) => r.ok ? r.json() : []),
      fetch("/api/locations?type=WAREHOUSE").then((r) => r.ok ? r.json() : []),
      fetch("/api/inventory").then((r) => r.ok ? r.json() : []),
    ]).then(([s, l, i]) => {
      setSuppliers(s); setGudang(l)
      setBahan((i as Bahan[]).filter((row) => row.isTrackable && row.isActive))
      if ((l as Opsi[]).length === 1) setWarehouseId((l as Opsi[])[0].id)
    }).catch(() => setError("Data belum dapat dimuat"))
  }, [])
  useEffect(() => {
    if (!supplierId || !warehouseId) return
    void fetch(`/api/item-suppliers?${new URLSearchParams({ supplierId, locationId: warehouseId })}`)
      .then(async (r) => setPemetaan(r.ok ? await r.json() : []))
      .catch(() => setPemetaan([]))
  }, [supplierId, warehouseId])

  const satuan = (itemId: string) => {
    const map = pemetaan.find((row) => row.itemId === itemId)
    const item = bahan.find((row) => row.id === itemId)
    return map?.purchaseUnit && Number(map.purchaseUnitSize) > 0 ? `${map.purchaseUnit} (isi ${Number(map.purchaseUnitSize)} ${item?.unit ?? ""})` : item?.unit ?? ""
  }
  const terisi = baris.filter((row) => row.itemId)
  const salah = terisi.some((row) => parseTransferQuantity(row.quantity) == null)
  // Bahan yang sudah dipetakan ke supplier ini ditaruh paling atas.
  const urutBahan = [...bahan].sort((a, b) => Number(!pemetaan.some((m) => m.itemId === a.id)) - Number(!pemetaan.some((m) => m.itemId === b.id)) || a.name.localeCompare(b.name))

  async function simpan(event: React.FormEvent) {
    event.preventDefault()
    if (!supplierId || !warehouseId || terisi.length === 0 || salah) return
    setBusy(true); setError("")
    try {
      const res = await fetch("/api/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: true, supplierId, warehouseId, notes, lines: terisi.map((row) => ({ itemId: row.itemId, quantity: Number(row.quantity) })) }) })
      const data = await res.json().catch(() => ({})) as { error?: string; shortCode?: string }
      if (!res.ok) { setError(data.error ?? "Pesanan gagal disimpan"); return }
      onDone(data.shortCode ?? "")
    } catch { setError("Koneksi terputus. Periksa daftar pesanan sebelum mencoba lagi.") }
    finally { setBusy(false) }
  }

  return <AppPortal><div className="app-overlay mobile-fullscreen-dialog z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="manual-order-title">
    <button type="button" aria-label="Tutup" className="absolute inset-0 bg-slate-950/55" onClick={() => { if (!busy) onClose() }} />
    <form onSubmit={simpan} className="mobile-dialog-panel relative z-10 flex max-h-[calc(100%-3rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 id="manual-order-title" className="text-lg font-bold text-slate-900">Catat pesanan manual</h2>
          <p className="mt-1 text-sm text-slate-500">Untuk pesanan yang sudah dibuat di luar Pantau (mis. lewat WA pribadi). Tidak ada WA yang dikirim ke supplier.</p>
        </div>
        <button type="button" disabled={busy} aria-label="Tutup" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100"><X className="h-5 w-5" /></button>
      </div>
      <div className="mobile-dialog-scroll space-y-4 overflow-y-auto overscroll-contain p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Supplier
            <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base">
              <option value="">Pilih supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Dikirim ke gudang
            <select required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base">
              <option value="">Pilih gudang</option>{gudang.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Bahan yang dipesan</p>
          {baris.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_6rem_auto] items-start gap-2">
              <div className="min-w-0">
                <select value={row.itemId} aria-label={`Bahan ${index + 1}`} onChange={(e) => setBaris(baris.map((b, j) => j === index ? { ...b, itemId: e.target.value } : b))}
                  className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                  <option value="">Pilih bahan</option>
                  {urutBahan.filter((item) => item.id === row.itemId || !baris.some((b) => b.itemId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                {row.itemId && <p className="mt-1 text-[11px] text-slate-500">Satuan: {satuan(row.itemId)}</p>}
              </div>
              <input type="number" inputMode="decimal" min="0" step="0.001" value={row.quantity} placeholder="Jumlah" aria-label={`Jumlah bahan ${index + 1}`}
                onChange={(e) => setBaris(baris.map((b, j) => j === index ? { ...b, quantity: e.target.value } : b))}
                className="h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base" />
              <button type="button" aria-label="Hapus baris" disabled={baris.length === 1} onClick={() => setBaris(baris.filter((_, j) => j !== index))}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setBaris([...baris, { itemId: "", quantity: "" }])} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600"><Plus className="h-4 w-4" /> Tambah bahan</button>
        </div>
        <label className="block text-sm font-medium text-slate-700">Catatan (opsional)
          <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. dipesan owner lewat WA pribadi, bayar COD" className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base" />
        </label>
        {salah && <p className="text-sm text-red-600">Jumlah setiap bahan harus lebih dari 0.</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
      <div className="mobile-dialog-actions grid grid-cols-2 gap-3 border-t border-slate-100 p-4">
        <button type="button" disabled={busy} onClick={onClose} className="min-h-12 rounded-xl border border-slate-200 text-sm font-semibold">Batal</button>
        <button type="submit" disabled={busy || !supplierId || !warehouseId || terisi.length === 0 || salah} className="min-h-12 rounded-xl bg-blue-600 px-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan pesanan"}</button>
      </div>
    </form>
  </div></AppPortal>
}
