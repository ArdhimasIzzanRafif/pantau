"use client"

import { useState, useEffect } from "react"
import { Plus, ArrowRight, CheckCircle, Clock, X, Package, Loader2, AlertTriangle, Camera } from "lucide-react"

type Location = { id: string; name: string }
type Item = { id: string; name: string; unit: string; packSize: number | null; packUnit: string | null }
type Transfer = {
  id: string
  status: "PENDING" | "SENT" | "RECEIVED" | "REJECTED"
  createdAt: string
  notes: string | null
  fromLocation: { name: string }
  toLocation: { name: string }
  items: Array<{ id: string; quantity: number; receivedQty: number | null; item: { name: string; unit: string } }>
}

type ReceiveModalItem = {
  id: string
  name: string
  unit: string
  sentQty: number
  receivedQty: string
}

type ReceiveModal = {
  transferId: string
  fromLocation: string
  toLocation: string
  items: ReceiveModalItem[]
}
type Row = { itemId: string; qty: string; inputUnit: "base" | "pack" }

const statusConfig = {
  PENDING: { label: "Disiapkan", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  SENT: { label: "Dikirim — Tunggu Konfirmasi", color: "bg-orange-100 text-orange-700", icon: ArrowRight },
  RECEIVED: { label: "Diterima", color: "bg-green-100 text-green-700", icon: CheckCircle },
  REJECTED: { label: "Ditolak", color: "bg-red-100 text-red-700", icon: X },
}

export default function TransferPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [inventoryItems, setInventoryItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "received">("all")
  const [fromId, setFromId] = useState("")
  const [toId, setToId] = useState("")
  const [notes, setNotes] = useState("")
  const [rows, setRows] = useState<Row[]>([{ itemId: "", qty: "", inputUnit: "base" }])
  const [error, setError] = useState("")
  const [receiveModal, setReceiveModal] = useState<ReceiveModal | null>(null)
  const [receiptNotes, setReceiptNotes] = useState("")
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState("")
  const [rejectModal, setRejectModal] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  // allBalances: { [locationId]: { [itemId]: qty_in_base_unit } }
  const [allBalances, setAllBalances] = useState<Record<string, Record<string, number>>>({})

  const stockBalances = allBalances[fromId] ?? {}

  async function fetchData() {
    setLoading(true)
    const [tRes, lRes, iRes, bRes] = await Promise.all([
      fetch("/api/transfers"),
      fetch("/api/locations"),
      fetch("/api/inventory"),
      fetch("/api/stock-balances"),
    ])
    if (tRes.ok) setTransfers(await tRes.json())
    if (lRes.ok) {
      const locs = await lRes.json()
      setLocations(locs)
      if (locs.length > 0) setFromId(locs[0].id)
      if (locs.length > 1) setToId(locs[1].id)
    }
    if (iRes.ok) setInventoryItems(await iRes.json())
    if (bRes.ok) {
      const balances = await bRes.json()
      const map: Record<string, Record<string, number>> = {}
      for (const b of balances) {
        if (!map[b.locationId]) map[b.locationId] = {}
        map[b.locationId][b.itemId] = Number(b.quantity)
      }
      setAllBalances(map)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function getItem(itemId: string): Item | undefined {
    return inventoryItems.find((it) => it.id === itemId)
  }

  function qtyInBase(row: Row): number {
    const q = Number(row.qty)
    if (!q || !row.itemId) return 0
    if (row.inputUnit === "pack") {
      const item = getItem(row.itemId)
      return q * (item?.packSize ?? 1)
    }
    return q
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError("")
    try {
    if (fromId === toId) {
      setError("Lokasi asal dan tujuan tidak boleh sama")
      setSubmitting(false)
      return
    }
    const validRows = rows.filter((r) => r.itemId && Number(r.qty) > 0)
    if (!validRows.length) {
      setError("Tambahkan minimal 1 item")
      setSubmitting(false)
      return
    }
    const overStockRow = validRows.find((r) => {
      const availPcs = stockBalances[r.itemId] ?? 0
      return qtyInBase(r) > availPcs
    })
    if (overStockRow) {
      const item = getItem(overStockRow.itemId)
      const availPcs = stockBalances[overStockRow.itemId] ?? 0
      const packSize = item?.packSize
      const availDisplay = packSize
        ? `${availPcs} ${item?.unit} (= ${Math.floor(availPcs / packSize)} ${item?.packUnit})`
        : `${availPcs} ${item?.unit}`
      setError(`Stok "${item?.name}" tidak cukup — tersedia ${availDisplay}`)
      setSubmitting(false)
      return
    }
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromLocationId: fromId,
        toLocationId: toId,
        notes: notes || null,
        items: validRows.map((r) => ({ itemId: r.itemId, quantity: qtyInBase(r) })),
      }),
    })
    if (res.ok) {
      setShowNew(false)
      setRows([{ itemId: "", qty: "", inputUnit: "base" }])
      setNotes("")
      fetchData()
    } else {
      const d = await res.json()
      setError(d.error ?? "Gagal membuat transfer")
    }
    } catch {
      setError("Koneksi gagal, coba lagi")
    } finally {
      setSubmitting(false)
    }
  }

  function openReceiveModal(t: Transfer) {
    setReceiveModal({
      transferId: t.id,
      fromLocation: t.fromLocation.name,
      toLocation: t.toLocation.name,
      items: t.items.map((i) => ({
        id: i.id,
        name: i.item.name,
        unit: i.item.unit,
        sentQty: Number(i.quantity),
        receivedQty: String(i.quantity),
      })),
    })
    setReceiptNotes("")
    setReceiptPhoto(null)
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true)
    setConfirmError("")
    const fd = new FormData()
    fd.append("file", file)
    fd.append("folder", "receipts")
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (res.ok) {
      const data = await res.json()
      setReceiptPhoto(data.url)
    } else {
      setConfirmError("Gagal upload foto. Coba lagi atau periksa koneksi.")
    }
    setUploadingPhoto(false)
  }

  async function handleReceiveSubmit() {
    if (!receiveModal) return
    const hasShortage = receiveModal.items.some((i) => (Number(i.receivedQty) || 0) < i.sentQty)
    if (hasShortage && !receiptNotes.trim()) { setConfirmError("Catatan wajib diisi jika ada kekurangan barang"); return }
    if (!receiptPhoto) return
    setConfirming(true)
    setConfirmError("")
    try {
      const res = await fetch(`/api/transfers/${receiveModal.transferId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          receivedItems: receiveModal.items.map((i) => ({
            id: i.id,
            receivedQty: Number(i.receivedQty) || 0,
          })),
          notes: receiptNotes || null,
          imageUrl: receiptPhoto,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setConfirmError(d.error ?? "Gagal mengkonfirmasi penerimaan")
        return
      }
      setReceiveModal(null)
      setReceiptPhoto(null)
      setReceiptNotes("")
      fetchData()
    } catch {
      setConfirmError("Tidak dapat terhubung ke server")
    } finally {
      setConfirming(false)
    }
  }

  async function rejectTransfer(id: string) {
    setRejecting(true)
    try {
      const res = await fetch(`/api/transfers/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error ?? "Gagal menolak transfer")
        return
      }
      setRejectModal(null)
      fetchData()
    } catch {
      alert("Tidak dapat terhubung ke server")
    } finally {
      setRejecting(false)
    }
  }

  const filtered = transfers.filter((t) => {
    if (activeTab === "pending") return ["PENDING", "SENT"].includes(t.status)
    if (activeTab === "received") return t.status === "RECEIVED"
    return true
  })

  const pendingCount = transfers.filter((t) => ["PENDING", "SENT"].includes(t.status)).length
  const receivedCount = transfers.filter((t) => t.status === "RECEIVED").length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Transfer Barang</h1>
          <p className="text-slate-500 text-sm mt-0.5">Kirim barang dari gudang ke outlet</p>
        </div>
        {!showNew && (
          <button
            onClick={() => { setShowNew(true); setError("") }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
          >
            <Plus className="w-4 h-4" />
            Buat Transfer Baru
          </button>
        )}
      </div>

      {showNew && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Transfer Baru</h2>
            <button onClick={() => setShowNew(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Dari</label>
              <select
                value={fromId}
                onChange={(e) => {
                  const newFrom = e.target.value
                  setFromId(newFrom)
                  if (toId === newFrom) {
                    const fallback = locations.find((l) => l.id !== newFrom)
                    setToId(fallback?.id ?? "")
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ke</label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {locations.filter((l) => l.id !== fromId).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Daftar Barang</label>
            <div className="space-y-2">
              {rows.map((row, i) => {
                const item = row.itemId ? getItem(row.itemId) : undefined
                const hasPack = !!(item?.packSize && item?.packUnit)
                const inPack = row.inputUnit === "pack"
                const availPcs = row.itemId ? (stockBalances[row.itemId] ?? 0) : null
                const qtyPcs = qtyInBase(row)
                const overStock = availPcs !== null && qtyPcs > availPcs

                return (
                  <div key={i} className="space-y-1">
                    <div className="flex gap-2 items-center overflow-x-auto">
                      <select
                        value={row.itemId}
                        onChange={(e) => {
                          const updated = [...rows]
                          updated[i] = { ...updated[i], itemId: e.target.value, inputUnit: "base" }
                          setRows(updated)
                        }}
                        className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Pilih item...</option>
                        {inventoryItems.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} ({it.unit}{it.packSize && it.packUnit ? ` · 1 ${it.packUnit}=${it.packSize}` : ""})
                          </option>
                        ))}
                      </select>

                      {/* Qty + satuan toggle */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          placeholder="Jumlah"
                          min="1"
                          value={row.qty}
                          onChange={(e) => {
                            const updated = [...rows]
                            updated[i].qty = e.target.value
                            setRows(updated)
                          }}
                          className={`w-24 px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center ${
                            overStock ? "border-red-300 bg-red-50" : "border-slate-200"
                          }`}
                        />
                        {hasPack ? (
                          <select
                            value={row.inputUnit}
                            onChange={(e) => {
                              const updated = [...rows]
                              updated[i].inputUnit = e.target.value as "base" | "pack"
                              setRows(updated)
                            }}
                            className="w-20 px-2 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            <option value="base">{item?.unit}</option>
                            <option value="pack">{item?.packUnit}</option>
                          </select>
                        ) : (
                          <span className="text-sm text-slate-400 w-12 text-center shrink-0">
                            {item?.unit ?? ""}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Stok info bar */}
                    {item && availPcs !== null && (
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                        overStock
                          ? "bg-red-50 text-red-600"
                          : availPcs === 0
                          ? "bg-orange-50 text-orange-600"
                          : "bg-slate-50 text-slate-500"
                      }`}>
                        <Package className="w-3.5 h-3.5 shrink-0" />
                        <span>Stok tersedia:</span>
                        <span className="font-bold">
                          {availPcs} {item.unit}
                          {hasPack && item.packSize
                            ? ` (= ${Math.floor(availPcs / item.packSize)} ${item.packUnit})`
                            : ""}
                        </span>
                        {inPack && hasPack && row.qty && (
                          <span className="text-slate-400 ml-1">· kirim {qtyPcs} {item.unit}</span>
                        )}
                        {overStock && <span className="ml-auto font-semibold text-red-500">Melebihi stok!</span>}
                        {availPcs === 0 && !overStock && <span className="ml-auto font-semibold">Stok kosong</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => setRows([...rows, { itemId: "", qty: "", inputUnit: "base" }])}
              className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-600 font-medium"
            >
              <Plus className="w-4 h-4" />
              Tambah Item
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Catatan (opsional)</label>
            <textarea
              placeholder="Contoh: Pengiriman rutin mingguan..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowNew(false)}
              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim...</> : <><ArrowRight className="w-4 h-4" /> Kirim Sekarang</>}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: "Semua", count: transfers.length },
          { key: "pending", label: "Belum Selesai", count: pendingCount },
          { key: "received", label: "Diterima", count: receivedCount },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.key ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-slate-400" />
          </div>
          <div className="text-slate-600 font-semibold">Belum ada transfer</div>
          <div className="text-slate-400 text-sm mt-1">Transfer barang yang dibuat akan muncul di sini</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => {
            const cfg = statusConfig[t.status]
            const StatusIcon = cfg.icon
            const isSent = t.status === "SENT"
            const isReceived = t.status === "RECEIVED"
            return (
              <div key={t.id} className={`bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-sm ${
                isSent ? "border-orange-200" : isReceived ? "border-emerald-200" : "border-slate-200"
              }`}>
                {isSent && <div className="h-1 bg-orange-400" />}
                {isReceived && <div className="h-1 bg-emerald-400" />}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isSent ? "bg-orange-100" : isReceived ? "bg-emerald-100" : "bg-slate-100"
                      }`}>
                        <Package className={`w-5 h-5 ${
                          isSent ? "text-orange-600" : isReceived ? "text-emerald-600" : "text-slate-500"
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 font-semibold text-slate-900 text-[14px]">
                          <span>{t.fromLocation.name}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{t.toLocation.name}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(t.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {t.notes && <span className="ml-1.5 italic">· {t.notes}</span>}
                        </div>
                      </div>
                    </div>
                    <span className={`text-[11px] px-2.5 py-1.5 rounded-full font-semibold flex items-center gap-1.5 shrink-0 ${cfg.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {t.items.map((item, i) => {
                      const displayQty = (t.status === "RECEIVED" && item.receivedQty != null)
                        ? Number(item.receivedQty)
                        : Number(item.quantity)
                      const hasSelisih = t.status === "RECEIVED" && item.receivedQty != null
                        && Number(item.receivedQty) !== Number(item.quantity)
                      return (
                        <span key={i} className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                          hasSelisih
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {item.item.name}{" "}
                          <strong>{displayQty}</strong>
                          {hasSelisih && <span className="opacity-50 ml-0.5">/{Number(item.quantity)}</span>}
                          {" "}{item.item.unit}
                        </span>
                      )
                    })}
                  </div>

                  {t.status === "SENT" && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => openReceiveModal(t)}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-full transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Konfirmasi Diterima
                      </button>
                      <button
                        onClick={() => setRejectModal(t.id)}
                        className="px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium rounded-full transition-colors"
                      >
                        Tolak
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {/* Receive Validation Modal */}
      {receiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setReceiveModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Verifikasi Barang Diterima</h2>
                <div className="text-xs text-slate-400 mt-0.5">
                  {receiveModal.fromLocation} → {receiveModal.toLocation}
                </div>
              </div>
              <button onClick={() => setReceiveModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-slate-500">
                Masukkan jumlah aktual yang diterima. Jika ada selisih, stok kekurangan otomatis kembali ke lokasi asal.
              </p>

              {receiveModal.items.map((item, i) => {
                const received = Number(item.receivedQty) || 0
                const hasShortage = received < item.sentQty
                return (
                  <div key={item.id} className={`rounded-xl border p-3 space-y-2 ${hasShortage ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{item.name}</span>
                      {hasShortage && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Selisih {item.sentQty - received} {item.unit}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-xs text-slate-400 mb-1">Dikirim</div>
                        <div className="text-sm font-semibold text-slate-600">{item.sentQty} {item.unit}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                      <div className="flex-1">
                        <div className="text-xs text-slate-400 mb-1">Diterima</div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max={item.sentQty}
                            value={item.receivedQty}
                            onChange={(e) => {
                              const updated = [...receiveModal.items]
                              updated[i] = { ...updated[i], receivedQty: e.target.value }
                              setReceiveModal({ ...receiveModal, items: updated })
                            }}
                            className={`w-20 px-2 py-1.5 rounded-lg border text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              hasShortage ? "border-amber-300" : "border-slate-200"
                            }`}
                          />
                          <span className="text-xs text-slate-400">{item.unit}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {receiveModal.items.some((i) => (Number(i.receivedQty) || 0) < i.sentQty) && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Ada selisih — tambahkan catatan penyebabnya (rusak, hilang, dll.) agar tercatat.</span>
                </div>
              )}

              {(() => {
                const hasShortage = receiveModal.items.some((i) => (Number(i.receivedQty) || 0) < i.sentQty)
                return (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Catatan penerimaan
                      {hasShortage
                        ? <span className="text-red-500 ml-1">*</span>
                        : <span className="text-slate-400 font-normal"> (opsional)</span>
                      }
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Contoh: 3 pcs Beef Patty rusak saat pengiriman..."
                      value={receiptNotes}
                      onChange={(e) => setReceiptNotes(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 resize-none ${
                        hasShortage && !receiptNotes.trim()
                          ? "border-red-300 focus:ring-red-400"
                          : "border-slate-200 focus:ring-blue-500"
                      }`}
                    />
                    {hasShortage && !receiptNotes.trim() && (
                      <p className="text-xs text-red-500 mt-1">Wajib diisi jika ada selisih</p>
                    )}
                  </div>
                )
              })()}

              {/* Upload foto barang */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Foto Barang <span className="text-red-500">*</span>
                </label>
                {receiptPhoto ? (
                  <div className="relative">
                    <img src={receiptPhoto} alt="Foto barang" className="w-full max-h-40 object-cover rounded-xl border border-slate-200" />
                    <button
                      type="button"
                      onClick={() => setReceiptPhoto(null)}
                      className="absolute top-2 right-2 p-1 bg-white/90 hover:bg-white rounded-lg shadow text-slate-500 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploadingPhoto ? "border-blue-200 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/40"}`}>
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }} />
                    {uploadingPhoto
                      ? <><Loader2 className="w-4 h-4 text-blue-500 animate-spin" /><span className="text-sm text-blue-600">Mengupload...</span></>
                      : <><Camera className="w-4 h-4 text-slate-400" /><span className="text-sm text-slate-500">Foto kondisi barang diterima</span></>
                    }
                  </label>
                )}
                {!receiptPhoto && <p className="text-xs text-red-500 mt-1">Wajib upload foto barang sebelum konfirmasi</p>}
              </div>
            </div>

            {confirmError && (
              <div className="mx-5 mb-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {confirmError}
              </div>
            )}
            <div className="p-5 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => { setReceiveModal(null); setConfirmError("") }}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleReceiveSubmit}
                disabled={confirming || !receiptPhoto || (receiveModal.items.some((i) => (Number(i.receivedQty) || 0) < i.sentQty) && !receiptNotes.trim())}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-full flex items-center justify-center gap-2"
              >
                {confirming ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</> : <><CheckCircle className="w-4 h-4" /> Konfirmasi</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRejectModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="font-semibold text-slate-900 text-base mb-1">Tolak Transfer Ini?</div>
              <div className="text-sm text-slate-500">Stok akan dikembalikan ke lokasi asal. Tindakan ini tidak bisa dibatalkan.</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRejectModal(null)}
                disabled={rejecting}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => rejectTransfer(rejectModal)}
                disabled={rejecting}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {rejecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</> : "Ya, Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
