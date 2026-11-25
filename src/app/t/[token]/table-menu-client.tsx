"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Plus, Minus, X, CheckCircle, Loader2, AlertCircle, ChevronRight, ShoppingBag, Pencil, MapPin, UserRound, History, Sparkles } from "lucide-react"
import { useViewportHeight } from "@/components/use-viewport-height"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { isGuestSessionId } from "@/lib/guest-bill"
import type { PublicMenuData } from "@/lib/public-menu"
import sheetStyles from "./menu-sheet.module.css"

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
type SessionOrder = {
  id: string
  orderNumber: string
  status: string
  total: number | string
  tableNumber: string | null
  customerName: string | null
  createdAt: string
  isMine: boolean
  items: Array<{ name: string; qty: number; price: number | string }>
}
type PageData = PublicMenuData

const rp = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID")
const ck = (id: string, mods: SelectedMod[]) => id + "::" + mods.map(m => m.optionId).sort().join("|")
const tableLabel = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return "Meja belum dipilih"
  return /^meja\b/i.test(trimmed) ? trimmed : `Meja ${trimmed}`
}
const guestStorageKey = (token: string, tableToken: string) => `pantau-order-session:${token}:${tableToken || "umum"}`
const guestCookieName = (token: string, tableToken: string) => `pantau-order-session-${token}-${tableToken || "umum"}`

const GUEST_SESSION_TTL_MS = 86_400_000 // 24 jam — pengaman untuk sesi terbengkalai

function readGuestSessionCookie(token: string, tableToken: string) {
  const prefix = `${guestCookieName(token, tableToken)}=`
  const entry = document.cookie.split("; ").find(cookie => cookie.startsWith(prefix))
  const saved = entry ? decodeURIComponent(entry.slice(prefix.length)) : ""
  return isGuestSessionId(saved) ? saved : ""
}

// Baca sessionId dari localStorage dengan menghormati batas usia (TTL) — supaya
// sesi lama yang terbengkalai tidak bangkit lagi setelah cookie kedaluwarsa.
function readGuestSessionStorage(token: string, tableToken: string) {
  try {
    const raw = window.localStorage.getItem(guestStorageKey(token, tableToken))
    if (!raw) return ""
    const parsed = JSON.parse(raw) as { id?: string; ts?: number }
    if (!isGuestSessionId(parsed?.id) || !parsed?.ts || Date.now() - parsed.ts > GUEST_SESSION_TTL_MS) {
      window.localStorage.removeItem(guestStorageKey(token, tableToken))
      return ""
    }
    return parsed.id
  } catch {
    return ""
  }
}

function rememberGuestSession(token: string, tableToken: string, sessionId: string) {
  try {
    window.localStorage.setItem(guestStorageKey(token, tableToken), JSON.stringify({ id: sessionId, ts: Date.now() }))
  } catch { /* ignore */ }
  // Cookie persisten: bertahan walau tab/browser ditutup, agar tamu bisa buka
  // lagi & melihat riwayatnya sampai dibayar. Dibersihkan otomatis saat semua
  // pesanan lunas; sebagai pengaman, kedaluwarsa setelah 24 jam.
  document.cookie = `${guestCookieName(token, tableToken)}=${encodeURIComponent(sessionId)}; Path=/t/${token}; Max-Age=86400; SameSite=Lax`
}

// Menutup sesi tamu: hapus identitas dari browser agar pelanggan berikutnya
// di meja yang sama memulai dari riwayat kosong (sesi baru dibuat saat memesan).
function clearGuestSession(token: string, tableToken: string) {
  try {
    window.localStorage.removeItem(guestStorageKey(token, tableToken))
  } catch { /* ignore */ }
  document.cookie = `${guestCookieName(token, tableToken)}=; Path=/t/${token}; SameSite=Lax; Max-Age=0`
}

const CAT_EMOJI: Record<string, string> = { Burger: "🍔", Makanan: "🍔", Minuman: "🥤", Snack: "🍟", Kentang: "🍟", Paket: "📦" }
const CAT_BG:    Record<string, string> = { Burger: "bg-orange-50", Makanan: "bg-orange-50", Minuman: "bg-blue-50", Snack: "bg-yellow-50", Kentang: "bg-yellow-50", Paket: "bg-purple-50" }
const catEmoji = (c: string) => CAT_EMOJI[c] ?? "🍽️"
const catBg    = (c: string) => CAT_BG[c]    ?? "bg-slate-50"

