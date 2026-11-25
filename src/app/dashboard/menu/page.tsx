"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { WarningModal } from "@/components/ui/warning-modal"
import { FormAlert } from "@/components/ui/form-alert"
import { AppPortal } from "@/components/ui/app-portal"
import { StableDraftInput, StableDraftTextarea } from "@/components/ui/stable-draft-input"
import { useConfirm } from "@/components/ui/use-confirm"
import { useCanEdit, DISABLED_ACTION_CLASS, NO_EDIT_PERMISSION_TITLE } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import {
  Plus,
  Search,
  Edit,
  Trash2,
  UtensilsCrossed,
  Loader2,
  X,
  ChefHat,
  ImagePlus,
  Camera,
  Trash,
  Tag,
  MapPin,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Check,
  SlidersHorizontal,
  Package,
} from "lucide-react"
import { formatDiscountSchedule, getDiscountScheduleStatus } from "@/lib/discount-schedule"
import { discountScheduleInput, jakartaTimeInput, minuteToTime } from "@/lib/discount-schedule-form"
import { DiscountScheduleFields } from "@/components/discount-schedule-fields"
import { ListPagination } from "@/components/ui/list-pagination"
import { compressImage } from "@/lib/compress-image"
import { parseInventoryDecimal, parseInventoryQuantity } from "@/lib/inventory-quantity"

function formatRpInput(val: string) {
  const digits = val.replace(/\D/g, "")
  if (!digits) return ""
  return Number(digits).toLocaleString("id-ID")
}
function parseQtyInput(val: string) {
  return parseInventoryDecimal(val)
}
// Angka dari server langsung diformat ke gaya Indonesia, termasuk 0,05 kg.
function formatQtyFromNumber(value: number) {
  if (!Number.isFinite(value)) return ""
  return value.toLocaleString("id-ID", { maximumFractionDigits: 3 })
}
function parseRpInput(val: string) {
  return val.replace(/\./g, "").replace(/,/g, "")
}

