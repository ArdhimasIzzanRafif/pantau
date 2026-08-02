"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Plus, Minus, X, CheckCircle, Loader2, UtensilsCrossed, AlertCircle, ChevronRight, ShoppingBag, Pencil } from "lucide-react"

type ModifierOption = { id: string; name: string; price: number }
type ModifierGroup  = { id: string; name: string; isRequired: boolean; maxSelect: number; options: ModifierOption[] }
type MenuItem = {
  id: string; name: string; price: number
  category: string; imageUrl: string | null; description: string | null
  isAvailable: boolean; unavailableReason: string | null
  modifierGroups: ModifierGroup[]
}
type SelectedMod = { groupId: string; groupName: string; optionId: string; optionName: string; price: number }
type CartItem    = { cartKey: string; menuItemId: string; name: string; price: number; qty: number; notes: string; modifiers: SelectedMod[] }
type PageData    = {
  location:     { id: string; name: string }
  table:        { id: string; name: string } | null
  organization: { name: string; logoUrl: string | null; qrisImageUrl: string | null; hasQris: boolean }
  menuItems:    MenuItem[]
  isOpen:       boolean
}

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID")
const ck = (id: string, mods: SelectedMod[]) => id + "::" + mods.map(m => m.optionId).sort().join("|")

const CAT_EMOJI: Record<string, string> = { Burger: "🍔", Makanan: "🍔", Minuman: "🥤", Snack: "🍟", Kentang: "🍟", Paket: "📦" }
const CAT_BG:    Record<string, string> = { Burger: "bg-orange-50", Makanan: "bg-orange-50", Minuman: "bg-blue-50", Snack: "bg-yellow-50", Kentang: "bg-yellow-50", Paket: "bg-purple-50" }
const catEmoji = (c: string) => CAT_EMOJI[c] ?? "🍽️"
const catBg    = (c: string) => CAT_BG[c]    ?? "bg-slate-50"

