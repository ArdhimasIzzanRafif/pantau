"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, Truck, X, Loader2, CheckCircle, Package, Sparkles, AlertTriangle, Camera, ImageIcon } from "lucide-react"

type Location = { id: string; name: string }
type Item = {
  id: string
  name: string
  sku: string | null
  unit: string
  packSize: number | null
  packUnit: string | null
  costPrice: number | null
}
type Receipt = {
  id: string
  createdAt: string
  supplier: string | null
  receiptNumber: string | null
  notes: string | null
  imageUrl: string | null
  location: { id: string; name: string }
  items: Array<{ quantity: number | string; item: { name: string; unit: string } }>
}
type Row = {
  itemId: string        // "__new__" = item baru belum ada di master
  customName: string
  customUnit: string
  customPackSize: string
  customPackUnit: string
  qty: string
  cost: string
  inputUnit: "base" | "pack"   // "pack" = input dalam kemasan (dus)
}

const NEW_ITEM = "__new__"
const UNIT_OPTIONS = ["pcs", "kg", "gram", "liter", "ml", "botol", "dus", "karton", "pack", "lusin", "porsi", "meter"]

function formatQty(value: number | string) {
  const qty = Number(value)
  if (!Number.isFinite(qty)) return "0"
  return qty.toLocaleString("id-ID", { maximumFractionDigits: 3 })
}

