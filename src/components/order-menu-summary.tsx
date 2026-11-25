"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

export type OrderHistoryItem = {
  id: string
  name: string
  qty: number
  notes?: string | null
  modifiers?: Array<{ id: string; groupName: string; optionName: string; price: number | string }>
}

const PREVIEW_HEIGHT = 96
const rupiah = (amount: number) => `Rp ${Math.round(amount).toLocaleString("id-ID")}`

export function OrderItemDescription({ item }: { item: OrderHistoryItem }) {
  return <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
    <p className="text-sm text-slate-700">{item.name} <span className="whitespace-nowrap text-slate-500">×{item.qty}</span></p>
    {(item.modifiers ?? []).map(modifier => <p key={modifier.id} className="text-xs leading-5 text-slate-500">
      {modifier.optionName}{Number(modifier.price) !== 0 && <span className="ml-1">({Number(modifier.price) > 0 ? "+" : "−"}{rupiah(Math.abs(Number(modifier.price)))})</span>}
    </p>)}
    {item.notes && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-500">Catatan: {item.notes}</p>}
  </div>
}

export function OrderMenuSummary({ items, className = "mx-auto w-full max-w-xs text-left" }: { items: OrderHistoryItem[]; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const contentId = useId()
  const canExpand = height > PREVIEW_HEIGHT

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    let active = true
    const measure = () => { if (active) setHeight(Math.ceil(content.scrollHeight)) }
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    measure()
    void document.fonts.ready.then(measure)
    return () => { active = false; observer.disconnect() }
  }, [items])

  return <div className={className}>
    <div id={contentId} className="overflow-hidden transition-[max-height] duration-200 motion-reduce:transition-none" style={{ maxHeight: expanded && canExpand ? height : PREVIEW_HEIGHT }}>
      <div ref={contentRef} className="space-y-3">
        {items.map(item => <OrderItemDescription key={item.id} item={item} />)}
      </div>
    </div>
    {canExpand && <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)}
      className="mt-2 inline-flex items-center gap-1 rounded py-1 text-xs font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      {expanded ? "Ringkas" : "Lihat semua"}<ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>}
  </div>
}
