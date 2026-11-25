"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Pagination } from "@/components/ui/pagination"
import { FormAlert } from "@/components/ui/form-alert"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { StableDraftInput } from "@/components/ui/stable-draft-input"
import { useCanEdit, DISABLED_ACTION_CLASS, NO_EDIT_PERMISSION_TITLE } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { costPerBaseUnit, formatInventoryQuantity, multiplyInventoryQuantity, parseInventoryDecimal, parseInventoryQuantity, quantityInPackages, QuantityInputError } from "@/lib/inventory-quantity"
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

const ALASAN_TERKUNCI = NO_EDIT_PERMISSION_TITLE
const AKSI_NONAKTIF = `${DISABLED_ACTION_CLASS} disabled:hover:text-slate-400`

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
const PACK_UNITS = ["ball", "box", "drum", "dus", "galon", "jerigen", "karton", "karung", "krat", "lusin", "pack", "pcs", "peti", "renteng", "roll", "sak", "toples"]
const DEFAULT_CATEGORIES = ["Bahan Baku", "Kemasan", "Makanan", "Minuman"]

// Angka besar lebih mudah dibaca dengan pemisah ribuan (1000 → "1.000").
// <input type="number"> tidak bisa menampilkan pemisah, jadi kolom yang memakai
// ini harus type="text" + inputMode="numeric".
function formatNumberInput(val: string) {
  const digits = val.replace(/\D/g, "")
  if (!digits) return ""
  return Number(digits).toLocaleString("id-ID")
}
function parseNumberInput(val: string) {
  return val.replace(/\./g, "").replace(/,/g, "")
}

function stockInputFromBase(minStock: number | null, packSize: number | null) {
  if (minStock == null) return ""
  return formatInventoryQuantity(packSize ? quantityInPackages(minStock, packSize) : minStock)
}

function stockInputToBase(value: string, packSize: string) {
  if (!value.trim()) return null
  const parsed = parseInventoryQuantity(value, "Minimum stok", true)
  const perPack = parseInventoryDecimal(packSize)
  return multiplyInventoryQuantity(parsed, perPack != null && perPack > 0 ? perPack : 1)
}

function MinimumStockInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  tone = "slate",
}: {
  value: string
  onCommit: (value: string) => void
  placeholder: string
  ariaLabel: string
  tone?: "slate" | "blue"
}) {
  // Draft lokal mencegah seluruh modal dan semua baris lokasi dirender ulang
  // pada setiap digit. Nilai baru disinkronkan ketika pengguna selesai dari
  // kolom, sehingga fokus dan posisi scroll tetap stabil.
  return (
    <StableDraftInput
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onCommit={onCommit}
      className={`h-10 w-full appearance-none rounded-lg bg-white pl-3 pr-16 text-sm tabular-nums focus:outline-none focus:ring-4 ${
        tone === "blue"
          ? "border border-blue-200 focus:border-blue-400 focus:ring-blue-100"
          : "border border-slate-200 focus:border-blue-400 focus:ring-blue-50"
      }`}
    />
  )
}

