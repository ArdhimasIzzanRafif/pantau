"use client"

import { useState, useEffect, useRef } from "react"
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
  Trash,
  Tag,
  Clock,
  CalendarDays,
  CalendarCheck2,
} from "lucide-react"

function formatRpInput(val: string) {
  const digits = val.replace(/\D/g, "")
  if (!digits) return ""
  return Number(digits).toLocaleString("id-ID")
}
function parseRpInput(val: string) {
  return val.replace(/\./g, "").replace(/,/g, "")
}

type Ingredient = {
  id: string
  name: string
  unit: string
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
  options: { _key: string; name: string; price: string }[]
}

type DiscountRule = {
  id: string
  name: string
  type: "PERCENT" | "AMOUNT"
  value: number
  minPurchase: number
  isActive: boolean
  validDays: string | null
  expiresAt: string | null
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
      options: { id: string; name: string; price: number }[]
    }
  }[]
}

const MENU_CATEGORIES = ["Makanan", "Minuman", "Snack", "Paket", "Lainnya"]

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

export default function MenuPage() {
  const [menus, setMenus] = useState<Menu[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [localModGroups, setLocalModGroups] = useState<LocalModGroup[]>([])
  const [deletedGroupIds, setDeletedGroupIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("Semua")

  const [showModal, setShowModal] = useState(false)
  const [editMenu, setEditMenu] = useState<Menu | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [recipe, setRecipe] = useState<{ childItemId: string; quantity: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Discount rules management
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([])
  const [showDiscountForm, setShowDiscountForm] = useState(false)
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null)
  const [discForm, setDiscForm] = useState({
    name: "", type: "PERCENT" as "PERCENT" | "AMOUNT", value: "", minPurchase: "",
    scheduleType: "ALWAYS" as "ALWAYS" | "DAYS" | "UNTIL",
    validDays: [] as number[],
    expiresAt: "",
  })
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

  async function fetchMenus() {
    setLoading(true)
    const res = await fetch("/api/menu")
    if (res.ok) setMenus(await res.json())
    setLoading(false)
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

  async function handleDiscountSubmit(e: React.FormEvent) {
    e.preventDefault()
    setDiscError("")
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
          validDays: discForm.scheduleType === "DAYS" && discForm.validDays.length > 0 ? discForm.validDays.sort((a, b) => a - b).join(",") : null,
          expiresAt: discForm.scheduleType === "UNTIL" && discForm.expiresAt ? discForm.expiresAt : null,
        }),
      })
      if (!res.ok) { const d = await res.json(); setDiscError(d.error ?? "Gagal menyimpan"); return }
      await fetchDiscountRules()
      setShowDiscountForm(false)
      setEditingRule(null)
      setDiscForm({ name: "", type: "PERCENT", value: "", minPurchase: "", scheduleType: "ALWAYS", validDays: [], expiresAt: "" })
    } catch { setDiscError("Tidak dapat terhubung ke server") }
    finally { setDiscSaving(false) }
  }

  async function handleDiscountDelete(id: string) {
    if (!confirm("Hapus aturan diskon ini?")) return
    await fetch(`/api/discount-rules/${id}`, { method: "DELETE" })
    setDiscountRules((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleDiscountToggle(rule: DiscountRule) {
    await fetch(`/api/discount-rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    setDiscountRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchMenus()
      fetchIngredients()
      fetchDiscountRules()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  const filtered = menus.filter((m) => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === "Semua" || m.category === category
    return matchSearch && matchCat
  })

  async function handleImageUpload(file: File) {
    setUploadingImage(true)
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (res.ok) {
      const d = await res.json()
      setForm((f) => ({ ...f, imageUrl: d.url }))
    } else {
      const d = await res.json()
      setError(d.error ?? "Gagal upload gambar")
    }
    setUploadingImage(false)
  }

  function openCreate() {
    setEditMenu(null)
    setForm(emptyForm)
    setRecipe([])
    setLocalModGroups([])
    setDeletedGroupIds([])
    setError("")
    setCategorySearch("")
    setCategoryOpen(false)
    setShowModal(true)
  }

  function openEdit(menu: Menu) {
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
        quantity: String(r.quantity),
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
        })),
      }))
    )
    setDeletedGroupIds([])
    setError("")
    setCategorySearch("")
    setCategoryOpen(false)
    setShowModal(true)
  }

  function addLocalModGroup() {
    setLocalModGroups((prev) => [
      ...prev,
      { _key: crypto.randomUUID(), name: "", isRequired: false, maxSelect: 1, options: [{ _key: crypto.randomUUID(), name: "", price: "" }] },
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
      i === gIdx ? { ...g, options: [...g.options, { _key: crypto.randomUUID(), name: "", price: "" }] } : g
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

  function addRecipeLine() {
    setRecipe([...recipe, { childItemId: "", quantity: "" }])
  }

  function removeRecipeLine(idx: number) {
    setRecipe(recipe.filter((_, i) => i !== idx))
  }

  function updateRecipeLine(idx: number, field: "childItemId" | "quantity", value: string) {
    setRecipe(recipe.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")

    const validRecipe = recipe.filter((r) => r.childItemId && r.quantity && Number(r.quantity) > 0)

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
            quantity: Number(r.quantity),
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
      fetchMenus()
    } catch {
      setError("Koneksi gagal, coba lagi")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus menu "${name}"? Resep yang terhubung juga akan dihapus.`)) return
    const res = await fetch(`/api/menu/${id}`, { method: "DELETE" })
    if (res.ok) fetchMenus()
  }

  function getIngredientUnit(childItemId: string) {
    return ingredients.find((i) => i.id === childItemId)?.unit ?? ""
  }

  const uniqueCategories = Array.from(new Set(menus.map((m) => m.category).filter(Boolean))) as string[]
  const allCategories = ["Semua", ...uniqueCategories.sort()]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Master Menu</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {menus.length} menu terdaftar
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Menu
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama menu..."
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
                category === cat ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
                {cat}
              </button>
            ))}
          </div>
        </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
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
                    <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3.5">Nama Menu</th>
                    <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5">Kategori</th>
                    <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3.5">Harga Jual</th>
                    <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3.5">Resep / Bahan</th>
                    <th className="text-center text-xs font-semibold text-slate-300 px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((menu, idx) => (
                    <tr key={menu.id} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 !== 0 ? "bg-slate-50/50" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {menu.imageUrl ? (
                            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
                              <img src={menu.imageUrl} alt={menu.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                              <UtensilsCrossed className="w-4 h-4 text-slate-300" />
                            </div>
                          )}
                          <div>
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
                                {r.childItem.name} × {r.quantity} {r.childItem.unit}
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
                            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-700"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(menu.id, menu.name)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-red-500"
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
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <UtensilsCrossed className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <div className="text-slate-500 font-medium">Belum ada menu</div>
                <div className="text-slate-400 text-sm mt-1">
                  Klik Tambah Menu untuk mulai mendaftarkan menu dan resepnya
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Discount Rules Section ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Tag className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Aturan Diskon</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tampil sebagai saran di POS saat syarat minimum terpenuhi</p>
            </div>
          </div>
          <button
            onClick={() => { setShowDiscountForm(true); setEditingRule(null); setDiscForm({ name: "", type: "PERCENT", value: "", minPurchase: "", scheduleType: "ALWAYS", validDays: [], expiresAt: "" }) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Tambah
          </button>
        </div>

        {showDiscountForm && (
          <form onSubmit={handleDiscountSubmit} className="border-b border-slate-100">
            {/* Form header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Tag className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="text-sm font-bold text-slate-800">{editingRule ? "Edit Aturan" : "Aturan Baru"}</span>
              </div>
              <button type="button" onClick={() => { setShowDiscountForm(false); setEditingRule(null) }} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {discError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2.5 rounded-xl">
                  {discError}
                </div>
              )}

              {/* Nama */}
              <input required placeholder="Nama diskon — cth: Happy Hour, Member, Promo Hari Ini"
                value={discForm.name} onChange={(e) => setDiscForm({ ...discForm, name: e.target.value })}
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />

              {/* Tipe · Nilai · Min beli — satu baris */}
              <div className="flex items-center gap-2">
                {/* Type toggle */}
                <div className="flex p-0.5 bg-slate-100 rounded-xl shrink-0">
                  <button type="button" onClick={() => setDiscForm({ ...discForm, type: "PERCENT", value: "" })}
                    className={`px-3.5 py-2 rounded-[10px] text-sm font-bold transition-all ${discForm.type === "PERCENT" ? "bg-white text-blue-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>%</button>
                  <button type="button" onClick={() => setDiscForm({ ...discForm, type: "AMOUNT", value: "" })}
                    className={`px-3 py-2 rounded-[10px] text-xs font-bold transition-all ${discForm.type === "AMOUNT" ? "bg-white text-blue-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>Rp</button>
                </div>
                {/* Nilai */}
                {discForm.type === "PERCENT" ? (
                  <div className="relative w-32 shrink-0">
                    <input required type="number" min="0" max="100" placeholder="10"
                      value={discForm.value} onChange={(e) => setDiscForm({ ...discForm, value: e.target.value })}
                      className="w-full pl-3 pr-7 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">%</span>
                  </div>
                ) : (
                  <div className="relative w-36 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 pointer-events-none">Rp</span>
                    <input required type="text" inputMode="numeric" placeholder="5.000"
                      value={discForm.value} onChange={(e) => setDiscForm({ ...discForm, value: formatRpInput(e.target.value) })}
                      className="w-full pl-8 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
                <div className="h-px w-3 bg-slate-300 shrink-0" />
                {/* Min beli */}
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 pointer-events-none">Rp</span>
                  <input type="text" inputMode="numeric" placeholder="Min. pembelian (opsional)"
                    value={discForm.minPurchase} onChange={(e) => setDiscForm({ ...discForm, minPurchase: formatRpInput(e.target.value) })}
                    className="w-full pl-8 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* Jadwal — icon cards */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Jadwal Berlaku</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { t: "ALWAYS" as const, icon: Clock, label: "Tanpa Batas", sub: "Selalu berlaku" },
                    { t: "DAYS" as const, icon: CalendarDays, label: "Hari Tertentu", sub: "Pilih hari" },
                    { t: "UNTIL" as const, icon: CalendarCheck2, label: "Berlaku Hingga", sub: "Ada tanggal akhir" },
                  ]).map(({ t, icon: Icon, label, sub }) => {
                    const active = discForm.scheduleType === t
                    return (
                      <button key={t} type="button"
                        onClick={() => setDiscForm({ ...discForm, scheduleType: t, validDays: [], expiresAt: "" })}
                        className={`flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border-2 transition-all text-center ${active ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                        <Icon className={`w-5 h-5 ${active ? "text-blue-600" : "text-slate-400"}`} />
                        <div>
                          <p className={`text-xs font-bold leading-none mb-1 ${active ? "text-blue-700" : "text-slate-700"}`}>{label}</p>
                          <p className={`text-[10px] leading-none ${active ? "text-blue-500" : "text-slate-400"}`}>{sub}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Hari */}
                {discForm.scheduleType === "DAYS" && (
                  <div className="flex gap-1.5">
                    {["Min","Sen","Sel","Rab","Kam","Jum","Sab"].map((label, i) => (
                      <button key={i} type="button"
                        onClick={() => setDiscForm({ ...discForm, validDays: discForm.validDays.includes(i) ? discForm.validDays.filter((d) => d !== i) : [...discForm.validDays, i] })}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${discForm.validDays.includes(i) ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Tanggal akhir */}
                {discForm.scheduleType === "UNTIL" && (
                  <input type="date" required value={discForm.expiresAt}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDiscForm({ ...discForm, expiresAt: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                )}
              </div>

              {/* Submit */}
              <button type="submit"
                disabled={discSaving || (discForm.scheduleType === "DAYS" && discForm.validDays.length === 0)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-colors">
                {discSaving ? "Menyimpan..." : editingRule ? "Simpan Perubahan" : "Buat Aturan"}
              </button>
            </div>
          </form>
        )}

        {discountRules.length === 0 && !showDiscountForm ? (
          <div className="py-14 text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Tag className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Belum ada aturan diskon</p>
            <p className="text-xs text-slate-400 mt-1">Tambahkan aturan untuk tampil sebagai saran di kasir</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {discountRules.map((rule) => {
              const discLabel = rule.type === "PERCENT"
                ? `${rule.value}%`
                : `Rp ${Number(rule.value) >= 1000000 ? `${(Number(rule.value)/1000000).toFixed(0)}jt` : Number(rule.value) >= 1000 ? `${(Number(rule.value)/1000).toFixed(0)}rb` : Number(rule.value).toLocaleString("id-ID")}`
              return (
                <div key={rule.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors ${!rule.isActive ? "opacity-60" : ""}`}>
                  <button onClick={() => handleDiscountToggle(rule)}
                    className={`shrink-0 relative rounded-full transition-colors duration-200 ${rule.isActive ? "bg-blue-600" : "bg-slate-200"}`}
                    style={{ width: 52, height: 30, padding: 3 }}>
                    <span className="block bg-white rounded-full transition-transform duration-200"
                      style={{ width: 24, height: 24, boxShadow: "0 2px 6px rgba(0,0,0,0.18), 0 0.5px 2px rgba(0,0,0,0.12)", transform: rule.isActive ? "translateX(22px)" : "translateX(0)" }} />
                  </button>
                  <div className={`w-16 h-11 rounded-xl flex items-center justify-center shrink-0 ${rule.isActive ? "bg-blue-50 border border-blue-100" : "bg-slate-50 border border-slate-200"}`}>
                    <span className={`text-sm font-black leading-none ${rule.isActive ? "text-blue-700" : "text-slate-400"}`}>{discLabel}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{rule.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {Number(rule.minPurchase) > 0 && (
                        <span className="inline-flex items-center text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          min. Rp {Number(rule.minPurchase).toLocaleString("id-ID")}
                        </span>
                      )}
                      {rule.validDays ? (
                        <span className="inline-flex items-center text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                          {rule.validDays.split(",").map((d) => ["Min","Sen","Sel","Rab","Kam","Jum","Sab"][Number(d)]).join(", ")}
                        </span>
                      ) : rule.expiresAt ? (
                        <span className="inline-flex items-center text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                          s/d {new Date(rule.expiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Selalu aktif</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => {
                      setEditingRule(rule)
                      const scheduleType = rule.validDays ? "DAYS" : rule.expiresAt ? "UNTIL" : "ALWAYS"
                      setDiscForm({
                        name: rule.name, type: rule.type,
                        value: rule.type === "AMOUNT" ? formatRpInput(String(Math.round(Number(rule.value)))) : String(rule.value),
                        minPurchase: Number(rule.minPurchase) > 0 ? formatRpInput(String(Math.round(Number(rule.minPurchase)))) : "",
                        scheduleType,
                        validDays: rule.validDays ? rule.validDays.split(",").map(Number) : [],
                        expiresAt: rule.expiresAt ? rule.expiresAt.slice(0, 10) : "",
                      })
                      setShowDiscountForm(true)
                    }} className="text-xs font-medium text-slate-400 hover:text-blue-600 px-2.5 py-1.5 hover:bg-blue-50 rounded-lg transition-colors">
                      Edit
                    </button>
                    <button onClick={() => handleDiscountDelete(rule.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-slate-300 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modifier Group Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg mx-4 p-6 z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editMenu ? "Edit Menu" : "Tambah Menu Baru"}
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Menu *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Burger Bali Spesial"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            const categories = Array.from(new Set([...MENU_CATEGORIES, ...uniqueCategories]))
                            const shownCategories = categories.filter((c) => c.toLowerCase().includes(categorySearch.toLowerCase()))
                            const trimmed = categorySearch.trim()
                            const alreadyExists = categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())
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
                  <input
                    type="text"
                    placeholder="MN-001"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Harga Jual (Rp)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">Rp</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="35.000"
                    value={form.sellPrice}
                    onChange={(e) => setForm({ ...form, sellPrice: formatRpInput(e.target.value) })}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Foto Menu</label>
                <div className="flex gap-3 items-start">
                  {form.imageUrl ? (
                    <div className="relative shrink-0">
                      <img src={form.imageUrl} alt="preview" className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, imageUrl: "" })}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                      >
                        <Trash className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors shrink-0">
                      {uploadingImage ? (
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      ) : (
                        <>
                          <ImagePlus className="w-5 h-5 text-slate-300" />
                          <span className="text-xs text-slate-400 mt-1">Upload</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }}
                      />
                    </label>
                  )}
                  <div className="flex-1 text-xs text-slate-400 pt-1">
                    JPG, PNG, WebP · Maks 2MB<br />
                    Foto akan tampil di layar kasir POS
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Deskripsi</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Burger dengan daging sapi pilihan, saus spesial, dan topping lengkap"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Catatan Internal</label>
                <input
                  type="text"
                  placeholder="Opsional — hanya terlihat di dashboard"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Recipe section */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ChefHat className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700">Resep / Bahan Baku</span>
                  </div>
                  <button
                    type="button"
                    onClick={addRecipeLine}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Tambah Bahan
                  </button>
                </div>

                {recipe.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                    Belum ada bahan. Klik Tambah Bahan untuk mulai.
                  </div>
                )}

                <div className="space-y-2">
                  {recipe.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={line.childItemId}
                        onChange={(e) => updateRecipeLine(idx, "childItemId", e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Pilih bahan...</option>
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>{ing.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateRecipeLine(idx, "quantity", e.target.value)}
                        className="w-20 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                      />
                      <span className="text-xs text-slate-400 w-10 shrink-0">
                        {getIngredientUnit(line.childItemId)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRecipeLine(idx)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modifier inline CRUD */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-semibold text-slate-700">Grup Modifier</span>
                    <span className="text-xs text-slate-400 ml-2">ukuran, topping, tingkat pedas, dll</span>
                  </div>
                  <button type="button" onClick={addLocalModGroup}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 px-2.5 py-1.5 hover:bg-blue-50 rounded-lg transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Tambah Grup
                  </button>
                </div>

                {localModGroups.length === 0 ? (
                  <button type="button" onClick={addLocalModGroup}
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                    + Tambah grup modifier (opsional)
                  </button>
                ) : (
                  <div className="space-y-3">
                    {localModGroups.map((g, gi) => (
                      <div key={g._key} className="border border-slate-200 rounded-xl overflow-hidden">
                        {/* Group header */}
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
                          <input type="text" placeholder="Nama grup (cth: Ukuran, Topping, Tingkat Pedas)"
                            value={g.name}
                            onChange={(e) => updateLocalModGroup(gi, { name: e.target.value })}
                            className="flex-1 bg-transparent text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none" />
                          <button type="button" onClick={() => removeLocalModGroup(gi, g.id)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Options */}
                        <div className="px-3 py-2.5 space-y-2">
                          {g.options.map((o, oi) => (
                            <div key={o._key} className="flex items-center gap-2">
                              <input type="text" placeholder="Nama opsi"
                                value={o.name}
                                onChange={(e) => updateLocalModOption(gi, oi, { name: e.target.value })}
                                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                              <span className="text-xs text-slate-400 shrink-0">+Rp</span>
                              <input type="text" inputMode="numeric" placeholder="0"
                                value={o.price}
                                onChange={(e) => updateLocalModOption(gi, oi, { price: formatRpInput(e.target.value) })}
                                className="w-24 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                              <button type="button" onClick={() => removeLocalModOption(gi, oi)}
                                disabled={g.options.length <= 1}
                                className="p-1 text-slate-300 hover:text-red-400 disabled:opacity-30 rounded transition-colors shrink-0">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button type="button" onClick={() => addLocalModOption(gi)}
                            className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1 pt-0.5">
                            <Plus className="w-3 h-3" /> Tambah opsi
                          </button>
                        </div>

                        {/* Settings */}
                        <div className="flex items-center gap-5 px-3 py-2 border-t border-slate-100 bg-slate-50/60">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={g.isRequired}
                              onChange={(e) => updateLocalModGroup(gi, { isRequired: e.target.checked })}
                              className="accent-blue-600 w-3.5 h-3.5" />
                            <span className="text-xs text-slate-600">Wajib dipilih</span>
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-600">Maks pilih:</span>
                            <select value={g.maxSelect}
                              onChange={(e) => updateLocalModGroup(gi, { maxSelect: Number(e.target.value) })}
                              className="px-1.5 py-0.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                              <option value={1}>1</option>
                              <option value={2}>2</option>
                              <option value={3}>3</option>
                              <option value={5}>5</option>
                              <option value={99}>Bebas</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editMenu && (
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