export default function GoodsReceiptPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [inventoryItems, setInventoryItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const [filterLocation, setFilterLocation] = useState("")
  const [filterFrom,     setFilterFrom]     = useState("")
  const [filterTo,       setFilterTo]       = useState("")

  const [locationId, setLocationId] = useState("")
  const [supplier, setSupplier] = useState("")
  const [receiptNumber, setReceiptNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [rows, setRows] = useState<Row[]>([
    { itemId: "", customName: "", customUnit: "pcs", customPackSize: "", customPackUnit: "", qty: "", cost: "", inputUnit: "base" },
  ])

  async function fetchData() {
    setLoading(true)
    const [rRes, lRes, iRes] = await Promise.all([
      fetch("/api/goods-receipts"),
      fetch("/api/locations"),
      fetch("/api/inventory"),
    ])
    if (rRes.ok) setReceipts(await rRes.json())
    if (lRes.ok) {
      const locs = await lRes.json()
      setLocations(locs)
      if (locs.length) setLocationId(locs[0].id)
    }
    if (iRes.ok) setInventoryItems(await iRes.json())
    setLoading(false)
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchData()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  function getItem(itemId: string): Item | undefined {
    return inventoryItems.find((it) => it.id === itemId)
  }

  function costPerBase(row: Row): number | null {
    if (!row.cost || !Number(row.cost)) return null
    const item = getItem(row.itemId)
    if (row.inputUnit === "pack" && item?.packSize) return Number(row.cost) / item.packSize
    return Number(row.cost)
  }

  function priceDiff(row: Row): { diff: number; pct: number } | null {
    const item = getItem(row.itemId)
    const master = item?.costPrice ? Number(item.costPrice) : null
    const incoming = costPerBase(row)
    if (master == null || incoming == null || Math.abs(incoming - master) < 0.01) return null
    return { diff: incoming - master, pct: ((incoming - master) / master) * 100 }
  }

  function resolvedQty(row: Row): number {
    const qty = Number(row.qty)
    if (!qty) return 0
    if (row.inputUnit === "pack" && row.itemId !== NEW_ITEM) {
      const item = getItem(row.itemId)
      return qty * (item?.packSize ?? 1)
    }
    if (row.inputUnit === "pack" && row.itemId === NEW_ITEM) {
      return qty * (Number(row.customPackSize) || 1)
    }
    return qty
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("folder", "receipts")
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (res.ok) {
      const data = await res.json()
      setPhotoUrl(data.url)
    } else {
      setError("Gagal upload foto. Coba lagi.")
    }
    setUploadingPhoto(false)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError("")
    try {
    if (!photoUrl) {
      setError("Foto surat jalan / barang wajib diupload sebelum konfirmasi")
      setSubmitting(false)
      return
    }
    const validRows = rows.filter(
      (r) => (r.itemId && r.itemId !== NEW_ITEM || (r.itemId === NEW_ITEM && r.customName.trim())) && Number(r.qty) > 0
    )
    if (!validRows.length) {
      setError("Tambahkan minimal 1 item dengan qty > 0")
      setSubmitting(false)
      return
    }

    const resolvedRows: Array<{ itemId: string; quantity: number; costPrice: number | null }> = []
    for (const r of validRows) {
      const qtyInBase = resolvedQty(r)
      if (r.itemId === NEW_ITEM) {
        const costPerBase = r.cost && Number(r.customPackSize) > 1 && r.inputUnit === "pack"
          ? Number(r.cost) / Number(r.customPackSize)
          : r.cost ? Number(r.cost) : null
        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: r.customName.trim(),
            unit: r.customUnit.trim() || "pcs",
            packSize: r.customPackSize ? Number(r.customPackSize) : null,
            packUnit: r.customPackUnit.trim() || null,
            costPrice: costPerBase,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          setError(`Gagal buat item "${r.customName}": ${d.error ?? "error"}`)
          setSubmitting(false)
          return
        }
        const newItem = await res.json()
        resolvedRows.push({ itemId: newItem.id, quantity: qtyInBase, costPrice: costPerBase ?? null })
        setInventoryItems((prev) => [...prev, newItem])
      } else {
        resolvedRows.push({ itemId: r.itemId, quantity: qtyInBase, costPrice: costPerBase(r) })
      }
    }

    // Auto-append catatan selisih harga
    const diffNotes = validRows
      .filter((r) => r.itemId !== NEW_ITEM && priceDiff(r) !== null)
      .map((r) => {
        const item = getItem(r.itemId)
        const diff = priceDiff(r)!
        const incoming = costPerBase(r) ?? 0
        const master = item?.costPrice ? Number(item.costPrice) : 0
        return `${item?.name}: HPP master Rp${Math.round(master).toLocaleString("id-ID")}, harga masuk Rp${Math.round(incoming).toLocaleString("id-ID")} (${diff.diff > 0 ? "+" : ""}${diff.pct.toFixed(1)}%)`
      })
    const finalNotes = [notes || null, diffNotes.length ? `Selisih harga: ${diffNotes.join("; ")}` : null]
      .filter(Boolean).join(" | ") || null

    const res = await fetch("/api/goods-receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId,
        supplier: supplier || null,
        receiptNumber: receiptNumber || null,
        notes: finalNotes,
        imageUrl: photoUrl,
        items: resolvedRows,
      }),
    })

    if (res.ok) {
      setShowForm(false)
      setRows([{ itemId: "", customName: "", customUnit: "pcs", customPackSize: "", customPackUnit: "", qty: "", cost: "", inputUnit: "base" }])
      setSupplier("")
      setReceiptNumber("")
      setNotes("")
      setPhotoUrl(null)
      fetchData()
    } else {
      const text = await res.text()
      try { setError(JSON.parse(text).error ?? "Gagal menyimpan penerimaan") }
      catch { setError(`Server error (${res.status}): ${text.slice(0, 120)}`) }
    }
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const formatRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`

  const filteredReceipts = receipts.filter((r) => {
    const localDate = new Date(r.createdAt).toLocaleDateString("en-CA")
    if (filterFrom && localDate < filterFrom) return false
    if (filterTo   && localDate > filterTo)   return false
    if (filterLocation && r.location.id !== filterLocation) return false
    return true
  })

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Barang Masuk</h1>
          <p className="text-slate-500 text-sm mt-0.5">Catat penerimaan barang dari supplier</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setError("") }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
          >
            <Plus className="w-4 h-4" />
            Catat Barang Masuk
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Penerimaan Barang Baru</h2>
            <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Diterima di *</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Supplier</label>
              <input
                type="text"
                placeholder="Contoh: PT Bahan Baku Jaya"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">No. Surat Jalan / Invoice</label>
              <input
                type="text"
                placeholder="SJ-20240601-001"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Catatan</label>
              <input
                type="text"
                placeholder="Opsional..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Upload foto — wajib */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Foto Struk <span className="text-red-500">*</span>
            </label>
            {photoUrl ? (
              <div className="relative w-full">
                <img src={photoUrl} alt="Foto barang masuk" className="w-full max-h-56 object-cover rounded-xl border border-slate-200" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded-lg shadow text-slate-500 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className={`flex flex-col items-center justify-center gap-2 w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploadingPhoto ? "border-blue-200 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/40"}`}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handlePhotoUpload(file)
                  }}
                />
                {uploadingPhoto ? (
                  <>
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <span className="text-sm text-blue-600">Mengupload foto...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-6 h-6 text-slate-400" />
                    <span className="text-sm text-slate-500">Foto struk dari supplier</span>
                    <span className="text-xs text-slate-400">Klik untuk pilih foto · Maks 2MB</span>
                  </>
                )}
              </label>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-700">Daftar Barang *</label>
              <div className="text-xs text-slate-400">Harga beli opsional — untuk update HPP</div>
            </div>
            <div className="space-y-3">
              {rows.map((row, i) => {
                const item = row.itemId && row.itemId !== NEW_ITEM ? getItem(row.itemId) : null
                const hasPack = item?.packSize != null && item?.packUnit != null
                const packLabel = item?.packUnit ?? ""
                const baseLabel = item?.unit ?? "pcs"
                const inPack = row.inputUnit === "pack"
                const qtyBase = resolvedQty(row)

                return (
                  <div key={i} className="space-y-2">
                    <div className="flex gap-2 items-center overflow-x-auto">
                      <select
                        value={row.itemId}
                        onChange={(e) => {
                          const sel = inventoryItems.find((it) => it.id === e.target.value)
                          const costPerBase = sel?.costPrice ? Number(sel.costPrice) : null
                          // Pre-fill harga per kemasan jika item punya packSize
                          const costDisplay = costPerBase !== null && sel?.packSize
                            ? String(Math.round(costPerBase * sel.packSize))
                            : costPerBase !== null ? String(costPerBase) : ""
                          updateRow(i, {
                            itemId: e.target.value,
                            cost: costDisplay,
                            customName: "",
                            customUnit: "pcs",
                            customPackSize: "",
                            customPackUnit: "",
                            inputUnit: sel?.packSize ? "pack" : "base",
                          })
                        }}
                        className="flex-2 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Pilih item...</option>
                        {inventoryItems.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} ({it.unit}{it.packSize && it.packUnit ? ` · 1 ${it.packUnit}=${it.packSize}` : ""})
                          </option>
                        ))}
                        <option value={NEW_ITEM}>➕ Item baru (tidak ada di daftar)</option>
                      </select>

                      {/* Qty + satuan toggle */}
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          type="number"
                          placeholder="Qty"
                          min="1"
                          value={row.qty}
                          onChange={(e) => updateRow(i, { qty: e.target.value })}
                          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center min-w-0"
                        />
                        {hasPack ? (
                          <select
                            value={row.inputUnit}
                            onChange={(e) => {
                              const newUnit = e.target.value as "base" | "pack"
                              const ps = item?.packSize ?? 1
                              let newCost = row.cost
                              if (row.cost && ps > 1) {
                                if (newUnit === "pack" && row.inputUnit === "base") {
                                  newCost = String(Math.round(Number(row.cost) * ps))
                                } else if (newUnit === "base" && row.inputUnit === "pack") {
                                  newCost = String(Math.round(Number(row.cost) / ps))
                                }
                              }
                              updateRow(i, { inputUnit: newUnit, cost: newCost })
                            }}
                            className="w-20 px-2 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            <option value="base">{baseLabel}</option>
                            <option value="pack">{packLabel}</option>
                          </select>
                        ) : (
                          <span className="text-sm text-slate-400 shrink-0 w-12 text-center">{baseLabel}</span>
                        )}
                      </div>

                      {/* Harga */}
                      <div className="relative flex-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                        <input
                          type="number"
                          placeholder={inPack && hasPack ? `Harga/${packLabel}` : `Harga/${baseLabel}`}
                          min="0"
                          value={row.cost}
                          onChange={(e) => updateRow(i, { cost: e.target.value })}
                          className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>


                      <button
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Info konversi */}
                    {hasPack && inPack && row.qty && (
                      <div className="ml-0 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-2">
                        <span>{row.qty} {packLabel} × {item?.packSize} = <strong>{qtyBase} {baseLabel}</strong> yang masuk ke stok</span>
                        {row.cost && <span>· Rp {Math.round(Number(row.cost) / (item?.packSize ?? 1)).toLocaleString("id-ID")}/{baseLabel}</span>}
                      </div>
                    )}

                    {/* Warning selisih harga */}
                    {row.itemId && row.itemId !== NEW_ITEM && row.cost && (() => {
                      const diff = priceDiff(row)
                      if (!diff) return null
                      const item = getItem(row.itemId)
                      const masterCost = item?.costPrice ? Number(item.costPrice) : 0
                      const incoming = costPerBase(row) ?? 0
                      const isUp = diff.diff > 0
                      const isCritical = isUp && diff.pct > 20
                      return (
                        <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${isCritical ? "bg-red-50 border-red-300 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isCritical ? "text-red-500" : "text-amber-500"}`} />
                          <span>
                            {isCritical && <strong className="text-red-700">⚠ Kenaikan signifikan! </strong>}
                            Harga berbeda dari HPP — master <strong>Rp {masterCost.toLocaleString("id-ID")}</strong>/
                            {item?.unit}, masuk <strong>Rp {Math.round(incoming).toLocaleString("id-ID")}</strong>/
                            {item?.unit}{" "}
                            <span className={`font-semibold ${isCritical ? "text-red-700" : isUp ? "text-red-600" : "text-green-700"}`}>
                              ({isUp ? "+" : ""}{diff.pct.toFixed(1)}%)
                            </span>
                            {isCritical && " — peringatan akan dikirim ke dashboard owner."}
                            {!isCritical && " Catatan selisih otomatis ditambahkan."}
                          </span>
                        </div>
                      )
                    })()}

                    {/* Inline form untuk item baru */}
                    {row.itemId === NEW_ITEM && (
                      <div className="ml-0 pl-3 border-l-2 border-blue-200 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                          <Sparkles className="w-3.5 h-3.5" />
                          Item baru akan ditambahkan ke Master Inventori
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Nama item *"
                            value={row.customName}
                            onChange={(e) => updateRow(i, { customName: e.target.value })}
                            className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <select
                            value={row.customUnit}
                            onChange={(e) => updateRow(i, { customUnit: e.target.value })}
                            className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 shrink-0">Kemasan:</span>
                          <input
                            type="text"
                            placeholder="Nama (mis: dus)"
                            value={row.customPackUnit}
                            onChange={(e) => updateRow(i, { customPackUnit: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-xs text-slate-500 shrink-0">=</span>
                          <input
                            type="number"
                            min="1"
                            placeholder="Isi"
                            value={row.customPackSize}
                            onChange={(e) => updateRow(i, { customPackSize: e.target.value })}
                            className="w-16 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                          />
                          <span className="text-xs text-slate-500 shrink-0">{row.customUnit}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => setRows([...rows, { itemId: "", customName: "", customUnit: "pcs", customPackSize: "", customPackUnit: "", qty: "", cost: "", inputUnit: "base" }])}
              className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-600 font-medium"
            >
              <Plus className="w-4 h-4" />
              Tambah Item
            </button>
          </div>

          {/* Preview total */}
          {rows.some((r) => (r.itemId && r.itemId !== NEW_ITEM) || (r.itemId === NEW_ITEM && r.customName)) && rows.some((r) => r.qty) && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="text-xs font-medium text-blue-700 mb-2">Ringkasan Penerimaan</div>
              <div className="space-y-1">
                {rows.filter((r) => r.qty && Number(r.qty) > 0).map((r, i) => {
                  const item = inventoryItems.find((it) => it.id === r.itemId)
                  const displayName = r.itemId === NEW_ITEM ? (r.customName || "Item baru") : item?.name
                  const baseUnit = r.itemId === NEW_ITEM ? (r.customUnit || "pcs") : item?.unit ?? "pcs"
                  if (!displayName) return null
                  const qtyBase = resolvedQty(r)
                  // Harga selalu per unit input (dus atau pcs), jadi pakai r.qty bukan qtyBase
                  const total = Number(r.qty) * (Number(r.cost) || 0)
                  const inPack = r.inputUnit === "pack"
                  const packLabel = item?.packUnit ?? r.customPackUnit
                  return (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-700 flex items-center gap-1.5">
                        {r.itemId === NEW_ITEM && <Sparkles className="w-3 h-3 text-blue-500" />}
                        {displayName} ×{" "}
                        {inPack && packLabel ? `${r.qty} ${packLabel} (${qtyBase} ${baseUnit})` : `${qtyBase} ${baseUnit}`}
                      </span>
                      <span className="font-medium text-slate-900">{total > 0 ? formatRp(total) : "—"}</span>
                    </div>
                  )
                })}
              </div>
              {rows.some((r) => r.itemId === NEW_ITEM && r.customName) && (
                <div className="mt-2 pt-2 border-t border-blue-100 text-xs text-blue-600">
                  Item bertanda ✦ akan otomatis masuk ke Master Inventori
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                : <><Truck className="w-4 h-4" /> Konfirmasi Diterima</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      {!loading && receipts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua Lokasi</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            max={today}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 text-sm">—</span>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            max={today}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {(filterLocation || filterFrom || filterTo) && (
            <button onClick={() => { setFilterLocation(""); setFilterFrom(""); setFilterTo("") }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Reset
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{filteredReceipts.length} catatan</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : receipts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Truck className="w-7 h-7 text-slate-400" />
          </div>
          <div className="text-slate-600 font-semibold">Belum ada penerimaan barang</div>
          <div className="text-slate-400 text-sm mt-1">Catat barang masuk dari supplier di sini</div>
        </div>
      ) : filteredReceipts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <div className="text-slate-500 text-sm">Tidak ada data untuk filter yang dipilih</div>
          <button onClick={() => { setFilterLocation(""); setFilterFrom(""); setFilterTo("") }}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >Reset filter</button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredReceipts.map((r) => {
            const totalItems = r.items.reduce((s, i) => s + Number(i.quantity), 0)
            return (
              <Link key={r.id} href={`/dashboard/audit/receipt/${r.id}`} className="block bg-white rounded-2xl border border-emerald-100 border-l-4 border-l-emerald-500 overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-3.5">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-[14px]">
                          {r.location.name}
                          {r.supplier && <span className="text-slate-400 font-normal ml-1.5">· {r.supplier}</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(r.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {r.receiptNumber && <span className="ml-1.5 font-mono">{r.receiptNumber}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">
                        Dikonfirmasi
                      </span>
                      <div className="text-xs text-slate-400 mt-1.5">{formatQty(totalItems)} unit masuk</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {r.items.map((item, i) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5">
                        <Package className="w-3 h-3 text-slate-400" />
                        {item.item.name}
                        <span className="text-emerald-600 font-bold">+{formatQty(item.quantity)}</span>
                        {item.item.unit}
                      </span>
                    ))}
                  </div>

                  {r.imageUrl && (
                    <div className="mt-3">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(r.imageUrl!, "_blank", "noopener,noreferrer") }}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Lihat foto surat jalan
                      </button>
                    </div>
                  )}
                  {r.notes && (
                    <div className="mt-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2 italic">{r.notes}</div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
