"use client"

import { useState, useEffect } from "react"
import { Plus, Edit, Trash2, X, Loader2, ChevronRight, Check } from "lucide-react"
import { useConfirm } from "@/components/ui/use-confirm"
import { FormAlert } from "@/components/ui/form-alert"
import { StableDraftInput } from "@/components/ui/stable-draft-input"

type ModifierOption = {
  id?: string
  name: string
  price: number
  recipeItems: Array<{
    itemId: string
    quantity: number
    item?: { id: string; name: string; unit: string }
  }>
}

type Ingredient = { id: string; name: string; unit: string; isTrackable: boolean }

type ModifierGroup = {
  id: string
  name: string
  isRequired: boolean
  maxSelect: number
  options: ModifierOption[]
  items: { itemId: string }[]
}

const emptyGroup = { name: "", isRequired: false, maxSelect: 1 }

export default function ModifiersPage() {
  const { ask, dialog } = useConfirm()
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editGroup, setEditGroup] = useState<ModifierGroup | null>(null)
  const [form, setForm] = useState(emptyGroup)
  const [options, setOptions] = useState<ModifierOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [ingredients, setIngredients] = useState<Ingredient[]>([])

  async function fetchGroups() {
    setLoading(true)
    const res = await fetch("/api/modifiers")
    if (res.ok) setGroups(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchGroups()
      fetch("/api/inventory")
        .then((res) => res.ok ? res.json() : [])
        .then((items: Ingredient[]) => setIngredients(items.filter((item) => item.isTrackable)))
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  function openCreate() {
    setEditGroup(null)
    setForm(emptyGroup)
    setOptions([{ name: "", price: 0, recipeItems: [] }])
    setError("")
    setShowModal(true)
  }

  function openEdit(g: ModifierGroup) {
    setEditGroup(g)
    setForm({ name: g.name, isRequired: g.isRequired, maxSelect: g.maxSelect })
    setOptions(g.options.map((o) => ({
      id: o.id,
      name: o.name,
      price: Number(o.price),
      recipeItems: (o.recipeItems ?? []).map((recipe) => ({
        itemId: recipe.itemId,
        quantity: Number(recipe.quantity),
        item: recipe.item,
      })),
    })))
    setError("")
    setShowModal(true)
  }

  function addOption() {
    setOptions([...options, { name: "", price: 0, recipeItems: [] }])
  }

  function removeOption(i: number) {
    setOptions(options.filter((_, idx) => idx !== i))
  }

  function updateOption(i: number, field: "name" | "price", value: string) {
    setOptions(options.map((o, idx) =>
      idx === i ? { ...o, [field]: field === "price" ? Number(value) : value } : o
    ))
  }

  function addRecipe(optionIndex: number) {
    setOptions((prev) => prev.map((option, index) => index === optionIndex
      ? { ...option, recipeItems: [...option.recipeItems, { itemId: "", quantity: 1 }] }
      : option
    ))
  }

  function updateRecipe(optionIndex: number, recipeIndex: number, patch: Partial<{ itemId: string; quantity: number }>) {
    setOptions((prev) => prev.map((option, index) => index === optionIndex
      ? {
          ...option,
          recipeItems: option.recipeItems.map((recipe, idx) => idx === recipeIndex ? { ...recipe, ...patch } : recipe),
        }
      : option
    ))
  }

  function removeRecipe(optionIndex: number, recipeIndex: number) {
    setOptions((prev) => prev.map((option, index) => index === optionIndex
      ? { ...option, recipeItems: option.recipeItems.filter((_, idx) => idx !== recipeIndex) }
      : option
    ))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError("Nama grup wajib diisi"); return }
    if (options.some((o) => !o.name.trim())) { setError("Semua opsi harus ada namanya"); return }
    if (options.some((o) => o.recipeItems.some((recipe) => !recipe.itemId || recipe.quantity <= 0))) {
      setError("Bahan modifier dan jumlah pemakaiannya harus valid")
      return
    }
    setSubmitting(true)
    setError("")

    const payload = {
      name: form.name.trim(),
      isRequired: form.isRequired,
      maxSelect: form.maxSelect,
      options: options.filter((o) => o.name.trim()),
    }

    const res = editGroup
      ? await fetch(`/api/modifiers/${editGroup.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/modifiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })

    if (res.ok) {
      setShowModal(false)
      fetchGroups()
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? "Gagal menyimpan")
    }
    setSubmitting(false)
  }

  function handleDelete(id: string, name: string) {
    ask({
      title: "Hapus grup modifier ini?",
      message: `Semua menu yang memakai "${name}" akan terpengaruh.`,
      confirmLabel: "Hapus",
      danger: true,
      onConfirm: async () => {
        const res = await fetch(`/api/modifiers/${id}`, { method: "DELETE" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? "Gagal menghapus grup modifier")
        }
        fetchGroups()
      },
    })
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Modifier Menu</h1>
          <p className="text-sm text-slate-500 mt-0.5">Ukuran, topping, tingkat kepedasan, dll.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Tambah Grup
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="font-medium">Belum ada modifier</p>
          <p className="text-sm mt-1">Buat grup modifier seperti &quot;Ukuran&quot; atau &quot;Topping&quot; lalu assign ke menu item</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{g.name}</span>
                    {g.isRequired && (
                      <span className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full font-medium">Wajib</span>
                    )}
                    {g.maxSelect > 1 && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full font-medium">Pilih maks {g.maxSelect}</span>
                    )}
                    <span className="text-xs text-slate-400">{g.items.length} item menu</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {g.options.map((o) => (
                      <span key={o.id} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-md">
                        {o.name}{Number(o.price) > 0 ? ` +Rp ${Number(o.price).toLocaleString("id-ID")}` : ""}
                        {o.recipeItems.length > 0 ? ` · ${o.recipeItems.map((recipe) => `${recipe.item?.name ?? "bahan"} ${Number(recipe.quantity)} ${recipe.item?.unit ?? ""}`).join(", ")}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(g)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(g.id, g.name)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <div className="flex gap-2">
          <ChevronRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Setelah membuat grup modifier, buka halaman <strong>Menu</strong> → edit menu item → bagian <strong>Modifier</strong> untuk assign grup ke item tersebut.
          </p>
        </div>
      </div>

      {showModal && (
        <div className="app-overlay z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" aria-label="Tutup formulir" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={() => setShowModal(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="modifier-dialog-title" className="relative z-10 flex max-h-[calc(100%-3rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100%-2rem)] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 id="modifier-dialog-title" className="text-lg font-semibold text-slate-900">{editGroup ? "Edit Grup Modifier" : "Tambah Grup Modifier"}</h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <form id="modifier-form" onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Grup <span className="text-red-500">*</span></label>
                <StableDraftInput
                  value={form.name}
                  onCommit={(value) => setForm((previous) => ({ ...previous, name: value }))}
                  placeholder="cth: Ukuran, Topping, Tingkat Kepedasan"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isRequired: !form.isRequired })}
                    className={`w-9 h-5 rounded-full transition-colors ${form.isRequired ? "bg-blue-600" : "bg-slate-200"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${form.isRequired ? "translate-x-4" : ""}`} />
                  </button>
                  <span className="text-sm text-slate-700">Pilihan wajib</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Maksimal pilihan</label>
                <select
                  value={form.maxSelect}
                  onChange={(e) => setForm({ ...form, maxSelect: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>1 — pilih salah satu (radio)</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={99}>Tidak terbatas</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Opsi <span className="text-red-500">*</span></label>
                  <button type="button" onClick={addOption} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Tambah opsi</button>
                </div>
                <div className="space-y-3">
                  {options.map((o, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
                      <div className="flex gap-2 items-center">
                        <StableDraftInput
                          value={o.name}
                          onCommit={(value) => updateOption(i, "name", value)}
                          placeholder="Nama opsi"
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">+Rp</span>
                          <StableDraftInput
                            type="number"
                            min={0}
                            value={o.price}
                            onCommit={(value) => updateOption(i, "price", value)}
                            className="w-28 pl-9 pr-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        {options.length > 1 && (
                          <button type="button" onClick={() => removeOption(i)} className="p-1.5 text-slate-400 hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-slate-500">Bahan stok tambahan (opsional)</span>
                          <button type="button" onClick={() => addRecipe(i)} className="text-[11px] font-medium text-blue-600">+ Bahan</button>
                        </div>
                        {o.recipeItems.map((recipe, recipeIndex) => {
                          const ingredient = ingredients.find((item) => item.id === recipe.itemId)
                          return (
                            <div key={recipeIndex} className="flex items-center gap-2">
                              <select
                                value={recipe.itemId}
                                onChange={(e) => updateRecipe(i, recipeIndex, { itemId: e.target.value })}
                                className="flex-1 px-2.5 py-2 border border-slate-200 bg-white rounded-lg text-xs"
                              >
                                <option value="">Pilih bahan...</option>
                                {ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                              </select>
                              <StableDraftInput
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={recipe.quantity}
                                onCommit={(value) => updateRecipe(i, recipeIndex, { quantity: Number(value) })}
                                className="w-20 px-2 py-2 border border-slate-200 bg-white rounded-lg text-xs text-right"
                              />
                              <span className="w-10 text-xs text-slate-400">{ingredient?.unit ?? "unit"}</span>
                              <button type="button" onClick={() => removeRecipe(i, recipeIndex)} className="text-slate-400 hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <FormAlert message={error} onClose={() => setError("")} />
            </form>
            <div className="dialog-actions flex gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4">
              <button type="button" onClick={() => setShowModal(false)} className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Batal
              </button>
              <button type="submit" form="modifier-form" disabled={submitting} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}
