"use client"

import { useState, useEffect, useRef } from "react"
import {
  Plus,
  Search,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Package,
  Loader2,
  X,
} from "lucide-react"

type ConfirmDialog = { id: string; name: string } | null

type Location = {
  id: string
  name: string
  type: string
}

type LocationSetting = {
  locationId: string
  minStock: number | null
  location?: Location
}

type Item = {
  id: string
  name: string
  sku: string | null
  category: string | null
  unit: string
  packSize: number | null
  packUnit: string | null
  costPrice: number | null
  minStock: number | null
  isTrackable: boolean
  isActive: boolean
  locationSettings?: LocationSetting[]
}

const UNITS = ["botol", "bungkus", "butir", "gram", "ikat", "kaleng", "kg", "lembar", "liter", "ml", "pcs", "potong", "sachet"]
const PACK_UNITS = ["ball", "box", "drum", "dus", "galon", "jerigen", "karton", "karung", "krat", "lusin", "pack", "peti", "renteng", "roll", "sak", "toples"]
const DEFAULT_CATEGORIES = ["Bahan Baku", "Kemasan", "Makanan", "Minuman"]

function formatRpInput(val: string) {
  const digits = val.replace(/\D/g, "")
  if (!digits) return ""
  return Number(digits).toLocaleString("id-ID")
}
function parseRpInput(val: string) {
  return val.replace(/\./g, "").replace(/,/g, "")
}

function stockInputFromBase(minStock: number | null, packSize: number | null) {
  if (minStock == null) return ""
  return packSize ? String(Math.round(minStock / packSize)) : String(minStock)
}