export default function TableMenuPage() {
  const { token } = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const mejaToken = searchParams.get("meja") ?? ""

  const [loading,   setLoading]   = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [data,      setData]      = useState<PageData | null>(null)

  const lockedTable = data?.table?.name ?? ""

  const [tableNumber,    setTableNumber]    = useState("")
  const [tableError,     setTableError]     = useState(false)
  const [showTableModal, setShowTableModal] = useState(false)
  const [tableTmp,       setTableTmp]       = useState("")

  const [customerName,  setCustomerName]  = useState("")
  const [nameError,     setNameError]     = useState(false)
  const [successOrder,  setSuccessOrder]  = useState<{ orderNumber: string; total: number } | null>(null)

  const [cart,      setCart]      = useState<CartItem[]>([])
  const [showCart,  setShowCart]  = useState(false)
  const [modModal,  setModModal]  = useState<MenuItem | null>(null)
  const [selMods,   setSelMods]   = useState<SelectedMod[]>([])
  const [modNotes,  setModNotes]  = useState("")
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const catRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const [ordering, setOrdering] = useState(false)
  const [orderErr, setOrderErr] = useState<string | null>(null)

  useEffect(() => {
    const qs = mejaToken ? `?meja=${encodeURIComponent(mejaToken)}` : ""
    fetch(`/api/public/${token}${qs}`).then(r => r.json()).then(d => {
      if (d.error) { setPageError(d.error); return }
      setData(d)
      if (d.table) setTableNumber(d.table.name)
      const cats = [...new Set(d.menuItems.map((m: MenuItem) => m.category))] as string[]
      if (cats.length) setActiveCat(cats[0])
    }).catch(() => setPageError("Gagal memuat menu")).finally(() => setLoading(false))
  }, [token, mejaToken])

  // Cek ulang status shift saat customer balik ke tab — tanpa polling
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && data && !data.isOpen) {
        fetch(`/api/public/${token}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d && !d.error) setData(d) })
          .catch(() => {})
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [token, data])

  const cats  = data ? [...new Set(data.menuItems.map(m => m.category))] : []
  const total = cart.reduce((s, c) => s + (c.price + c.modifiers.reduce((ms, m) => ms + m.price, 0)) * c.qty, 0)
  const qty   = cart.reduce((s, c) => s + c.qty, 0)

  function confirmTable(val: string) {
    if (!val.trim()) return
    setTableNumber(val.trim()); setShowTableModal(false); setTableError(false)
  }
  function openModModal(item: MenuItem) {
    if (!item.isAvailable) return
    if (!item.modifierGroups.length) addToCart(item, [], "")
    else { setModModal(item); setSelMods([]); setModNotes("") }
  }
  function toggleMod(g: ModifierGroup, o: ModifierOption) {
    setSelMods(prev => {
      if (prev.find(m => m.groupId === g.id && m.optionId === o.id)) return prev.filter(m => !(m.groupId === g.id && m.optionId === o.id))
      const entry = { groupId: g.id, groupName: g.name, optionId: o.id, optionName: o.name, price: o.price }
      if (prev.filter(m => m.groupId === g.id).length >= g.maxSelect) return [...prev.filter(m => m.groupId !== g.id), entry]
      return [...prev, entry]
    })
  }
  const canConfirm = () => modModal?.modifierGroups.every(g => !g.isRequired || selMods.some(m => m.groupId === g.id)) ?? false
  function addToCart(item: MenuItem, mods: SelectedMod[], notes: string) {
    const k = ck(item.id, mods)
    setCart(prev => {
      const i = prev.findIndex(c => c.cartKey === k)
      if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n }
      return [...prev, { cartKey: k, menuItemId: item.id, name: item.name, price: item.price, qty: 1, notes, modifiers: mods }]
    })
    setModModal(null)
  }
  function changeQty(k: string, d: number) {
    setCart(prev => prev.map(c => c.cartKey === k ? { ...c, qty: c.qty + d } : c).filter(c => c.qty > 0))
  }
  async function submitOrder() {
    if (!cart.length || !tableNumber.trim() || !customerName.trim()) return
    setOrdering(true); setOrderErr(null)

    const body = {
      tableNumber: tableNumber.trim(),
      tableToken: data?.table ? mejaToken : undefined,
      customerName: customerName.trim(),
      items: cart.map(c => ({
        menuItemId: c.menuItemId, name: c.name, price: c.price, qty: c.qty,
        notes: c.notes || null,
        modifiers: c.modifiers.map(m => ({ groupName: m.groupName, optionName: m.optionName, price: m.price })),
      })),
    }

    try {
      const res = await fetch(`/api/public/${token}/order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) { setOrderErr(d.error ?? "Gagal memproses pesanan"); setOrdering(false); return }

      // Bayar di kasir — tampilkan success sederhana
      setSuccessOrder({ orderNumber: d.orderNumber, total })
      setCart([]); setShowCart(false); setOrdering(false)
    } catch { setOrderErr("Gagal memproses pesanan, coba lagi"); setOrdering(false) }
  }
  function openCart() {
    if (!tableNumber.trim()) { setTableError(true); return }
    if (!customerName.trim()) { setNameError(true); return }
    setOrderErr(null); setShowCart(true)
  }

  // ─── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
    </div>
  )
  if (pageError) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="text-center">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <UtensilsCrossed className="w-6 h-6 text-slate-400" />
        </div>
        <p className="font-semibold text-slate-800">{pageError}</p>
        <p className="text-sm text-slate-400 mt-1">Coba scan ulang QR code</p>
      </div>
    </div>
  )

  // ─── Success Screen ──────────────────────────────────────────────────────
  if (successOrder) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm space-y-4">
          <div className="bg-linear-to-br from-green-400 to-emerald-600 rounded-3xl px-6 pt-8 pb-6 flex flex-col items-center text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold">Pembayaran Berhasil!</h2>
            <p className="text-white/80 text-sm mt-1">Pesanan kamu sedang diproses dapur</p>
            <div className="mt-4 bg-white/20 rounded-2xl px-5 py-3 w-full">
              <p className="text-xs text-white/70 mb-1">Nomor Pesanan</p>
              <p className="font-black text-lg tracking-wider">{successOrder.orderNumber}</p>
            </div>
            <div className="flex items-center gap-2 mt-3 text-white/70 text-xs">
              <span>{customerName}</span>
              <span>·</span>
              <span>Meja {tableNumber}</span>
              <span>·</span>
              <span className="font-bold text-white">{rp(successOrder.total)}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm px-5 py-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-xl">🍳</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">Tunggu sebentar ya!</p>
              <p className="text-xs text-slate-400 mt-0.5">Kasir akan mencetak struk dan dapur akan segera memproses pesanan kamu</p>
            </div>
          </div>

          <button
            onClick={() => { setSuccessOrder(null); setCustomerName("") }}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-colors"
          >
            Pesan Lagi
          </button>
        </div>
      </div>
    )
  }

  const isOpen = data?.isOpen ?? false

  // ─── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100">

      {/* ═══════════ CLOSED BANNER ═════════════════════════════════════════ */}
      {!isOpen && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-sm font-semibold text-center py-2.5 px-4 flex items-center justify-center gap-2">
          <span>⏰</span>
          <span>Kasir belum buka — kamu tetap bisa lihat menu, tapi pesanan belum bisa dikirim</span>
        </div>
      )}

      {/* ═══════════ DESKTOP LEFT SIDEBAR (lg+) ═══════════════════════════ */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 z-20">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-slate-100 space-y-4">
          <div className="flex items-center gap-3">
            {data?.organization.logoUrl
              ? <img src={data.organization.logoUrl} alt="logo" className="w-11 h-11 rounded-xl object-cover shrink-0" /> // eslint-disable-line @next/next/no-img-element
              : <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shrink-0"><UtensilsCrossed className="w-5 h-5 text-white" /></div>
            }
            <div className="min-w-0">
              <p className="font-bold text-slate-900 text-sm truncate">{data?.organization.name}</p>
              <p className="text-xs text-slate-400 truncate">{data?.location.name}</p>
            </div>
          </div>
          {/* Table number — sidebar */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">Nomor Meja</label>
            {lockedTable ? (
              <div className="w-full text-center text-2xl font-black px-4 py-3 rounded-xl bg-blue-50 border-2 border-blue-200 text-blue-700">
                {lockedTable}
              </div>
            ) : (
              <>
                <input
                  type="text" inputMode="numeric"
                  value={tableNumber}
                  onChange={e => { setTableNumber(e.target.value); setTableError(false) }}
                  placeholder="Contoh: 4"
                  className={`w-full text-center text-2xl font-black px-4 py-3 rounded-xl bg-slate-50 border-2 focus:outline-none focus:border-blue-500 transition-colors text-slate-900 placeholder:text-slate-200 ${
                    tableError ? "border-red-400 bg-red-50" : "border-slate-200"
                  }`}
                />
                {tableError && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" /> Wajib diisi sebelum memesan
                  </p>
                )}
              </>
            )}
          </div>

          {/* Nama pemesan — sidebar */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">Nama Kamu <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={customerName}
              onChange={e => { setCustomerName(e.target.value); setNameError(false) }}
              placeholder="Contoh: Budi"
              className={`w-full px-4 py-3 rounded-xl bg-slate-50 border-2 focus:outline-none focus:border-blue-500 transition-colors text-slate-900 placeholder:text-slate-300 text-sm ${
                nameError ? "border-red-400 bg-red-50" : "border-slate-200"
              }`}
            />
            {nameError && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> Nama wajib diisi
              </p>
            )}
          </div>
        </div>
        {/* Category nav */}
        <nav className="flex-1 overflow-y-auto p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2">Kategori</p>
          <div className="space-y-0.5">
            {cats.map(cat => {
              const count  = data?.menuItems.filter(m => m.category === cat).length ?? 0
              const active = activeCat === cat
              return (
                <button key={cat}
                  onClick={() => { setActiveCat(cat); catRefs.current[cat]?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}>
                  <span className="flex items-center gap-2.5">
                    <span>{catEmoji(cat)}</span>
                    <span>{cat}</span>
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${active ? "opacity-70" : "opacity-40"}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </aside>

      {/* ═══════════ DESKTOP RIGHT CART PANEL (lg+) ════════════════════════ */}
      <aside className="hidden lg:flex flex-col fixed right-0 top-0 h-screen w-80 bg-white border-l border-slate-200 z-20">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">Pesanan</h2>
            {tableNumber && <p className="text-xs text-slate-400 mt-0.5">Meja {tableNumber}</p>}
          </div>
          {qty > 0 && <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">{qty} item</span>}
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
              <ShoppingBag className="w-7 h-7 text-slate-300" />
            </div>
            <p className="font-semibold text-slate-400 text-sm">Keranjang kosong</p>
            <p className="text-slate-300 text-xs">Pilih menu untuk mulai memesan</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
              {cart.map(c => {
                const up = c.price + c.modifiers.reduce((s, m) => s + m.price, 0)
                return (
                  <div key={c.cartKey} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                        {c.modifiers.map(m => (
                          <p key={m.optionId} className="text-xs text-blue-500">{m.optionName}{m.price > 0 ? ` +${rp(m.price)}` : ""}</p>
                        ))}
                      </div>
                      <p className="text-sm font-bold text-slate-900 shrink-0">{rp(up * c.qty)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => changeQty(c.cartKey, -1)} className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:border-red-300 transition-colors">
                          <Minus className="w-3 h-3 text-slate-500" />
                        </button>
                        <span className="w-5 text-center text-sm font-bold text-slate-900">{c.qty}</span>
                        <button onClick={() => changeQty(c.cartKey, 1)} className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center hover:bg-blue-700 transition-colors">
                          <Plus className="w-3 h-3 text-white" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">{rp(up)} / item</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="px-4 pb-5 pt-3 border-t border-slate-100 space-y-3 shrink-0">
              {/* Nama pemesan — wajib, desktop */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Nama Kamu <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => { setCustomerName(e.target.value); setNameError(false) }}
                  placeholder="Contoh: Budi"
                  className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none focus:border-blue-500 transition-colors text-slate-900 placeholder:text-slate-300 ${
                    nameError ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                  }`}
                />
                {nameError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> Nama wajib diisi</p>}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-sm">Total</span>
                <span className="font-black text-lg text-slate-900">{rp(total)}</span>
              </div>
              <button
                onClick={() => { if (!tableNumber.trim()) { setTableError(true); return } if (!customerName.trim()) { setNameError(true); return } submitOrder() }}
                disabled={ordering || !isOpen}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {ordering ? <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</> : !isOpen ? "Kasir Belum Buka" : <>Bayar {rp(total)} <ChevronRight className="w-4 h-4" /></>}
              </button>
              {orderErr && <p className="text-xs text-red-500 text-center">{orderErr}</p>}
            </div>
          </>
        )}
      </aside>

      {/* ═══════════ MAIN CONTENT ══════════════════════════════════════════ */}
      <div className={`lg:ml-64 lg:mr-80 ${!isOpen ? "pt-10" : ""}`}>

        {/* Mobile sticky header */}
        <header className="lg:hidden bg-white sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
            {data?.organization.logoUrl
              ? <img src={data.organization.logoUrl} alt="logo" className="w-10 h-10 rounded-xl object-cover shrink-0" /> // eslint-disable-line @next/next/no-img-element
              : <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0"><UtensilsCrossed className="w-5 h-5 text-white" /></div>
            }
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 text-sm truncate">{data?.organization.name}</p>
              <p className="text-xs text-slate-400 truncate">{data?.location.name}</p>
            </div>
            {/* Table number — mobile badge */}
            {lockedTable ? (
              <div className="shrink-0 flex items-center gap-1.5 font-bold text-xs px-3 py-1.5 rounded-xl bg-blue-600 text-white">
                Meja {lockedTable}
              </div>
            ) : (
              <button onClick={() => { setTableTmp(tableNumber); setShowTableModal(true) }}
                className={`shrink-0 flex items-center gap-1.5 font-bold text-xs px-3 py-1.5 rounded-xl transition-colors ${
                  tableError ? "bg-red-600 text-white animate-pulse" :
                  tableNumber ? "bg-slate-900 text-white" :
                  "bg-slate-100 text-slate-500 border-2 border-dashed border-slate-300"
                }`}>
                <span>{tableNumber ? `Meja ${tableNumber}` : "Isi Meja"}</span>
                <Pencil className="w-3 h-3 opacity-70" />
              </button>
            )}
          </div>
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {cats.map(cat => {
              const count  = data?.menuItems.filter(m => m.category === cat).length ?? 0
              const active = activeCat === cat
              return (
                <button key={cat}
                  onClick={() => { setActiveCat(cat); catRefs.current[cat]?.scrollIntoView({ behavior: "smooth", block: "start" }) }}
                  className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {cat}
                  <span className={`text-[10px] font-bold ${active ? "opacity-70" : "opacity-50"}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </header>

        {/* Desktop page header */}
        <div className="hidden lg:block px-8 pt-7 pb-2">
          <h1 className="text-xl font-bold text-slate-800">Menu</h1>
          <p className="text-sm text-slate-400 mt-0.5">{data?.location.name}</p>
        </div>

        {/* Grid */}
        <div className="px-4 lg:px-8 pt-5 pb-28 lg:pb-10">
          <div className="space-y-8">
            {cats.map(cat => {
              const items = data?.menuItems.filter(m => m.category === cat) ?? []
              return (
                <div key={cat} ref={el => { catRefs.current[cat] = el }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{cat}</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 lg:gap-4">
                    {items.map(item => {
                      const inCart  = cart.find(c => c.menuItemId === item.id)
                      const cartQty = inCart?.qty ?? 0
                      const noMod   = !item.modifierGroups.length
                      const unavail = !item.isAvailable
                      return (
                        <div key={item.id}
                          onClick={() => !unavail && openModModal(item)}
                          className={`bg-white rounded-2xl overflow-hidden flex flex-col text-left transition-all shadow-sm select-none ${
                            unavail ? "opacity-50 cursor-not-allowed" : "hover:shadow-md active:scale-[0.97] cursor-pointer"
                          } ${inCart ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-100" : ""}`}>
                          <div className="relative w-full h-36 lg:h-40 shrink-0 overflow-hidden">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} // eslint-disable-line @next/next/no-img-element
                                className={`w-full h-full object-cover ${unavail ? "grayscale" : ""}`} />
                            ) : (
                              <div className={`w-full h-full ${catBg(item.category)} flex items-center justify-center`}>
                                <span className={`text-5xl select-none ${unavail ? "opacity-30" : "opacity-80"}`}>{catEmoji(item.category)}</span>
                              </div>
                            )}
                            {unavail && (
                              <div className="absolute inset-0 bg-black/20 flex items-end p-2">
                                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {item.unavailableReason === "habis" ? "Habis" : "N/A"}
                                </span>
                              </div>
                            )}
                            {cartQty > 0 && !unavail && (
                              <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white">
                                <span className="text-white text-[10px] font-black">{cartQty}</span>
                              </div>
                            )}
                          </div>
                          <div className="p-3 flex flex-col flex-1">
                            <p className="text-xs font-semibold text-slate-900 leading-snug line-clamp-2 flex-1 mb-2">{item.name}</p>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-bold text-blue-600">{rp(item.price)}</span>
                              {unavail ? (
                                <span className="text-[10px] text-slate-400">Habis</span>
                              ) : inCart && noMod ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => changeQty(inCart.cartKey, -1)}
                                    className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                                    <Minus className="w-2.5 h-2.5 text-slate-700" />
                                  </button>
                                  <span className="w-4 text-center text-xs font-black text-slate-900">{cartQty}</span>
                                  <button onClick={() => changeQty(inCart.cartKey, 1)}
                                    className="w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center">
                                    <Plus className="w-2.5 h-2.5 text-white" />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={e => { e.stopPropagation(); openModModal(item) }}
                                  className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center shadow-sm transition-colors">
                                  <Plus className="w-4 h-4 text-white" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ═══════════ MOBILE CART FAB ════════════════════════════════════════ */}
      {qty > 0 && !showCart && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 px-4 pb-5 z-30">
          <button onClick={openCart}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl py-4 flex items-center px-5 gap-4 shadow-2xl shadow-black/20 transition-colors">
            <div className="bg-blue-600 rounded-xl w-9 h-9 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-sm">Lihat Pesanan</p>
              <p className="text-slate-400 text-xs">{qty} item</p>
            </div>
            <p className="font-black text-sm shrink-0">{rp(total)}</p>
          </button>
        </div>
      )}

      {/* ═══════════ MOBILE CART BOTTOM SHEET ══════════════════════════════ */}
      {showCart && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex justify-center py-3 shrink-0"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>

            <>
              <div className="flex items-center justify-between px-5 pb-4 border-b border-slate-100 shrink-0">
                <div><h2 className="font-bold text-slate-900 text-lg">Pesanan Anda</h2><p className="text-xs text-slate-400 mt-0.5">Meja {tableNumber}</p></div>
                <button onClick={() => setShowCart(false)} className="w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                {cart.map(c => {
                  const up = c.price + c.modifiers.reduce((s, m) => s + m.price, 0)
                  return (
                    <div key={c.cartKey} className="flex items-start gap-3">
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => changeQty(c.cartKey, -1)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center"><Minus className="w-3.5 h-3.5 text-slate-600" /></button>
                        <span className="w-5 text-center text-sm font-bold">{c.qty}</span>
                        <button onClick={() => changeQty(c.cartKey, 1)} className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center"><Plus className="w-3.5 h-3.5 text-blue-600" /></button>
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        {c.modifiers.map(m => <p key={m.optionId} className="text-xs text-slate-400">{m.optionName}{m.price > 0 ? ` · +${rp(m.price)}` : ""}</p>)}
                      </div>
                      <p className="text-sm font-bold text-slate-900 shrink-0 pt-1">{rp(up * c.qty)}</p>
                    </div>
                  )
                })}
              </div>
              <div className="px-5 pb-8 pt-4 border-t border-slate-100 shrink-0 space-y-3">
                {/* Nama pemesan — wajib, mobile */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Nama Kamu <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => { setCustomerName(e.target.value); setNameError(false) }}
                    placeholder="Contoh: Budi"
                    className={`w-full px-4 py-3 rounded-xl border-2 text-sm focus:outline-none focus:border-blue-500 transition-colors text-slate-900 placeholder:text-slate-300 ${
                      nameError ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50"
                    }`}
                  />
                  {nameError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> Nama wajib diisi</p>}
                </div>
                <div className="flex justify-between"><span className="text-slate-500 text-sm">Total</span><span className="font-black text-xl">{rp(total)}</span></div>
                {orderErr && <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 rounded-xl"><AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /><span className="text-sm text-red-700">{orderErr}</span></div>}
                <button
                  onClick={() => { if (!tableNumber.trim()) { setTableError(true); return } if (!customerName.trim()) { setNameError(true); return } submitOrder() }}
                  disabled={ordering || !isOpen}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-2xl flex items-center justify-center gap-2"
                >
                  {ordering ? <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</> : !isOpen ? "Kasir Belum Buka" : <>Bayar {rp(total)}</>}
                </button>
              </div>
            </>
          </div>
        </div>
      )}


      {/* ═══════════ MOBILE TABLE NUMBER MODAL ══════════════════════════════ */}
      {showTableModal && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowTableModal(false)} />
          <div className="relative bg-white rounded-t-3xl w-full shadow-2xl px-6 pt-6 pb-10">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
            <h3 className="font-bold text-slate-900 text-lg mb-1">Nomor Meja</h3>
            <p className="text-sm text-slate-400 mb-4">Masukkan nomor meja yang tertera di meja Anda</p>
            <input type="text" inputMode="numeric" autoFocus
              value={tableTmp}
              onChange={e => setTableTmp(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmTable(tableTmp)}
              placeholder="0"
              className="w-full text-center text-5xl font-black px-4 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:outline-none focus:border-blue-500 text-slate-900 placeholder:text-slate-200 mb-4"
            />
            <button onClick={() => confirmTable(tableTmp)} disabled={!tableTmp.trim()}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white font-bold rounded-2xl transition-colors">
              Konfirmasi Meja
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ MODIFIER MODAL (all screens) ═══════════════════════════ */}
      {modModal && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:items-center lg:justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModModal(null)} />
          <div className="relative bg-white rounded-t-3xl lg:rounded-3xl max-h-[88vh] flex flex-col w-full lg:max-w-md shadow-2xl">
            <div className="flex justify-center py-3 shrink-0 lg:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
            <div className="relative shrink-0">
              {modModal.imageUrl
                ? <img src={modModal.imageUrl} alt={modModal.name} className="w-full h-40 object-cover" /> // eslint-disable-line @next/next/no-img-element
                : <div className={`w-full h-24 ${catBg(modModal.category)} flex items-center justify-center`}><span className="text-5xl opacity-70">{catEmoji(modModal.category)}</span></div>
              }
              <button onClick={() => setModModal(null)} className="absolute top-3 right-3 w-8 h-8 bg-black/30 hover:bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <div className="px-5 pt-4 pb-3.5 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-900 text-lg">{modModal.name}</h2>
              <p className="text-base font-black text-blue-600 mt-0.5">{rp(modModal.price)}</p>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {modModal.modifierGroups.map(group => (
                <div key={group.id}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-slate-900">{group.name}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${group.isRequired ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                      {group.isRequired ? "Wajib" : "Opsional"}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.options.map(opt => {
                      const sel = selMods.some(m => m.groupId === group.id && m.optionId === opt.id)
                      return (
                        <button key={opt.id} onClick={() => toggleMod(group, opt)}
                          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all ${sel ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:border-slate-200"}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${sel ? "border-blue-500 bg-blue-500" : "border-slate-300"}`}>
                              {sel && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <span className={`font-medium ${sel ? "text-blue-700" : "text-slate-700"}`}>{opt.name}</span>
                          </div>
                          {opt.price > 0 && <span className={`text-xs font-bold ${sel ? "text-blue-600" : "text-slate-400"}`}>+{rp(opt.price)}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Catatan <span className="font-normal text-slate-400">opsional</span></label>
                <textarea value={modNotes} onChange={e => setModNotes(e.target.value)}
                  placeholder="Contoh: tidak pedas, tanpa bawang..." rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="px-5 py-4 pb-8 lg:pb-5 border-t border-slate-100 shrink-0">
              <button disabled={!canConfirm()} onClick={() => addToCart(modModal, selMods, modNotes)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white font-bold rounded-2xl transition-colors">
                Tambah ke Pesanan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