function dateInputValue(value: string | null) {
  if (!value) return ""
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

type Ingredient = {
  id: string
  name: string
  unit: string
  isTrackable: boolean
}

type InventoryOption = Ingredient & {
  isMenuItem: boolean
}

type RecipeItem = {
  id: string
  childItemId: string
  quantity: number
  childItem: Ingredient
}

type LocalModGroup = {
  _key: string
  id?: string
  name: string
  isRequired: boolean
  maxSelect: number
  options: {
    _key: string
    name: string
    price: string
    recipeItems: { _key: string; itemId: string; quantity: string }[]
  }[]
}

type DiscountRule = {
  id: string
  name: string
  type: "PERCENT" | "AMOUNT"
  value: number
  minPurchase: number
  isActive: boolean
  scheduleMode: "PERIOD" | "RECURRING"
  validDays: string | null
  startsAt: string | null
  expiresAt: string | null
  startMinute: number | null
  endMinute: number | null
  locations: { location: { id: string; name: string } }[]
  items: { menuItem: { id: string; name: string } }[]
}

type DiscountLocation = { id: string; name: string }

type SearchableMultiSelectProps = {
  label: string
  description: string
  allLabel: string
  searchPlaceholder: string
  emptyText: string
  options: { id: string; name: string }[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  icon: React.ReactNode
}

function SearchableMultiSelect({
  label,
  description,
  allLabel,
  searchPlaceholder,
  emptyText,
  options,
  selectedIds,
  onChange,
  icon,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selectedOptions = options.filter((option) => selectedIds.includes(option.id))
  const filteredOptions = options.filter((option) => option.name.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [])

  useEffect(() => {
    if (!open || window.matchMedia("(pointer: coarse)").matches) return
    const timeoutId = window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 0)
    return () => window.clearTimeout(timeoutId)
  }, [open])

  const summary = selectedIds.length === 0
    ? allLabel
    : selectedOptions.length === 1
      ? selectedOptions[0].name
      : `${selectedOptions.length} dipilih`

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="mb-2 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{description}</p>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left transition-all ${open ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 hover:border-blue-300"}`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-700">{summary}</p>
          {selectedIds.length > 1 && <p className="mt-0.5 truncate text-[11px] text-slate-400">{selectedOptions.slice(0, 3).map((option) => option.name).join(", ")}{selectedOptions.length > 3 ? ` +${selectedOptions.length - 3}` : ""}</p>}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            <button type="button" onClick={() => { onChange([]); setOpen(false); setQuery("") }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${selectedIds.length === 0 ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
              <span>{allLabel}</span>{selectedIds.length === 0 && <Check className="h-4 w-4" />}
            </button>
            <div className="my-1 border-t border-slate-100" />
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-slate-400">{emptyText}</p>
            ) : filteredOptions.map((option) => {
              const selected = selectedIds.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChange(selected ? selectedIds.filter((id) => id !== option.id) : [...selectedIds, option.id])}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${selected ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  <span className="truncate">{option.name}</span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>
                </button>
              )
            })}
          </div>
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2.5">
              <span className="text-xs font-semibold text-slate-500">{selectedIds.length} dipilih</span>
              <button type="button" onClick={() => { setOpen(false); setQuery("") }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Selesai</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function newDiscountForm() {
  return {
    name: "",
    type: "PERCENT" as "PERCENT" | "AMOUNT",
    value: "",
    minPurchase: "",
    scheduleMode: "PERIOD" as "PERIOD" | "RECURRING",
    validDays: [] as number[],
    startsAt: "",
    expiresAt: "",
    startTime: "",
    endTime: "",
    locationIds: [] as string[],
    itemIds: [] as string[],
  }
}

type Menu = {
  id: string
  name: string
  sku: string | null
  category: string | null
  notes: string | null
  description: string | null
  imageUrl: string | null
  isActive: boolean
  sellPrice: number | null
  recipeItems: RecipeItem[]
  modifierGroups: {
    groupId: string
    group: {
      id: string
      name: string
      isRequired: boolean
      maxSelect: number
      options: {
        id: string
        name: string
        price: number
        recipeItems?: { itemId: string; quantity: number; item?: Ingredient }[]
      }[]
    }
  }[]
}

const MENU_CATEGORIES = ["Makanan", "Minuman", "Snack", "Paket", "Lainnya"]
const LIST_PAGE_SIZE = 5

const emptyForm = {
  name: "",
  sku: "",
  category: "Makanan",
  notes: "",
  description: "",
  imageUrl: "",
  isActive: true,
  sellPrice: "",
}

type MenuPanel = "main" | "recipe" | "modifiers"

export default function MenuPage() {
  const canEdit = useCanEdit("MASTER_MENU")
  const [menus, setMenus] = useState<Menu[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [localModGroups, setLocalModGroups] = useState<LocalModGroup[]>([])
  const [deletedGroupIds, setDeletedGroupIds] = useState<string[]>([])
  // Opsi tampil satu baris; panel "bahan stok" dibuka per opsi agar daftar
  // opsi (mis. Regular/Medium/Large) tetap ringkas dan mudah dibaca.
  const [openOptionStock, setOpenOptionStock] = useState<string[]>([])
  const toggleOptionStock = (key: string) =>
    setOpenOptionStock((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")
  const [menuPage, setMenuPage] = useState(1)
  const [menuPageSize, setMenuPageSize] = useState(LIST_PAGE_SIZE)
  const [showAllMenus, setShowAllMenus] = useState(false)
  const [menuTotal, setMenuTotal] = useState(0)
  // Daftar ringan seluruh menu (id/nama/kategori) — dipakai chip kategori dan
  // pemilih menu di aturan diskon, yang tetap butuh semua menu meski daftar
  // utamanya dipaginasi.
  const [menuOptions, setMenuOptions] = useState<{ id: string; name: string; category: string | null }[]>([])
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const menuListRef = useRef<HTMLDivElement>(null)

  const [showModal, setShowModal] = useState(false)
  const [menuPanel, setMenuPanel] = useState<MenuPanel>("main")
  const [menuPanelDirection, setMenuPanelDirection] = useState<"forward" | "back">("forward")
  const [menuModalClosing, setMenuModalClosing] = useState(false)
  const menuModalCloseTimer = useRef<number | null>(null)
  const menuFormScrollRef = useRef<HTMLDivElement>(null)
  const [editMenu, setEditMenu] = useState<Menu | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [recipe, setRecipe] = useState<{ childItemId: string; quantity: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [warning, setWarning] = useState<{ title?: string; messages: string[] } | null>(null)
  const { ask, dialog: confirmDialog } = useConfirm()

  // Discount rules management
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([])
  const [discountSearch, setDiscountSearch] = useState("")
  const [discountPage, setDiscountPage] = useState(1)
  const [showAllDiscounts, setShowAllDiscounts] = useState(false)
  const discountListRef = useRef<HTMLDivElement>(null)
  const [showDiscountForm, setShowDiscountForm] = useState(false)
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null)
  const [discForm, setDiscForm] = useState(newDiscountForm)
  const [discountLocations, setDiscountLocations] = useState<DiscountLocation[]>([])
  const [discSaving, setDiscSaving] = useState(false)
  const [discError, setDiscError] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [categoryOpen, setCategoryOpen] = useState(false)
  const categoryRef = useRef<HTMLDivElement>(null)
  const categorySearchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) setCategoryOpen(false)
    }

    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => {
    if (!categoryOpen || window.matchMedia("(pointer: coarse)").matches) return
    const timeoutId = window.setTimeout(() => categorySearchRef.current?.focus({ preventScroll: true }), 0)
    return () => window.clearTimeout(timeoutId)
  }, [categoryOpen])

  useEffect(() => () => {
    if (menuModalCloseTimer.current) window.clearTimeout(menuModalCloseTimer.current)
  }, [])

  const fetchMenus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    const p = new URLSearchParams()
    if (debouncedSearch)      p.set("search",   debouncedSearch)
    if (category !== "Semua") p.set("category", category)
    if (!showAllMenus) {
      p.set("page", String(menuPage))
      p.set("take", String(menuPageSize))
    }
    const res = await fetch(`/api/menu?${p}`)
    if (res.ok) {
      const data = await res.json()
      if (showAllMenus) {
        setMenus(data)
        setMenuTotal(data.length)
      } else {
        setMenus(data.items)
        setMenuTotal(data.total)
      }
    }
    setLoading(false)
  }, [debouncedSearch, category, showAllMenus, menuPage, menuPageSize])

  async function fetchMenuOptions() {
    const res = await fetch("/api/menu?minimal=1")
    if (res.ok) setMenuOptions(await res.json())
  }

  async function fetchIngredients() {
    const res = await fetch("/api/inventory?active=true")
    if (res.ok) {
      const all = await res.json() as InventoryOption[]
      setIngredients(all.filter((i) => !i.isMenuItem))
    }
  }

  async function fetchDiscountRules() {
    const res = await fetch("/api/discount-rules")
    if (res.ok) setDiscountRules(await res.json())
  }

  async function fetchDiscountLocations() {
    const res = await fetch("/api/locations?type=OUTLET")
    if (res.ok) setDiscountLocations(await res.json())
  }

  async function handleDiscountSubmit(e: React.FormEvent) {
    e.preventDefault()
    setDiscError("")
    let schedule: ReturnType<typeof discountScheduleInput>
    try {
      schedule = discountScheduleInput(discForm)
    } catch (error) {
      setWarning({ title: "Jadwal belum lengkap", messages: [error instanceof Error ? error.message : "Periksa kembali jadwal diskon."] })
      return
    }
    setDiscSaving(true)
    try {
      const url = editingRule ? `/api/discount-rules/${editingRule.id}` : "/api/discount-rules"
      const method = editingRule ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: discForm.name,
          type: discForm.type,
          value: discForm.type === "AMOUNT" ? Number(parseRpInput(discForm.value)) : Number(discForm.value),
          minPurchase: discForm.minPurchase ? Number(parseRpInput(discForm.minPurchase)) : 0,
          ...schedule,
          locationIds: discForm.locationIds,
          itemIds: discForm.itemIds,
        }),
      })
      if (!res.ok) { const d = await res.json(); setDiscError(d.error ?? "Gagal menyimpan"); return }
      await fetchDiscountRules()
      setShowDiscountForm(false)
      setEditingRule(null)
      setDiscForm(newDiscountForm())
    } catch { setDiscError("Tidak dapat terhubung ke server") }
    finally { setDiscSaving(false) }
  }

  function handleDiscountDelete(id: string) {
    ask({
      title: "Hapus aturan diskon?",
      message: "Aturan diskon ini akan dihapus dan tidak lagi muncul sebagai saran di kasir.",
      confirmLabel: "Hapus",
      danger: true,
      onConfirm: async () => {
        const res = await fetch(`/api/discount-rules/${id}`, { method: "DELETE" })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setWarning({ title: "Diskon belum terhapus", messages: [data.error ?? "Server gagal menghapus aturan diskon"] })
          return
        }
        setDiscountRules((prev) => prev.filter((r) => r.id !== id))
      },
    })
  }

  async function handleDiscountToggle(rule: DiscountRule) {
    const res = await fetch(`/api/discount-rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setWarning({ title: "Status belum berubah", messages: [data.error ?? "Server gagal mengubah status diskon"] })
      return
    }
    setDiscountRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchMenuOptions()
      fetchIngredients()
      fetchDiscountRules()
      fetchDiscountLocations()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timeoutId)
  }, [search])

  // Pencarian, kategori, dan halaman disaring di server.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchMenus() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchMenus])

  // Menu yang ditambah pengguna lain ikut muncul tanpa perlu memuat ulang halaman.
  useLiveRefresh(() => { void fetchMenus({ silent: true }) })

  const currentMenuPage = Math.min(menuPage, Math.max(1, Math.ceil(menuTotal / menuPageSize)))
  const visibleMenus = menus
  const discountQuery = discountSearch.trim().toLowerCase()
  const filteredDiscounts = discountRules.filter((rule) =>
    !discountQuery || [
      rule.name,
      ...rule.locations.map(({ location }) => location.name),
      ...rule.items.map(({ menuItem }) => menuItem.name),
    ].some((value) => value.toLowerCase().includes(discountQuery))
  )
  const currentDiscountPage = Math.min(discountPage, Math.max(1, Math.ceil(filteredDiscounts.length / LIST_PAGE_SIZE)))
  const visibleDiscounts = showAllDiscounts ? filteredDiscounts : filteredDiscounts.slice((currentDiscountPage - 1) * LIST_PAGE_SIZE, currentDiscountPage * LIST_PAGE_SIZE)

  async function handleImageUpload(file: File) {
    setUploadingImage(true)
    setError("")
    try {
      // Foto kamera HP sering berupa HEIC dan lebih dari 2 MB. Ubah ke JPEG
      // berukuran wajar agar upload lewat koneksi seluler/ngrok tetap ringan.
      const upload = await compressImage(file)
      const fd = new FormData()
      fd.append("file", upload)
      fd.append("folder", "menu")
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      if (res.ok) {
        const d = await res.json()
        setForm((f) => ({ ...f, imageUrl: d.url }))
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? "Gagal upload gambar")
      }
    } catch {
      setError("Gagal upload foto. Periksa koneksi lalu coba lagi.")
    } finally {
      setUploadingImage(false)
    }
  }

  function openCreate() {
    if (menuModalCloseTimer.current) window.clearTimeout(menuModalCloseTimer.current)
    setEditMenu(null)
    setForm(emptyForm)
    setRecipe([])
    setLocalModGroups([])
    setDeletedGroupIds([])
    setError("")
    setCategorySearch("")
    setCategoryOpen(false)
    setMenuPanel("main")
    setMenuPanelDirection("forward")
    setMenuModalClosing(false)
    setShowModal(true)
  }

  function openEdit(menu: Menu) {
    if (menuModalCloseTimer.current) window.clearTimeout(menuModalCloseTimer.current)
    setEditMenu(menu)
    setForm({
      name: menu.name,
      sku: menu.sku ?? "",
      category: menu.category ?? "Makanan",
      notes: menu.notes ?? "",
      description: menu.description ?? "",
      imageUrl: menu.imageUrl ?? "",
      isActive: menu.isActive,
      sellPrice: menu.sellPrice != null ? formatRpInput(String(Math.round(menu.sellPrice))) : "",
    })
    setRecipe(
      menu.recipeItems.map((r) => ({
        childItemId: r.childItemId,
        quantity: r.childItem.isTrackable ? formatQtyFromNumber(Number(r.quantity)) : "",
      }))
    )
    setLocalModGroups(
      menu.modifierGroups.map((mg) => ({
        _key: mg.group.id,
        id: mg.group.id,
        name: mg.group.name,
        isRequired: mg.group.isRequired,
        maxSelect: mg.group.maxSelect,
        options: mg.group.options.map((o) => ({
          _key: o.id,
          name: o.name,
          price: Number(o.price) > 0 ? formatRpInput(String(Math.round(Number(o.price)))) : "",
          recipeItems: (o.recipeItems ?? [])
            .filter((recipe) => recipe.item?.isTrackable !== false)
            .map((recipe) => ({
              _key: `${o.id}-${recipe.itemId}`,
              itemId: recipe.itemId,
              quantity: formatQtyFromNumber(Number(recipe.quantity)),
            })),
        })),
      }))
    )
    setDeletedGroupIds([])
    setError("")
    setCategorySearch("")
    setCategoryOpen(false)
    setMenuPanel("main")
    setMenuPanelDirection("forward")
    setMenuModalClosing(false)
    setShowModal(true)
  }

  function openMenuPanel(panel: Exclude<MenuPanel, "main">) {
    setCategoryOpen(false)
    setMenuPanelDirection("forward")
    setMenuPanel(panel)
    window.requestAnimationFrame(() => { if (menuFormScrollRef.current) menuFormScrollRef.current.scrollTop = 0 })
  }

  function backToMenuMain() {
    setMenuPanelDirection("back")
    setMenuPanel("main")
    window.requestAnimationFrame(() => { if (menuFormScrollRef.current) menuFormScrollRef.current.scrollTop = 0 })
  }

  function finishMenuModalClose() {
    if (menuModalCloseTimer.current) window.clearTimeout(menuModalCloseTimer.current)
    menuModalCloseTimer.current = null
    setShowModal(false)
    setMenuModalClosing(false)
    setMenuPanel("main")
  }

  function closeMenuModal() {
    if (menuModalCloseTimer.current) window.clearTimeout(menuModalCloseTimer.current)
    setCategoryOpen(false)
    setMenuModalClosing(true)
    menuModalCloseTimer.current = window.setTimeout(finishMenuModalClose, 320)
  }

  function addLocalModGroup() {
    setLocalModGroups((prev) => [
      ...prev,
      { _key: crypto.randomUUID(), name: "", isRequired: false, maxSelect: 1, options: [{ _key: crypto.randomUUID(), name: "", price: "", recipeItems: [] }] },
    ])
  }

  function removeLocalModGroup(idx: number, id?: string) {
    if (id) setDeletedGroupIds((prev) => [...prev, id])
    setLocalModGroups((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateLocalModGroup(idx: number, patch: Partial<Omit<LocalModGroup, "_key" | "options">>) {
    setLocalModGroups((prev) => prev.map((g, i) => i === idx ? { ...g, ...patch } : g))
  }

  function addLocalModOption(gIdx: number) {
    setLocalModGroups((prev) => prev.map((g, i) =>
      i === gIdx ? { ...g, options: [...g.options, { _key: crypto.randomUUID(), name: "", price: "", recipeItems: [] }] } : g
    ))
  }

  function removeLocalModOption(gIdx: number, oIdx: number) {
    setLocalModGroups((prev) => prev.map((g, i) =>
      i === gIdx ? { ...g, options: g.options.filter((_, j) => j !== oIdx) } : g
    ))
  }

  function updateLocalModOption(gIdx: number, oIdx: number, patch: { name?: string; price?: string }) {
    setLocalModGroups((prev) => prev.map((g, i) =>
      i === gIdx ? { ...g, options: g.options.map((o, j) => j === oIdx ? { ...o, ...patch } : o) } : g
    ))
  }

  function addLocalModRecipe(gIdx: number, oIdx: number) {
    setLocalModGroups((prev) => prev.map((group, groupIndex) => groupIndex === gIdx
      ? {
          ...group,
          options: group.options.map((option, optionIndex) => optionIndex === oIdx
            ? {
                ...option,
                recipeItems: [...option.recipeItems, { _key: crypto.randomUUID(), itemId: "", quantity: "1" }],
              }
            : option),
        }
      : group
    ))
  }

  function updateLocalModRecipe(
    gIdx: number,
    oIdx: number,
    recipeIdx: number,
    patch: Partial<{ itemId: string; quantity: string }>,
  ) {
    setLocalModGroups((prev) => prev.map((group, groupIndex) => groupIndex === gIdx
      ? {
          ...group,
          options: group.options.map((option, optionIndex) => optionIndex === oIdx
            ? {
                ...option,
                recipeItems: option.recipeItems.map((recipeItem, recipeIndex) =>
                  recipeIndex === recipeIdx ? { ...recipeItem, ...patch } : recipeItem
                ),
              }
            : option),
        }
      : group
    ))
  }

  function removeLocalModRecipe(gIdx: number, oIdx: number, recipeIdx: number) {
    setLocalModGroups((prev) => prev.map((group, groupIndex) => groupIndex === gIdx
      ? {
          ...group,
          options: group.options.map((option, optionIndex) => optionIndex === oIdx
            ? { ...option, recipeItems: option.recipeItems.filter((_, recipeIndex) => recipeIndex !== recipeIdx) }
            : option),
        }
      : group
    ))
  }

  function addRecipeLine() {
    setRecipe([...recipe, { childItemId: "", quantity: "" }])
  }

  function removeRecipeLine(idx: number) {
    setRecipe(recipe.filter((_, i) => i !== idx))
  }

  function updateRecipeLine(idx: number, field: "childItemId" | "quantity", value: string) {
    setRecipe(recipe.map((r, i) => {
      if (i !== idx) return r
      const next = { ...r, [field]: value }
      // Kuantitas lama tidak boleh tertinggal saat bahannya diganti ke non-lacak.
      if (field === "childItemId" && !isRecipeQtyUsed(value)) next.quantity = ""
      return next
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (uploadingImage) {
      setError("Tunggu sampai foto selesai diunggah.")
      return
    }

    const validRecipe = recipe.filter((r) => {
      if (!r.childItemId) return false
      // Bahan non-lacak dicatat sebagai keterangan resep, tanpa kuantitas.
      if (!isRecipeQtyUsed(r.childItemId)) return true
      return !!r.quantity && Number(parseQtyInput(r.quantity)) > 0
    })

    // Baris yang bahannya sudah dipilih tapi jumlahnya kosong: sebelumnya
    // dibuang diam-diam, jadi bahannya hilang tanpa pemberitahuan. Sekarang
    // ditahan dan disebut namanya.
    const missingQty = recipe.filter((r) =>
      r.childItemId
      && isRecipeQtyUsed(r.childItemId)
      && !(r.quantity && Number(parseQtyInput(r.quantity)) > 0)
    )

    // Validasi wajib — harga jual & resep bahan baku harus diisi
    const issues: string[] = []
    if (!form.name.trim()) issues.push("Nama menu wajib diisi")
    if (!form.sellPrice || Number(parseRpInput(form.sellPrice)) <= 0) issues.push("Harga jual wajib diisi")
    for (const line of missingQty) {
      issues.push(`Jumlah untuk ${getIngredient(line.childItemId)?.name ?? "bahan"} wajib diisi`)
    }
    if (validRecipe.length === 0 && missingQty.length === 0) {
      issues.push("Resep/bahan baku wajib diisi minimal 1 bahan")
    }
    if (localModGroups.some((group) => group.options.some((option) =>
      option.recipeItems.some((recipeItem) =>
        !recipeItem.itemId
        || (isRecipeQtyUsed(recipeItem.itemId) && !(Number(parseQtyInput(recipeItem.quantity)) > 0))
      )
    ))) issues.push("Bahan dan jumlah pemakaian modifier harus dilengkapi")
    const quantities = [
      ...validRecipe.filter(line => isRecipeQtyUsed(line.childItemId)).map(line => ({ name: getIngredient(line.childItemId)?.name ?? "bahan", quantity: line.quantity })),
      ...localModGroups.flatMap(group => group.options.flatMap(option => option.recipeItems.filter(line => isRecipeQtyUsed(line.itemId)).map(line => ({ name: getIngredient(line.itemId)?.name ?? "bahan modifier", quantity: line.quantity })))),
    ]
    for (const line of quantities) {
      try { parseInventoryQuantity(line.quantity, `Jumlah ${line.name}`) }
      catch (error) { issues.push(error instanceof Error ? error.message : "Jumlah bahan tidak valid") }
    }
    if (issues.length > 0) {
      setWarning({ title: "Lengkapi data menu", messages: issues })
      return
    }

    setSubmitting(true)
    setError("")

    try {
      let menuId = editMenu?.id

      if (editMenu) {
        const res = await fetch(`/api/menu/${editMenu.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            sku: form.sku || null,
            category: form.category || null,
            notes: form.notes || null,
            description: form.description || null,
            imageUrl: form.imageUrl || null,
            isActive: form.isActive,
            sellPrice: form.sellPrice ? Number(parseRpInput(form.sellPrice)) : null,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          setError(d.error ?? "Gagal menyimpan menu")
          return
        }
      } else {
        const res = await fetch("/api/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            sku: form.sku || null,
            category: form.category || null,
            notes: form.notes || null,
            description: form.description || null,
            imageUrl: form.imageUrl || null,
            sellPrice: form.sellPrice ? Number(parseRpInput(form.sellPrice)) : null,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          setError(d.error ?? "Gagal membuat menu")
          return
        }
        const created = await res.json()
        menuId = created.id
      }

      // Save recipe
      const recipeRes = await fetch(`/api/menu/${menuId}/recipe`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validRecipe.map((r) => ({
            childItemId: r.childItemId,
            quantity: isRecipeQtyUsed(r.childItemId) ? Number(parseQtyInput(r.quantity)) : 0,
          })),
        }),
      })

      if (!recipeRes.ok) {
        const d = await recipeRes.json()
        setError(d.error ?? "Gagal menyimpan resep")
        return
      }

      // Delete removed groups
      for (const id of deletedGroupIds) {
        await fetch(`/api/modifiers/${id}`, { method: "DELETE" })
      }

      // Save each inline modifier group
      const savedGroupIds: string[] = []
      for (const g of localModGroups) {
        const payload = {
          name: g.name.trim() || "Modifier",
          isRequired: g.isRequired,
          maxSelect: g.maxSelect,
          options: g.options.filter((o) => o.name.trim()).map((o) => ({
            name: o.name.trim(),
            price: Number(parseRpInput(o.price)) || 0,
            recipeItems: o.recipeItems.map((recipeItem) => ({
              itemId: recipeItem.itemId,
              quantity: Number(parseQtyInput(recipeItem.quantity)),
            })),
          })),
          menuItemId: menuId,
        }
        if (g.id) {
          const r = await fetch(`/api/modifiers/${g.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          if (r.ok) savedGroupIds.push(g.id)
        } else {
          const r = await fetch("/api/modifiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          if (r.ok) { const d = await r.json(); savedGroupIds.push(d.id) }
        }
      }

      // Sync assignments (handles order + any new ones without menuItemId for existing items)
      if (savedGroupIds.length > 0 || deletedGroupIds.length > 0) {
        await fetch(`/api/menu/${menuId}/modifiers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupIds: savedGroupIds }),
        })
      }

      setShowModal(false)
      void fetchMenus()
      void fetchMenuOptions()
    } catch {
      setError("Koneksi gagal, coba lagi")
    } finally {
      setSubmitting(false)
    }
  }

  function handleDelete(id: string, name: string) {
    ask({
      title: "Hapus menu ini?",
      message: `Menu "${name}" beserta resep yang terhubung akan dihapus permanen.`,
      confirmLabel: "Hapus",
      danger: true,
      onConfirm: async () => {
        const res = await fetch(`/api/menu/${id}`, { method: "DELETE" })
        if (res.ok) { void fetchMenus(); void fetchMenuOptions() }
      },
    })
  }

  function getIngredient(childItemId: string) {
    return ingredients.find((i) => i.id === childItemId)
  }

  function getIngredientUnit(childItemId: string) {
    return getIngredient(childItemId)?.unit ?? ""
  }

  // Bahan non-lacak tidak pernah dipotong saat penjualan — pos-orders.ts
  // menyaringnya lewat `isTrackable: true`. Jadi kuantitasnya tidak pernah
  // dipakai, dan kolomnya tidak perlu diisi.
  function isRecipeQtyUsed(childItemId: string) {
    const ingredient = getIngredient(childItemId)
    return ingredient ? ingredient.isTrackable : true
  }

  const uniqueCategories = Array.from(new Set(menuOptions.map((m) => m.category).filter(Boolean))) as string[]
  const allCategories = ["Semua", ...uniqueCategories.sort()]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Master Menu</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {menuOptions.length} menu terdaftar
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={!canEdit}
          title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
          className={`flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 ${DISABLED_ACTION_CLASS} disabled:hover:bg-blue-600 sm:w-auto sm:rounded-full`}
        >
          <Plus className="w-4 h-4" />
          Tambah Menu
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama menu..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setMenuPage(1) }}
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setMenuPage(1) }}
              className={`px-3.5 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                category === cat ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
                {cat}
              </button>
            ))}
          </div>
        </div>

      <div ref={menuListRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : menus.length === 0 ? (
          <div className="px-5 py-14 text-center sm:py-16">
            <UtensilsCrossed className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <div className="font-medium text-slate-500">{menuOptions.length === 0 ? "Belum ada menu" : "Menu tidak ditemukan"}</div>
            <div className="mt-1 text-sm text-slate-400">
              {menuOptions.length === 0 ? "Klik Tambah Menu untuk mulai mendaftarkan menu dan resepnya" : "Coba kata kunci atau kategori lain"}
            </div>
          </div>
        ) : (
          <>
            {/* Tabel hanya digunakan saat area konten cukup lebar. */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[940px] text-sm">
                <thead>
                  <tr className="bg-slate-900">
                    <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3.5">Nama Menu</th>
                    <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5">Kategori</th>
                    <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Harga Jual</th>
                    <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5">Resep / Bahan</th>
                    <th className="text-center text-xs font-semibold text-slate-300 px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleMenus.map((menu, idx) => (
                    <tr key={menu.id} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 !== 0 ? "bg-slate-50/50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {menu.imageUrl ? (
                            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={menu.imageUrl} alt={menu.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                              <UtensilsCrossed className="w-4 h-4 text-slate-300" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900">{menu.name}</div>
                            {menu.description && (
                              <div className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{menu.description}</div>
                            )}
                            {menu.sku && (
                              <div className="text-xs text-slate-400 font-mono">{menu.sku}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {menu.category ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {menu.sellPrice != null ? (
                          <span className="text-sm font-medium text-slate-900">
                            Rp {Number(menu.sellPrice).toLocaleString("id-ID")}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-500">Belum ada</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {menu.recipeItems.length === 0 ? (
                          <span className="text-xs text-amber-500 font-medium">Belum ada resep</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {menu.recipeItems.map((r) => (
                              <span
                                key={r.id}
                                className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                              >
                                {r.childItem.isTrackable
                                  ? `${r.childItem.name} × ${formatQtyFromNumber(Number(r.quantity))} ${r.childItem.unit}`
                                  : `${r.childItem.name} · via opname`}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          menu.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {menu.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(menu)}
                            disabled={!canEdit}
                            title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
                            className={`p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700 ${DISABLED_ACTION_CLASS}`}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(menu.id, menu.name)}
                            disabled={!canEdit}
                            title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
                            className={`p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-red-500 ${DISABLED_ACTION_CLASS}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Kartu lebih terbaca saat sidebar atau DevTools mempersempit layar. */}
            <div className="divide-y divide-slate-100 xl:hidden">
              {visibleMenus.map((menu) => (
                <article key={menu.id} className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    {menu.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={menu.imageUrl} alt={menu.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                        <UtensilsCrossed className="h-5 w-5 text-slate-300" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="font-semibold text-slate-900">{menu.name}</h2>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                              {menu.category ?? "Tanpa kategori"}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${menu.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                              {menu.isActive ? "Aktif" : "Nonaktif"}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {menu.sellPrice != null ? (
                            <div className="font-semibold text-slate-900">Rp {Number(menu.sellPrice).toLocaleString("id-ID")}</div>
                          ) : (
                            <div className="text-xs font-medium text-amber-500">Harga belum diatur</div>
                          )}
                        </div>
                      </div>
                      {menu.description && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{menu.description}</p>}
                      {menu.sku && <p className="mt-1 text-[11px] font-mono text-slate-400">SKU: {menu.sku}</p>}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Resep / Bahan</div>
                    {menu.recipeItems.length === 0 ? (
                      <span className="text-xs font-medium text-amber-500">Belum ada resep</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {menu.recipeItems.map((recipeItem) => (
                          <span key={recipeItem.id} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                            {recipeItem.childItem.name} × {formatQtyFromNumber(Number(recipeItem.quantity))} {recipeItem.childItem.unit}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openEdit(menu)}
                      disabled={!canEdit}
                      title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
                      className={`flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 ${DISABLED_ACTION_CLASS}`}
                    >
                      <Edit className="h-4 w-4" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(menu.id, menu.name)}
                      disabled={!canEdit}
                      title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
                      className={`flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-100 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 ${DISABLED_ACTION_CLASS}`}
                    >
                      <Trash2 className="h-4 w-4" /> Hapus
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <ListPagination label="menu" total={menuTotal} page={currentMenuPage} showAll={showAllMenus}
              pageSize={menuPageSize}
              onPageSizeChange={(size) => { setMenuPageSize(size); setMenuPage(1) }}
              onPageChange={(page) => { setMenuPage(page); menuListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
              onShowAllChange={(showAll) => { setShowAllMenus(showAll); setMenuPage(1); menuListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }} />
          </>
        )}
      </div>

      {/* ── Discount Rules Section ──────────────────────────────────────────── */}
      <div className="overflow-visible rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 rounded-t-3xl border-b border-slate-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600">
              <Tag className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black tracking-tight text-slate-900">Aturan Diskon</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Kelola promo berdasarkan outlet, menu, dan jadwal tanpa memenuhi halaman kasir.</p>
            </div>
          </div>
          <button
            onClick={() => { setShowDiscountForm(true); setEditingRule(null); setDiscForm(newDiscountForm()) }}
            disabled={!canEdit}
            title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
            className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 ${DISABLED_ACTION_CLASS} disabled:hover:bg-blue-600 sm:w-auto`}
          >
            <Plus className="w-4 h-4" /> Tambah
          </button>
        </div>

        {showDiscountForm && (
          <form onSubmit={handleDiscountSubmit} className="border-b border-slate-100 bg-slate-50/70">
            {/* Form header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div><span className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{editingRule ? "Edit aturan" : "Aturan baru"}</span><p className="mt-1 text-sm text-slate-500">Isi detail promo, tentukan cakupan, lalu atur waktu berlakunya.</p></div>
              <button type="button" onClick={() => { setShowDiscountForm(false); setEditingRule(null) }} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              {discError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl">
                  {discError}
                </div>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white">1</span><div><h3 className="text-sm font-black text-slate-900">Detail diskon</h3><p className="text-xs text-slate-400">Nama dan besaran promo yang dilihat kasir.</p></div></div>
                <div className="mb-4">
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Nama diskon</label>
                  <StableDraftInput required placeholder="Contoh: Happy Hour Burger"
                    value={discForm.name} onCommit={(value) => setDiscForm((previous) => ({ ...previous, name: value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Potongan</label>
                  <div className="flex gap-2">
                    <div className="flex shrink-0 rounded-xl bg-slate-100 p-0.5">
                      <button type="button" onClick={() => setDiscForm({ ...discForm, type: "PERCENT", value: "" })}
                        className={`rounded-[10px] px-3.5 py-2 text-sm font-bold transition-all ${discForm.type === "PERCENT" ? "bg-white text-blue-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>%</button>
                      <button type="button" onClick={() => setDiscForm({ ...discForm, type: "AMOUNT", value: "" })}
                        className={`rounded-[10px] px-3 py-2 text-xs font-bold transition-all ${discForm.type === "AMOUNT" ? "bg-white text-blue-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>Rp</button>
                    </div>
                    {discForm.type === "PERCENT" ? (
                      <div className="relative min-w-0 flex-1">
                        <StableDraftInput required type="number" min="0.01" max="100" step="0.01" placeholder="10"
                          value={discForm.value} onCommit={(value) => setDiscForm((previous) => ({ ...previous, value }))}
                          className="w-full rounded-xl border border-slate-200 py-2.5 pl-3.5 pr-8 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">%</span>
                      </div>
                    ) : (
                      <div className="relative min-w-0 flex-1">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">Rp</span>
                        <StableDraftInput required type="text" inputMode="numeric" placeholder="5.000"
                          value={discForm.value} formatValue={formatRpInput} onCommit={(value) => setDiscForm((previous) => ({ ...previous, value }))}
                          className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3.5 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Min. pembelian <span className="font-medium normal-case tracking-normal text-slate-400">· opsional</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">Rp</span>
                    <StableDraftInput type="text" inputMode="numeric" placeholder="0"
                      value={discForm.minPurchase} formatValue={formatRpInput} onCommit={(value) => setDiscForm((previous) => ({ ...previous, minPurchase: value }))}
                      className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3.5 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
                  </div>
                </div>
                </div>
              </section>

              {/* Cakupan: outlet & menu */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white">2</span><div><h3 className="text-sm font-black text-slate-900">Cakupan promo</h3><p className="text-xs text-slate-400">Pilih lokasi dan menu tanpa deretan pilihan panjang.</p></div></div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <SearchableMultiSelect
                    label="Outlet"
                    description="Kosong berarti promo berlaku di semua outlet."
                    allLabel="Semua outlet"
                    searchPlaceholder="Cari nama outlet..."
                    emptyText="Outlet tidak ditemukan"
                    options={discountLocations}
                    selectedIds={discForm.locationIds}
                    onChange={(locationIds) => setDiscForm((current) => ({ ...current, locationIds }))}
                    icon={<MapPin className="h-4 w-4" />}
                  />
                  <SearchableMultiSelect
                    label="Menu"
                    description={discForm.itemIds.length > 0 ? "Diskon hanya dihitung dari menu pilihan." : "Diskon dipotong dari total belanja."}
                    allLabel="Semua menu"
                    searchPlaceholder="Cari nama menu..."
                    emptyText="Menu tidak ditemukan"
                    options={menuOptions.map((menu) => ({ id: menu.id, name: menu.name }))}
                    selectedIds={discForm.itemIds}
                    onChange={(itemIds) => setDiscForm((current) => ({ ...current, itemIds }))}
                    icon={<Tag className="h-4 w-4" />}
                  />
                </div>
              </section>

              <DiscountScheduleFields value={discForm}
                onChange={(patch) => setDiscForm((current) => ({ ...current, ...patch }))} />

              {/* Submit */}
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => { setShowDiscountForm(false); setEditingRule(null) }}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">
                  Batal
                </button>
                <button type="submit"
                  disabled={discSaving}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:min-w-40">
                  {discSaving ? "Menyimpan..." : editingRule ? "Simpan Perubahan" : "Buat Aturan"}
                </button>
              </div>
            </div>
          </form>
        )}

        {discountRules.length > 0 && (
          <div className="relative border-b border-slate-100 px-4 py-3 sm:px-5">
            <Search className="absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:left-8" />
            <input type="search" value={discountSearch} onChange={(event) => { setDiscountSearch(event.target.value); setDiscountPage(1) }}
              placeholder="Cari nama diskon, outlet, atau menu..." aria-label="Cari aturan diskon"
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white" />
          </div>
        )}

        {discountRules.length === 0 && !showDiscountForm ? (
          <div className="px-4 py-12 text-center sm:py-14">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Tag className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Belum ada aturan diskon</p>
            <p className="text-xs text-slate-400 mt-1">Tambahkan aturan untuk tampil sebagai saran di kasir</p>
          </div>
        ) : discountRules.length > 0 && filteredDiscounts.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">Aturan diskon tidak ditemukan. Coba kata kunci lain.</div>
        ) : (
          <>
          <div ref={discountListRef} className="scroll-mt-24 divide-y divide-slate-100">
            {visibleDiscounts.map((rule) => {
              const discLabel = rule.type === "PERCENT"
                ? `${rule.value}%`
                : `Rp ${Number(rule.value) >= 1000000 ? `${(Number(rule.value)/1000000).toFixed(0)}jt` : Number(rule.value) >= 1000 ? `${(Number(rule.value)/1000).toFixed(0)}rb` : Number(rule.value).toLocaleString("id-ID")}`
              const scheduleStatus = getDiscountScheduleStatus(rule)
              const status = scheduleStatus === "ACTIVE"
                ? { label: "Aktif sekarang", className: "bg-emerald-50 text-emerald-700" }
                : scheduleStatus === "UPCOMING"
                  ? { label: "Terjadwal", className: "bg-blue-50 text-blue-700" }
                  : scheduleStatus === "EXPIRED"
                    ? { label: "Kedaluwarsa", className: "bg-red-50 text-red-600" }
                    : scheduleStatus === "INACTIVE"
                      ? { label: "Nonaktif", className: "bg-slate-100 text-slate-500" }
                      : { label: "Di luar jadwal", className: "bg-amber-50 text-amber-700" }
              return (
                <div key={rule.id} className={`flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:px-5 ${!rule.isActive ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleDiscountToggle(rule)}
                      className={`relative shrink-0 rounded-full transition-colors duration-200 ${rule.isActive ? "bg-blue-600" : "bg-slate-200"}`}
                      style={{ width: 52, height: 30, padding: 3 }}>
                      <span className="block rounded-full bg-white transition-transform duration-200"
                        style={{ width: 24, height: 24, boxShadow: "0 2px 6px rgba(0,0,0,0.18), 0 0.5px 2px rgba(0,0,0,0.12)", transform: rule.isActive ? "translateX(22px)" : "translateX(0)" }} />
                    </button>
                    <div className={`flex h-11 w-16 shrink-0 items-center justify-center rounded-xl ${rule.isActive ? "border border-blue-100 bg-blue-50" : "border border-slate-200 bg-slate-50"}`}>
                      <span className={`text-sm font-black leading-none ${rule.isActive ? "text-blue-700" : "text-slate-400"}`}>{discLabel}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900">{rule.name}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {Number(rule.minPurchase) > 0 && (
                        <span className="inline-flex items-center text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          min. Rp {Number(rule.minPurchase).toLocaleString("id-ID")}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center text-[11px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md"
                        title={rule.locations.map(({ location }) => location.name).join(", ") || undefined}
                      >
                        {rule.locations.length === 0
                          ? "Semua outlet"
                          : rule.locations.length === 1
                            ? rule.locations[0].location.name
                            : `${rule.locations.length} outlet`}
                      </span>
                      {rule.items.length > 0 && (
                        <span
                          className="inline-flex items-center text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md"
                          title={rule.items.map(({ menuItem }) => menuItem.name).join(", ")}
                        >
                          {rule.items.length === 1
                            ? rule.items[0].menuItem.name
                            : `${rule.items.length} menu tertentu`}
                        </span>
                      )}
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {rule.scheduleMode === "PERIOD" ? "Sekali selama periode" : "Berulang"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{formatDiscountSchedule(rule)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:flex sm:shrink-0 sm:items-center sm:justify-end sm:border-t-0 sm:pt-0">
                    <button onClick={() => {
                      setEditingRule(rule)
                      setDiscForm({
                        name: rule.name, type: rule.type,
                        value: rule.type === "AMOUNT" ? formatRpInput(String(Math.round(Number(rule.value)))) : String(rule.value),
                        minPurchase: Number(rule.minPurchase) > 0 ? formatRpInput(String(Math.round(Number(rule.minPurchase)))) : "",
                        scheduleMode: rule.scheduleMode ?? "RECURRING",
                        validDays: rule.validDays ? rule.validDays.split(",").map(Number) : [],
                        startsAt: dateInputValue(rule.startsAt),
                        expiresAt: dateInputValue(rule.expiresAt),
                        startTime: rule.scheduleMode === "PERIOD" ? jakartaTimeInput(rule.startsAt) : minuteToTime(rule.startMinute),
                        endTime: rule.scheduleMode === "PERIOD" ? jakartaTimeInput(rule.expiresAt) : minuteToTime(rule.endMinute),
                        locationIds: rule.locations.map(({ location }) => location.id),
                        itemIds: rule.items.map(({ menuItem }) => menuItem.id),
                      })
                      setShowDiscountForm(true)
                    }} disabled={!canEdit} title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 ${DISABLED_ACTION_CLASS} sm:min-h-9 sm:border-0 sm:px-2.5 sm:text-xs`}>
                      <Edit className="h-4 w-4" /> Edit
                    </button>
                    <button onClick={() => handleDiscountDelete(rule.id)} disabled={!canEdit} title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-100 px-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 ${DISABLED_ACTION_CLASS} sm:min-h-9 sm:border-0 sm:px-2.5 sm:text-xs`}>
                      <Trash2 className="h-4 w-4" /> Hapus
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <ListPagination label="aturan diskon" total={filteredDiscounts.length} page={currentDiscountPage} showAll={showAllDiscounts}
            onPageChange={(page) => { setDiscountPage(page); discountListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
            onShowAllChange={(showAll) => { setShowAllDiscounts(showAll); discountListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }} />
          </>
        )}
      </div>

      {/* Modifier Group Modal */}
      {showModal && (
        <AppPortal>
        <div
          className={`app-overlay mobile-fullscreen-dialog z-50 flex items-end justify-center sm:items-center sm:p-4 ${menuModalClosing ? "is-closing" : ""}`}
          onAnimationEnd={(event) => {
            if (menuModalClosing && event.currentTarget === event.target) finishMenuModalClose()
          }}
        >
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={() => { if (!submitting) closeMenuModal() }} />
          <div className="mobile-dialog-panel relative z-10 flex max-h-[calc(100%-3rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:max-h-[calc(100%-2rem)] sm:rounded-2xl lg:max-w-[840px]">
            <div className="relative flex min-h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6">
              {menuPanel === "main" ? (
                <>
                  <h2 className="text-lg font-bold text-slate-900">
                    {editMenu ? "Edit Menu" : "Tambah Menu Baru"}
                  </h2>
                  <button type="button" onClick={closeMenuModal} disabled={submitting} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                    <X className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={backToMenuMain} className="flex min-h-10 items-center gap-1 pr-2 text-sm font-semibold text-blue-600 md:hidden">
                    <ArrowLeft className="h-5 w-5" /> Kembali
                  </button>
                  <h2 className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-base font-bold text-slate-900 md:static md:translate-x-0 md:text-lg">
                    {menuPanel === "recipe" ? "Resep / Bahan" : "Grup Modifier"}
                  </h2>
                  <button type="button" onClick={backToMenuMain} className="min-h-10 pl-2 text-sm font-bold text-blue-600 md:hidden">
                    Selesai
                  </button>
                </>
              )}
            </div>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col min-h-0 flex-1">
              <div ref={menuFormScrollRef} className="mobile-dialog-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-6 sm:pb-5 sm:pt-4">
              <FormAlert message={error} onClose={() => setError("")} />
              <div className={`${menuPanel === "main" ? `menu-panel-enter-${menuPanelDirection}` : "hidden"} space-y-4 md:block`}>
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem] lg:grid-cols-[minmax(0,1fr)_13rem]">
                <div className="min-w-0 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Menu <span className="text-red-500">*</span></label>
                <StableDraftInput
                  type="text"
                  required
                  placeholder="Contoh: Burger Bali Spesial"
                  value={form.name}
                  onCommit={(value) => setForm((previous) => ({ ...previous, name: value }))}
                  className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Kategori</label>
                  <div ref={categoryRef} className="relative">
                    <button
                      type="button"
                      onClick={() => { setCategoryOpen((o) => !o); setCategorySearch("") }}
                      className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <span className={`truncate ${form.category ? "text-slate-900" : "text-slate-400"}`}>{form.category || "Pilih atau buat kategori..."}</span>
                      <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
                            const categories = Array.from(new Set([...MENU_CATEGORIES, ...uniqueCategories]))
                            const shownCategories = categories.filter((c) => c.toLowerCase().includes(categorySearch.toLowerCase()))
                            const trimmed = categorySearch.trim()
                            const alreadyExists = categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())
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
                                {shownCategories.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => { setForm({ ...form, category: c }); setCategoryOpen(false) }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${form.category === c ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"}`}
                                  >
                                    {c}
                                  </button>
                                ))}
                                {shownCategories.length === 0 && (
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">SKU</label>
                  <StableDraftInput
                    type="text"
                    placeholder="MN-001"
                    value={form.sku}
                    onCommit={(value) => setForm((previous) => ({ ...previous, sku: value }))}
                    className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Harga Jual (Rp) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                    <StableDraftInput
                      type="text"
                      inputMode="numeric"
                      placeholder="35.000"
                      value={form.sellPrice}
                      formatValue={formatRpInput}
                      onCommit={(value) => setForm((previous) => ({ ...previous, sellPrice: value }))}
                      className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                </div>

                <div className="min-w-0">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Foto Menu</label>
                  <div>
                    {form.imageUrl ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.imageUrl} alt="Foto menu" className="h-36 w-full rounded-xl border border-slate-200 object-cover sm:h-40 lg:h-44" />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, imageUrl: "" })}
                          aria-label="Hapus foto menu"
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600 shadow-sm hover:bg-white"
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 text-center sm:h-40 lg:h-44">
                        {uploadingImage ? (
                          <>
                            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                            <span className="text-xs font-medium text-blue-600">Mengunggah foto...</span>
                          </>
                        ) : (
                          <>
                            <ImagePlus className="h-6 w-6 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600">Belum ada foto menu</span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-center text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 ${uploadingImage ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={uploadingImage}
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.currentTarget.value = ""
                            if (file) void handleImageUpload(file)
                          }}
                        />
                        <Camera className="h-4 w-4 shrink-0" />
                        Ambil Foto
                      </label>
                      <label className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 ${uploadingImage ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingImage}
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.currentTarget.value = ""
                            if (file) void handleImageUpload(file)
                          }}
                        />
                        <ImagePlus className="h-4 w-4 shrink-0" />
                        Pilih Galeri
                      </label>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">Foto otomatis diperkecil sebelum diunggah dan akan tampil di kasir.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Deskripsi</label>
                  <StableDraftTextarea
                    rows={2}
                    placeholder="Contoh: Burger dengan daging sapi pilihan, saus spesial, dan topping lengkap"
                    value={form.description}
                    onCommit={(value) => setForm((previous) => ({ ...previous, description: value }))}
                    className="h-20 w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Catatan Internal</label>
                  <StableDraftTextarea
                    rows={2}
                    placeholder="Opsional — hanya terlihat di dashboard"
                    value={form.notes}
                    onCommit={(value) => setForm((previous) => ({ ...previous, notes: value }))}
                    className="h-20 w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-4 md:hidden">
                <button
                  type="button"
                  onClick={() => openMenuPanel("recipe")}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                    <ChefHat className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">Resep / Bahan Baku</span>
                    <span className={`mt-0.5 block text-xs ${recipe.some((line) => line.childItemId) ? "text-slate-500" : "text-red-500"}`}>
                      {recipe.some((line) => line.childItemId) ? `${recipe.filter((line) => line.childItemId).length} bahan dipilih` : "Wajib diisi"}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => openMenuPanel("modifiers")}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800">Grup Modifier</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {localModGroups.length > 0 ? `${localModGroups.length} grup ditambahkan` : "Opsional"}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                </button>
              </div>
              </div>

              {/* Recipe section */}
              <div className={`${menuPanel === "recipe" ? `menu-panel-enter-${menuPanelDirection}` : "hidden"} border-slate-100 md:block md:border-t md:pt-4`}>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <ChefHat className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700">Resep / Bahan Baku <span className="text-red-500">*</span></span>
                  </div>
                  <button
                    type="button"
                    onClick={addRecipeLine}
                    className="flex w-fit items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3 h-3" />
                    Tambah Bahan
                  </button>
                </div>

                <p className="mb-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-700">Isi jumlah bahan untuk 1 porsi. Untuk bahan bersatuan kg, 0,05 kg = 50 gram per porsi. Pecahan maksimal 3 angka desimal.</p>
                {recipe.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                    Belum ada bahan. Klik Tambah Bahan untuk mulai.
                  </div>
                )}

                <div className="space-y-2">
                  {recipe.map((line, idx) => (
                    // Satu baris utuh di semua lebar — memecah qty/satuan ke baris
                    // kedua hanya memanjangkan form dan memutus hubungan bahan↔jumlah.
                    <div key={idx} className="grid grid-cols-[minmax(0,1fr)_4rem_2.5rem_1.75rem] items-center gap-2">
                      <div className="relative min-w-0">
                        <select
                          value={line.childItemId}
                          onChange={(e) => updateRecipeLine(idx, "childItemId", e.target.value)}
                          className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Pilih bahan...</option>
                          {ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>{ing.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                      {isRecipeQtyUsed(line.childItemId) ? (
                        <>
                          <StableDraftInput
                            type="text"
                            inputMode="decimal"
                            placeholder={getIngredientUnit(line.childItemId) === "kg" ? "0,05" : "Qty"}
                            aria-label={`Jumlah ${getIngredient(line.childItemId)?.name ?? "bahan"} dalam ${getIngredientUnit(line.childItemId) || "satuan dasar"}`}
                            value={line.quantity}
                            onCommit={(value) => updateRecipeLine(idx, "quantity", value)}
                            className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 px-1.5 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="truncate text-xs text-slate-400" title={getIngredientUnit(line.childItemId)}>
                            {getIngredientUnit(line.childItemId)}
                          </span>
                        </>
                      ) : (
                        // Stoknya hanya disesuaikan lewat opname, jadi angka apa pun
                        // di sini tidak akan pernah dipakai.
                        <span className="col-span-2 text-center text-[11px] leading-tight text-slate-400">
                          dihitung saat opname
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRecipeLine(idx)}
                        aria-label="Hapus bahan"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modifier inline CRUD */}
              <div className={`${menuPanel === "modifiers" ? `menu-panel-enter-${menuPanelDirection}` : "hidden"} border-slate-100 md:block md:border-t md:pt-5`}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <SlidersHorizontal className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900">Grup modifier</span>
                      <span className="block text-xs leading-5 text-slate-500">Tambahkan ukuran, topping, tingkat pedas, atau pilihan lain.</span>
                    </div>
                  </div>
                  <button type="button" onClick={addLocalModGroup}
                    className="flex h-10 w-fit shrink-0 items-center gap-2 rounded-xl bg-blue-50 px-3.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100">
                    <Plus className="h-4 w-4" /> Tambah grup
                  </button>
                </div>

                {localModGroups.length === 0 ? (
                  <button type="button" onClick={addLocalModGroup}
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                    + Tambah grup modifier (opsional)
                  </button>
                ) : (
                  <div className="space-y-4">
                    {localModGroups.map((g, gi) => (
                      <div key={g._key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
                        {/* Group header */}
                        <div className="border-b border-slate-200 bg-slate-50/80 p-3.5 sm:p-4">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Nama grup</label>
                              <StableDraftInput type="text" placeholder="Contoh: Pilihan Beef Burger"
                                value={g.name}
                                onCommit={(value) => updateLocalModGroup(gi, { name: value })}
                                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-900 shadow-sm placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                            </div>
                            <button type="button" onClick={() => removeLocalModGroup(gi, g.id)}
                              aria-label="Hapus grup modifier"
                              className="mt-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5" title="Pembeli harus memilih setidaknya satu opsi dari grup ini">
                              <input type="checkbox" checked={g.isRequired}
                                onChange={(e) => updateLocalModGroup(gi, { isRequired: e.target.checked })}
                                className="peer sr-only" />
                              <span className={`relative h-5 w-9 rounded-full transition-colors ${g.isRequired ? "bg-blue-600" : "bg-slate-200"}`}>
                                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${g.isRequired ? "left-[18px]" : "left-0.5"}`} />
                              </span>
                              <span className="text-xs font-semibold text-slate-700">Wajib dipilih</span>
                            </label>
                            <div className="flex min-h-9 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 sm:justify-start">
                              <span className="text-xs font-medium text-slate-500">Maksimal pilihan</span>
                              <div className="relative">
                                <select value={g.maxSelect}
                                  onChange={(e) => updateLocalModGroup(gi, { maxSelect: Number(e.target.value) })}
                                  className="h-8 min-w-20 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-7 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                                  <option value={1}>1</option>
                                  <option value={2}>2</option>
                                  <option value={3}>3</option>
                                  <option value={5}>5</option>
                                  <option value={99}>Bebas</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Options */}
                        <div className="space-y-2.5 p-3.5 sm:p-4">
                          <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_5.5rem_2.25rem] gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:grid">
                            <span>Nama opsi</span>
                            <span>Tambahan harga</span>
                            <span className="text-center">Bahan stok</span>
                            <span />
                          </div>
                          {g.options.map((o, oi) => (
                            <div key={o._key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 transition-colors focus-within:border-blue-200 focus-within:bg-blue-50/30">
                              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_5.5rem_2.25rem]">
                                <StableDraftInput type="text" placeholder="Nama opsi (cth: Regular)"
                                  value={o.name}
                                  onCommit={(value) => updateLocalModOption(gi, oi, { name: value })}
                                  aria-label="Nama opsi modifier"
                                  className="col-span-3 h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:col-span-1" />
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">+Rp</span>
                                  <StableDraftInput type="text" inputMode="numeric" placeholder="0"
                                    value={o.price}
                                    formatValue={formatRpInput}
                                    onCommit={(value) => updateLocalModOption(gi, oi, { price: value })}
                                    aria-label="Tambahan harga opsi"
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-2 text-xs font-semibold tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                                </div>
                                <button type="button" onClick={() => toggleOptionStock(o._key)}
                                  title="Atur bahan yang dipotong dari stok"
                                  className={`flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-bold transition-colors ${
                                    o.recipeItems.length > 0
                                      ? "border-blue-200 bg-blue-50 text-blue-700"
                                      : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600"
                                  }`}>
                                  <Package className="h-3.5 w-3.5" />
                                  {o.recipeItems.length > 0 ? `${o.recipeItems.length} bahan` : "Atur"}
                                </button>
                                <button type="button" onClick={() => removeLocalModOption(gi, oi)}
                                  disabled={g.options.length <= 1}
                                  aria-label="Hapus opsi modifier"
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              <div className={`mt-2 border-t border-slate-200/70 pt-2 ${openOptionStock.includes(o._key) ? "" : "hidden"}`}>
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span className="text-[11px] font-medium text-slate-500">
                                    {o.recipeItems.length > 0 ? "Stok otomatis berkurang" : "Tidak mengurangi stok"}
                                  </span>
                                  <button type="button" onClick={() => addLocalModRecipe(gi, oi)}
                                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700">
                                    + Bahan stok
                                  </button>
                                </div>
                                {o.recipeItems.map((recipeItem, recipeIdx) => (
                                  // Tinggi kontrol dikunci h-9: tanpa itu <select> memakai
                                  // tinggi intrinsiknya sendiri dan jadi lebih jangkung
                                  // daripada kolom jumlah di sebelahnya.
                                  <div key={recipeItem._key} className="mb-1.5 grid grid-cols-[minmax(0,1fr)_3.5rem_2.5rem_1.5rem] items-center gap-2 last:mb-0">
                                    <div className="relative min-w-0">
                                    <select
                                      value={recipeItem.itemId}
                                      onChange={(e) => updateLocalModRecipe(gi, oi, recipeIdx, { itemId: e.target.value })}
                                      className="h-9 w-full min-w-0 appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    >
                                      <option value="">Pilih bahan yang dipotong...</option>
                                      {ingredients.filter((ingredient) => ingredient.isTrackable).map((ingredient) => (
                                        <option
                                          key={ingredient.id}
                                          value={ingredient.id}
                                          disabled={o.recipeItems.some((line, index) => index !== recipeIdx && line.itemId === ingredient.id)}
                                        >
                                          {ingredient.name} ({ingredient.unit})
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                    </div>
                                    <StableDraftInput
                                      type="text"
                                      inputMode="decimal"
                                      value={recipeItem.quantity}
                                      onCommit={(value) => updateLocalModRecipe(gi, oi, recipeIdx, { quantity: value })}
                                      className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-1.5 text-center text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      aria-label="Jumlah stok yang dipotong"
                                    />
                                    <span className="truncate text-xs text-slate-400" title={getIngredientUnit(recipeItem.itemId) || "unit"}>
                                      {getIngredientUnit(recipeItem.itemId) || "unit"}
                                    </span>
                                    <button type="button" onClick={() => removeLocalModRecipe(gi, oi, recipeIdx)}
                                      aria-label="Hapus bahan stok"
                                      className="flex h-6 w-6 items-center justify-center rounded text-slate-300 transition-colors hover:text-red-400">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <button type="button" onClick={() => addLocalModOption(gi)}
                            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-200 text-xs font-bold text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-50">
                            <Plus className="h-3.5 w-3.5" /> Tambah opsi
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editMenu && menuPanel === "main" && (
                <div
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-xl cursor-pointer"
                  onClick={() => setForm({ ...form, isActive: !form.isActive })}
                >
                  <div>
                    <div className="text-sm font-medium text-slate-700">Status menu</div>
                    <div className="text-xs text-slate-400">
                      {form.isActive ? "Aktif — muncul di daftar" : "Nonaktif — tersembunyi"}
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full relative transition-colors ${form.isActive ? "bg-blue-600" : "bg-slate-300"}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.isActive ? "right-1" : "left-1"}`} />
                  </div>
                </div>
              )}

              </div>

              <div className={`${menuPanel === "main" ? "grid" : "hidden md:flex"} mobile-dialog-actions shrink-0 grid-cols-[0.75fr_1.25fr] gap-3 border-t border-slate-100 bg-white p-4 sm:flex sm:justify-end sm:px-6`}>
                <button
                  type="button"
                  onClick={closeMenuModal}
                  disabled={submitting || uploadingImage}
                  className="h-11 rounded-xl border border-slate-200 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 sm:min-w-28"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingImage}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 sm:min-w-36"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : uploadingImage ? "Mengunggah foto..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </AppPortal>
      )}

      <WarningModal
        open={warning !== null}
        onClose={() => setWarning(null)}
        title={warning?.title}
        messages={warning?.messages ?? []}
      />

      {confirmDialog}
    </div>
  )
}