function stockInputToBase(value: string, packSize: string) {
  if (value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed * (packSize ? Number(packSize) : 1)
}

async function readApiError(res: Response, fallback: string) {
  try {
    if (res.headers.get("content-type")?.includes("application/json")) {
      const data = await res.json() as { error?: string }
      return data.error ?? fallback
    }
  } catch {
    // Fall through to the status-aware fallback below.
  }

  return `${fallback} (${res.status})`
}

const emptyForm = {
  name: "",
  sku: "",
  category: "",
  unit: "pcs",
  packSize: "",
  packUnit: "",
  costPrice: "",
  minStock: "",
  isTrackable: true,
  isActive: true,
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDialog>(null)
  const [deleteError, setDeleteError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [unitSearch, setUnitSearch] = useState("")
  const [unitOpen, setUnitOpen] = useState(false)
  const unitRef = useRef<HTMLDivElement>(null)
  const unitSearchRef = useRef<HTMLInputElement>(null)
  const [customUnits, setCustomUnits] = useState<string[]>([])
  const [categorySearch, setCategorySearch] = useState("")
  const [categoryOpen, setCategoryOpen] = useState(false)
  const categoryRef = useRef<HTMLDivElement>(null)
  const categorySearchRef = useRef<HTMLInputElement>(null)
  const [packUnitSearch, setPackUnitSearch] = useState("")
  const [packUnitOpen, setPackUnitOpen] = useState(false)
  const packUnitRef = useRef<HTMLDivElement>(null)
  const packUnitSearchRef = useRef<HTMLInputElement>(null)
  const [customPackUnits, setCustomPackUnits] = useState<string[]>([])
  const [locationMinStocks, setLocationMinStocks] = useState<Record<string, string>>({})

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (unitRef.current && !unitRef.current.contains(e.target as Node)) setUnitOpen(false)
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false)
      if (packUnitRef.current && !packUnitRef.current.contains(e.target as Node)) setPackUnitOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function fetchItems() {
    setLoading(true)
    const res = await fetch("/api/inventory")
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }

  async function fetchLocations() {
    const res = await fetch("/api/locations")
    if (res.ok) setLocations(await res.json())
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchItems()
      fetchLocations()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  const filtered = items.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku?.toLowerCase().includes(search.toLowerCase()) ?? false)
    const matchCat = category === "Semua" || item.category === category
    return matchSearch && matchCat
  })

  function openCreate() {
    setEditItem(null)
    setForm(emptyForm)
    setLocationMinStocks({})
    setError("")
    setUnitSearch("")
    setUnitOpen(false)
    setCategorySearch("")
    setCategoryOpen(false)
    setPackUnitSearch("")
    setPackUnitOpen(false)
    setShowModal(true)
  }

  function openEdit(item: Item) {
    setEditItem(item)
    setForm({
      name: item.name,
      sku: item.sku ?? "",
      category: item.category ?? "",
      unit: item.unit,
      packSize: item.packSize != null ? String(item.packSize) : "",
      packUnit: item.packUnit ?? "",
      // Tampilkan harga per kemasan agar user edit dalam satuan yang sama saat input
      costPrice: item.costPrice != null
        ? formatRpInput(item.packSize
          ? String(Math.round(Number(item.costPrice) * item.packSize))
          : String(Math.round(Number(item.costPrice))))
        : "",
      minStock: stockInputFromBase(item.minStock, item.packSize),
      isTrackable: item.isTrackable,
      isActive: item.isActive,
    })
    const nextLocationMinStocks: Record<string, string> = {}
    for (const setting of item.locationSettings ?? []) {
      nextLocationMinStocks[setting.locationId] = stockInputFromBase(setting.minStock, item.packSize)
    }
    setLocationMinStocks(nextLocationMinStocks)
    setError("")
    setUnitSearch("")
    setUnitOpen(false)
    setCategorySearch("")
    setCategoryOpen(false)
    setPackUnitSearch("")
    setPackUnitOpen(false)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        sku: form.sku || null,
        category: form.category || null,
        unit: form.unit,
        packSize: form.packSize ? Number(form.packSize) : null,
        packUnit: form.packUnit || null,
        // Jika ada packSize, harga diinput per kemasan → konversi ke per satuan dasar
        costPrice: form.costPrice
          ? form.packSize
            ? Number(parseRpInput(form.costPrice)) / Number(form.packSize)
            : Number(parseRpInput(form.costPrice))
          : null,
        minStock: stockInputToBase(form.minStock, form.packSize),
        isTrackable: form.isTrackable,
        isActive: form.isActive,
      }

      if (locations.length > 0) {
        body.locationMinStocks = locations.map((location) => ({
          locationId: location.id,
          minStock: stockInputToBase(locationMinStocks[location.id] ?? "", form.packSize),
        }))
      }

      const res = editItem
        ? await fetch(`/api/inventory/${editItem.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/inventory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })

      if (res.ok) {
        setShowModal(false)
        fetchItems()
      } else {
        setError(await readApiError(res, "Gagal menyimpan item"))
      }
    } catch {
      setError("Koneksi gagal, coba lagi")
    } finally {
      setSubmitting(false)
    }
  }

  function openDelete(id: string, name: string) {
    setDeleteError("")
    setConfirmDelete({ id, name })
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    setDeleteError("")
    const res = await fetch(`/api/inventory/${confirmDelete.id}`, { method: "DELETE" })
    if (res.ok) {
      setConfirmDelete(null)
      fetchItems()
    } else {
      setDeleteError(await readApiError(res, "Gagal menghapus item"))
    }
    setDeleting(false)
  }

  const formatRp = (n: number | null) =>
    n == null ? "—" : `Rp ${n.toLocaleString("id-ID")}`

  const missingCost = items.filter((i) => !i.costPrice && i.isTrackable).length
  const uniqueCategories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[]
  const allCategories = ["Semua", ...uniqueCategories.sort()]

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Master Inventori</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {items.length} item terdaftar
            {missingCost > 0 && <span className="text-orange-500 ml-1">· {missingCost} tanpa harga pokok</span>}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Item
        </button>
      </div>

      {missingCost > 0 && (
        <div className="bg-white border border-orange-200 border-l-4 border-l-orange-500 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <span className="text-sm font-semibold text-orange-800">{missingCost} item belum ada harga pokok —</span>
            <span className="text-sm text-orange-600 ml-1">estimasi kerugian tidak akan akurat.</span>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama item atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3.5 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                category === cat
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900">
                    <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5">Nama Item</th>
                    <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5">SKU</th>
                    <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5">Kategori</th>
                    <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Harga Pokok</th>
                    <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Min Stok</th>
                    <th className="text-center text-xs font-semibold text-slate-300 px-5 py-3.5">Tracking</th>
                    <th className="text-center text-xs font-semibold text-slate-300 px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item, idx) => (
                    <tr key={item.id} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 !== 0 ? "bg-slate-50/50" : ""}`}>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 text-[13px]">{item.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {item.unit}
                          {item.packSize && item.packUnit && (
                            <span className="ml-1.5 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md text-[10px]">
                              1 {item.packUnit} = {item.packSize} {item.unit}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{item.sku ?? "—"}</td>
                      <td className="px-5 py-3.5">
                        {item.category ? (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                            {item.category}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {item.costPrice ? (
                          <div>
                            <div className="text-slate-900 text-[13px]">
                              {item.packSize && item.packUnit
                                ? `${formatRp(Math.round(item.costPrice * item.packSize))}/${item.packUnit}`
                                : `${formatRp(item.costPrice)}/${item.unit}`}
                            </div>
                            {item.packSize && item.packUnit && (
                              <div className="text-xs text-slate-400">{formatRp(item.costPrice)}/{item.unit}</div>
                            )}
                          </div>
                        ) : item.isTrackable ? (
                          <span className="text-orange-500 text-xs font-semibold flex items-center justify-end gap-1">
                            <AlertTriangle className="w-3 h-3" /> Belum diisi
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-700">
                        {item.minStock != null ? (
                          <div>
                            <div className="text-[13px]">
                              {item.packSize && item.packUnit
                                ? `${Math.round(item.minStock / item.packSize)} ${item.packUnit}`
                                : `${item.minStock} ${item.unit}`}
                            </div>
                            {item.packSize && item.packUnit && (
                              <div className="text-xs text-slate-400">= {item.minStock} {item.unit}</div>
                            )}
                            {(item.locationSettings?.filter((setting) => setting.minStock != null).length ?? 0) > 0 && (
                              <div className="text-xs text-blue-600 mt-0.5">
                                {item.locationSettings?.filter((setting) => setting.minStock != null).length} lokasi khusus
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-300 text-[13px]">—</span>
                            {(item.locationSettings?.filter((setting) => setting.minStock != null).length ?? 0) > 0 && (
                              <div className="text-xs text-blue-600 mt-0.5">
                                {item.locationSettings?.filter((setting) => setting.minStock != null).length} lokasi khusus
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {item.isTrackable ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${
                          item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                        }`}>
                          {item.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors text-slate-400 hover:text-blue-600"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDelete(item.id, item.name)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-slate-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="py-20 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Package className="w-7 h-7 text-slate-400" />
                </div>
                <div className="text-slate-600 font-semibold">Tidak ada item ditemukan</div>
                <div className="text-slate-400 text-sm mt-1.5">Coba ubah filter atau kata pencarian</div>
              </div>
            )}
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm mx-4 p-6 z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">Hapus Item</div>
                <div className="text-sm text-slate-500 mt-0.5">Tindakan ini tidak dapat dibatalkan</div>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Yakin ingin menghapus <span className="font-semibold text-slate-900">&quot;{confirmDelete.name}&quot;</span>? Semua data stok dan riwayat item ini juga akan terhapus.
            </p>
            {deleteError && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {deleteError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Menghapus...</> : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl mx-4 p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editItem ? "Edit Item" : "Tambah Item Baru"}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {error && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Item *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Beef Patty 80gr"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">SKU</label>
                  <input
                    type="text"
                    placeholder="BP-001"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Satuan Dasar *</label>
                  <div ref={unitRef} className="relative">
                    <button
                      type="button"
                      onClick={() => { setUnitOpen((o) => !o); setUnitSearch("") }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                    >
                      <span className={form.unit ? "text-slate-900" : "text-slate-400"}>{form.unit || "Pilih satuan..."}</span>
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {unitOpen && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            ref={unitSearchRef}
                            autoFocus
                            type="text"
                            placeholder="Cari atau ketik satuan baru..."
                            value={unitSearch}
                            onChange={(e) => setUnitSearch(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="max-h-44 overflow-y-auto">
                          {(() => {
                            const allUnits = [...UNITS, ...customUnits]
                            const filtered = allUnits.filter((u) => u.toLowerCase().includes(unitSearch.toLowerCase()))
                            const trimmed = unitSearch.trim()
                            const alreadyExists = allUnits.some((u) => u.toLowerCase() === trimmed.toLowerCase())
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!trimmed) { unitSearchRef.current?.focus(); return }
                                    if (alreadyExists) return
                                    setCustomUnits((prev) => [...prev, trimmed])
                                    setForm({ ...form, unit: trimmed })
                                    setUnitOpen(false)
                                  }}
                                  disabled={alreadyExists && !!trimmed}
                                  className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 border-b border-slate-100 transition-colors ${
                                    trimmed && !alreadyExists
                                      ? "text-blue-600 hover:bg-blue-50"
                                      : "text-slate-400 cursor-default"
                                  }`}
                                >
                                  <Plus className="w-3.5 h-3.5 shrink-0" />
                                  {trimmed && !alreadyExists ? `Tambah "${trimmed}"` : "Ketik untuk tambah satuan baru"}
                                </button>
                                {filtered.map((u) => (
                                  <button
                                    key={u}
                                    type="button"
                                    onClick={() => { setForm({ ...form, unit: u }); setUnitOpen(false) }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${form.unit === u ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"}`}
                                  >
                                    {u}
                                  </button>
                                ))}
                                {filtered.length === 0 && (
                                  <div className="px-4 py-3 text-sm text-slate-400 text-center">Tidak ada yang cocok</div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Kemasan <span className="text-slate-400 font-normal">(opsional)</span>
                </label>
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-slate-500 shrink-0">1</span>
                  <div ref={packUnitRef} className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => { setPackUnitOpen((o) => !o); setPackUnitSearch("") }}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                    >
                      <span className={form.packUnit ? "text-slate-900" : "text-slate-400"}>{form.packUnit || "Pilih kemasan..."}</span>
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {packUnitOpen && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            ref={packUnitSearchRef}
                            autoFocus
                            type="text"
                            placeholder="Cari atau ketik kemasan baru..."
                            value={packUnitSearch}
                            onChange={(e) => setPackUnitSearch(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="max-h-44 overflow-y-auto">
                          {(() => {
                            const allPackUnits = [...PACK_UNITS, ...customPackUnits]
                            const filtered = allPackUnits.filter((u) => u.toLowerCase().includes(packUnitSearch.toLowerCase()))
                            const trimmed = packUnitSearch.trim()
                            const alreadyExists = allPackUnits.some((u) => u.toLowerCase() === trimmed.toLowerCase())
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!trimmed) { packUnitSearchRef.current?.focus(); return }
                                    if (alreadyExists) return
                                    setCustomPackUnits((prev) => [...prev, trimmed])
                                    setForm({ ...form, packUnit: trimmed })
                                    setPackUnitOpen(false)
                                  }}
                                  disabled={alreadyExists && !!trimmed}
                                  className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 border-b border-slate-100 transition-colors ${
                                    trimmed && !alreadyExists
                                      ? "text-blue-600 hover:bg-blue-50"
                                      : "text-slate-400 cursor-default"
                                  }`}
                                >
                                  <Plus className="w-3.5 h-3.5 shrink-0" />
                                  {trimmed && !alreadyExists ? `Tambah "${trimmed}"` : "Ketik untuk tambah kemasan baru"}
                                </button>
                                {filtered.map((u) => (
                                  <button
                                    key={u}
                                    type="button"
                                    onClick={() => { setForm({ ...form, packUnit: u }); setPackUnitOpen(false) }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${form.packUnit === u ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"}`}
                                  >
                                    {u}
                                  </button>
                                ))}
                                {filtered.length === 0 && (
                                  <div className="px-4 py-3 text-sm text-slate-400 text-center">Tidak ada yang cocok</div>
                                )}
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-slate-500 shrink-0">=</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Isi"
                    value={form.packSize}
                    onChange={(e) => setForm({ ...form, packSize: e.target.value })}
                    className="w-20 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                  />
                  <span className="text-sm text-slate-500 shrink-0">{form.unit}</span>
                </div>
                {form.packSize && form.packUnit && (
                  <p className="text-xs text-blue-600 mt-1.5">
                    1 {form.packUnit} = {form.packSize} {form.unit}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Kategori</label>
                <div ref={categoryRef} className="relative">
                  <button
                    type="button"
                    onClick={() => { setCategoryOpen((o) => !o); setCategorySearch("") }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  >
                    <span className={form.category ? "text-slate-900" : "text-slate-400"}>{form.category || "Pilih atau buat kategori..."}</span>
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {categoryOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-slate-100">
                        <input
                          ref={categorySearchRef}
                          autoFocus
                          type="text"
                          placeholder="Cari atau ketik kategori baru..."
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="max-h-44 overflow-y-auto">
                        {(() => {
                          const allCats = Array.from(new Set([...DEFAULT_CATEGORIES, ...uniqueCategories]))
                          const filtered = allCats.filter((c) => c.toLowerCase().includes(categorySearch.toLowerCase()))
                          const trimmed = categorySearch.trim()
                          const alreadyExists = allCats.some((c) => c.toLowerCase() === trimmed.toLowerCase())
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!trimmed) { categorySearchRef.current?.focus(); return }
                                  if (alreadyExists) return
                                  setForm({ ...form, category: trimmed })
                                  setCategoryOpen(false)
                                }}
                                disabled={alreadyExists && !!trimmed}
                                className={`w-full text-left px-4 py-2 text-sm font-medium flex items-center gap-2 border-b border-slate-100 transition-colors ${
                                  trimmed && !alreadyExists
                                    ? "text-blue-600 hover:bg-blue-50"
                                    : "text-slate-400 cursor-default"
                                }`}
                              >
                                <Plus className="w-3.5 h-3.5 shrink-0" />
                                {trimmed && !alreadyExists ? `Tambah "${trimmed}"` : "Ketik untuk tambah kategori baru"}
                              </button>
                              {filtered.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => { setForm({ ...form, category: c }); setCategoryOpen(false) }}
                                  className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${form.category === c ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"}`}
                                >
                                  {c}
                                </button>
                              ))}
                              {filtered.length === 0 && (
                                <div className="px-4 py-3 text-sm text-slate-400 text-center">Tidak ada yang cocok</div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Harga Pokok per {form.packUnit || form.unit}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={form.costPrice}
                      onChange={(e) => setForm({ ...form, costPrice: formatRpInput(e.target.value) })}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {form.packSize && form.packUnit && form.costPrice && Number(form.packSize) > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      = Rp {Math.round(Number(parseRpInput(form.costPrice)) / Number(form.packSize)).toLocaleString("id-ID")} per {form.unit}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Stok Minimum Default {form.packUnit ? `(dalam ${form.packUnit})` : `(dalam ${form.unit})`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.minStock}
                    onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {form.packSize && form.packUnit && form.minStock && Number(form.minStock) > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      = {Number(form.minStock) * Number(form.packSize)} {form.unit}
                    </p>
                  )}
                </div>
              </div>
              {locations.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-3 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div>
                      <div className="text-sm font-medium text-slate-700">Edit Minimum Lokasi</div>
                      <div className="text-xs text-slate-400">Sesuaikan minimum stok di berbagai lokasi.</div>
                    </div>
                    <div className="text-xs text-slate-400">
                      Dalam {form.packUnit || form.unit}
                    </div>
                  </div>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {locations.map((location) => {
                      const overrideValue = locationMinStocks[location.id] ?? ""
                      const defaultValue = form.minStock || "0"
                      return (
                        <div
                          key={location.id}
                          className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-2 sm:items-center rounded-xl bg-slate-50 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-700 truncate">{location.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                location.type === "WAREHOUSE"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}>
                                {location.type === "WAREHOUSE" ? "Gudang" : "Outlet"}
                              </span>
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              placeholder={defaultValue}
                              value={overrideValue}
                              onChange={(e) => setLocationMinStocks((prev) => ({
                                ...prev,
                                [location.id]: e.target.value,
                              }))}
                              className="w-full pl-3 pr-16 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                              {form.packUnit || form.unit}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {form.packSize && form.packUnit && Object.values(locationMinStocks).some(Boolean) && (
                    <div className="text-xs text-blue-600">
                      Nilai lokasi juga dikonversi ke satuan dasar saat disimpan: 1 {form.packUnit} = {form.packSize} {form.unit}.
                    </div>
                  )}
                </div>
              )}
              <div
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer"
                onClick={() => setForm({ ...form, isTrackable: !form.isTrackable })}
              >
                <div>
                  <div className="text-sm font-medium text-slate-700">Dilacak di opname</div>
                  <div className="text-xs text-slate-400">Nonaktifkan untuk bumbu atau garnish</div>
                </div>
                <div className={`w-10 h-6 rounded-full relative transition-colors ${form.isTrackable ? "bg-blue-600" : "bg-slate-300"}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isTrackable ? "right-1" : "left-1"}`} />
                </div>
              </div>
              {editItem && (
                <div
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer"
                  onClick={() => setForm({ ...form, isActive: !form.isActive })}
                >
                  <div>
                    <div className="text-sm font-medium text-slate-700">Status item</div>
                    <div className="text-xs text-slate-400">{form.isActive ? "Aktif — muncul di daftar pilihan" : "Nonaktif — tersembunyi dari form"}</div>
                  </div>
                  <div className={`w-10 h-6 rounded-full relative transition-colors ${form.isActive ? "bg-blue-600" : "bg-slate-300"}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isActive ? "right-1" : "left-1"}`} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-xl transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