export default function TableMenuContent({ token, mejaToken, initialData, initialError }: {
  token: string
  mejaToken: string
  initialData: PageData | null
  initialError: string | null
}) {
  useViewportHeight({ resetWindowScroll: false })

  const [loading,   setLoading]   = useState(false)
  const [pageError, setPageError] = useState<string | null>(initialError)
  const [data,      setData]      = useState<PageData | null>(initialData)
  const menuRequestRef = useRef<AbortController | null>(null)
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null)
  const businessLogoUrl = data?.organization.logoUrl && data.organization.logoUrl !== failedLogoUrl ? data.organization.logoUrl : null

  const lockedTable = data?.table?.name ?? ""

  const [tableNumber,    setTableNumber]    = useState(initialData?.table?.name ?? "")
  const [tableError,     setTableError]     = useState(false)
  const [showTableModal, setShowTableModal] = useState(false)
  const [tableTmp,       setTableTmp]       = useState("")

  const [customerName,  setCustomerName]  = useState("")
  const [lockedCustomerName, setLockedCustomerName] = useState("")
  const [sessionRestoring, setSessionRestoring] = useState(true)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [showNewSession, setShowNewSession] = useState(false)
  const [nameError,     setNameError]     = useState(false)
  const [successOrder,  setSuccessOrder]  = useState<{ id: string; orderNumber: string; total: number } | null>(null)
  const [trackedStatus, setTrackedStatus] = useState("OPEN")
  const [sessionOrders, setSessionOrders] = useState<SessionOrder[]>([])
  const [showSessionOrders, setShowSessionOrders] = useState(false)
  const guestSessionIdRef = useRef("")

  const [cart,      setCart]      = useState<CartItem[]>([])
  const [showCart,  setShowCart]  = useState(false)
  const [modModal,  setModModal]  = useState<MenuItem | null>(null)
  const [selMods,   setSelMods]   = useState<SelectedMod[]>([])
  const [modNotes,  setModNotes]  = useState("")
  const [activeCat, setActiveCat] = useState<string | null>(initialData?.menuItems[0]?.category ?? null)
  const catRefs = useRef<Record<string, HTMLElement | null>>({})

  const [ordering, setOrdering] = useState(false)
  const [orderErr, setOrderErr] = useState<string | null>(null)

  const overlayOpen = showCart || showSessionOrders || showTableModal || showNewSession || modModal !== null
  useEffect(() => {
    if (!overlayOpen) return

    // iOS Safari tetap bisa menggulir halaman di belakang modal jika hanya
    // overflow: hidden yang dipakai. Bekukan posisi halaman, lalu pulihkan.
    const scrollY = window.scrollY
    const body = document.body
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    body.style.position = "fixed"
    body.style.top = `-${scrollY}px`
    body.style.left = "0"
    body.style.right = "0"
    body.style.width = "100%"
    body.style.overflow = "hidden"

    return () => {
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.right = previous.right
      body.style.width = previous.width
      body.style.overflow = previous.overflow
      window.scrollTo(0, scrollY)
    }
  }, [overlayOpen])

  const refreshMenu = useCallback(async (showLoading = false) => {
    menuRequestRef.current?.abort()
    const controller = new AbortController()
    menuRequestRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    if (showLoading) { setLoading(true); setPageError(null) }
    try {
      const query = mejaToken ? `?meja=${encodeURIComponent(mejaToken)}` : ""
      const response = await fetch(`/api/public/${token}${query}`, { cache: "no-store", signal: controller.signal })
      const result = await response.json()
      if (!response.ok || result.error) throw new Error(result.error || "Gagal memuat menu")
      if (menuRequestRef.current !== controller) return
      setData(result)
      setPageError(null)
      setActiveCat(previous => previous ?? result.menuItems[0]?.category ?? null)
      if (result.table) setTableNumber(result.table.name)
    } catch (error) {
      if (menuRequestRef.current !== controller) return
      if (showLoading) setPageError(controller.signal.aborted ? "Koneksi terlalu lama. Coba lagi saat jaringan stabil." : error instanceof Error ? error.message : "Gagal memuat menu")
    } finally {
      window.clearTimeout(timeout)
      if (menuRequestRef.current === controller) setLoading(false)
    }
  }, [token, mejaToken])

  useEffect(() => () => { menuRequestRef.current?.abort(); menuRequestRef.current = null }, [])

  // Logo, menu, dan status kasir mengikuti perubahan tanpa menghapus keranjang.
  useLiveRefresh(() => { void refreshMenu() })

  const cats  = data ? [...new Set(data.menuItems.map(m => m.category))] : []
  const total = cart.reduce((s, c) => s + (c.price + c.modifiers.reduce((ms, m) => ms + m.price, 0)) * c.qty, 0)
  const qty   = cart.reduce((s, c) => s + c.qty, 0)

  function confirmTable(val: string) {
    if (!val.trim()) return
    setTableNumber(val.trim()); setShowTableModal(false); setTableError(false)
  }
  function chooseTable() {
    if (lockedTable || lockedCustomerName) return
    setTableTmp(tableNumber)
    setShowTableModal(true)
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

  function getGuestSessionId() {
    if (guestSessionIdRef.current) return guestSessionIdRef.current
    try {
      const saved = readGuestSessionCookie(token, mejaToken) || readGuestSessionStorage(token, mejaToken)
      if (saved) {
        rememberGuestSession(token, mejaToken, saved)
        guestSessionIdRef.current = saved
        return saved
      }
      const created = window.crypto.randomUUID()
      rememberGuestSession(token, mejaToken, created)
      guestSessionIdRef.current = created
      return created
    } catch {
      const created = window.crypto.randomUUID()
      guestSessionIdRef.current = created
      return created
    }
  }

  function startNewSession() {
    const id = window.crypto.randomUUID()
    guestSessionIdRef.current = id
    rememberGuestSession(token, mejaToken, id)
    setCustomerName("")
    setLockedCustomerName("")
    setSessionOrders([])
    setSuccessOrder(null)
    setCart([])
    setOrderErr(null)
    setNameError(false)
    setTrackedStatus("OPEN")
    setShowSessionOrders(false)
    setShowCart(false)
    setShowNewSession(false)
    setSessionRestoring(true)
    setSessionVersion(version => version + 1)
  }

  async function submitOrder() {
    if (ordering || sessionRestoring || !cart.length || !tableNumber.trim() || !customerName.trim()) return
    setOrdering(true); setOrderErr(null)

    const body = {
      tableNumber: tableNumber.trim(),
      tableToken: data?.table ? mejaToken : undefined,
      customerName: lockedCustomerName || customerName.trim(),
      guestSessionId: getGuestSessionId(),
      items: cart.map(c => ({
        menuItemId: c.menuItemId, name: c.name, price: c.price, qty: c.qty,
        notes: c.notes || null,
        modifiers: c.modifiers.map(m => ({ optionId: m.optionId })),
      })),
    }

    try {
      const res = await fetch(`/api/public/${token}/order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const d = await res.json()
      if (guestSessionIdRef.current !== body.guestSessionId) return
      if (!res.ok) throw new Error(d.error ?? "Gagal memproses pesanan")

      setCustomerName(d.customerName)
      setLockedCustomerName(d.customerName)
      setTableNumber(d.tableNumber)
      setTrackedStatus("OPEN")
      setSuccessOrder({ id: String(d.orderId), orderNumber: d.orderNumber, total: Number(d.total ?? total) })
      setCart([]); setShowCart(false); setOrdering(false)
    } catch (submitError) {
      if (guestSessionIdRef.current !== body.guestSessionId) return
      setOrderErr(submitError instanceof Error ? submitError.message : "Gagal memproses pesanan, coba lagi")
      setOrdering(false)
    }
  }
  function openCart() {
    setOrderErr(null); setShowCart(true)
  }

  useEffect(() => {
    if (!guestSessionIdRef.current) {
      try {
        guestSessionIdRef.current = readGuestSessionCookie(token, mejaToken) || readGuestSessionStorage(token, mejaToken) || ""
        if (guestSessionIdRef.current) rememberGuestSession(token, mejaToken, guestSessionIdRef.current)
      } catch {
        guestSessionIdRef.current = ""
      }
    }
    if (!guestSessionIdRef.current) { setSessionRestoring(false); return }
    let cancelled = false

    const isSettled = (status: string) => status === "PAID" || status === "VOID"

    const refreshStatus = async () => {
      const sessionId = guestSessionIdRef.current
      if (!sessionId) return
      try {
        const res = await fetch(`/api/public/${token}/session?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        })
        if (!res.ok || cancelled) return
        const result = await res.json() as { orders?: SessionOrder[] }
        if (cancelled || guestSessionIdRef.current !== sessionId) return
        const orders = result.orders ?? []
        // Pesanan milik tamu ini saja — dasar untuk logika reset & status.
        const myOrders = orders.filter((order) => order.isMine)

        // Pembayaran pelanggan lain di meja ini tidak mengakhiri sesi ini.
        const allSettled = myOrders.length > 0 && myOrders.every((order) => isSettled(order.status))
        const stillTrackingActive = successOrder
          ? myOrders.some((order) => order.id === successOrder.id && !isSettled(order.status))
          : false
        if (allSettled && !stillTrackingActive) {
          clearGuestSession(token, mejaToken)
          guestSessionIdRef.current = ""
          setSessionOrders([])
          setShowSessionOrders(false)
          // Reset identitas pemesan agar pelanggan berikutnya mulai dari kosong.
          setCustomerName("")
          setLockedCustomerName("")
          setSessionRestoring(false)
          setSuccessOrder(null)
          setTrackedStatus("OPEN")
          return
        }

        setSessionOrders(orders)
        // Identitas mengikuti pesanan pertama yang tersimpan, termasuk setelah reload.
        const myName = myOrders.find((order) => order.customerName)?.customerName
        if (myName) { setCustomerName(myName); setLockedCustomerName(myName) }
        const myTable = myOrders.find(order => order.tableNumber)?.tableNumber
        if (myTable) setTableNumber(myTable)
        const currentOrder = successOrder ? myOrders.find((order) => order.id === successOrder.id) : null
        if (currentOrder) setTrackedStatus(currentOrder.status)
      } catch {
        // Status akan dicoba lagi pada interval berikutnya.
      } finally {
        if (!cancelled && guestSessionIdRef.current === sessionId) setSessionRestoring(false)
      }
    }

    void refreshStatus()
    const intervalId = window.setInterval(() => void refreshStatus(), 3_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [successOrder, token, mejaToken, sessionVersion])

  // Perubahan sesi di tab lain tidak boleh mengirim pesanan memakai identitas lama.
  useEffect(() => {
    function syncSession(event: StorageEvent) {
      if (event.key !== guestStorageKey(token, mejaToken) && event.key !== null) return
      const saved = readGuestSessionStorage(token, mejaToken)
      if (saved === guestSessionIdRef.current) return
      guestSessionIdRef.current = saved
      setCustomerName("")
      setLockedCustomerName("")
      setSessionOrders([])
      setSuccessOrder(null)
      setCart([])
      setOrdering(false)
      setShowSessionOrders(false)
      setShowNewSession(false)
      setSessionRestoring(true)
      setSessionVersion(version => version + 1)
    }
    window.addEventListener("storage", syncSession)
    return () => window.removeEventListener("storage", syncSession)
  }, [token, mejaToken])

  useEffect(() => {
    if (!successOrder) return
    const timerId = window.setTimeout(() => setSuccessOrder(null), 7_000)
    return () => window.clearTimeout(timerId)
  }, [successOrder])

  const myOrders = sessionOrders.filter(order => order.isMine)
  const myGrandTotal = myOrders.reduce((sum, order) => sum + Number(order.total), 0)
  const sessionOrdersModal = showSessionOrders && (
    <div className="app-overlay fixed inset-0 z-60 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowSessionOrders(false)} />
      <div className="relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Pesanan saya</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">{lockedCustomerName || customerName} · {tableLabel(tableNumber)}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Pesanan tambahan tetap masuk ke tagihan pelanggan yang sama.
            </p>
          </div>
          <button onClick={() => setShowSessionOrders(false)} className="rounded-xl bg-slate-100 p-2.5 text-slate-500 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-slate-50/70 p-4 sm:p-5">
          {[...sessionOrders].reverse().map((order) => {
            const status = order.status === "PAID"
              ? { text: "Sudah dibayar", color: "bg-emerald-50 text-emerald-700" }
              : order.status === "HELD"
                ? { text: "Sedang diproses", color: "bg-blue-50 text-blue-700" }
                : order.status === "VOID"
                  ? { text: "Dibatalkan", color: "bg-red-50 text-red-700" }
                  : { text: "Menunggu kasir", color: "bg-amber-50 text-amber-700" }
            return (
              <div key={order.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${order.isMine ? "border-blue-300 ring-2 ring-blue-500/10" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900">{order.customerName ?? "Pelanggan"}</p>
                    {order.isMine && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Kamu</span>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.color}`}>{status.text}</span>
                </div>
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 px-3 py-3">
                  {order.items.map((item, itemIndex) => (
                    <div key={`${order.id}-${itemIndex}`} className="flex justify-between gap-3 text-xs text-slate-600">
                      <span>{item.qty}× {item.name}</span>
                      <span className="shrink-0 text-slate-400">{rp(Number(item.price) * item.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-[10px] text-slate-300">{order.orderNumber}</p>
                  <p className="text-sm font-black text-slate-900">{rp(Number(order.total))}</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="border-t border-slate-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
          <div className="mt-2 flex items-end justify-between rounded-2xl bg-slate-950 px-4 py-3 text-white">
            <div><span className="text-sm font-semibold">Total pesanan saya</span><p className="mt-0.5 text-[10px] text-slate-400">Bayar langsung di kasir</p></div>
            <span className="text-xl font-black">{rp(myGrandTotal)}</span>
          </div>
          <button onClick={() => setShowNewSession(true)} disabled={ordering} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Mulai pesanan baru</button>
        </div>
      </div>
    </div>
  )

  // ─── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return (
    <div role="status" aria-label="Memuat menu" className="app-loading-enter flex min-h-screen items-center justify-center bg-[#f7f8fc]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-blue-100" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-r-blue-300 border-t-blue-600 motion-safe:animate-spin" />
          <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white shadow-xl shadow-blue-600/20 motion-safe:animate-pulse">
            <img src="/brand/pantau-logo.png" alt="Logo Pantau" className="h-full w-full object-cover" />{/* eslint-disable-line @next/next/no-img-element */}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          Memuat menu
        </div>
      </div>
    </div>
  )
  if (pageError) return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fc] px-6">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <AlertCircle className="h-7 w-7 text-red-400" />
        </div>
        <p className="text-lg font-black text-slate-900">Menu belum bisa dibuka</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{pageError}</p>
        <button onClick={() => void refreshMenu(true)} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">Coba lagi</button>
      </div>
    </div>
  )

  const isOpen = data?.isOpen ?? false
  const latestStatusText = trackedStatus === "PAID"
    ? "Pembayaran diterima"
    : trackedStatus === "HELD"
      ? "Pesanan sedang diproses"
      : trackedStatus === "VOID"
        ? "Pesanan dibatalkan"
        : "Menunggu diproses kasir"
  const paymentSelector = (
    <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
      <label className="mb-1 block text-xs font-semibold text-slate-500">Pembayaran</label>
      <p className="text-sm font-semibold text-blue-700">Bayar di kasir</p>
      <p className="mt-0.5 text-xs leading-relaxed text-blue-600/75">Pilih Tunai atau QRIS ketika kasir membuka pesanan Anda.</p>
    </div>
  )
  const customerNameField = (id: string) => (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-500">Nama kamu <span className="text-red-500">*</span></label>
      <div className="relative">
        <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input id={id} type="text" value={customerName} readOnly={!!lockedCustomerName || sessionRestoring} maxLength={100}
          onChange={event => { setCustomerName(event.target.value); setNameError(false) }}
          placeholder={sessionRestoring ? "Memuat pesananmu…" : "Contoh: Budi"}
          className={`w-full rounded-xl border bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 ${nameError ? "border-red-400" : "border-slate-200"}`} />
      </div>
      {nameError && <p className="mt-1 text-xs text-red-500">Nama wajib diisi</p>}
      {!!lockedCustomerName && <div className="mt-2 space-y-2">
        <p className="text-xs leading-relaxed text-slate-500">Nama terkunci. Pesanan tambahan tetap untuk <strong>{lockedCustomerName}</strong>.</p>
        <button onClick={() => setShowNewSession(true)} disabled={ordering} className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-40">Mulai pesanan baru</button>
      </div>}
    </div>
  )

  // ─── Main Render ───────────────────────────────────────────────────────────
  return (
    <div data-keyboard-aware className="min-h-screen bg-[#f7f8fc] text-slate-900">

      {/* Notifikasi ringan: pelanggan tetap berada di halaman menu. */}
      {successOrder && (
        <div className={`fixed inset-x-3 z-70 lg:left-auto lg:right-5 lg:w-96 ${!isOpen ? "top-14" : "top-3 lg:top-5"}`}>
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl shadow-slate-900/15">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Pesanan terkirim ke kasir</p>
              <p className="mt-0.5 text-xs text-slate-500">{tableLabel(tableNumber)} · {rp(successOrder.total)}</p>
              <p className="mt-1 text-xs font-semibold text-amber-600">{latestStatusText}</p>
              <button onClick={() => setShowSessionOrders(true)} className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700">
                Lihat Pesanan Saya
              </button>
            </div>
            <button onClick={() => setSuccessOrder(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ CLOSED BANNER ═════════════════════════════════════════ */}
      {!isOpen && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-amber-500/20">
          <span>⏰</span>
          <span>Kasir belum buka — kamu tetap bisa lihat menu, tapi pesanan belum bisa dikirim</span>
        </div>
      )}

      {/* ═══════════ STOREFRONT HEADER ═════════════════════════════════════ */}
      <header className={`sticky z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl ${!isOpen ? "top-10" : "top-0"}`}>
        <div className="mx-auto flex max-w-[1480px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
          {businessLogoUrl
            ? <img src={businessLogoUrl} alt={`Logo ${data?.organization.name}`} onError={() => setFailedLogoUrl(businessLogoUrl)} className="h-11 w-11 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1 shadow-sm lg:h-12 lg:w-12" /> // eslint-disable-line @next/next/no-img-element
            : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-black text-white shadow-md shadow-blue-200 lg:h-12 lg:w-12">{data?.organization.name.trim().charAt(0).toUpperCase()}</div>
          }
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black tracking-tight text-slate-950 lg:text-base">{data?.organization.name}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-400 lg:text-xs"><MapPin className="h-3 w-3 text-blue-600" />{data?.location.name}</p>
          </div>
          {sessionOrders.length > 0 && (
            <button onClick={() => setShowSessionOrders(true)} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-blue-300 hover:text-blue-600 sm:w-auto sm:gap-2 sm:px-4">
              <History className="h-4 w-4" /><span className="hidden text-xs font-bold sm:inline">Pesanan saya</span>
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black text-white sm:static sm:h-auto sm:min-w-0 sm:bg-transparent sm:p-0 sm:text-xs sm:text-blue-600">{sessionOrders.length}</span>
            </button>
          )}
        </div>
      </header>

      <div className={`mx-auto grid max-w-[1480px] gap-8 px-4 pb-28 pt-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:pb-12 lg:pt-8 xl:gap-10 ${!isOpen ? "" : ""}`}>
        <main className="min-w-0">
          {/* Editorial hero inspired by a modern food-delivery app */}
          <section className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-blue-50 via-indigo-50 to-blue-100 px-5 py-6 sm:min-h-72 sm:px-9 sm:py-9 lg:min-h-80 lg:px-12 lg:py-11">
            <div className="absolute -right-10 -top-12 h-52 w-52 rounded-full bg-blue-300/45 blur-2xl sm:h-80 sm:w-80" />
            <div className={`relative z-10 grid items-center gap-3 ${businessLogoUrl ? "grid-cols-[minmax(0,1fr)_38%] sm:grid-cols-[minmax(0,1fr)_40%] sm:gap-6" : "grid-cols-1"}`}>
              <div className="min-w-0">
                <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-blue-700 shadow-sm sm:text-[10px]"><Sparkles className="h-3 w-3" /> Pesan dari meja</div>
                <h1 className="text-[clamp(1.5rem,7vw,1.75rem)] font-black leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">Makan enak,<br/><span className="text-blue-600">tanpa antre.</span></h1>
                <p className="mt-4 text-xs leading-relaxed text-slate-500 sm:text-sm">Pilih sesukamu, kirim ke kasir, lalu bayar setelah selesai makan.</p>
              </div>
              {businessLogoUrl && (
                <div className="pointer-events-none relative aspect-square min-w-0 overflow-hidden rounded-full border-[6px] border-white/90 bg-white shadow-xl sm:border-[10px]">
                  <img src={businessLogoUrl} alt={`Logo ${data?.organization.name}`} onError={() => setFailedLogoUrl(businessLogoUrl)} className="h-full w-full object-contain object-center p-4 sm:p-6" />{/* eslint-disable-line @next/next/no-img-element */}
                </div>
              )}
            </div>
          </section>

          {cats.length > 1 && (
            <nav className="mt-6 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }} aria-label="Kategori menu">
              {cats.map(cat => {
                const count = data?.menuItems.filter(m => m.category === cat).length ?? 0
                const active = activeCat === cat
                return (
                  <button key={cat} onClick={() => { setActiveCat(cat); catRefs.current[cat]?.scrollIntoView({ behavior: "smooth", block: "start" }) }} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold transition-all ${active ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}>
                    <span>{cat}</span><span className={active ? "text-white/70" : "text-slate-300"}>{count}</span>
                  </button>
                )
              })}
            </nav>
          )}

          <div className={`${cats.length > 1 ? "mt-7" : "mt-8 lg:mt-10"} space-y-10`}>
            {cats.map(cat => {
              const items = data?.menuItems.filter(m => m.category === cat) ?? []
              return (
                <section key={cat} ref={el => { catRefs.current[cat] = el }} className="scroll-mt-36">
                  <div className="mb-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Pilihan menu</p>
                      <div className="mt-1.5 flex items-center gap-2.5">
                        <h2 className="text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-3xl">{cat}</h2>
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold tabular-nums text-slate-500">{items.length} menu</span>
                  </div>
                  <div className="grid grid-cols-1 gap-5 min-[520px]:grid-cols-2 xl:grid-cols-3">
                    {items.map(item => {
                      const inCart  = cart.find(c => c.menuItemId === item.id)
                      const cartQty = inCart?.qty ?? 0
                      const noMod   = !item.modifierGroups.length
                      const unavail = !item.isAvailable
                      const unavailableLabel = item.unavailableReason === "habis" ? "Habis"
                        : item.unavailableReason === "qr_nonaktif" ? "Tidak tersedia di QR"
                        : "Menu nonaktif"
                      return (
                        <article key={item.id} onClick={() => !unavail && openModModal(item)} className={`group flex select-none items-center gap-3 overflow-hidden rounded-2xl border bg-white p-2.5 text-left transition-all duration-300 min-[520px]:block min-[520px]:rounded-[1.75rem] min-[520px]:p-0 ${unavail ? "cursor-not-allowed border-slate-200 opacity-60" : "cursor-pointer border-slate-200 shadow-sm min-[520px]:shadow-[0_12px_35px_rgba(15,23,42,0.07)] min-[520px]:hover:-translate-y-1 min-[520px]:hover:shadow-[0_18px_45px_rgba(15,23,42,0.13)] active:scale-[0.99]"} ${inCart ? "border-blue-500 ring-2 ring-blue-500/15" : ""}`}>
                          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#f2eee8] min-[520px]:aspect-[4/3] min-[520px]:h-auto min-[520px]:w-full min-[520px]:rounded-none">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} // eslint-disable-line @next/next/no-img-element
                                className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${unavail ? "grayscale" : ""}`} />
                            ) : (
                              <div className={`w-full h-full ${catBg(item.category)} flex items-center justify-center`}>
                                <span className={`text-4xl select-none ${unavail ? "opacity-30" : "opacity-80"}`}>{catEmoji(item.category)}</span>
                              </div>
                            )}
                            {unavail && (
                              <div className="absolute inset-0 bg-black/30 flex items-end justify-center pb-1.5">
                                <span className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                                  {unavailableLabel}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 min-[520px]:p-5">
                            <p className="line-clamp-2 text-sm font-black leading-snug text-slate-950 min-[520px]:text-lg">{item.name}</p>
                            {cartQty > 0 && !unavail && (
                              <p className="mt-1 text-[11px] font-semibold text-blue-600">{cartQty} di keranjang</p>
                            )}
                            {item.description && (
                              <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-slate-400 min-[520px]:mt-1.5 min-[520px]:line-clamp-2">{item.description}</p>
                            )}
                            <div className="mt-1.5 flex items-center justify-between gap-2 min-[520px]:mt-4">
                              <p className="text-sm font-black text-blue-600 min-[520px]:text-lg">{rp(item.price)}</p>
                              <div className="shrink-0">
                            {unavail ? (
                              <span className="text-[11px] font-semibold text-slate-400">{unavailableLabel}</span>
                            ) : inCart && noMod ? (
                              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                <button onClick={() => changeQty(inCart.cartKey, -1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 transition-colors hover:bg-slate-200">
                                  <Minus className="w-3.5 h-3.5 text-slate-700" />
                                </button>
                                <span className="w-5 text-center text-sm font-black text-slate-900">{cartQty}</span>
                                <button onClick={() => changeQty(inCart.cartKey, 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 shadow-md shadow-blue-200 transition-all hover:bg-blue-700">
                                  <Plus className="w-3.5 h-3.5 text-white" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); openModModal(item) }} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg shadow-slate-950/20 transition-all hover:bg-blue-600 group-hover:scale-105" aria-label={`Tambah ${item.name}`}>
                                <Plus className="h-4 w-4" />
                              </button>
                            )}
                              </div>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </main>

        {/* Desktop order card */}
        <aside className="sticky top-28 hidden h-[calc(100vh-8rem)] min-h-[560px] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.08)] lg:flex">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Pesananmu</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Keranjang</h2></div>{qty > 0 && <span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-black text-white">{qty} item</span>}</div>
            <button type="button" onClick={chooseTable} disabled={Boolean(lockedTable || lockedCustomerName)} className={`mt-4 flex w-full items-center gap-2 rounded-2xl border px-3.5 py-3 text-left text-xs font-bold transition-colors ${tableError ? "border-red-200 bg-red-50 text-red-600" : "border-transparent bg-slate-50 text-slate-600 hover:border-blue-200 hover:bg-blue-50"}`}>
              <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="flex-1">{tableLabel(lockedTable || tableNumber)}</span>
              {!lockedTable && !lockedCustomerName && <Pencil className="h-3.5 w-3.5 text-slate-400" />}
            </button>
          </div>
          {cart.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="flex h-20 w-20 rotate-3 items-center justify-center rounded-[1.75rem] bg-blue-50 text-blue-600"><ShoppingBag className="h-8 w-8" /></div><p className="mt-5 text-base font-black text-slate-950">Keranjang masih kosong</p><p className="mt-2 max-w-52 text-xs leading-relaxed text-slate-400">Tekan tombol + pada menu yang kamu mau.</p></div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
                {cart.map(c => { const up = c.price + c.modifiers.reduce((s, m) => s + m.price, 0); return (
                  <div key={c.cartKey} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-950">{c.name}</p>{c.modifiers.map(m => <p key={m.optionId} className="mt-0.5 text-[11px] text-blue-600">{m.optionName}{m.price > 0 ? ` +${rp(m.price)}` : ""}</p>)}</div><p className="shrink-0 text-sm font-black">{rp(up * c.qty)}</p></div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3"><p className="text-[10px] text-slate-400">{rp(up)} / item</p><div className="flex items-center gap-2"><button onClick={() => changeQty(c.cartKey, -1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"><Minus className="h-3.5 w-3.5" /></button><span className="w-4 text-center text-sm font-black">{c.qty}</span><button onClick={() => changeQty(c.cartKey, 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white"><Plus className="h-3.5 w-3.5" /></button></div></div>
                  </div>
                )})}
              </div>
              <div className="space-y-3 border-t border-slate-200 bg-white px-5 pb-5 pt-4">
                {customerNameField("customer-name")}
                {paymentSelector}
                <div className="flex items-end justify-between px-1"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</p><p className="text-xs text-slate-400">{qty} item</p></div><p className="text-2xl font-black text-slate-950">{rp(total)}</p></div>
                <button onClick={() => { if (!tableNumber.trim()) { setTableError(true); chooseTable(); return } if (!customerName.trim()) { setNameError(true); return } submitOrder() }} disabled={ordering || !isOpen} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{ordering ? <><Loader2 className="h-4 w-4 animate-spin"/>Memproses...</> : !isOpen ? "Kasir belum buka" : <>Kirim pesanan <ChevronRight className="h-4 w-4"/></>}</button>
                {orderErr && <p className="text-center text-xs text-red-500">{orderErr}</p>}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* ═══════════ MOBILE CART FAB ════════════════════════════════════════ */}
      {qty > 0 && !showCart && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
          <button onClick={openCart}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-white shadow-2xl shadow-slate-950/30 transition-all active:scale-[0.99]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold">Lihat keranjang</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{qty} item dipilih</p>
            </div>
            <div className="flex items-center gap-2">
              <p className="shrink-0 text-sm font-black">{rp(total)}</p>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          </button>
        </div>
      )}

      {/* ═══════════ MOBILE CART BOTTOM SHEET ══════════════════════════════ */}
      {showCart && (
        <div className={`app-overlay fixed inset-0 z-40 flex flex-col justify-end lg:hidden ${sheetStyles.overlay}`}>
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div role="dialog" aria-modal="true" aria-label="Keranjang pesanan" className={`relative flex max-h-[92vh] flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl ${sheetStyles.panel} ${sheetStyles.cartPanel}`}>
            <div className="flex justify-center py-3 shrink-0"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>

            <>
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Keranjangmu</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900">Pesanan · {qty} item</h2>
                  <button onClick={chooseTable} className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${tableError ? "text-red-600" : "text-blue-600"}`}>
                    <MapPin className="h-3.5 w-3.5" />{tableNumber.trim() ? tableLabel(tableNumber) : "Pilih meja"}{!lockedTable && !lockedCustomerName && <Pencil className="h-3 w-3" />}
                  </button>
                </div>
                <button onClick={() => setShowCart(false)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 transition-colors hover:bg-slate-200"><X className="h-4 w-4 text-slate-500" /></button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/70 px-5 py-4">
                {cart.map(c => {
                  const up = c.price + c.modifiers.reduce((s, m) => s + m.price, 0)
                  return (
                    <div key={c.cartKey} className="rounded-2xl border border-slate-200/80 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900">{c.name}</p>
                          {c.modifiers.map(m => <p key={m.optionId} className="mt-0.5 text-xs text-blue-500">{m.optionName}{m.price > 0 ? ` · +${rp(m.price)}` : ""}</p>)}
                          {c.notes && <p className="mt-1 text-xs italic text-slate-400">“{c.notes}”</p>}
                        </div>
                        <p className="shrink-0 text-sm font-black text-slate-900">{rp(up * c.qty)}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                        <p className="text-[11px] text-slate-400">{rp(up)} / item</p>
                        <div className="flex items-center gap-2">
                          <button onClick={() => changeQty(c.cartKey, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white"><Minus className="h-3.5 w-3.5 text-slate-600" /></button>
                          <span className="w-5 text-center text-sm font-black">{c.qty}</span>
                          <button onClick={() => changeQty(c.cartKey, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600"><Plus className="h-3.5 w-3.5 text-white" /></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* Nama pemesan — wajib, mobile */}
                <div>
                  {customerNameField("mobile-customer-name")}
                </div>
                {paymentSelector}
                {orderErr && <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 rounded-xl"><AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /><span className="text-sm text-red-700">{orderErr}</span></div>}
              </div>
              <div className={`shrink-0 space-y-3 border-t border-slate-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 ${sheetStyles.footer}`}>
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-500">Total pembayaran</p><span className="text-xl font-black text-slate-950">{rp(total)}</span></div>
                <button
                  onClick={() => { if (!tableNumber.trim()) { setTableError(true); chooseTable(); return } if (!customerName.trim()) { setNameError(true); return } submitOrder() }}
                  disabled={ordering || !isOpen}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {ordering ? <><Loader2 className="w-4 h-4 animate-spin" />Memproses...</> : !isOpen ? "Kasir Belum Buka" : <>Kirim Pesanan <ChevronRight className="h-4 w-4" /></>}
                </button>
              </div>
            </>
          </div>
        </div>
      )}


      {/* ═══════════ TABLE NUMBER MODAL ═════════════════════════════════════ */}
      {showTableModal && (
        <div className="app-overlay z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowTableModal(false)} />
          <div className="relative w-full overflow-y-auto rounded-t-[2rem] bg-white px-6 pb-10 pt-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-7">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MapPin className="h-5 w-5" /></div>
            <h3 className="mb-1 text-xl font-black tracking-tight text-slate-900">Kamu duduk di meja berapa?</h3>
            <p className="mb-5 text-sm leading-relaxed text-slate-500">Masukkan nomor meja yang tertera agar kasir tahu pesanan ini harus diantar ke mana.</p>
            <input type="text" inputMode="numeric"
              value={tableTmp}
              onChange={e => setTableTmp(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmTable(tableTmp)}
              placeholder="0"
              className="mb-4 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-center text-5xl font-black text-slate-900 placeholder:text-slate-200 focus:border-blue-500 focus:outline-none"
            />
            <button onClick={() => confirmTable(tableTmp)} disabled={!tableTmp.trim()}
              className="w-full rounded-2xl bg-blue-600 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 disabled:opacity-30 disabled:shadow-none">
              Konfirmasi Meja
            </button>
          </div>
        </div>
      )}

      {sessionOrdersModal}

      {showNewSession && (
        <div className="app-overlay fixed inset-0 z-80 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowNewSession(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="new-session-title" className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="new-session-title" className="text-lg font-bold text-slate-900">Mulai pesanan baru?</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">Tagihan <strong className="text-slate-700">{lockedCustomerName}</strong> tetap tersimpan di kasir dan harus dibayar. Pelanggan berikutnya memakai nama dan tagihan sendiri.</p>
            {cart.length > 0 && <p className="mt-2 text-sm text-slate-500">Isi keranjang yang belum dikirim akan dikosongkan.</p>}
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowNewSession(false)} className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600">Batal</button>
              <button onClick={startNewSession} disabled={ordering} className="flex-1 rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-700">Mulai baru</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODIFIER MODAL (all screens) ═══════════════════════════ */}
      {modModal && (
        <div className={`app-overlay fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4 ${sheetStyles.overlay}`}>
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModModal(null)} />
          <div role="dialog" aria-modal="true" aria-label={`Atur pesanan ${modModal.name}`} className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl ${sheetStyles.panel}`}>
            <div className="flex justify-center py-3 shrink-0 lg:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
            <div className="relative shrink-0">
              {modModal.imageUrl
                ? <img src={modModal.imageUrl} alt={modModal.name} className="h-48 w-full object-cover sm:h-56" /> // eslint-disable-line @next/next/no-img-element
                : <div className={`flex h-32 w-full items-center justify-center ${catBg(modModal.category)}`}><span className="text-5xl opacity-70">{catEmoji(modModal.category)}</span></div>
              }
              <button aria-label="Tutup pilihan menu" onClick={() => setModModal(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm hover:bg-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Atur pesanan</p>
              <div className="mt-1 flex items-end justify-between gap-3"><h2 className="text-xl font-black tracking-tight text-slate-900">{modModal.name}</h2><p className="shrink-0 text-lg font-black text-blue-600">{rp(modModal.price)}</p></div>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-slate-50/50 px-5 py-5 sm:px-6">
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
                          className={`flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-3.5 text-left transition-all ${sel ? "border-blue-500 ring-2 ring-blue-500/10" : "border-slate-200 hover:border-blue-200"}`}>
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
            <div className={`shrink-0 border-t border-slate-200 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 ${sheetStyles.footer}`}>
              <button disabled={!canConfirm()} onClick={() => addToCart(modModal, selMods, modNotes)}
                className="flex w-full items-center justify-between rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 disabled:opacity-30 disabled:shadow-none">
                <span>Tambah ke pesanan</span><span>{rp(modModal.price + selMods.reduce((sum, mod) => sum + mod.price, 0))}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
