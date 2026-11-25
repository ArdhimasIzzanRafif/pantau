"use client"

import { useId, useState } from "react"
import { formatInventoryQuantity } from "@/lib/inventory-quantity"
import { resolveOpnameQuantity, splitOpnameQuantity } from "@/lib/opname-quantity"

type Props = {
  item: { id: string; name: string; unit: string; packSize: number | null; packUnit: string | null }
  value: string
  onCommit: (value: string) => void
}

export function OpnameQuantityInput({ item, value, onCommit }: Props) {
  const errorId = useId()
  const size = item.packUnit && Number(item.packSize) > 0 ? Number(item.packSize) : null
  const initial = (next: string) => {
    if (!next || !Number.isFinite(Number(next))) return { packs: "", loose: "" }
    if (!size) return { packs: "", loose: formatInventoryQuantity(Number(next)) }
    const split = splitOpnameQuantity(Number(next), size)
    return { packs: String(split.packs), loose: formatInventoryQuantity(split.loose) }
  }
  const [draft, setDraft] = useState(() => initial(value))
  const [lastValue, setLastValue] = useState(value)
  let total: number | null = null
  let error = ""
  try {
    total = resolveOpnameQuantity(draft.packs, draft.loose, size)
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Jumlah tidak valid"
  }
  if (lastValue !== value) {
    setLastValue(value)
    if (String(total ?? "") !== value && value !== "invalid") setDraft(initial(value))
  }
  const input = (field: "packs" | "loose", unit: string, name: string) => (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 block text-[11px] font-medium text-slate-500">{name}</span>
      <span className={`flex h-11 items-center overflow-hidden rounded-xl border bg-white transition-shadow focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 ${error ? "border-red-300" : "border-slate-200"}`}>
        <input type="text" inputMode={field === "packs" ? "numeric" : "decimal"} value={draft[field]} placeholder="0" aria-label={`${name} ${item.name} (${unit})`} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
          onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
          // Fokus ditampilkan oleh pembungkus agar satuan ikut berada di dalamnya.
          // Override outline global yang diterapkan pada input :focus-visible.
          style={{ outline: "none" }}
          className="h-full w-full min-w-0 border-0 bg-transparent px-3 text-sm font-medium tabular-nums text-slate-900 outline-none placeholder:text-slate-400" />
        <span className="shrink-0 pr-3 text-xs text-slate-500">{unit}</span>
      </span>
    </label>
  )
  return (
    <div className="min-w-0" onBlur={(event) => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
      onCommit(error ? "invalid" : total == null ? "" : String(total))
    }}>
      <div className="flex min-w-0 items-end gap-2">
        {size && <>{input("packs", item.packUnit!, "Kemasan utuh")}<span className="mb-3 text-sm text-slate-400">+</span></>}
        {input("loose", item.unit, size ? "Satuan lepas" : "Jumlah fisik")}
      </div>
      {error ? <p id={errorId} className="mt-2 text-xs leading-5 text-red-600">{error}</p>
        : <p className="mt-2 text-xs text-slate-500">{total == null ? "Belum dihitung" : <>Total fisik <span className="font-semibold tabular-nums text-blue-600">{formatInventoryQuantity(total)} {item.unit}</span></>}</p>}
    </div>
  )
}