function CostPriceInput({
  value,
  onCommit,
  inputRef,
  ariaLabel,
}: {
  value: string
  onCommit: (value: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  ariaLabel: string
}) {
  // Harga pokok sebelumnya menulis ke state form induk pada setiap digit.
  // Akibatnya seluruh isi modal—termasuk semua lokasi—ikut dirender ulang.
  // Draft lokal membuat ketikan hanya merender ulang input ini.
  return (
    <StableDraftInput
      ref={inputRef}
      type="text"
      inputMode="numeric"
      required
      aria-label={ariaLabel}
      placeholder="Contoh: 35.000"
      value={value}
      formatValue={formatNumberInput}
      onCommit={onCommit}
      className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-4 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
    />
  )
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
  const canEdit = useCanEdit("MASTER_INVENTORY")
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showPackaging, setShowPackaging] = useState(false)
  const [packagingChangeNotice, setPackagingChangeNotice] = useState("")
  const packagingRestoreRef = useRef<{ costPrice: string; locationMinStocks: Record<string, string>; allLocationsMinStock: string } | null>(null)
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
  const packSizeRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const [customPackUnits, setCustomPackUnits] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalAll, setTotalAll] = useState(0)
  const [missingCost, setMissingCost] = useState(0)
  const [serverCategories, setServerCategories] = useState<string[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  // Pencarian ditunda sebentar supaya tiap ketikan tidak memanggil server.
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [locationMinStocks, setLocationMinStocks] = useState<Record<string, string>>({})
  const [allLocationsMinStock, setAllLocationsMinStock] = useState("")

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (unitRef.current && !unitRef.current.contains(e.target as Node)) setUnitOpen(false)
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false)
      if (packUnitRef.current && !packUnitRef.current.contains(e.target as Node)) setPackUnitOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Kolom pencarian dropdown difokuskan otomatis hanya di perangkat ber-mouse.
  // Di layar sentuh, fokus paksa memunculkan keyboard dan membuat Safari
  // menggulirkan form ke posisi kolom itu — form terlihat melompat sendiri.
  useEffect(() => {
    if (!unitOpen && !packUnitOpen && !categoryOpen) return
    if (window.matchMedia("(pointer: coarse)").matches) return
    const timeoutId = window.setTimeout(() => {
      if (unitOpen) unitSearchRef.current?.focus({ preventScroll: true })
      else if (packUnitOpen) packUnitSearchRef.current?.focus({ preventScroll: true })
      else if (categoryOpen) categorySearchRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [unitOpen, packUnitOpen, categoryOpen])

  const fetchItems = useCallback(async (nextPage = 1, { silent = false } = {}) => {
    if (!silent) setLoading(true)
    const p = new URLSearchParams({ page: String(nextPage) })
    if (debouncedSearch)      p.set("search",   debouncedSearch)
    if (category !== "Semua") p.set("category", category)
    const res = await fetch(`/api/inventory?${p}`)
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
      setPage(data.page)
      setPages(data.pages)
      setTotal(data.total)
      setTotalAll(data.totalAll)
      setMissingCost(data.missingCost)
      setServerCategories(data.categories)
    }
    setLoading(false)
  }, [debouncedSearch, category])

  async function fetchLocations() {
    const res = await fetch("/api/locations")
    if (res.ok) setLocations(await res.json())
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { fetchLocations() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])


  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timeoutId)
  }, [search])

  // Pencarian dan kategori disaring di server, jadi daftar dimuat ulang saat berubah.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchItems() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchItems])

  // Item yang ditambah pengguna lain ikut muncul tanpa memuat ulang halaman.
  useLiveRefresh(() => { void fetchItems(page, { silent: true }) })

  function openCreate() {
    setEditItem(null)
    setForm(emptyForm)
    setShowPackaging(false)
    setPackagingChangeNotice("")
    packagingRestoreRef.current = null
    setLocationMinStocks({})
    setAllLocationsMinStock("")
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
    setShowPackaging(item.packUnit != null || item.packSize != null)
    setPackagingChangeNotice("")
    packagingRestoreRef.current = null
    setForm({
      name: item.name,
      sku: item.sku ?? "",
      category: item.category ?? "",
      unit: item.unit,
      packSize: item.packSize != null ? formatInventoryQuantity(item.packSize) : "",
      packUnit: item.packUnit ?? "",
      // Tampilkan harga per kemasan agar user edit dalam satuan yang sama saat input
      costPrice: item.costPrice != null
        ? formatNumberInput(item.packSize
          ? String(Math.round(Number(item.costPrice) * item.packSize))
          : String(Math.round(Number(item.costPrice))))
        : "",
      minStock: "",
      isTrackable: item.isTrackable,
      isActive: item.isActive,
    })
    const nextLocationMinStocks: Record<string, string> = {}
    for (const setting of item.locationSettings ?? []) {
      nextLocationMinStocks[setting.locationId] = stockInputFromBase(setting.minStock, item.packSize)
    }
    setLocationMinStocks(nextLocationMinStocks)
    const locationValues = locations.map((location) => nextLocationMinStocks[location.id] ?? "")
    setAllLocationsMinStock(
      locationValues.length > 0 && locationValues.every((value) => value === locationValues[0])
        ? locationValues[0]
        : ""
    )
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
    setError("")

    const packSize = parseInventoryDecimal(form.packSize) ?? NaN
    if (showPackaging && !form.packUnit.trim()) {
      setError("Pilih jenis kemasan atau hapus bagian kemasan.")
      packUnitRef.current?.querySelector("button")?.focus({ preventScroll: true })
      return
    }
    if (showPackaging) {
      try { parseInventoryQuantity(form.packSize, "Isi per kemasan") }
      catch (error) {
        setError(error instanceof Error ? error.message : "Isi per kemasan tidak valid")
        packSizeRef.current?.focus({ preventScroll: true })
        return
      }
    }

    const enteredCost = Number(parseNumberInput(form.costPrice))
    if (!form.costPrice || !Number.isFinite(enteredCost) || enteredCost < 0) {
      setError("Harga pokok wajib diisi dan tidak boleh negatif. Gunakan Rp0 untuk bahan gratis.")
      priceRef.current?.focus({ preventScroll: true })
      return
    }

    setSubmitting(true)

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        sku: form.sku || null,
        category: form.category || null,
        unit: form.unit,
        packSize: showPackaging ? packSize : null,
        packUnit: showPackaging ? form.packUnit.trim() : null,
        // Jika ada packSize, harga diinput per kemasan → konversi ke per satuan dasar
        costPrice: showPackaging ? costPerBaseUnit(enteredCost, packSize) : enteredCost,
        minStock: null,
        isTrackable: form.isTrackable,
        isActive: form.isActive,
      }

      if (locations.length > 0) {
        body.locationMinStocks = locations.map((location) => ({
          locationId: location.id,
          minStock: stockInputToBase(locationMinStocks[location.id] ?? "", showPackaging ? form.packSize : ""),
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
    } catch (error) {
      setError(error instanceof QuantityInputError ? error.message : "Koneksi gagal, coba lagi")
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
    try {
      const res = await fetch(`/api/inventory/${confirmDelete.id}`, { method: "DELETE" })
      if (res.ok) {
        setConfirmDelete(null)
        void fetchItems()
      } else {
        setDeleteError(await readApiError(res, "Gagal menghapus item"))
      }
    } catch {
      setDeleteError("Koneksi gagal, coba lagi")
    } finally {
      setDeleting(false)
    }
  }

  const formatRp = (n: number | null) =>
    n == null ? "—" : `Rp ${n.toLocaleString("id-ID")}`

  const uniqueCategories = serverCategories
  const allCategories = ["Semua", ...uniqueCategories]
  const parsedPackSize = parseInventoryDecimal(form.packSize)
  const hasCompletePackaging = showPackaging && !!form.packUnit && parsedPackSize != null && parsedPackSize > 0 && parsedPackSize < 1e12 && Number(parsedPackSize.toFixed(3)) === parsedPackSize
  const inputUnit = showPackaging ? (form.packUnit || "kemasan") : form.unit

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Master Inventori</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {totalAll} item terdaftar
            {missingCost > 0 && <span className="text-orange-500 ml-1">· {missingCost} tanpa harga pokok</span>}
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={!canEdit}
          title={canEdit ? undefined : ALASAN_TERKUNCI}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-600 sm:w-auto sm:rounded-full"
        >
          <Plus className="w-4 h-4" />
          Tambah Item
        </button>
      </div>

      {missingCost > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-l-4 border-orange-200 border-l-orange-500 bg-white p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
          </div>
          <div className="min-w-0 text-sm leading-relaxed">
            <span className="font-semibold text-orange-800">{missingCost} item belum ada harga pokok.</span>{" "}
            <span className="text-orange-600">Estimasi kerugian belum dapat dihitung secara akurat.</span>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama item atau SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
          />
        </div>
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 sm:pb-0">
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
      <div ref={listRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-[1040px] w-full text-sm">
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
                  {items.map((item, idx) => (
                    <tr key={item.id} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 !== 0 ? "bg-slate-50/50" : ""}`}>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 text-[13px]">{item.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {item.unit}
                          {item.packSize && item.packUnit && (
                            <span className="ml-1.5 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md text-[10px]">
                              1 {item.packUnit} = {formatInventoryQuantity(item.packSize)} {item.unit}
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
                        {item.costPrice != null ? (
                          <div>
                            <div className="text-slate-900 text-[13px]">
                              {item.packSize && item.packUnit
                                ? `${formatRp(Math.round(item.costPrice * item.packSize))}/${item.packUnit}`
                                : `${formatRp(item.costPrice)}/${item.unit}`}
                            </div>
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
                        {(item.locationSettings?.filter((setting) => setting.minStock != null).length ?? 0) > 0 ? (
                          <div className="text-xs font-medium text-blue-600">
                            {item.locationSettings?.filter((setting) => setting.minStock != null).length} lokasi diatur
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Belum diatur</span>
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
                            disabled={!canEdit}
                            title={canEdit ? undefined : ALASAN_TERKUNCI}
                            aria-label={`Edit ${item.name}`}
                            className={`p-1.5 rounded-lg transition-colors text-slate-400 ${AKSI_NONAKTIF} hover:bg-blue-50 hover:text-blue-600`}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDelete(item.id, item.name)}
                            disabled={!canEdit}
                            title={canEdit ? undefined : ALASAN_TERKUNCI}
                            aria-label={`Hapus ${item.name}`}
                            className={`p-1.5 rounded-lg transition-colors text-slate-400 ${AKSI_NONAKTIF} hover:bg-red-50 hover:text-red-500`}
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
            <div className="divide-y divide-slate-100 xl:hidden">
              {items.map((item) => {
                const configuredLocations = item.locationSettings?.filter((setting) => setting.minStock != null).length ?? 0
                const costLabel = item.costPrice != null
                  ? item.packSize && item.packUnit
                    ? `${formatRp(Math.round(item.costPrice * item.packSize))}/${item.packUnit}`
                    : `${formatRp(item.costPrice)}/${item.unit}`
                  : null

                return (
                  <article key={item.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-sm font-semibold text-slate-900">{item.name}</h2>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {item.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                          <span>{item.unit}</span>
                          {item.packSize && item.packUnit && (
                            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                              1 {item.packUnit} = {formatInventoryQuantity(item.packSize)} {item.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          disabled={!canEdit}
                          title={canEdit ? undefined : ALASAN_TERKUNCI}
                          aria-label={`Edit ${item.name}`}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors ${AKSI_NONAKTIF} hover:bg-blue-50 hover:text-blue-600`}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(item.id, item.name)}
                          disabled={!canEdit}
                          title={canEdit ? undefined : ALASAN_TERKUNCI}
                          aria-label={`Hapus ${item.name}`}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors ${AKSI_NONAKTIF} hover:bg-red-50 hover:text-red-500`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-4">
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">SKU</dt>
                        <dd className="mt-1 truncate font-mono text-xs text-slate-700">{item.sku ?? "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Kategori</dt>
                        <dd className="mt-1 truncate text-xs font-medium text-slate-700">{item.category ?? "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Harga Pokok</dt>
                        <dd className={`mt-1 break-words text-xs font-medium ${costLabel ? "text-slate-700" : item.isTrackable ? "text-orange-600" : "text-slate-400"}`}>
                          {costLabel ?? (item.isTrackable ? "Belum diisi" : "—")}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Minimum Stok</dt>
                        <dd className={`mt-1 text-xs font-medium ${configuredLocations > 0 ? "text-blue-600" : "text-slate-400"}`}>
                          {configuredLocations > 0 ? `${configuredLocations} lokasi diatur` : "Belum diatur"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      {item.isTrackable ? (
                        <><CheckCircle className="h-4 w-4 text-emerald-500" /> Dilacak per transaksi</>
                      ) : (
                        <><span className="h-4 w-4 text-center text-slate-300">—</span> Hanya dihitung via opname (bumbu/garnish)</>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
            {items.length === 0 && (
              <div className="px-4 py-14 text-center sm:py-20">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Package className="w-7 h-7 text-slate-400" />
                </div>
                <div className="text-slate-600 font-semibold">
                  {totalAll === 0 ? "Belum ada item" : "Tidak ada item ditemukan"}
                </div>
                <div className="text-slate-400 text-sm mt-1.5">
                  {totalAll > 0
                    ? "Coba ubah filter atau kata pencarian"
                    : canEdit
                      ? "Klik Tambah Item untuk mulai mendaftarkan bahan"
                      : "Belum ada item yang didaftarkan"}
                </div>
              </div>
            )}
            <Pagination page={page} pages={pages} total={total} perPage={30} label="item"
              loading={loading} scrollToRef={listRef} onPageChange={fetchItems} />
          </>
        )}
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Hapus item?"
        message={confirmDelete ? `\"${confirmDelete.name}\" beserta stok dan riwayatnya akan terhapus. Tindakan ini tidak dapat dibatalkan.` : undefined}
        confirmLabel="Hapus"
        danger
        loading={deleting}
        error={deleteError}
      />

      {showModal && (
        <div className="app-overlay z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={() => setShowModal(false)} />
          <div className="relative z-10 flex max-h-[calc(100%-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:max-h-[calc(100%-2rem)] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-3 sm:px-6 sm:py-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editItem ? "Edit Item" : "Tambah Item Baru"}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Tutup formulir" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div
                className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6"
                style={{ overflowAnchor: "none" }}
              >
              <FormAlert message={error} onClose={() => setError("")} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Nama Item <span className="text-red-500" aria-hidden="true">*</span>
                </label>
                <StableDraftInput
                  type="text"
                  required
                  placeholder="Contoh: Beef Patty 80gr"
                  value={form.name}
                  onCommit={(value) => setForm((previous) => ({ ...previous, name: value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">SKU</label>
                  <StableDraftInput
                    type="text"
                    placeholder="BP-001"
                    value={form.sku}
                    onCommit={(value) => setForm((previous) => ({ ...previous, sku: value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Satuan Dasar <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <div ref={unitRef} className="relative">
                    <button
                      type="button"
                      onClick={() => { setUnitOpen((o) => !o); setUnitSearch("") }}
                      className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                    >
                      <span className={form.unit ? "text-slate-900" : "text-slate-400"}>{form.unit || "Pilih satuan..."}</span>
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {unitOpen && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            ref={unitSearchRef}
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
                                    if (!trimmed) { unitSearchRef.current?.focus({ preventScroll: true }); return }
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
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 ring-1 ring-slate-200">
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Kemasan <span className="font-normal text-slate-400">(opsional)</span></h3>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">Gunakan jika item dibeli atau disimpan per dus, pack, atau kemasan lain.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPackUnitOpen(false)
                      setError("")
                      if (showPackaging) {
                        const snapshot = packagingRestoreRef.current
                        if (snapshot) {
                          setLocationMinStocks(snapshot.locationMinStocks)
                          setAllLocationsMinStock(snapshot.allLocationsMinStock)
                          setForm((previous) => ({ ...previous, packUnit: "", packSize: "", costPrice: snapshot.costPrice }))
                          packagingRestoreRef.current = null
                          setPackagingChangeNotice("")
                        } else {
                          const multiplier = parseInventoryDecimal(form.packSize)
                          if (multiplier != null && multiplier > 0) {
                            try {
                              const converted = Object.fromEntries(Object.entries(locationMinStocks).map(([id, value]) => [id, value ? formatInventoryQuantity(stockInputToBase(value, form.packSize) ?? 0) : ""]))
                              const convertedAll = allLocationsMinStock ? formatInventoryQuantity(stockInputToBase(allLocationsMinStock, form.packSize) ?? 0) : ""
                              setLocationMinStocks(converted)
                              setAllLocationsMinStock(convertedAll)
                            } catch (error) {
                              setError(error instanceof Error ? error.message : "Minimum stok tidak valid")
                              return
                            }
                          }
                          setForm((previous) => ({ ...previous, packUnit: "", packSize: "", costPrice: hasCompletePackaging ? "" : previous.costPrice }))
                          setPackagingChangeNotice(hasCompletePackaging ? "Kemasan dihapus. Isi ulang harga pokok per satuan dasar." : "")
                        }
                        setShowPackaging(false)
                      } else {
                        packagingRestoreRef.current = { costPrice: form.costPrice, locationMinStocks, allLocationsMinStock }
                        const hadThresholds = allLocationsMinStock !== "" || Object.values(locationMinStocks).some(Boolean)
                        const clearedFields = [form.costPrice && "harga pokok", hadThresholds && "minimum stok"].filter(Boolean).join(" dan ")
                        setPackagingChangeNotice(clearedFields ? `Satuan berubah: ${clearedFields} dikosongkan. Isi ulang sesuai kemasan.` : "")
                        setForm((previous) => ({ ...previous, costPrice: "" }))
                        setLocationMinStocks({})
                        setAllLocationsMinStock("")
                        setShowPackaging(true)
                      }
                    }}
                    className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${showPackaging ? "text-slate-500 hover:bg-white hover:text-red-600" : "bg-white text-blue-600 ring-1 ring-blue-200 hover:bg-blue-50"}`}
                  >
                    {showPackaging ? "Hapus kemasan" : "+ Tambah kemasan"}
                  </button>
                </div>
                {packagingChangeNotice && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">{packagingChangeNotice}</p>}
                {showPackaging && (
                  <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">Jenis kemasan <span className="text-red-500">*</span></label>
                      <div ref={packUnitRef} className="relative min-w-0">
                    <button
                      type="button"
                      aria-expanded={packUnitOpen}
                      onClick={() => { setPackUnitOpen((o) => !o); setPackUnitSearch("") }}
                      className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                    >
                      <span className={form.packUnit ? "text-slate-900" : "text-slate-400"}>{form.packUnit || "Contoh: dus"}</span>
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {packUnitOpen && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            ref={packUnitSearchRef}
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
                                    if (!trimmed) { packUnitSearchRef.current?.focus({ preventScroll: true }); return }
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
                    </div>
                    <div>
                      <label htmlFor="inventory-pack-size" className="mb-1.5 block text-xs font-semibold text-slate-600">Isi per kemasan <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <StableDraftInput
                          id="inventory-pack-size"
                          ref={packSizeRef}
                          type="text"
                          inputMode="decimal"
                          placeholder="Contoh: 0,05 atau 12"
                          value={form.packSize}
                          onCommit={(value) => setForm((previous) => ({ ...previous, packSize: value }))}
                          className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-16 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{form.unit}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-slate-500">Boleh pecahan, maksimal 3 angka desimal{form.unit === "kg" ? ". Contoh: 0,05 kg = 50 gram." : ". Gunakan koma untuk desimal."}</p>
                    </div>
                    {hasCompletePackaging && (
                      <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700 sm:col-span-2">
                        1 {form.packUnit} = {formatInventoryQuantity(parsedPackSize!)} {form.unit}{form.unit === "kg" ? ` (${formatInventoryQuantity(parsedPackSize! * 1000)} gram)` : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Kategori</label>
                  <div ref={categoryRef} className="relative">
                  <button
                    type="button"
                    onClick={() => { setCategoryOpen((o) => !o); setCategorySearch("") }}
                    className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                  >
                    <span className={form.category ? "text-slate-900" : "text-slate-400"}>{form.category || "Pilih atau buat kategori..."}</span>
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {categoryOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-slate-100">
                        <input
                          ref={categorySearchRef}
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
                                  if (!trimmed) { categorySearchRef.current?.focus({ preventScroll: true }); return }
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
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Harga Pokok per {inputUnit} <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                    <CostPriceInput
                      inputRef={priceRef}
                      ariaLabel={`Harga Pokok per ${inputUnit}`}
                      value={form.costPrice}
                      onCommit={(value) => setForm((previous) => ({ ...previous, costPrice: value }))}
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    {hasCompletePackaging
                      ? `Isi harga beli untuk 1 ${form.packUnit}. HPP per ${form.unit} dihitung otomatis; Rp0 boleh untuk bahan gratis.`
                      : `Isi harga beli untuk 1 ${inputUnit}. Gunakan Rp0 jika bahan memang diperoleh gratis.`}
                  </p>
                </div>
              </div>
              {locations.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-slate-200 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">Minimum Stok per Lokasi</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-slate-400">Peringatan dibuat saat stok sama dengan atau di bawah minimum. Untuk outlet, WhatsApp dikirim ke penanggung jawab gudang pemenuhannya.</div>
                    </div>
                    <div className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] leading-5 text-slate-500">
                      <span>Dalam</span>
                      <span className="font-semibold text-slate-700">{inputUnit}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-blue-800">Semua lokasi</div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-blue-600">Isi sekali untuk menerapkan nilai yang sama ke seluruh lokasi.</div>
                    </div>
                    <div className="relative">
                      <MinimumStockInput
                        value={allLocationsMinStock}
                        placeholder="Atur semua..."
                        ariaLabel="Minimum stok semua lokasi"
                        tone="blue"
                        onCommit={(value) => {
                          setAllLocationsMinStock(value)
                          setLocationMinStocks(Object.fromEntries(
                            locations.map((location) => [location.id, value])
                          ))
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                        {inputUnit}
                      </span>
                    </div>
                  </div>
                  {/* Di HP daftar ini mengalir mengikuti scroll form. Dulu ia punya
                      area scroll sendiri, dan kolom di dalamnya membuat Safari
                      menggulirkan dua scroller sekaligus sehingga tampilan terlihat
                      bergerak saat mengetik. Di layar besar tetap dibatasi. */}
                  <div className="space-y-2 pr-1 sm:max-h-52 sm:overflow-y-auto">
                    {locations.map((location) => {
                      const overrideValue = locationMinStocks[location.id] ?? ""
                      return (
                        <div
                          key={location.id}
                          className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-700 truncate">{location.name}</span>
                              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                location.type === "WAREHOUSE"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}>
                                {location.type === "WAREHOUSE" ? "Gudang" : "Outlet"}
                              </span>
                            </div>
                          </div>
                          <div className="relative">
                            <MinimumStockInput
                              value={overrideValue}
                              placeholder="Atur sendiri..."
                              ariaLabel={`Minimum stok ${location.name}`}
                              onCommit={(value) => {
                                setAllLocationsMinStock("")
                                setLocationMinStocks((prev) => ({
                                  ...prev,
                                  [location.id]: value,
                                }))
                              }}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                              {inputUnit}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Tampil begitu kemasan lengkap, tidak menunggu nilai terisi.
                      Sebelumnya teks ini muncul saat kolom mulai diketik, sehingga
                      tinggi form bertambah dan isinya tergeser di tengah pengetikan. */}
                  {hasCompletePackaging && (
                    <div className="text-xs leading-relaxed text-blue-600">
                      Nilai lokasi juga dikonversi ke satuan dasar saat disimpan: 1 {form.packUnit} = {formatInventoryQuantity(parsedPackSize!)} {form.unit}.
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                aria-pressed={form.isTrackable}
                className="flex w-full items-center justify-between gap-4 rounded-xl bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100"
                onClick={() => setForm({ ...form, isTrackable: !form.isTrackable })}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700">Dilacak per transaksi</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-400">Matikan untuk bumbu atau garnish yang kecil. Stoknya tidak berkurang tiap penjualan, cukup dihitung saat opname. Tetap bisa barang masuk dan transfer.</div>
                </div>
                <div className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${form.isTrackable ? "bg-blue-600" : "bg-slate-300"}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isTrackable ? "right-1" : "left-1"}`} />
                </div>
              </button>
              <button
                type="button"
                aria-pressed={form.isActive}
                className="flex w-full items-center justify-between gap-4 rounded-xl bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100"
                onClick={() => setForm({ ...form, isActive: !form.isActive })}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700">Status item</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{form.isActive ? "Aktif — muncul di daftar pilihan" : "Nonaktif — tersembunyi dari form"}</div>
                </div>
                <div className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${form.isActive ? "bg-blue-600" : "bg-slate-300"}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isActive ? "right-1" : "left-1"}`} />
                </div>
              </button>
              </div>

              <div className="dialog-actions grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-6 sm:py-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="min-h-12 rounded-full border border-slate-200 px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
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
