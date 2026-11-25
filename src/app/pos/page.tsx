"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { STOCK_ADJUSTMENT_NOTE_MAX_LENGTH } from "@/lib/stock-adjustment-validation"
import { guestBillKey } from "@/lib/guest-bill"
import {
  ChevronDown,
  MoreHorizontal,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  Printer,
  Clock,
  MapPin,
  Tag,
  StickyNote,
  ClipboardList,
  LogOut,
  Pause,
  Play,
  Bell,
  UtensilsCrossed,
  Bluetooth,
  ClipboardMinus,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { signOut } from "next-auth/react"
import QRCode from "qrcode"
import { makeQrisDynamic } from "@/lib/qris"
import { isDiscountRuleValidNow } from "@/lib/discount-schedule"
import { useReceiptPrinter } from "@/hooks/use-receipt-printer"
import { StableDraftInput } from "@/components/ui/stable-draft-input"
import { getEffectivePermissions } from "@/lib/permissions"
import { useOrgPermissions } from "@/lib/use-can-edit"
import {
  formatReceiptLine,
  isBluetoothPrintingSupported,
  thermalPrinterName,
  type ReceiptLine,
} from "@/lib/thermal-printer"

type StockIssue = { name: string; unit: string | null; sisa: number; butuh: number }

type ModifierOption = { id: string; name: string; price: number }
type ModifierGroup = {
  id: string
  name: string
  isRequired: boolean
  maxSelect: number
  options: ModifierOption[]
}

type ProductModifierGroup = { group: ModifierGroup }

type Product = {
  id: string
  name: string
  category: string | null
  sellPrice: number | null
  description: string | null
  imageUrl: string | null
  stockQty: number | null
  isAvailableForQr: boolean
  recipeItems: { childItemId: string; quantity: number; currentStock?: number; childItem: { name: string; unit: string | null } }[]
  modifierGroups: ProductModifierGroup[]
}

type SelectedModifier = {
  groupId: string
  groupName: string
  optionId: string
  optionName: string
  price: number
}

type DiscountRule = {
  id: string
  name: string
  type: "PERCENT" | "AMOUNT"
  value: number
  minPurchase: number
  isActive: boolean
  validDays: string | null
  scheduleMode: "PERIOD" | "RECURRING"
  startsAt: string | null
  expiresAt: string | null
  startMinute: number | null
  endMinute: number | null
  items: { menuItem: { id: string; name: string } }[] // kosong = potong total belanja
}

type CartItem = {
  cartKey: string
  productId: string
  name: string
  price: number
  qty: number
  itemDiscountType: "PERCENT" | "AMOUNT"
  itemDiscountValue: number
  notes: string
  modifiers: SelectedModifier[]
}

type Location = {
  id: string
  name: string
  type: string
}

type WasteItem = {
  id: string
  name: string
  unit: string
  sku: string | null
  isTrackable: boolean
  isMenuItem: boolean
}

const WASTE_TYPES = [
  { value: "DAMAGE", label: "Rusak" },
  { value: "WASTE", label: "Terbuang" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "LOSS", label: "Hilang" },
  { value: "COMPLIMENTARY", label: "Complimentary" },
]

type Shift = {
  id: string
  locationId: string
  shiftNumber: string
  openingBalance: number
  totalSales: number
  totalOrders: number
  openedAt: string
  cashier: { name: string | null }
  location: { name: string }
}

type Order = {
  id: string
  orderNumber: string
  orderType: string
  tableNumber: string | null
  customerName: string | null
  status: string
  subtotal: number
  discountAmount: number
  discountLabel: string | null
  taxAmount: number
  total: number
  paidAt: string | null
  items: OrderItem[]
  payments: Payment[]
  cashier: { name: string | null } | null
  location: { name: string; address?: string | null }
}

type HeldOrder = {
  id: string
  orderNumber: string
  tableNumber: string | null
  customerName: string | null
  guestSessionId: string | null
  items: { id: string; name: string; price: number; qty: number; discount: number; subtotal: number; notes: string | null; menuItemId: string | null; modifiers: { groupName: string; optionName: string; price: number }[] }[]
  total: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  discountLabel: string | null
  createdAt: string
}

type QrOrder = {
  id: string
  orderNumber: string
  tableNumber: string | null
  customerName: string | null
  guestSessionId: string | null
  total: number
  createdAt: string
  items: { id: string; name: string; price: number; qty: number; notes: string | null; menuItemId: string | null; modifiers: { groupName: string; optionName: string; price: number }[] }[]
}

type OrderItemModifier = { id: string; groupName: string; optionName: string; price: number }

type OrderItem = {
  id: string
  name: string
  price: number
  qty: number
  discount: number
  subtotal: number
  notes: string | null
  modifiers: OrderItemModifier[]
}

type Payment = {
  id: string
  method: string
  amount: number
  change: number
  reference: string | null
}

const CATEGORY_COLORS: Record<string, string> = {
  Makanan: "bg-orange-100 text-orange-700",
  Minuman: "bg-blue-100 text-blue-700",
  Snack: "bg-yellow-100 text-yellow-700",
  Paket: "bg-purple-100 text-purple-700",
  Lainnya: "bg-slate-100 text-slate-600",
}

function formatRp(amount: number) {
  return "Rp " + Math.round(amount).toLocaleString("id-ID")
}

function formatTableLabel(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return "Tanpa Meja"
  return /^meja\b/i.test(trimmed) ? trimmed : `Meja ${trimmed}`
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  TRANSFER: "Transfer",
  GOFOOD: "GoFood",
  GRABFOOD: "GrabFood",
  SHOPEEFOOD: "ShopeeFood",
  OTHER: "Lainnya",
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

function elapsedTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 0) return `${h}j ${m}m`
  return `${m}m`
}

function ProductGridSkeleton() {
  return (
    <div role="status" aria-label="Memuat menu" className="app-loading-enter grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="app-skeleton mb-4 aspect-[4/3] w-full rounded-xl" />
          <div className="app-skeleton mb-2 h-3 w-4/5 rounded-full" />
          <div className="app-skeleton mb-3 h-4 w-1/2 rounded-full" />
          <div className="app-skeleton h-5 w-16 rounded-lg" />
        </div>
      ))}
      <span className="sr-only">Memuat menu…</span>
    </div>
  )
}

export default function POSPage() {
  const { data: session } = useSession()
  const orgPermissions = useOrgPermissions()
  const sessionUser = session?.user as {
    name?: string
    organizationId?: string
    businessName?: string
    role?: string
    locationIds?: string[]
  } | undefined

  const isKasir = sessionUser?.role === "KASIR"
  // Kasir selalu boleh mencatat barang rusak di outletnya — role ini tidak
  // punya fitur backoffice untuk diatur. Role lain mengikuti izin Waste &
  // Penyesuaian supaya tombolnya tidak muncul lalu ditolak server.
  const canRecordWaste = isKasir
    || getEffectivePermissions(sessionUser?.role ?? "", orgPermissions).ADJUSTMENTS === "EDIT"
  const canManualDiscount = sessionUser?.role === "OWNER" || sessionUser?.role === "SUPERVISOR"
  const assignedLocationIds = sessionUser?.locationIds?.join(",") ?? ""
  const sessionReady = sessionUser !== undefined

  // Barang rusak dari sisi kasir: dicatat langsung di POS karena role ini
  // tidak punya akses ke halaman Waste & Penyesuaian di backoffice.
  const [showWaste, setShowWaste] = useState(false)
  const [wasteItems, setWasteItems] = useState<WasteItem[]>([])
  const [wasteLoaded, setWasteLoaded] = useState(false)
  const [wasteItemId, setWasteItemId] = useState("")
  const [wasteType, setWasteType] = useState("DAMAGE")
  const [wasteQty, setWasteQty] = useState("")
  const [wasteNote, setWasteNote] = useState("")
  const [wasteSubmitting, setWasteSubmitting] = useState(false)
  const [wasteError, setWasteError] = useState("")
  const [wasteSaved, setWasteSaved] = useState("")

  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [loadingLocations, setLoadingLocations] = useState(true)

  const [products, setProducts] = useState<Product[]>([])
  const [shift, setShift] = useState<Shift | null>(null)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingShift, setLoadingShift] = useState(false)

  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("Semua")

  const [cart, setCart] = useState<CartItem[]>([])
  // Di HP keranjang tampil sebagai bottom sheet supaya area menu tidak terpotong.
  // Di md+ panel keranjang tetap menempel di samping seperti biasa.
  const [showCartSheet, setShowCartSheet] = useState(false)
  // Menu ringkas di header untuk layar kecil (Riwayat/Shift/Keluar)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  // Input diskon manual disembunyikan sampai kasir menekan "Beri diskon"
  const [showDiscountInput, setShowDiscountInput] = useState(false)
  // Daftar promo ditutup default supaya panel tidak penuh saat promo banyak
  const [showPromoList, setShowPromoList] = useState(false)
  const [promoQuery, setPromoQuery] = useState("")
  const cartRef = useRef<CartItem[]>([])
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY" | "DELIVERY">("DINE_IN")
  const [tableNumber, setTableNumber] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [discount, setDiscount] = useState({ type: "PERCENT" as "PERCENT" | "AMOUNT", value: 0, label: "", ruleId: null as string | null })
  const [taxPercent] = useState(0)
  const [cartNoteId, setCartNoteId] = useState<string | null>(null)
  const [cartDiscountId, setCartDiscountId] = useState<string | null>(null)
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([])

  const [stockModal, setStockModal] = useState<{ productName: string; cartKey: string; issues: StockIssue[]; pendingAdd: () => void } | null>(null)
  const [noRecipeToast, setNoRecipeToast] = useState<string | null>(null)
  const noRecipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "QRIS" | "TRANSFER" | "GOFOOD" | "GRABFOOD" | "SHOPEEFOOD" | "OTHER">("CASH")
  const [cashAmount, setCashAmount] = useState("")
  const [paymentRef, setPaymentRef] = useState("")
  const [platformOrderNumber, setPlatformOrderNumber] = useState("")
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  // Masa tenang: transaksi ditahan beberapa detik setelah opname disimpan.
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const [tableErr, setTableErr] = useState(false)
  const [nameErr, setNameErr] = useState(false)
  const [receiptLogoUrl, setReceiptLogoUrl] = useState<string | null>(null)
  const [receiptWifiName, setReceiptWifiName] = useState<string | null>(null)
  const [receiptWifiPassword, setReceiptWifiPassword] = useState<string | null>(null)
  const [receiptFooterText, setReceiptFooterText] = useState<string | null>(null)
  const [qrisImageUrl, setQrisImageUrl] = useState<string | null>(null)

  const [dynamicQrUrl, setDynamicQrUrl] = useState<string | null>(null)
  const [qrisPayload, setQrisPayload] = useState<string | null>(null)

  const [showReceipt, setShowReceipt] = useState(false)
  const [lastOrder, setLastOrder] = useState<Order | null>(null)

  const receiptPrinter = useReceiptPrinter()
  const { printer, busy: printerBusy, stage: printerStage, error: printerError, notice: printerNotice } = receiptPrinter

  const [showOpenShift, setShowOpenShift] = useState(false)
  const [openingBalance, setOpeningBalance] = useState("")
  const [openingLocationId, setOpeningLocationId] = useState("")
  const [openShiftError, setOpenShiftError] = useState<string | null>(null)
  const [openingShift, setOpeningShift] = useState(false)

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([])
  const [heldOrderId, setHeldOrderId] = useState<string | null>(null)
  const [batchHeldIds, setBatchHeldIds] = useState<string[]>([])
  // Total tersimpan saat me-resume order tertahan (tunggal/gabung). Dipakai
  // sebagai jumlah tagih agar tampilan == yang benar-benar dibebankan server
  // (sudah termasuk diskon level-order & pajak masing-masing order).
  const [heldPayTotal, setHeldPayTotal] = useState<number | null>(null)
  const [showHeldModal, setShowHeldModal] = useState(false)
  const [holdingOrder, setHoldingOrder] = useState(false)
  const heldTabCount = new Set(heldOrders.map(guestBillKey)).size

  const [qrOrders, setQrOrders] = useState<QrOrder[]>([])
  const [showQrPanel, setShowQrPanel] = useState(false)
  const [selectedQrIds, setSelectedQrIds] = useState<string[]>([])
  const [tolakConfirm, setTolakConfirm] = useState<QrOrder[] | null>(null)
  const [tolaking, setTolaking] = useState(false)
  const knownQrOrderIds = useRef<Set<string>>(new Set())
  const [holdToast, setHoldToast] = useState<string | null>(null)

  function playOrderNotif() {
    try {
      const utter = new SpeechSynthesisUtterance("Pesanan masuk")
      utter.lang = "id-ID"
      utter.rate = 1.0
      utter.pitch = 1.0
      utter.volume = 1.0
      window.speechSynthesis.speak(utter)
    } catch { /* browser blocked autoplay */ }
  }

  useEffect(() => {
    const unseenOrders = qrOrders.filter((order) => !knownQrOrderIds.current.has(order.id))
    knownQrOrderIds.current = new Set(qrOrders.map((order) => order.id))
    if (unseenOrders.length === 0) return

    playOrderNotif()
    const newest = unseenOrders[0]
    setHoldToast(
      unseenOrders.length > 1
        ? `${unseenOrders.length} pesanan QR baru masuk`
        : `Pesanan QR baru · ${formatTableLabel(newest.tableNumber)} · ${newest.customerName ?? "Pelanggan"}`
    )
    const timerId = window.setTimeout(() => setHoldToast(null), 4_000)
    return () => window.clearTimeout(timerId)
  }, [qrOrders])

  const [modifierModal, setModifierModal] = useState<Product | null>(null)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, SelectedModifier[]>>({})

  useEffect(() => { cartRef.current = cart }, [cart])

  useEffect(() => {
    fetch("/api/organization").then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d) return
      if (d?.qrisImageUrl) setQrisImageUrl(d.qrisImageUrl)
      if (d?.qrisPayload) setQrisPayload(d.qrisPayload)
      setReceiptLogoUrl(d.receiptLogoUrl ?? null)
      setReceiptWifiName(d.receiptWifiName ?? null)
      setReceiptWifiPassword(d.receiptWifiPassword ?? null)
      setReceiptFooterText(d.receiptFooterText ?? null)
    })
  }, [])

  useEffect(() => {
    async function fetchLocations() {
      setLoadingLocations(true)
      try {
        const [locationRes, shiftRes] = await Promise.all([
          fetch("/api/locations?type=OUTLET"),
          fetch("/api/pos/shifts?mine=true&status=OPEN"),
        ])
        if (locationRes.ok) {
          const all: Location[] = await locationRes.json()
          const ids = assignedLocationIds ? assignedLocationIds.split(",") : []
          const filtered = isKasir && ids.length > 0 ? all.filter((l) => ids.includes(l.id)) : all
          const shiftData = shiftRes.ok ? await shiftRes.json() : { items: [] }
          const activeShifts: Shift[] = Array.isArray(shiftData) ? shiftData : shiftData.items ?? []
          const activeShift = activeShifts.find((candidate) => filtered.some((loc) => loc.id === candidate.locationId)) ?? null
          const activeLocation = activeShift ? filtered.find((loc) => loc.id === activeShift.locationId) ?? null : null

          setLocations(filtered)
          setShift(activeShift)
          setSelectedLocation(activeLocation ?? (filtered.length === 1 ? filtered[0] : null))
          setOpeningLocationId(activeLocation?.id ?? (filtered.length === 1 ? filtered[0].id : ""))
        }
      } finally {
        setLoadingLocations(false)
      }
    }
    if (sessionReady) fetchLocations()
  }, [assignedLocationIds, isKasir, sessionReady])

  const fetchShift = useCallback(async (locationId: string) => {
    setLoadingShift(true)
    // mine=true → hanya shift milik kasir yang sedang login
    const res = await fetch(`/api/pos/shifts?locationId=${locationId}&mine=true&status=OPEN`)
    if (res.ok) {
      const data = await res.json()
      const shifts: (Shift & { status: string })[] = Array.isArray(data) ? data : data.items ?? []
      setShift(shifts[0] ?? null)
    }
    setLoadingShift(false)
  }, [])

  const fetchProducts = useCallback(async (locationId: string) => {
    setLoadingProducts(true)
    const res = await fetch(`/api/pos/products?locationId=${locationId}`)
    if (res.ok) setProducts(await res.json())
    setLoadingProducts(false)
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (selectedLocation) {
        void fetchShift(selectedLocation.id)
        void fetchProducts(selectedLocation.id)
      }
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [selectedLocation, fetchShift, fetchProducts])

  // Aturan diskon bergantung pada outlet, tanggal, hari, dan jam. Segarkan
  // berkala agar POS yang dibiarkan terbuka tidak memakai jadwal yang basi.
  useEffect(() => {
    if (!selectedLocation) {
      const timeoutId = window.setTimeout(() => setDiscountRules([]), 0)
      return () => window.clearTimeout(timeoutId)
    }

    let cancelled = false
    const refresh = async () => {
      const res = await fetch(`/api/discount-rules?locationId=${selectedLocation.id}`)
      if (!res.ok || cancelled) return
      const rules = await res.json() as DiscountRule[]
      if (!cancelled) setDiscountRules(rules.filter((rule) => isDiscountRuleValidNow(rule)))
    }

    void refresh()
    const intervalId = window.setInterval(refresh, 30_000)
    window.addEventListener("focus", refresh)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refresh)
    }
  }, [selectedLocation])

  // Auto-refresh menu setiap 10 detik + saat tab aktif kembali
  useEffect(() => {
    if (!selectedLocation) return
    const refresh = () => {
      fetch(`/api/pos/products?locationId=${selectedLocation.id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setProducts(data) })
    }
    const id = setInterval(refresh, 10_000)
    const onFocus = () => refresh()
    window.addEventListener("focus", onFocus)
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus) }
  }, [selectedLocation])

  async function toggleQrAvailability(product: Product, e: React.MouseEvent) {
    e.stopPropagation()
    const next = !product.isAvailableForQr
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, isAvailableForQr: next } : p))
    await fetch(`/api/menu/${product.id}/qr-availability`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailableForQr: next }),
    })
  }

  const categories = ["Semua", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]))]

  const filteredProducts = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCategory === "Semua" || p.category === activeCategory
    return matchSearch && matchCat
  })

  // Peringatan di pembayaran bersifat informatif. POS tetap menerima transaksi
  // dan server membukukan kekurangannya sebagai stok minus untuk ditelusuri.
  const cartQtyByProduct = new Map<string, number>()
  for (const item of cart) {
    cartQtyByProduct.set(item.productId, (cartQtyByProduct.get(item.productId) ?? 0) + item.qty)
  }
  const paymentStockIssues = [...cartQtyByProduct.entries()].flatMap(([productId, needed]) => {
    const product = products.find((candidate) => candidate.id === productId)
    if (!product || product.stockQty == null || needed <= product.stockQty) return []
    return [{ name: product.name, available: product.stockQty, needed }]
  })

  function addToCart(product: Product, chosenModifiers?: SelectedModifier[]) {
    const price = Number(product.sellPrice ?? 0)
    const resolvedModifiers = chosenModifiers ?? []

    // Non-blocking warning saat menu belum punya resep — stok tidak akan ter-deduct
    if (product.recipeItems.length === 0) {
      if (noRecipeTimer.current) clearTimeout(noRecipeTimer.current)
      setNoRecipeToast(product.name)
      noRecipeTimer.current = setTimeout(() => setNoRecipeToast(null), 4000)
    }

    // `undefined` berarti pilihan modifier belum dibuka. Array kosong berarti
    // kasir sudah mengonfirmasi semua grup opsional tanpa memilih tambahan.
    if (product.modifierGroups.length > 0 && chosenModifiers === undefined) {
      setSelectedModifiers({})
      setModifierModal(product)
      return
    }

    const modKey = resolvedModifiers.map((m) => m.optionId).sort().join("|")
    const cartKey = `${product.id}::${modKey}`
    const modifierPriceTotal = resolvedModifiers.reduce((s, m) => s + m.price, 0)
    const effectivePrice = price + modifierPriceTotal

    const doAdd = () => setCart((prev) => {
      const existing = prev.find((c) => c.cartKey === cartKey)
      if (existing) return prev.map((c) => c.cartKey === cartKey ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { cartKey, productId: product.id, name: product.name, price: effectivePrice, qty: 1, itemDiscountType: "PERCENT" as const, itemDiscountValue: 0, notes: "", modifiers: resolvedModifiers }]
    })

    // Read latest cart from ref (avoids stale closure, safe outside updater)
    if (product.stockQty !== null) {
      const currentQty = cartRef.current.find((c) => c.cartKey === cartKey)?.qty ?? 0
      const newQty = currentQty + 1

      if (newQty > product.stockQty) {
        const issues: StockIssue[] = product.recipeItems.length > 0
          ? product.recipeItems
              .map((ri) => ({
                name: ri.childItem.name,
                unit: ri.childItem.unit,
                sisa: ri.currentStock ?? Math.floor((product.stockQty ?? 0) * Number(ri.quantity)),
                butuh: Number(ri.quantity) * newQty,
              }))
              .filter((issue) => issue.sisa < issue.butuh)
          : [{ name: product.name, unit: null, sisa: product.stockQty ?? 0, butuh: newQty }]

        if (issues.length > 0) {
          setStockModal({ productName: product.name, cartKey, issues, pendingAdd: doAdd })
          return  // Block add — wait for user to confirm
        }
      }
    }

    doAdd()
  }

  function updateQty(cartKey: string, delta: number) {
    if (delta > 0) {
      const productId = cartKey.split("::")[0]
      const product = products.find((p) => p.id === productId)
      if (product && product.stockQty !== null) {
        const currentQty = cartRef.current.find((c) => c.cartKey === cartKey)?.qty ?? 0
        const newQty = currentQty + 1
        if (newQty > product.stockQty) {
          const issues: StockIssue[] = product.recipeItems.length > 0
            ? product.recipeItems
                .map((ri) => ({
                  name: ri.childItem.name,
                  unit: ri.childItem.unit,
                  sisa: ri.currentStock ?? Math.floor((product.stockQty ?? 0) * Number(ri.quantity)),
                  butuh: Number(ri.quantity) * newQty,
                }))
                .filter((issue) => issue.sisa < issue.butuh)
            : [{ name: product.name, unit: null, sisa: product.stockQty ?? 0, butuh: newQty }]
          if (issues.length > 0) {
            setStockModal({
              productName: product.name,
              cartKey,
              issues,
              pendingAdd: () => setCart((prev) => prev.map((c) => c.cartKey === cartKey ? { ...c, qty: c.qty + 1 } : c)),
            })
            return
          }
        }
      }
    }
    setCart((prev) =>
      prev
        .map((c) => c.cartKey === cartKey ? { ...c, qty: c.qty + delta } : c)
        .filter((c) => c.qty > 0)
    )
  }

  function removeItem(cartKey: string) {
    setCart((prev) => prev.filter((c) => c.cartKey !== cartKey))
  }

  function updateItemNote(cartKey: string, notes: string) {
    setCart((prev) => prev.map((c) => c.cartKey === cartKey ? { ...c, notes } : c))
  }

  function updateItemDiscount(cartKey: string, type: "PERCENT" | "AMOUNT", value: number) {
    setCart((prev) => prev.map((c) => c.cartKey === cartKey ? { ...c, itemDiscountType: type, itemDiscountValue: value } : c))
  }

  function calcItemDiscount(item: CartItem) {
    return item.itemDiscountType === "PERCENT"
      ? Math.round(item.price * item.qty * item.itemDiscountValue / 100)
      : item.itemDiscountValue
  }

  function toggleModifierOption(group: ModifierGroup, option: ModifierOption) {
    setSelectedModifiers((prev) => {
      const groupSelections = prev[group.id] ?? []
      const alreadySelected = groupSelections.find((s) => s.optionId === option.id)

      if (alreadySelected) {
        // Deselect
        const updated = groupSelections.filter((s) => s.optionId !== option.id)
        return { ...prev, [group.id]: updated }
      }

      const newSelection: SelectedModifier = {
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        price: Number(option.price),
      }

      if (group.maxSelect === 1) {
        // Radio — replace
        return { ...prev, [group.id]: [newSelection] }
      }

      if (groupSelections.length >= group.maxSelect) {
        // Already at max — replace oldest
        return { ...prev, [group.id]: [...groupSelections.slice(1), newSelection] }
      }

      return { ...prev, [group.id]: [...groupSelections, newSelection] }
    })
  }

  function confirmModifiers() {
    if (!modifierModal) return

    // Check required groups
    for (const pmg of modifierModal.modifierGroups) {
      const g = pmg.group
      if (g.isRequired && !(selectedModifiers[g.id]?.length)) {
        return // don't close modal, user must pick
      }
    }

    const chosen = Object.values(selectedModifiers).flat()
    addToCart(modifierModal, chosen)
    setModifierModal(null)
    setSelectedModifiers({})
  }

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.qty - calcItemDiscount(c), 0)

  // Aturan per-menu hanya memotong subtotal menu yang tercantum; aturan tanpa
  // menu (dan diskon manual) tetap memotong seluruh belanja. Harus sama dengan
  // perhitungan server di resolveOrderDiscount().
  function ruleBase(rule?: DiscountRule) {
    if (!rule || rule.items.length === 0) return subtotal
    const ids = new Set(rule.items.map((i) => i.menuItem.id))
    return cart.reduce((sum, c) => ids.has(c.productId) ? sum + c.price * c.qty - calcItemDiscount(c) : sum, 0)
  }

  const appliedRule = discount.ruleId ? discountRules.find((r) => r.id === discount.ruleId) : undefined
  const discountBase = ruleBase(appliedRule)
  const discountAmount = Math.min(discountBase,
    discount.type === "PERCENT"
      ? Math.round((discountBase * discount.value) / 100)
      : discount.value
  )
  const applicableRules = discountRules.filter((r) => {
    if (discount.value !== 0) return false
    const base = ruleBase(r)
    if (r.items.length > 0 && base <= 0) return false
    return base >= Number(r.minPurchase)
  })
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const taxAmount = Math.round((afterDiscount * taxPercent) / 100)
  const total = afterDiscount + taxAmount

  // Saat me-resume order tertahan, jumlah tagih = total tersimpan (bukan hitung
  // ulang keranjang) supaya konsisten dengan yang dibebankan server.
  const isResuming = heldOrderId !== null || batchHeldIds.length > 0
  const chargeTotal = isResuming && heldPayTotal !== null ? heldPayTotal : total

  const cashAmountNum = Number(cashAmount.replace(/\D/g, "")) || 0
  const change = cashAmountNum - chargeTotal

  // Auto-remove rule-based discount when cart total drops below minimum
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!discount.ruleId || discount.value === 0) return
      if (
        !appliedRule ||
        discountBase < Number(appliedRule.minPurchase) ||
        (appliedRule.items.length > 0 && discountBase <= 0) ||
        !isDiscountRuleValidNow(appliedRule)
      ) {
        setDiscount({ type: "PERCENT", value: 0, label: "", ruleId: null })
      }
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [discountBase, discount.ruleId, discount.value, appliedRule])

  // Generate dynamic QRIS with embedded amount per transaction
  useEffect(() => {
    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      if (!showPaymentModal || paymentMethod !== "QRIS" || !qrisPayload || chargeTotal <= 0) {
        if (!cancelled) setDynamicQrUrl(null)
        return
      }
      try {
        const dynamicPayload = makeQrisDynamic(qrisPayload, chargeTotal)
        const dataUrl = await QRCode.toDataURL(dynamicPayload, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 512,
          color: { dark: "#000000", light: "#ffffff" },
        })
        if (!cancelled) setDynamicQrUrl(dataUrl)
      } catch {
        if (!cancelled) setDynamicQrUrl(null)
      }
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [showPaymentModal, paymentMethod, qrisPayload, chargeTotal])

  const fetchHeldOrders = useCallback(async () => {
    if (!selectedLocation) return
    try {
      const res = await fetch(`/api/pos/orders?status=HELD&locationId=${selectedLocation.id}`)
      if (res.ok) setHeldOrders(await res.json())
    } catch { /* ignore */ }
  }, [selectedLocation])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchHeldOrders() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchHeldOrders])

  const fetchQrOrders = useCallback(async () => {
    if (!selectedLocation) return
    try {
      const res = await fetch(`/api/pos/orders?qr=true&locationId=${selectedLocation.id}`)
      if (res.ok) setQrOrders(await res.json())
    } catch { /* ignore */ }
  }, [selectedLocation])

  useEffect(() => {
    if (!shift) return
    const timeoutId = window.setTimeout(() => { void fetchQrOrders() }, 0)
    const refresh = () => void fetchQrOrders()
    const intervalId = window.setInterval(refresh, 5_000)
    const onFocus = () => refresh()
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [fetchQrOrders, shift])

  // Masa tenang opname: polling ke server apakah transaksi sedang ditahan.
  useEffect(() => {
    if (!shift || !selectedLocation) return
    const locId = selectedLocation.id
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/pos/opname-lock?locationId=${locId}`, { cache: "no-store" })
        if (!res.ok || cancelled) return
        const data = await res.json() as { locked?: boolean; secondsRemaining?: number }
        if (!cancelled) setCooldownLeft(data.locked ? (data.secondsRemaining ?? 0) : 0)
      } catch { /* ignore */ }
    }
    void poll()
    const intervalId = window.setInterval(() => void poll(), 5_000)
    return () => { cancelled = true; window.clearInterval(intervalId) }
  }, [shift, selectedLocation])

  // Hitung mundur lokal tiap detik saat transaksi ditahan.
  const isCoolingDown = cooldownLeft > 0
  useEffect(() => {
    if (!isCoolingDown) return
    const intervalId = window.setInterval(() => setCooldownLeft((s) => (s > 0 ? s - 1 : 0)), 1_000)
    return () => window.clearInterval(intervalId)
  }, [isCoolingDown])

  // Proses satu / beberapa pesanan QR terpilih (OPEN → HELD). Panel dibiarkan
  // terbuka & daftar diperbarui langsung — tidak perlu refresh manual.
  async function prosesQrOrders(orders: QrOrder[]) {
    if (orders.length === 0 || !shift) return
    const responses = await Promise.all(orders.map(o =>
      fetch(`/api/pos/orders/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: shift.id }),
      })
    ))
    const okCount = responses.filter(res => res.ok).length
    await Promise.all([fetchQrOrders(), fetchHeldOrders()])
    setSelectedQrIds([])
    if (okCount === 0) {
      setHoldToast("Pesanan sudah diproses kasir lain")
    } else if (okCount < orders.length) {
      setHoldToast(`${okCount} pesanan diproses; sisanya sudah diambil kasir lain`)
    } else {
      setHoldToast(`${okCount} pesanan sedang diproses — bayar setelah pelanggan selesai`)
    }
    setTimeout(() => setHoldToast(null), 3500)
  }

  async function confirmTolak() {
    if (!tolakConfirm) return
    setTolaking(true)
    await Promise.all(tolakConfirm.map(o =>
      fetch(`/api/pos/orders/${o.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Ditolak kasir" }),
      })
    ))
    setTolakConfirm(null)
    setTolaking(false)
    setSelectedQrIds([])
    fetchQrOrders()
  }

  async function handleHold() {
    if (!selectedLocation || cart.length === 0 || !shift) return
    setHoldingOrder(true)
    try {
      const res = await fetch("/api/pos/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocation.id,
          shiftId: shift.id,
          orderType,
          tableNumber: orderType === "DINE_IN" ? tableNumber || null : null,
          customerName: customerName || null,
          items: cart.map((c) => ({
            menuItemId: c.productId,
            name: c.name,
            price: Number(c.price) - c.modifiers.reduce((s, m) => s + m.price, 0),
            qty: c.qty,
            discount: calcItemDiscount(c),
            notes: c.notes || null,
            modifiers: c.modifiers.map((m) => ({ optionId: m.optionId })),
          })),
          discountRuleId: discount.ruleId,
          discountType: discount.value > 0 ? discount.type : null,
          discountValue: discount.value,
          discountLabel: discount.label || null,
          taxPercent,
          hold: true,
        }),
      })
      if (res.ok) {
        resetOrder()
        await fetchHeldOrders()
        setHoldToast("Order ditahan ✓ — klik badge untuk melanjutkan")
        setTimeout(() => setHoldToast(null), 3500)
      } else {
        const d = await res.json().catch(() => ({}))
        setHoldToast(`Gagal menahan order: ${d.error ?? `HTTP ${res.status}`}`)
        setTimeout(() => setHoldToast(null), 3500)
      }
    } catch {
      setHoldToast("Tidak dapat terhubung ke server")
      setTimeout(() => setHoldToast(null), 3000)
    } finally {
      setHoldingOrder(false)
    }
  }

  async function handlePay() {
    if (!selectedLocation) {
      setPayError("Pilih outlet terlebih dahulu")
      return
    }
    if (cooldownLeft > 0) {
      setPayError(`Opname baru disimpan — transaksi ditahan ${cooldownLeft} detik lagi`)
      return
    }
    if (orderType === "DINE_IN" && !batchHeldIds.length && !heldOrderId) {
      const tErr = !tableNumber.trim()
      const nErr = !customerName.trim()
      if (tErr) setTableErr(true)
      if (nErr) setNameErr(true)
      if (tErr || nErr) return
    }
    if (paymentMethod === "CASH" && cashAmountNum < chargeTotal) return
    if (paymentMethod === "QRIS" && !qrisImageUrl) {
      setPayError("QRIS belum dikonfigurasi. Upload QRIS terverifikasi di Pengaturan.")
      return
    }

    setPayError(null)
    setPaying(true)
    try {
      const isDeliveryPlatform = ["GOFOOD", "GRABFOOD", "SHOPEEFOOD"].includes(paymentMethod)

      // Tab meja: banyak order ditahan dalam 1 tagihan
      if (batchHeldIds.length > 0) {
        const res = await fetch("/api/pos/orders/pay-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderIds: batchHeldIds,
            payment: { method: paymentMethod, amount: paymentMethod === "CASH" ? cashAmountNum : chargeTotal, reference: isDeliveryPlatform || paymentMethod === "OTHER" ? platformOrderNumber || null : paymentRef || null },
            shiftId: shift?.id ?? null,
          }),
        })
        if (res.ok) {
          setShowPaymentModal(false)
          resetOrder()
          fetchHeldOrders()
          if (selectedLocation) { fetchShift(selectedLocation.id); fetchProducts(selectedLocation.id) }
        } else {
          const d = await res.json().catch(() => ({}))
          if (res.status === 423 && typeof d.secondsRemaining === "number") setCooldownLeft(d.secondsRemaining)
          setPayError(d.error ?? "Pembayaran gagal")
        }
        setPaying(false)
        return
      }

      const url = heldOrderId
        ? `/api/pos/orders/${heldOrderId}/pay`
        : "/api/pos/orders"
      const body = heldOrderId
        ? { payment: { method: paymentMethod, amount: chargeTotal, reference: platformOrderNumber || paymentRef || null }, shiftId: shift?.id ?? null }
        : {
            locationId: selectedLocation.id,
            shiftId: shift?.id ?? null,
            orderType,
            tableNumber: orderType === "DINE_IN" ? tableNumber || null : null,
            customerName: customerName || null,
            items: cart.map((c) => ({
              menuItemId: c.productId,
              name: c.name,
              price: Number(c.price) - c.modifiers.reduce((s, m) => s + m.price, 0),
              qty: c.qty,
              discount: calcItemDiscount(c),
              notes: c.notes || null,
              modifiers: c.modifiers.map((m) => ({ optionId: m.optionId })),
            })),
            discountRuleId: discount.ruleId,
            discountType: discount.value > 0 ? discount.type : null,
            discountValue: discount.value,
            discountLabel: discount.label || null,
            platformOrderNumber: isDeliveryPlatform ? platformOrderNumber || null : null,
            taxPercent, notes: null,
            payment: { method: paymentMethod, amount: paymentMethod === "CASH" ? cashAmountNum : chargeTotal, reference: isDeliveryPlatform || paymentMethod === "OTHER" ? platformOrderNumber || null : paymentRef || null },
          }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const order = await res.json()
        setLastOrder(order)
        setShowPaymentModal(false)
        setShowReceipt(true)
        setHeldOrderId(null)
        fetchHeldOrders()
        fetchQrOrders()
        if (selectedLocation) {
          fetchShift(selectedLocation.id)
          fetchProducts(selectedLocation.id)
        }
      } else {
        const data = await res.json().catch(() => ({}))
        if (res.status === 423 && typeof data.secondsRemaining === "number") setCooldownLeft(data.secondsRemaining)
        setPayError(
          res.status >= 500
            ? "Terjadi kesalahan di server. Coba lagi atau hubungi admin."
            : (data.error ?? "Pembayaran gagal. Periksa data dan coba lagi.")
        )
      }
    } catch (paymentError) {
      setPayError(paymentError instanceof Error ? paymentError.message : "Tidak dapat terhubung ke server. Periksa koneksi internet.")
    } finally {
      setPaying(false)
    }
  }

  async function handlePrint(withLogo = true) {
    if (!lastOrder || printerBusy) return
      const payment = lastOrder.payments?.[0]
      const printLines: ReceiptLine[] = [
        { text: (sessionUser?.businessName ?? "Pantau").toUpperCase(), align: "center" },
        { text: lastOrder.location?.name ?? "", align: "center" },
        ...(lastOrder.location?.address ? [{ text: lastOrder.location.address, align: "center" } as const] : []),
        "",
        `No. Struk: ${lastOrder.orderNumber}`,
        ...(lastOrder.paidAt ? [`Waktu: ${new Date(lastOrder.paidAt).toLocaleString("id-ID")}`] : []),
        ...(lastOrder.cashier?.name ? [`Kasir: ${lastOrder.cashier.name}`] : []),
        ...(lastOrder.tableNumber ? [`Meja: ${lastOrder.tableNumber}`] : []),
        ...(lastOrder.customerName ? [`Pelanggan: ${lastOrder.customerName}`] : []),
        `--------------------------------`,
        ...lastOrder.items.flatMap((i) => [
          formatReceiptLine(`${i.qty}x ${i.name}`, formatRp(i.subtotal)),
          ...(i.modifiers?.length ? [`  ${i.modifiers.map((m) => m.optionName).join(", ")}`] : []),
        ]),
        `--------------------------------`,
        ...(Number(lastOrder.discountAmount) > 0
          ? [formatReceiptLine(`Diskon${lastOrder.discountLabel ? ` (${lastOrder.discountLabel})` : ""}`, `-${formatRp(Number(lastOrder.discountAmount))}`)]
          : []),
        ...(Number(lastOrder.taxAmount) > 0 ? [formatReceiptLine("Pajak", formatRp(Number(lastOrder.taxAmount)))] : []),
        formatReceiptLine("TOTAL", formatRp(Number(lastOrder.total))),
        ...(payment ? [
          formatReceiptLine(`Bayar (${PAYMENT_LABELS[payment.method] ?? payment.method})`, formatRp(Number(payment.amount))),
          ...(Number(payment.change) > 0 ? [formatReceiptLine("Kembali", formatRp(Number(payment.change)))] : []),
        ] : []),
        `--------------------------------`,
        ...(receiptWifiName ? [{ text: `WiFi: ${receiptWifiName}`, align: "center" } as const] : []),
        ...(receiptWifiPassword ? [{ text: `Sandi WiFi: ${receiptWifiPassword}`, align: "center" } as const] : []),
        { text: receiptFooterText || "Terima kasih!", align: "center" },
      ]

    await receiptPrinter.send(printLines, { logoUrl: withLogo ? receiptLogoUrl : null, feedLines: 4 })
  }

  function handleConnectPrinter() {
    void receiptPrinter.connect(!!printer)
  }

  async function handleTestPrinter() {
    await receiptPrinter.send([
      { text: "TES PRINTER PANTAU", align: "center" },
      new Date().toLocaleString("id-ID"),
      "Jika teks ini terbaca,",
      "jalur cetak teks berfungsi.",
      "Terima kasih!",
    ], { feedLines: 4 })
  }

  function resetOrder() {
    setCart([])
    setTableNumber("")
    setCustomerName("")
    setTableErr(false)
    setNameErr(false)
    setDiscount({ type: "PERCENT", value: 0, label: "", ruleId: null })
    setPaymentMethod("CASH")
    setCashAmount("")
    setPaymentRef("")
    setPlatformOrderNumber("")
    setShowReceipt(false)
    setLastOrder(null)
    setHeldOrderId(null)
    setBatchHeldIds([])
    setHeldPayTotal(null)
  }

  async function handleOpenShift() {
    const openingLocation = locations.find((location) => location.id === openingLocationId)
    if (!openingLocation) {
      setOpenShiftError("Pilih outlet tempat shift akan dibuka")
      return
    }
    setOpenShiftError(null)
    setOpeningShift(true)
    try {
      const res = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: openingLocation.id,
          openingBalance: Number(openingBalance) || 0,
        }),
      })
      if (res.ok) {
        const s = await res.json()
        setSelectedLocation(openingLocation)
        setShift(s)
        setShowOpenShift(false)
        setOpeningBalance("")
      } else {
        const data = await res.json().catch(() => ({}))
        setOpenShiftError(data.error ?? "Shift gagal dibuka")
      }
    } catch {
      setOpenShiftError("Tidak dapat terhubung ke server")
    } finally {
      setOpeningShift(false)
    }
  }

  function openShiftDialog() {
    setOpeningLocationId(selectedLocation?.id ?? (locations.length === 1 ? locations[0].id : ""))
    setOpenShiftError(null)
    setShowOpenShift(true)
  }

  const openPaymentModal = () => {
    if (cart.length === 0) return
    if (orderType === "DINE_IN" && !batchHeldIds.length && !heldOrderId) {
      const tErr = !tableNumber.trim()
      const nErr = !customerName.trim()
      if (tErr) setTableErr(true)
      if (nErr) setNameErr(true)
      if (tErr || nErr) return
    }
    setCashAmount("")
    setShowPaymentModal(true)
  }

  // Daftar item diambil saat panel dibuka saja — kasir jarang memakainya, jadi
  // tidak perlu ikut membebani pemuatan awal POS.
  useEffect(() => {
    if (!showWaste || wasteLoaded) return
    let aborted = false
    void fetch("/api/inventory?includeMenuItems=1")
      .then(async (res) => (res.ok ? await res.json() as WasteItem[] : []))
      .then((list) => {
        if (aborted) return
        setWasteItems(list)
        setWasteItemId((current) => current || list[0]?.id || "")
        setWasteLoaded(true)
      })
      .catch(() => {
        if (aborted) return
        setWasteError("Gagal memuat daftar item")
        setWasteLoaded(true)
      })
    return () => { aborted = true }
  }, [showWaste, wasteLoaded])

  const selectedWasteItem = wasteItems.find((item) => item.id === wasteItemId)
  const wasteQtyNumber = Number(wasteQty) || 0
  const stepWasteQty = (delta: number) =>
    setWasteQty(String(Math.max(0, Math.round((wasteQtyNumber + delta) * 1000) / 1000)))
  const wasteNoteTrimmed = wasteNote.trim()
  const wasteReady = !!wasteItemId && wasteQtyNumber > 0 && wasteNoteTrimmed.length >= 3

  async function submitWaste() {
    if (!selectedLocation) return
    setWasteSubmitting(true)
    setWasteError("")
    try {
      const res = await fetch("/api/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocation.id,
          itemId: wasteItemId,
          type: wasteType,
          quantity: Number(wasteQty),
          note: wasteNote,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal mencatat barang rusak")
      setWasteSaved(`${selectedWasteItem?.name ?? "Item"} tercatat`)
      setWasteQty("")
      setWasteNote("")
      setShowWaste(false)
      // Stok item yang dilacak berkurang, jadi kartu produk POS ikut disegarkan.
      void fetchProducts(selectedLocation.id)
      window.setTimeout(() => setWasteSaved(""), 3000)
    } catch (error) {
      setWasteError(error instanceof Error ? error.message : "Gagal mencatat barang rusak")
    } finally {
      setWasteSubmitting(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Toast barang rusak */}
      {wasteSaved && (
        <div role="status" className="app-toast-enter fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-sm items-center gap-2.5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 shadow-lg">
          <ClipboardMinus className="h-4 w-4 shrink-0" />
          <span>{wasteSaved}</span>
        </div>
      )}

      {/* Catat barang rusak — kasir tidak punya akses backoffice, jadi
          pencatatannya disediakan langsung di sini. */}
      {showWaste && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-4">
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-[2px]" onClick={() => setShowWaste(false)} />
          <div className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">

            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <ClipboardMinus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-slate-900">Catat Barang Rusak</h2>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{selectedLocation?.name}</span>
                </p>
              </div>
              <button
                onClick={() => setShowWaste(false)}
                className="-mr-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {wasteError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                  {wasteError}
                </div>
              )}

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Item</label>
                {wasteItems.length === 0 ? (
                  <div className="flex h-12 items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3.5 text-sm text-slate-400">
                    {wasteLoaded
                      ? "Belum ada item di master inventori atau menu"
                      : <><Loader2 className="h-4 w-4 animate-spin" /> Memuat daftar item...</>}
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={wasteItemId}
                      onChange={(event) => setWasteItemId(event.target.value)}
                      className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-10 text-sm font-semibold text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                    >
                      {[
                        { label: "Menu", list: wasteItems.filter((item) => item.isMenuItem) },
                        { label: "Bahan & Inventori", list: wasteItems.filter((item) => !item.isMenuItem) },
                      ].filter((group) => group.list.length > 0).map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.list.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}{item.sku ? ` · ${item.sku}` : ""}{item.isTrackable ? "" : " · tidak dilacak"}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Jenis kejadian</label>
                <div className="grid grid-cols-3 gap-2">
                  {WASTE_TYPES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setWasteType(option.value)}
                      className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                        wasteType === option.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Jumlah</label>
                <div className="flex h-12 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
                  <button
                    type="button"
                    onClick={() => stepWasteQty(-1)}
                    disabled={wasteQtyNumber <= 0}
                    aria-label="Kurangi jumlah"
                    className="flex w-12 shrink-0 items-center justify-center border-r border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    inputMode="decimal"
                    value={wasteQty}
                    onChange={(event) => setWasteQty(event.target.value)}
                    placeholder="0"
                    className="min-w-0 flex-1 bg-transparent text-center text-lg font-bold tabular-nums text-slate-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="pointer-events-none flex items-center pr-1 text-xs font-semibold text-slate-400">
                    {selectedWasteItem?.unit ?? "unit"}
                  </span>
                  <button
                    type="button"
                    onClick={() => stepWasteQty(1)}
                    aria-label="Tambah jumlah"
                    className="flex w-12 shrink-0 items-center justify-center border-l border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Keterangan</label>
                <textarea
                  rows={3}
                  value={wasteNote}
                  onChange={(event) => setWasteNote(event.target.value)}
                  maxLength={STOCK_ADJUSTMENT_NOTE_MAX_LENGTH}
                  aria-describedby="pos-waste-note-hint"
                  placeholder="Contoh: gelas pecah saat penyajian"
                  className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
                <p id="pos-waste-note-hint" className={`mt-1.5 flex justify-between gap-3 text-xs ${wasteNoteTrimmed.length > 0 && wasteNoteTrimmed.length < 3 ? "text-amber-600" : "text-slate-400"}`}>
                  <span>{wasteNoteTrimmed.length > 0 && wasteNoteTrimmed.length < 3
                    ? "Keterangan minimal 3 karakter."
                    : `Maksimal ${STOCK_ADJUSTMENT_NOTE_MAX_LENGTH} karakter.`}</span>
                  <span className={`shrink-0 tabular-nums ${wasteNote.length >= STOCK_ADJUSTMENT_NOTE_MAX_LENGTH ? "font-medium text-amber-600" : ""}`}>{wasteNote.length}/{STOCK_ADJUSTMENT_NOTE_MAX_LENGTH}</span>
                </p>
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
                <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${selectedWasteItem && !selectedWasteItem.isTrackable ? "bg-slate-400" : "bg-amber-500"}`} />
                {selectedWasteItem && !selectedWasteItem.isTrackable
                  ? "Stok item ini tidak dilacak, jadi tidak ada saldo yang berkurang. Kejadian tetap tercatat atas nama Anda."
                  : "Stok di outlet ini langsung berkurang dan tercatat atas nama Anda di kartu stok serta audit."}
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowWaste(false)}
                  className="h-12 flex-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitWaste}
                  disabled={wasteSubmitting || !wasteReady}
                  className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white shadow-sm shadow-red-200 transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {wasteSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {wasteSubmitting ? "Menyimpan..." : "Simpan Catatan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hold toast */}
      {holdToast && !showQrPanel && (
        <div role="status" className={`app-toast-enter fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${holdToast.startsWith("Gagal") || holdToast.startsWith("Tidak") ? "border border-red-200 bg-red-50 text-red-800" : "border border-green-200 bg-green-50 text-green-800"}`}>
          <Pause className="w-4 h-4 shrink-0" />
          <span>{holdToast}</span>
        </div>
      )}

      {/* No-recipe toast — non-blocking, auto-dismiss */}
      {noRecipeToast && (
        <div className="app-toast-enter fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-sm items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-lg">
          <span className="text-base shrink-0">⚠️</span>
          <span><span className="font-semibold">{noRecipeToast}</span> belum ada resep — stok tidak akan ter-deduct. Bisa menyulitkan opname.</span>
          <button onClick={() => setNoRecipeToast(null)} className="ml-auto shrink-0 text-amber-400 hover:text-amber-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modifier selection modal */}
      {modifierModal && (
        <div className="app-overlay z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModifierModal(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm max-h-[85vh] flex flex-col z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="font-semibold text-slate-900">{modifierModal.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">Pilih variasi</div>
              </div>
              <button onClick={() => setModifierModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {modifierModal.modifierGroups.map(({ group }) => {
                const selections = selectedModifiers[group.id] ?? []
                const isRadio = group.maxSelect === 1
                return (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-slate-800">{group.name}</span>
                      {group.isRequired
                        ? <span className="text-xs text-red-500 font-medium">Wajib</span>
                        : <span className="text-xs text-slate-400">Opsional</span>}
                      {!isRadio && <span className="text-xs text-slate-400">maks {group.maxSelect}</span>}
                    </div>
                    <div className="space-y-1.5">
                      {group.options.map((opt) => {
                        const isSelected = selections.some((s) => s.optionId === opt.id)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleModifierOption(group, opt)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                              isSelected
                                ? "border-blue-500 bg-blue-50"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                isSelected ? "border-blue-500 bg-blue-500" : "border-slate-300"
                              }`}>
                                {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </div>
                              <span className="text-sm text-slate-800">{opt.name}</span>
                            </div>
                            {Number(opt.price) > 0 && (
                              <span className="text-xs text-blue-600 font-medium">+{formatRp(Number(opt.price))}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    {group.isRequired && selections.length === 0 && (
                      <p className="text-xs text-red-400 mt-1">Pilih salah satu</p>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-4 border-t">
              {(() => {
                const totalExtra = Object.values(selectedModifiers).flat().reduce((s, m) => s + m.price, 0)
                const basePrice = Number(modifierModal.sellPrice ?? 0)
                const canConfirm = modifierModal.modifierGroups.every(({ group }) =>
                  !group.isRequired || (selectedModifiers[group.id]?.length ?? 0) > 0
                )
                return (
                  <button
                    onClick={confirmModifiers}
                    disabled={!canConfirm}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
                  >
                    Tambah ke Keranjang — {formatRp(basePrice + totalExtra)}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Stock warning modal */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setStockModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <span className="text-amber-600 text-lg">⚠️</span>
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">Stok tidak cukup</div>
                <div className="text-slate-500 text-xs mt-0.5">Bahan untuk <span className="font-semibold text-slate-700">{stockModal.productName}</span> perlu dicek</div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden mb-5">
              <div className="px-4 py-2.5 border-b border-amber-200 grid grid-cols-3 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
                <span>Bahan</span><span className="text-center">Sisa stok</span><span className="text-right">Dibutuhkan</span>
              </div>
              {stockModal.issues.map((issue) => (
                <div key={issue.name} className="px-4 py-2.5 grid grid-cols-3 items-center border-b border-amber-100 last:border-0">
                  <span className="text-sm font-medium text-slate-800 truncate pr-2">{issue.name}</span>
                  <span className={`text-sm font-bold text-center ${issue.sisa <= 0 ? "text-red-600" : "text-amber-600"}`}>
                    {issue.sisa} {issue.unit ?? "pcs"}
                  </span>
                  <span className="text-sm text-slate-500 text-right">{issue.butuh} {issue.unit ?? "pcs"}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStockModal(null)}
                className="flex-1 border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">
                Batalkan
              </button>
              <button onClick={() => { stockModal.pendingAdd(); setStockModal(null) }}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl text-sm">
                Tetap lanjut
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2 shrink-0 sm:mr-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0">P</div>
          <span className="text-white font-bold text-sm hidden lg:block">{sessionUser?.businessName ?? "Pantau"}</span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-sm text-slate-300 sm:px-3">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-24 truncate sm:max-w-40">{shift?.location.name ?? selectedLocation?.name ?? "Dipilih saat buka shift"}</span>
        </div>

        {shift && (
          <div className="hidden min-w-0 items-center gap-1.5 text-slate-400 text-xs md:flex">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="text-slate-300 font-medium truncate">{shift.shiftNumber}</span>
            <span className="shrink-0">· {elapsedTime(shift.openedAt)}</span>
          </div>
        )}
        {shift && (
          <span className="shrink-0 text-xs text-slate-400 md:hidden">{elapsedTime(shift.openedAt)}</span>
        )}

        <div className="ml-auto flex items-center gap-1.5 shrink-0 sm:gap-2">
          {shift && (
            <button
              onClick={() => { setShowQrPanel(true); fetchQrOrders() }}
              className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                qrOrders.length > 0
                  ? "bg-blue-600 text-white hover:bg-blue-500 ring-2 ring-blue-400/30"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Pesanan Masuk</span>
              {qrOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {qrOrders.length}
                </span>
              )}
            </button>
          )}
          {shift && (
            <button
              onClick={() => { setShowHeldModal(true); fetchHeldOrders() }}
              className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                heldTabCount > 0
                  ? "bg-slate-800 text-white hover:bg-slate-700 ring-2 ring-amber-400/30"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <Pause className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Tab Aktif</span>
              {heldTabCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {heldTabCount}
                </span>
              )}
            </button>
          )}
          <Link
            href={`/pos/orders${selectedLocation ? `?locationId=${selectedLocation.id}` : ""}`}
            className="hidden items-center gap-1.5 text-slate-300 hover:text-white text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors sm:flex"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Riwayat</span>
          </Link>
          <Link
            href="/pos/shift"
            className="hidden items-center gap-1.5 text-slate-300 hover:text-white text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors sm:flex"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Shift</span>
          </Link>
          {selectedLocation && canRecordWaste && (
            <button
              type="button"
              onClick={() => { setShowWaste(true); setWasteError("") }}
              className="hidden items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700 hover:text-white sm:flex"
            >
              <ClipboardMinus className="h-3.5 w-3.5" />
              <span className="hidden lg:block">Barang Rusak</span>
            </button>
          )}
          <button
            onClick={async () => { await signOut({ redirect: false }); window.location.href = "/login" }}
            className="hidden p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors sm:block"
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* Menu ringkas (HP) — Riwayat / Shift / Keluar */}
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setShowMoreMenu((open) => !open)}
              aria-label="Menu lainnya"
              aria-expanded={showMoreMenu}
              aria-controls="pos-mobile-menu"
              className="rounded-lg bg-slate-800 p-2 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Tutup menu lainnya"
              tabIndex={showMoreMenu ? 0 : -1}
              onClick={() => setShowMoreMenu(false)}
              className={`fixed inset-0 z-40 transition-opacity duration-200 ${
                showMoreMenu
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            />
            <div
              id="pos-mobile-menu"
              aria-hidden={!showMoreMenu}
              className={`absolute right-0 top-full z-50 mt-2 w-44 origin-top-right overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl transition-[opacity,transform,visibility] duration-200 ease-out ${
                showMoreMenu
                  ? "visible scale-100 translate-y-0 opacity-100"
                  : "pointer-events-none invisible scale-95 -translate-y-1 opacity-0"
              }`}
            >
              <Link
                href={`/pos/orders${selectedLocation ? `?locationId=${selectedLocation.id}` : ""}`}
                tabIndex={showMoreMenu ? 0 : -1}
                onClick={() => setShowMoreMenu(false)}
                className="flex items-center gap-2.5 px-4 py-3 text-sm text-slate-200 hover:bg-slate-700"
              >
                <ClipboardList className="h-4 w-4 shrink-0" /> Riwayat
              </Link>
              <Link
                href="/pos/shift"
                tabIndex={showMoreMenu ? 0 : -1}
                onClick={() => setShowMoreMenu(false)}
                className="flex items-center gap-2.5 border-t border-slate-700 px-4 py-3 text-sm text-slate-200 hover:bg-slate-700"
              >
                <Clock className="h-4 w-4 shrink-0" /> Shift
              </Link>
              {selectedLocation && canRecordWaste && (
                <button
                  type="button"
                  tabIndex={showMoreMenu ? 0 : -1}
                  onClick={() => { setShowMoreMenu(false); setShowWaste(true); setWasteError("") }}
                  className="flex w-full items-center gap-2.5 border-t border-slate-700 px-4 py-3 text-left text-sm text-slate-200 hover:bg-slate-700"
                >
                  <ClipboardMinus className="h-4 w-4 shrink-0" /> Barang Rusak
                </button>
              )}
              <button
                type="button"
                tabIndex={showMoreMenu ? 0 : -1}
                onClick={async () => { setShowMoreMenu(false); await signOut({ redirect: false }); window.location.href = "/login" }}
                className="flex w-full items-center gap-2.5 border-t border-slate-700 px-4 py-3 text-left text-sm text-red-400 hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4 shrink-0" /> Keluar
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Products Panel */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 min-h-0">
          {/* Search + Categories */}
          <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari menu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                    activeCategory === cat
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4 lg:p-6 lg:pb-6">
            {loadingLocations || loadingShift ? (
              <ProductGridSkeleton />
            ) : !shift ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Clock className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-slate-700 font-semibold text-lg mb-1">Buka Shift Dulu</p>
                <p className="text-slate-400 text-sm mb-4">
                  {locations.length > 1
                    ? "Pilih outlet di formulir pembukaan shift"
                    : locations.length === 1
                      ? `Shift akan dibuka di ${locations[0].name}`
                      : "Akun ini belum memiliki akses outlet"}
                </p>
                <button
                  onClick={openShiftDialog}
                  disabled={locations.length === 0}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl transition-colors"
                >
                  Buka Shift
                </button>
              </div>
            ) : loadingProducts ? (
              <ProductGridSkeleton />
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <ShoppingCart className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-slate-500">Tidak ada menu ditemukan</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
                {filteredProducts.map((product) => {
                  const totalQty = cart.filter((c) => c.productId === product.id).reduce((s, c) => s + c.qty, 0)
                  const catColor = CATEGORY_COLORS[product.category ?? "Lainnya"] ?? "bg-slate-100 text-slate-600"
                  const hasModifiers = product.modifierGroups.length > 0
                  const lowStock = product.stockQty !== null && product.stockQty <= 0
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`rounded-2xl p-4 text-left shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 border relative ${
                        lowStock ? "bg-amber-50 border-amber-200" : "bg-white border-slate-100"
                      }`}
                    >
                      {totalQty > 0 && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold z-10">
                          {totalQty}
                        </div>
                      )}
                      {hasModifiers && !product.recipeItems.length && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-md z-10">
                          ✦ Modifier
                        </div>
                      )}
                      {product.recipeItems.length === 0 && !hasModifiers && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-md z-10">
                          ⚠ No Resep
                        </div>
                      )}
                      {lowStock && (
                        <div className="absolute top-2 left-2 flex items-center gap-1 bg-orange-100 border border-orange-300 text-orange-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-md z-10">
                          ⚠ Stok tipis
                        </div>
                      )}
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className={`w-full h-40 object-cover rounded-xl mb-3 ${lowStock ? "opacity-60" : ""}`}
                        />
                      ) : (
                        <div className={`w-full h-40 rounded-xl flex items-center justify-center text-4xl mb-3 ${
                          lowStock ? "bg-orange-50" :
                          product.category === "Makanan" ? "bg-orange-50" :
                          product.category === "Minuman" ? "bg-blue-50" :
                          product.category === "Snack" ? "bg-yellow-50" : "bg-slate-50"
                        } ${lowStock ? "opacity-70" : ""}`}>
                          {product.category === "Makanan" ? "🍔" :
                           product.category === "Minuman" ? "🥤" :
                           product.category === "Snack" ? "🍟" :
                           product.category === "Paket" ? "📦" : "🍽️"}
                        </div>
                      )}
                      <div className={`font-medium text-sm leading-tight mb-1 line-clamp-2 ${lowStock ? "text-slate-500" : "text-slate-900"}`}>{product.name}</div>
                      {product.description && (
                        <div className="text-xs text-slate-400 mb-1 line-clamp-1">{product.description}</div>
                      )}
                      {product.category && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColor}`}>
                          {product.category}
                        </span>
                      )}
                      <div className="mt-2 font-bold text-blue-600 text-sm">
                        {product.sellPrice ? formatRp(Number(product.sellPrice)) : <span className="text-slate-400 font-normal text-xs">Belum ada harga</span>}
                      </div>
                      {/* QR Menu toggle — kasir only */}
                      <div
                        onClick={(e) => toggleQrAvailability(product, e)}
                        className={`mt-2 flex items-center gap-1.5 w-fit px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                          product.isAvailableForQr
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${product.isAvailableForQr ? "bg-green-500" : "bg-slate-400"}`} />
                        QR {product.isAvailableForQr ? "Aktif" : "Nonaktif"}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Ringkasan keranjang mengambang (HP saja) */}
        {!showCartSheet && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 md:hidden">
            <button
              onClick={() => setShowCartSheet(true)}
              className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-white transition-transform active:scale-[0.99]"
            >
              <ShoppingCart className="h-5 w-5 shrink-0" />
              <span className="flex-1 text-left text-sm font-bold">
                {cart.length === 0 ? "Buka keranjang" : `${cart.reduce((sum, c) => sum + c.qty, 0)} item`}
              </span>
              <span className="text-sm font-black">{formatRp(total)}</span>
            </button>
          </div>
        )}

        {/* Backdrop bottom sheet (HP saja) */}
        <button
          type="button"
          aria-label="Tutup keranjang"
          tabIndex={showCartSheet ? 0 : -1}
          className={`fixed inset-0 z-30 bg-slate-900/50 transition-opacity duration-300 md:hidden ${
            showCartSheet
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setShowCartSheet(false)}
        />

        {/* Cart Panel — bottom sheet di HP, panel samping di md+.
            Panel tetap di tempat ketika keyboard terbuka; isi di bawah header
            yang bergulir, sama seperti form pada shell Pantau. */}
        <div
          className={`mobile-cart-sheet fixed inset-x-0 bottom-0 z-40 flex max-h-[calc(var(--app-height,100dvh)-3rem)] w-full transform-gpu flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl md:static md:z-auto md:flex md:max-h-none md:w-80 md:shrink-0 md:translate-y-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none xl:w-96 ${
            showCartSheet
              ? "is-open translate-y-0"
              : "is-closed pointer-events-none translate-y-full md:pointer-events-auto"
          }`}
        >
          {/* Handle + tutup (HP saja) */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 md:hidden">
            <span className="text-sm font-bold text-slate-900">Keranjang</span>
            <button onClick={() => setShowCartSheet(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Resume banner */}
          {(heldOrderId || batchHeldIds.length > 0) && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200">
              <Play className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-xs font-semibold text-blue-700 flex-1">
                {batchHeldIds.length > 1 ? `Tab ${formatTableLabel(tableNumber)} (${batchHeldIds.length} pesanan)` : "Melanjutkan order ditahan"}
              </span>
              <button
                onClick={resetOrder}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium"
              >
                Batalkan
              </button>
            </div>
          )}

          {/* Order Type */}
          <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
            <div className="flex rounded-xl overflow-hidden border border-slate-200">
              {(["DINE_IN", "TAKEAWAY", "DELIVERY"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    orderType === type ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {type === "DINE_IN" ? "Dine In" : type === "TAKEAWAY" ? "Takeaway" : "Delivery"}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {orderType === "DINE_IN" && (
                <div>
                  <input
                    type="text"
                    placeholder="No. Meja *"
                    value={tableNumber}
                    onChange={(e) => { setTableNumber(e.target.value); setTableErr(false) }}
                    className={`w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 border ${tableErr ? "border-red-400 bg-red-50 placeholder:text-red-400" : "border-slate-200"}`}
                  />
                  {tableErr && <p className="text-xs text-red-500 mt-1 ml-1">Nomor meja wajib diisi</p>}
                </div>
              )}
              <div>
                <input
                  type="text"
                  placeholder={orderType === "DINE_IN" ? "Nama pelanggan *" : "Nama pelanggan"}
                  value={customerName}
                  onChange={(e) => { setCustomerName(e.target.value); setNameErr(false) }}
                  className={`w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 border ${nameErr && orderType === "DINE_IN" ? "border-red-400 bg-red-50 placeholder:text-red-400" : "border-slate-200"}`}
                />
                {nameErr && orderType === "DINE_IN" && <p className="text-xs text-red-500 mt-1 ml-1">Nama pelanggan wajib diisi</p>}
              </div>
            </div>
          </div>

          {/* Hanya daftar item dan pengaturan diskon yang bergulir. Ringkasan
              total serta tombol pembayaran tetap menempel di bawah. */}
          <div className="mobile-cart-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Cart Items */}
          <div>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <ShoppingCart className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-slate-400 font-medium">Keranjang kosong</p>
                <p className="text-slate-300 text-sm">Klik produk untuk menambahkan</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {cart.map((item) => (
                  <div key={item.cartKey} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 text-sm truncate">{item.name}</div>
                        {item.modifiers.length > 0 && (
                          <div className="text-xs text-blue-600 mt-0.5">
                            {item.modifiers.map((m) => m.optionName).join(", ")}
                          </div>
                        )}
                        <div className="text-xs text-slate-500">{formatRp(item.price)} × {item.qty}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => updateQty(item.cartKey, -1)}
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:border-blue-300 transition-colors"
                        >
                          <Minus className="w-3 h-3 text-slate-500" />
                        </button>
                        <span className="w-6 text-center text-sm font-bold text-slate-900">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.cartKey, 1)}
                          className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="w-3 h-3 text-white" />
                        </button>
                        {canManualDiscount && (
                          <button
                            onClick={() => {
                              setCartDiscountId(cartDiscountId === item.cartKey ? null : item.cartKey)
                              setCartNoteId(null)
                            }}
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors text-xs font-bold ${item.itemDiscountValue > 0 ? "bg-green-50 border-green-300 text-green-600" : "bg-white border-slate-200 text-slate-400 hover:border-green-300"}`}
                            title="Diskon item"
                          >
                            %
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setCartNoteId(cartNoteId === item.cartKey ? null : item.cartKey)
                            setCartDiscountId(null)
                          }}
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:border-amber-300 transition-colors"
                        >
                          <StickyNote className="w-3 h-3 text-slate-400" />
                        </button>
                        <button
                          onClick={() => removeItem(item.cartKey)}
                          className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:border-red-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3 text-slate-400" />
                        </button>
                      </div>
                    </div>
                    {canManualDiscount && cartDiscountId === item.cartKey && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs shrink-0">
                          <button
                            onClick={() => updateItemDiscount(item.cartKey, "PERCENT", item.itemDiscountValue)}
                            className={`px-2.5 py-1.5 font-medium transition-colors ${item.itemDiscountType === "PERCENT" ? "bg-green-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                          >%</button>
                          <button
                            onClick={() => updateItemDiscount(item.cartKey, "AMOUNT", item.itemDiscountValue)}
                            className={`px-2.5 py-1.5 font-medium transition-colors ${item.itemDiscountType === "AMOUNT" ? "bg-green-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                          >Rp</button>
                        </div>
                        <StableDraftInput
                          type="number"
                          min="0"
                          placeholder="Nilai diskon"
                          value={item.itemDiscountValue || ""}
                          onCommit={(value) => updateItemDiscount(item.cartKey, item.itemDiscountType, Number(value) || 0)}
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-right bg-white"
                        />
                        {item.itemDiscountValue > 0 && (
                          <button onClick={() => updateItemDiscount(item.cartKey, "PERCENT", 0)} className="text-xs text-red-400 hover:text-red-600 shrink-0">Hapus</button>
                        )}
                      </div>
                    )}
                    {cartNoteId === item.cartKey && (
                      <input
                        type="text"
                        placeholder="Catatan (contoh: tanpa bawang)"
                        value={item.notes}
                        onChange={(e) => updateItemNote(item.cartKey, e.target.value)}
                        className="mt-2 w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    )}
                    <div className="text-right text-sm font-semibold text-slate-900 mt-1">
                      {calcItemDiscount(item) > 0 ? (
                        <span>
                          <span className="text-xs line-through text-slate-400 mr-1">{formatRp(item.price * item.qty)}</span>
                          <span className="text-green-600">{formatRp(item.price * item.qty - calcItemDiscount(item))}</span>
                        </span>
                      ) : formatRp(item.price * item.qty)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Order Summary + Discount */}
          {cart.length > 0 && (
            <div className="border-t border-slate-100 p-4 space-y-3 shrink-0">
              {/* Diskon — satu blok rapi */}
              {(applicableRules.length > 0 || (canManualDiscount && !discount.ruleId)) && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                <div className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Diskon</span>
                  {canManualDiscount && !discount.ruleId && (showDiscountInput || discount.value > 0) && (
                    <button
                      onClick={() => { setDiscount({ ...discount, value: 0, label: "", ruleId: null }); setShowDiscountInput(false) }}
                      className="ml-auto text-[11px] font-semibold text-slate-400 transition-colors hover:text-red-500"
                    >
                      Batal
                    </button>
                  )}
                </div>

              {/* Promo tersedia — daftar ringkas yang bisa dibuka */}
              {applicableRules.length > 0 && (
                <div>
                  <button
                    onClick={() => { setShowPromoList((open) => !open); setPromoQuery("") }}
                    className={`flex w-full items-center justify-between gap-2 border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 ${showPromoList ? "rounded-t-lg" : "rounded-lg"}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Promo tersedia</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-black text-white">{applicableRules.length}</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPromoList ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  {showPromoList && (() => {
                    const q = promoQuery.trim().toLowerCase()
                    const found = q ? applicableRules.filter((r) => r.name.toLowerCase().includes(q)) : applicableRules
                    return (
                      <div className="overflow-hidden rounded-b-lg border border-t-0 border-green-200 bg-white">
                        {applicableRules.length > 4 && (
                          <div className="relative border-b border-slate-100 p-1.5">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                              value={promoQuery}
                              onChange={(e) => setPromoQuery(e.target.value)}
                              placeholder="Cari promo..."
                              className="w-full rounded-md bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs outline-none transition focus:bg-white focus:ring-2 focus:ring-green-500/30"
                            />
                          </div>
                        )}
                        <div className="max-h-44 overflow-y-auto p-1">
                          {found.length === 0 ? (
                            <p className="px-2.5 py-6 text-center text-xs text-slate-400">Promo tidak ditemukan</p>
                          ) : found.map((rule) => (
                            <button
                              key={rule.id}
                              onClick={() => {
                                setDiscount({ type: rule.type, value: Number(rule.value), label: rule.name, ruleId: rule.id })
                                setShowPromoList(false)
                                setPromoQuery("")
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-green-50"
                            >
                              <span className="min-w-0 truncate text-slate-700">{rule.name}</span>
                              <span className="shrink-0 rounded-md bg-green-50 px-1.5 py-0.5 font-black text-green-700">
                                {rule.type === "PERCENT" ? `${rule.value}%` : formatRp(Number(rule.value))}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Diskon manual — tersembunyi sampai dibutuhkan */}
              {canManualDiscount && !discount.ruleId && !(showDiscountInput || discount.value > 0) && (
                <button
                  onClick={() => setShowDiscountInput(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600"
                >
                  <Plus className="h-3.5 w-3.5" /> Beri diskon manual
                </button>
              )}

              {/* Discount presets + input */}
              {canManualDiscount && !discount.ruleId && (showDiscountInput || discount.value > 0) && <div className="space-y-1.5">
                <div className="flex items-stretch gap-1.5">
                  <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs">
                    <button
                      onClick={() => setDiscount({ ...discount, type: "PERCENT", ruleId: null })}
                      className={`w-9 font-semibold transition-colors ${discount.type === "PERCENT" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    >%</button>
                    <button
                      onClick={() => setDiscount({ ...discount, type: "AMOUNT", ruleId: null })}
                      className={`w-9 border-l border-slate-200 font-semibold transition-colors ${discount.type === "AMOUNT" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    >Rp</button>
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <StableDraftInput
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="0"
                      value={discount.value || ""}
                      onCommit={(value) => setDiscount((previous) => ({ ...previous, value: Number(value) || 0, ruleId: null }))}
                      className="h-full w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-9 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      {discount.type === "PERCENT" ? "%" : "Rp"}
                    </span>
                  </div>
                </div>
                {/* Percent presets */}
                {discount.type === "PERCENT" && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 10, 20, 50].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setDiscount({ ...discount, value: pct, ruleId: null })}
                        className={`rounded-lg border py-1.5 text-xs font-semibold transition-colors ${discount.value === pct ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600"}`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                )}
                {/* Label */}
                {discount.value > 0 && (
                  <input
                    type="text"
                    placeholder="Alasan diskon (opsional, muncul di struk)"
                    value={discount.label}
                    onChange={(e) => setDiscount({ ...discount, label: e.target.value, ruleId: null })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                )}
              </div>}
              </div>
              )}

              {discount.ruleId && (
                <div className="flex items-center justify-between rounded-xl bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                  <span>Promo aktif: <strong>{discount.label}</strong></span>
                  <button onClick={() => setDiscount({ type: "PERCENT", value: 0, label: "", ruleId: null })} className="font-semibold hover:underline">Hapus</button>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Footer transaksi selalu terlihat, berapa pun jumlah item. */}
          {cart.length > 0 && (
            <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatRp(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between gap-3 text-green-600">
                    {/* Nama promo sudah tampil pada tanda "Promo aktif" di atas.
                        Diulang di sini, teksnya panjang dan mendorong nominal
                        sampai pecah jadi dua baris. Alasan diskon manual tetap
                        ditampilkan, tapi dipotong bila kepanjangan. */}
                    <span className="min-w-0 truncate">
                      Diskon{!discount.ruleId && discount.label ? ` (${discount.label})` : ""}
                    </span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">-{formatRp(discountAmount)}</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Pajak ({taxPercent}%)</span>
                    <span>{formatRp(taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-900 text-base pt-1 border-t border-slate-100">
                  <span>Total</span>
                  <span className="text-blue-600">{formatRp(chargeTotal)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                {shift && !heldOrderId && (
                  <button
                    onClick={handleHold}
                    disabled={holdingOrder}
                    className="flex items-center gap-1.5 px-4 py-3 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-600 font-medium rounded-2xl transition-colors text-sm shrink-0"
                    title="Tahan order sementara"
                  >
                    <Pause className="w-4 h-4" />
                    {holdingOrder ? "..." : "Tahan"}
                  </button>
                )}
                <button
                  onClick={openPaymentModal}
                  disabled={!shift || isCoolingDown}
                  className="flex-1 py-4 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-lg rounded-2xl transition-colors active:scale-95"
                >
                  {!shift ? "Buka Shift Dulu" : isCoolingDown ? `Ditahan ${cooldownLeft}s` : "BAYAR"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Open Shift Modal */}
      {showOpenShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowOpenShift(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Buka Shift</h2>
              <button onClick={() => setShowOpenShift(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Buka shift di <span className="text-red-500">*</span>
              </label>
              {locations.length === 1 ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  {locations[0].name}
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={openingLocationId}
                    onChange={(e) => { setOpeningLocationId(e.target.value); setOpenShiftError(null) }}
                    className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih outlet...</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Modal Awal (opsional)</label>
              <StableDraftInput
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={openingBalance.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                formatValue={(value) => value.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                onCommit={(value) => setOpeningBalance(value.replace(/\D/g, ""))}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {openShiftError && (
              <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{openShiftError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowOpenShift(false)}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleOpenShift}
                disabled={openingShift || !openingLocationId}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl"
              >
                {openingShift ? "Membuka..." : "Buka Shift"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => { setShowPaymentModal(false); setPayError(null) }} />
          <div className={`relative z-10 max-h-[calc(100%-3rem)] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100%-2rem)] ${
            paymentMethod === "CASH" ? "max-w-2xl" : "max-w-lg"
          }`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-5 sm:pt-5 sm:pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Pembayaran</h2>
                <p className="mt-0.5 text-xs text-slate-500">Pilih metode pembayaran pelanggan</p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} aria-label="Tutup pembayaran" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-slate-100 px-4 pb-3 sm:px-5 sm:pb-4">
              <div className="grid grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1" aria-label="Metode pembayaran">
                {([
                  { method: "CASH",     label: "Tunai" },
                  { method: "QRIS",     label: "QRIS" },
                  { method: "TRANSFER", label: "Transfer" },
                  { method: "GOFOOD",   label: "Online" },
                  { method: "OTHER",    label: "Lainnya" },
                ] as const).map(({ method, label }) => {
                  const isOnline = ["GOFOOD","GRABFOOD","SHOPEEFOOD"].includes(paymentMethod)
                  const active = method === "GOFOOD" ? isOnline : paymentMethod === method
                  return (
                    <button key={method}
                      onClick={() => { setPaymentMethod(method); setCashAmount(""); setPlatformOrderNumber(""); setPayError(null) }}
                      aria-pressed={active}
                      className={`min-w-0 whitespace-nowrap rounded-lg px-1 py-2 text-[11px] font-semibold transition-colors sm:text-xs ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
                    >{label}</button>
                  )
                })}
              </div>
            </div>

            {paymentStockIssues.length > 0 && (
              <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 sm:mx-5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">⚠</span>
                  <div>
                    <div className="font-semibold">Stok tidak cukup, tetapi pembayaran tetap bisa dilanjutkan.</div>
                    <div className="mt-0.5 text-xs text-amber-700">
                      {paymentStockIssues.map((issue) => `${issue.name}: tersedia ${issue.available}, dibutuhkan ${issue.needed}`).join(" · ")}. Kekurangan akan tercatat sebagai stok minus.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {["GOFOOD", "GRABFOOD", "SHOPEEFOOD"].includes(paymentMethod) ? (
              /* ── PESANAN ONLINE ── */
              <div className="flex flex-col gap-4 p-5">
                {/* Platform sub-selector */}
                <div className="flex gap-2">
                  {([
                    { m: "GOFOOD",    label: "GoFood",    color: "bg-red-500" },
                    { m: "GRABFOOD",  label: "GrabFood",  color: "bg-green-600" },
                    { m: "SHOPEEFOOD",label: "ShopeeFood",color: "bg-orange-500" },
                  ] as const).map(({ m, label, color }) => (
                    <button key={m}
                      onClick={() => { setPaymentMethod(m); setPlatformOrderNumber("") }}
                      className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
                        paymentMethod === m ? `${color} text-white` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >{label}</button>
                  ))}
                </div>

                <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Tagihan</div>
                    <div className="text-2xl font-bold text-slate-900 mt-0.5">{formatRp(chargeTotal)}</div>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white ${
                    paymentMethod === "GOFOOD" ? "bg-red-500" : paymentMethod === "GRABFOOD" ? "bg-green-600" : "bg-orange-500"
                  }`}>
                    {paymentMethod === "GOFOOD" ? "GF" : paymentMethod === "GRABFOOD" ? "GB" : "SF"}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">No. Order Platform <span className="text-slate-400 font-normal">(opsional)</span></label>
                  <input
                    type="text"
                    value={platformOrderNumber}
                    onChange={(e) => setPlatformOrderNumber(e.target.value)}
                    placeholder={`Contoh: ${paymentMethod === "GOFOOD" ? "GF-12345678" : paymentMethod === "GRABFOOD" ? "GB-ABCD1234" : "SF-87654321"}`}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">Nomor dari notifikasi {paymentMethod === "GOFOOD" ? "GoBiz" : paymentMethod === "GRABFOOD" ? "GrabMerchant" : "ShopeeFood"}</p>
                </div>

                <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-600">
                  Pembayaran di-settle oleh {paymentMethod === "GOFOOD" ? "GoFood" : paymentMethod === "GRABFOOD" ? "GrabFood" : "ShopeeFood"} ke rekening bisnis Anda
                </div>

                {payError && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>{payError}</span>
                  </div>
                )}
                <button onClick={handlePay} disabled={paying}
                  className="w-full rounded-xl bg-green-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400"
                >{paying ? "Memproses..." : "Konfirmasi Pembayaran"}</button>
              </div>

            ) : paymentMethod === "TRANSFER" ? (
              /* ── TRANSFER BANK ── */
              <div className="flex flex-col gap-4 p-5">
                <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Tagihan</div>
                    <div className="text-2xl font-bold text-slate-900 mt-0.5">{formatRp(chargeTotal)}</div>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  </div>
                </div>
                <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-600">
                  Pastikan transfer sudah diterima sebelum konfirmasi
                </div>
                {payError && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>{payError}</span>
                  </div>
                )}
                <button onClick={handlePay} disabled={paying}
                  className="w-full rounded-xl bg-green-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400"
                >{paying ? "Memproses..." : "Konfirmasi Transfer"}</button>
              </div>

            ) : paymentMethod === "OTHER" ? (
              /* ── LAINNYA ── */
              <div className="flex flex-col gap-4 p-5">
                <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Tagihan</div>
                    <div className="text-2xl font-bold text-slate-900 mt-0.5">{formatRp(chargeTotal)}</div>
                  </div>
                  <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
                    </svg>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Catatan <span className="text-slate-400 font-normal">(opsional)</span></label>
                  <input type="text" value={platformOrderNumber} onChange={(e) => setPlatformOrderNumber(e.target.value)}
                    placeholder="Contoh: kartu kredit, voucher, dll."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {payError && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>{payError}</span>
                  </div>
                )}
                <button onClick={handlePay} disabled={paying}
                  className="w-full rounded-xl bg-green-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400"
                >{paying ? "Memproses..." : "Konfirmasi Pembayaran"}</button>
              </div>

            ) : paymentMethod === "CASH" ? (
              /* ── TUNAI ── */
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_13rem]">
                {/* Bill info */}
                <div className="flex min-w-0 flex-col border-b border-slate-100 p-3 sm:border-b-0 sm:border-r sm:p-5">
                  <div className="hidden max-h-40 flex-1 space-y-1 overflow-y-auto text-sm sm:block">
                    {cart.map((item) => (
                      <div key={item.cartKey} className="flex justify-between text-slate-600">
                        <span className="truncate pr-2">{item.name} × {item.qty}{calcItemDiscount(item) > 0 ? <span className="text-green-600 text-xs ml-1">(-{item.itemDiscountType === "PERCENT" ? `${item.itemDiscountValue}%` : formatRp(item.itemDiscountValue)})</span> : null}</span>
                        <span className="shrink-0">{formatRp(item.price * item.qty - calcItemDiscount(item))}</span>
                      </div>
                    ))}
                    {discountAmount > 0 && (
                      <div className="flex justify-between gap-3 text-green-600 pt-1 border-t border-slate-100">
                        <span className="min-w-0 truncate">
                          Diskon{!discount.ruleId && discount.label ? ` (${discount.label})` : ""}
                        </span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">-{formatRp(discountAmount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="sm:mt-3 sm:border-t sm:border-slate-200 sm:pt-3">
                    <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
                      <span className="text-sm text-slate-500">Total Tagihan</span>
                      <span className="whitespace-nowrap text-xl font-bold tabular-nums text-slate-900">{formatRp(chargeTotal)}</span>
                    </div>

                    {/* Display uang diterima */}
                    <div className="mb-2 rounded-xl bg-slate-900 p-2.5 sm:mb-3 sm:p-4">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-400">Uang Diterima</span>
                        {cashAmountNum > 0 && (
                          <span className={`whitespace-nowrap font-medium sm:hidden ${change >= 0 ? "text-green-300" : "text-red-300"}`}>
                            {change >= 0 ? "Kembalian" : "Kurang"} {formatRp(Math.abs(change))}
                          </span>
                        )}
                      </div>
                      <div className="text-right text-2xl font-bold tabular-nums text-white sm:text-3xl">
                        {cashAmountNum > 0 ? formatRp(cashAmountNum) : <span className="text-slate-500">Rp 0</span>}
                      </div>
                    </div>

                    {/* Kembalian */}
                    <div className={`hidden items-center justify-between rounded-xl p-2 sm:flex sm:p-3 ${
                      cashAmountNum === 0 ? "bg-slate-50" :
                      change >= 0 ? "bg-green-50" : "bg-red-50"
                    }`}>
                      <span className={`text-sm font-medium ${
                        cashAmountNum === 0 ? "text-slate-400" :
                        change >= 0 ? "text-green-700" : "text-red-600"
                      }`}>
                        {cashAmountNum === 0 ? "Kembalian" : change >= 0 ? "Kembalian" : "Kurang"}
                      </span>
                      <span className={`text-lg font-bold ${
                        cashAmountNum === 0 ? "text-slate-300" :
                        change >= 0 ? "text-green-700" : "text-red-600"
                      }`}>
                        {cashAmountNum === 0 ? "—" : formatRp(Math.abs(change))}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Quick amounts and numpad */}
                <div className="flex min-w-0 flex-col gap-2 p-3 sm:p-4">
                  {/* Quick denominations */}
                  <div className="mb-1 grid grid-cols-3 gap-2 sm:grid-cols-2 sm:gap-1.5">
                    {[5000, 10000, 20000, 50000, 100000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setCashAmount(String(cashAmountNum + amt))}
                        className="min-h-9 rounded-lg bg-blue-50 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 sm:min-h-10"
                      >
                        +{amt >= 1000 ? `${amt / 1000}rb` : amt}
                      </button>
                    ))}
                    <button
                      onClick={() => setCashAmount(String(total))}
                      className="min-h-9 rounded-lg bg-amber-50 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 sm:min-h-10"
                    >
                      Pas
                    </button>
                  </div>

                  {/* Numpad */}
                  <div className="grid flex-1 grid-cols-3 gap-2 sm:gap-1.5">
                    {["1","2","3","4","5","6","7","8","9","000","0","⌫"].map((key) => (
                      <button
                        key={key}
                        onClick={() => {
                          if (key === "⌫") {
                            setCashAmount((prev) => prev.slice(0, -1))
                          } else {
                            setCashAmount((prev) => {
                              const next = prev + key
                              return next.replace(/^0+/, "") || "0"
                            })
                          }
                        }}
                        className={`min-h-11 rounded-xl py-2.5 text-base font-bold transition-colors sm:py-3.5 ${
                          key === "⌫"
                            ? "bg-red-50 hover:bg-red-100 text-red-500"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                        }`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sticky bottom-0 z-10 border-t border-slate-100 bg-white p-3 sm:col-span-2 sm:p-4">
                  {payError && (
                    <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      <span className="mt-0.5 shrink-0">⚠</span>
                      <span>{payError}</span>
                    </div>
                  )}
                  <button
                    onClick={handlePay}
                    disabled={paying || cashAmountNum < chargeTotal}
                    className="w-full rounded-xl bg-green-500 py-3 text-base font-bold text-white transition-colors hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 sm:py-3.5"
                  >
                    {paying ? "Memproses..." : "Konfirmasi Bayar"}
                  </button>
                </div>
              </div>
            ) : (
              /* ── QRIS ── */
              <div className="flex flex-col items-center gap-4 p-5">
                {/* Tagihan */}
                <div className="w-full bg-slate-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Tagihan</div>
                    <div className="text-2xl font-bold text-slate-900 mt-0.5">{formatRp(chargeTotal)}</div>
                  </div>
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3m0 4h4m-4-4v4m-4 0h4"/>
                    </svg>
                  </div>
                </div>

                {/* QR Code */}
                {dynamicQrUrl ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={dynamicQrUrl} alt="QRIS" className="h-52 w-52 object-contain sm:h-56 sm:w-56" />
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <div className="text-[11px] text-slate-400 font-medium">Nominal sudah termasuk dalam QR</div>
                    </div>
                  </div>
                ) : qrisImageUrl ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrisImageUrl} alt="QRIS" className="h-52 w-52 object-contain sm:h-56 sm:w-56" />
                    <div className="text-[11px] text-amber-500 font-medium">QR statis — customer input nominal manual</div>
                  </div>
                ) : (
                  <div className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-[10px] font-bold text-slate-500">
                      QRIS
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">QRIS belum tersedia</p>
                      <p className="text-xs text-slate-500">Unggah kode QR di Pengaturan untuk menampilkannya di sini.</p>
                    </div>
                  </div>
                )}

                {/* Info */}
                <div className="w-full flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-600">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
                  </svg>
                  {dynamicQrUrl || qrisImageUrl
                    ? "Tunjukkan QR ke pelanggan, lalu konfirmasi setelah pembayaran terlihat di rekening."
                    : "Konfirmasi manual hanya setelah pembayaran benar-benar terlihat di rekening."}
                </div>

                {payError && (
                  <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>{payError}</span>
                  </div>
                )}
                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full rounded-xl bg-green-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {paying ? "Memproses..." : "Konfirmasi Pembayaran Manual"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Held Orders Modal */}
      {showHeldModal && (() => {
        // Satu meja dapat dipakai pelanggan berikutnya sebelum tagihan lama lunas.
        const tableGroups: Record<string, HeldOrder[]> = {}
        const noTable: HeldOrder[] = []
        for (const o of heldOrders) {
          if (o.tableNumber) {
            const key = guestBillKey(o)
            ;(tableGroups[key] ??= []).push(o)
          } else {
            noTable.push(o)
          }
        }
        const tabCount = Object.keys(tableGroups).length + noTable.length

        function lanjutkanSingle(held: HeldOrder) {
          setCart(held.items.map(i => ({
            cartKey: `held::${i.id}`,
            productId: i.menuItemId ?? i.id,
            name: i.name,
            price: Number(i.price),
            qty: i.qty,
            itemDiscountType: "AMOUNT" as const,
            itemDiscountValue: Number(i.discount),
            notes: i.notes ?? "",
            modifiers: (i.modifiers ?? []).map(m => ({ groupId: "", groupName: m.groupName, optionId: "", optionName: m.optionName, price: m.price })),
          })))
          setHeldOrderId(held.id)
          setBatchHeldIds([])
          setHeldPayTotal(Number(held.total))
          if (held.tableNumber) setTableNumber(held.tableNumber)
          if (held.customerName) setCustomerName(held.customerName)
          if (Number(held.discountValue) > 0) {
            setDiscount({ type: (held.discountType ?? "PERCENT") as "PERCENT" | "AMOUNT", value: Number(held.discountValue), label: held.discountLabel ?? "", ruleId: null })
          }
          setPaymentMethod("CASH")
          setPayError(null)
          setShowHeldModal(false)
          setShowPaymentModal(true)
        }

        function lanjutkanTable(orders: HeldOrder[]) {
          const merged = orders.flatMap(held => held.items.map(i => ({
            cartKey: `held::${i.id}`,
            productId: i.menuItemId ?? i.id,
            name: i.name,
            price: Number(i.price),
            qty: i.qty,
            itemDiscountType: "AMOUNT" as const,
            itemDiscountValue: Number(i.discount),
            notes: i.notes ?? "",
            modifiers: (i.modifiers ?? []).map(m => ({ groupId: "", groupName: m.groupName, optionId: "", optionName: m.optionName, price: m.price })),
          })))
          setCart(merged)
          setHeldOrderId(null)
          setBatchHeldIds(orders.map(o => o.id))
          setHeldPayTotal(orders.reduce((s, o) => s + Number(o.total), 0))
          if (orders[0].tableNumber) setTableNumber(orders[0].tableNumber)
          if (orders[0].customerName) setCustomerName(orders[0].customerName)
          setPaymentMethod("CASH")
          setPayError(null)
          setShowHeldModal(false)
          setShowPaymentModal(true)
        }

        async function batalkanOrders(orders: HeldOrder[]) {
          await Promise.all(orders.map(o =>
            fetch(`/api/pos/orders/${o.id}/pay`, { method: "DELETE" })
          ))
          fetchHeldOrders()
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowHeldModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md z-10 overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Tab Aktif</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{tabCount} tab menunggu pembayaran</p>
                </div>
                <button onClick={() => setShowHeldModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100">
                {heldOrders.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">Belum ada tab aktif</div>
                ) : (
                  <>
                    {/* Tagihan per sesi pelanggan, meskipun mejanya sama. */}
                    {Object.entries(tableGroups).map(([table, orders]) => {
                      const tableTotal = orders.reduce((s, o) => s + Number(o.total), 0)
                      const allItems = orders.flatMap(o => o.items)
                      const latest = orders.reduce((a, b) => new Date(a.createdAt) > new Date(b.createdAt) ? a : b)
                      return (
                        <div key={table} className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm">{formatTableLabel(orders[0].tableNumber)}</span>
                                {[...new Set(orders.map(o => o.customerName).filter((n): n is string => Boolean(n)))].map((name) => (
                                  <span key={name} className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">{name}</span>
                                ))}
                                {orders.length > 1 && (
                                  <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">{orders.length} pesanan</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">
                                Terakhir {new Date(latest.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                {" · "}{allItems.reduce((s, i) => s + i.qty, 0)} item
                              </div>
                            </div>
                            <div className="font-bold text-slate-900 text-sm shrink-0">{formatRp(tableTotal)}</div>
                          </div>
                          {orders.length === 1 && (
                            <div className="text-xs text-slate-500 mb-3 line-clamp-2">
                              {allItems.map(i => `${i.qty}× ${i.name}`).join(", ")}
                            </div>
                          )}

                          {/* Pesanan tambahan pelanggan yang sama. */}
                          {orders.length > 1 && (
                            <div className="mb-3 space-y-1.5">
                              {orders.map((o) => (
                                <div key={o.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-700 truncate">
                                      {o.customerName ?? "Pelanggan"} · {formatRp(Number(o.total))}
                                    </p>
                                    <p className="text-[11px] text-slate-400 truncate">
                                      {o.items.map(i => `${i.qty}× ${i.name}`).join(", ")}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => lanjutkanSingle(o)}
                                    className="shrink-0 px-2.5 py-1 text-[11px] font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    Bayar
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => batalkanOrders(orders)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 border border-red-200 hover:bg-red-50 rounded-lg font-medium transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Batalkan
                            </button>
                            <button
                              onClick={() => orders.length === 1 ? lanjutkanSingle(orders[0]) : lanjutkanTable(orders)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                              <Play className="w-3 h-3" /> {orders.length > 1 ? "Bayar Gabung" : "Bayar Sekarang"}
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Order tanpa meja (takeaway/delivery/dll) */}
                    {noTable.map(held => (
                      <div key={held.id} className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">
                              {held.customerName ?? "Takeaway"}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {new Date(held.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                              {" · "}{held.items.length} item
                            </div>
                          </div>
                          <div className="font-bold text-slate-900 text-sm shrink-0">{formatRp(Number(held.total))}</div>
                        </div>
                        <div className="text-xs text-slate-500 mb-3 line-clamp-2">
                          {held.items.map(i => `${i.qty}× ${i.name}`).join(", ")}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              await fetch(`/api/pos/orders/${held.id}/pay`, { method: "DELETE" })
                              fetchHeldOrders()
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-500 border border-red-200 hover:bg-red-50 rounded-lg font-medium transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Batalkan
                          </button>
                          <button
                            onClick={() => lanjutkanSingle(held)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            <Play className="w-3 h-3" /> Bayar Sekarang
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Popup masa tenang opname — transaksi ditahan */}
      {isCoolingDown && (
        <div className="fixed inset-0 z-60 flex items-center justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-amber-200 overflow-hidden">
            <div className="bg-amber-500 px-5 py-3 flex items-center gap-2 text-white">
              <Pause className="w-4 h-4" />
              <span className="font-bold text-sm">Transaksi ditahan sebentar</span>
            </div>
            <div className="px-5 py-5 text-center">
              <p className="text-sm text-slate-600">Opname baru saja disimpan di outlet ini. Tunggu sampai data stok benar-benar masuk.</p>
              <div className="my-3 text-4xl font-black text-amber-600 tabular-nums">{cooldownLeft}s</div>
              <p className="text-xs text-slate-400">Tombol bayar aktif lagi otomatis setelah hitungan selesai.</p>
            </div>
          </div>
        </div>
      )}

      {/* QR Incoming Orders Panel */}
      {showQrPanel && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowQrPanel(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-slate-900">Pesanan Masuk</h2>
                {qrOrders.length > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{qrOrders.length}</span>
                )}
              </div>
              <button onClick={() => setShowQrPanel(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            {holdToast && (
              <div role="status" className={`mx-5 mt-3 shrink-0 rounded-xl px-3 py-2 text-xs font-medium ${holdToast.startsWith("Gagal") || holdToast.startsWith("Tidak") ? "border border-red-200 bg-red-50 text-red-800" : "border border-green-200 bg-green-50 text-green-800"}`}>
                {holdToast}
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {qrOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                  <UtensilsCrossed className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-slate-400 font-medium text-sm">Belum ada pesanan masuk</p>
                  <p className="text-slate-300 text-xs mt-1">Pesanan dari QR menu akan muncul di sini</p>
                </div>
              ) : (
                <div>
                  {/* Pilih semua */}
                  <label className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 text-xs font-semibold text-slate-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={qrOrders.length > 0 && qrOrders.every(o => selectedQrIds.includes(o.id))}
                      onChange={(e) => setSelectedQrIds(e.target.checked ? qrOrders.map(o => o.id) : [])}
                      className="h-4 w-4 accent-blue-600"
                    />
                    Pilih semua ({qrOrders.length})
                  </label>

                  {/* Tiap pesanan tampil sendiri-sendiri — bisa dipilih via checkbox */}
                  <div className="divide-y divide-slate-100">
                    {qrOrders.map((o) => {
                      const checked = selectedQrIds.includes(o.id)
                      const itemCount = o.items.reduce((s, i) => s + i.qty, 0)
                      return (
                        <label
                          key={o.id}
                          className={`flex gap-3 px-5 py-3.5 cursor-pointer transition-colors ${checked ? "bg-blue-50/60" : "hover:bg-slate-50"}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedQrIds(prev => prev.includes(o.id) ? prev.filter(id => id !== o.id) : [...prev, o.id])}
                            className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {o.tableNumber ? (
                                  <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">{formatTableLabel(o.tableNumber)}</span>
                                ) : (
                                  <span className="bg-slate-200 text-slate-600 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0">Tanpa Meja</span>
                                )}
                                <span className="font-semibold text-slate-800 text-sm truncate">{o.customerName ?? "Pelanggan"}</span>
                              </div>
                              <span className="font-black text-slate-900 text-sm shrink-0">{formatRp(Number(o.total))}</span>
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {new Date(o.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} · {itemCount} item
                            </div>
                            <div className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 space-y-0.5">
                              {o.items.map((item) => (
                                <div key={item.id} className="flex justify-between text-xs text-slate-600">
                                  <span>{item.qty}× {item.name}</span>
                                  <span className="text-slate-400">{formatRp(Number(item.price) * item.qty)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Aksi untuk pesanan terpilih */}
            {qrOrders.length > 0 && (() => {
              const selected = qrOrders.filter(o => selectedQrIds.includes(o.id))
              const n = selected.length
              return (
                <div className="border-t border-slate-100 px-5 py-3 flex gap-2 shrink-0">
                  <button
                    onClick={() => setTolakConfirm(selected)}
                    disabled={n === 0}
                    className="px-4 py-2.5 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:hover:bg-red-50 text-red-600 text-sm font-bold rounded-xl transition-colors border border-red-200"
                  >
                    Tolak{n > 0 ? ` (${n})` : ""}
                  </button>
                  <button
                    onClick={() => prosesQrOrders(selected)}
                    disabled={n === 0}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    {n > 0 ? `Proses (${n})` : "Pilih pesanan untuk diproses"}
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Tolak Confirmation Dialog */}
      {tolakConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !tolaking && setTolakConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6">
            <h3 className="font-bold text-slate-900 text-base mb-1">Tolak pesanan ini?</h3>
            <p className="text-sm text-slate-500 mb-4">
              {tolakConfirm[0]?.tableNumber
                ? `${tolakConfirm.length > 1 ? `${tolakConfirm.length} pesanan dari ${formatTableLabel(tolakConfirm[0].tableNumber)}` : `Pesanan dari ${formatTableLabel(tolakConfirm[0].tableNumber)}`} akan dibatalkan dan tidak bisa dikembalikan.`
                : "Pesanan ini akan dibatalkan dan tidak bisa dikembalikan."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setTolakConfirm(null)}
                disabled={tolaking}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmTolak}
                disabled={tolaking}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-40 transition-colors"
              >
                {tolaking ? "Menolak..." : "Ya, Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastOrder && (() => {
        const waLines = [
          `*${sessionUser?.businessName ?? "Pantau"}*`,
          lastOrder.location?.name ?? "",
          ...(lastOrder.location?.address ? [lastOrder.location.address] : []),
          ``,
          `No. Struk: ${lastOrder.orderNumber}`,
          lastOrder.paidAt ? new Date(lastOrder.paidAt).toLocaleString("id-ID") : "",
          ...(lastOrder.tableNumber ? [`Meja: ${lastOrder.tableNumber}`] : []),
          ...(lastOrder.customerName ? [`Pelanggan: ${lastOrder.customerName}`] : []),
          `--------------------------------`,
          ...lastOrder.items.map((i) => `${i.qty}x ${i.name}${" ".repeat(Math.max(1, 24 - i.name.length - String(i.qty).length))}${formatRp(i.subtotal)}`),
          `--------------------------------`,
          ...(Number(lastOrder.discountAmount) > 0 ? [`Diskon${lastOrder.discountLabel ? ` (${lastOrder.discountLabel})` : ""}              -${formatRp(Number(lastOrder.discountAmount))}`] : []),
          ...(Number(lastOrder.taxAmount) > 0 ? [`Pajak                ${formatRp(Number(lastOrder.taxAmount))}`] : []),
          `*TOTAL               ${formatRp(Number(lastOrder.total))}*`,
          `--------------------------------`,
          `Terima kasih! 🙏`,
        ]
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70" />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs z-10 overflow-hidden">

              {/* Thermal paper area */}
              <div
                className={`px-6 pb-4 max-h-[70vh] overflow-y-auto ${receiptLogoUrl ? "pt-6" : "pt-3"}`}
                id="receipt-content"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
              >

                {/* Header — logo + nama bisnis + outlet + alamat */}
                <div className="text-center mb-4">
                  {receiptLogoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={receiptLogoUrl}
                      alt=""
                      className="h-14 w-auto object-contain mx-auto mb-2"
                      onError={() => setReceiptLogoUrl(null)}
                    />
                  )}
                  <div className="text-base font-black tracking-wide uppercase">{sessionUser?.businessName ?? "Pantau"}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{lastOrder.location?.name}</div>
                  {lastOrder.location?.address && (
                    <div className="text-xs text-slate-500 mt-0.5 leading-tight">{lastOrder.location.address}</div>
                  )}
                </div>

                <div className="border-t border-dashed border-slate-300 my-3" />

                {/* Meta */}
                <div className="text-xs text-slate-500 space-y-0.5 text-center">
                  <div className="font-semibold text-slate-700">{lastOrder.orderNumber}</div>
                  <div>{lastOrder.paidAt ? new Date(lastOrder.paidAt).toLocaleString("id-ID") : ""}</div>
                  {lastOrder.cashier?.name && <div>Kasir: {lastOrder.cashier.name}</div>}
                  {lastOrder.tableNumber && <div>Meja: {lastOrder.tableNumber}</div>}
                  {lastOrder.customerName && <div>Pelanggan: {lastOrder.customerName}</div>}
                </div>

                <div className="border-t border-dashed border-slate-300 my-3" />

                {/* Items */}
                <div className="space-y-2">
                  {lastOrder.items.map((item) => (
                    <div key={item.id}>
                      <div className="flex justify-between items-start text-xs">
                        <span className="text-slate-900 font-medium flex-1 pr-2 leading-tight">{item.name}</span>
                        <span className="text-slate-900 font-semibold shrink-0">{formatRp(item.subtotal)}</span>
                      </div>
                      {item.modifiers?.length > 0 && (
                        <div className="text-xs text-slate-400 italic">
                          {item.modifiers.map((m) => m.optionName).join(", ")}
                        </div>
                      )}
                      <div className="text-xs text-slate-400">{item.qty} × {formatRp(item.price)}{Number(item.discount) > 0 && ` − ${formatRp(item.discount)}`}</div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed border-slate-300 my-3" />

                {/* Totals — hanya tampil subtotal kalau ada diskon/pajak */}
                <div className="space-y-1 text-xs">
                  {(Number(lastOrder.discountAmount) > 0 || Number(lastOrder.taxAmount) > 0) && (
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span>{formatRp(Number(lastOrder.subtotal))}</span>
                    </div>
                  )}
                  {Number(lastOrder.discountAmount) > 0 && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Diskon</span>
                      <span>-{formatRp(Number(lastOrder.discountAmount))}</span>
                    </div>
                  )}
                  {Number(lastOrder.taxAmount) > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>Pajak</span>
                      <span>{formatRp(Number(lastOrder.taxAmount))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-900 font-black text-sm pt-1">
                    <span>TOTAL</span>
                    <span>{formatRp(Number(lastOrder.total))}</span>
                  </div>
                  {lastOrder.payments?.[0] && (
                    <>
                      <div className="flex justify-between text-slate-500 pt-1">
                        <span>Bayar ({PAYMENT_LABELS[lastOrder.payments[0].method] ?? lastOrder.payments[0].method})</span>
                        <span>{formatRp(Number(lastOrder.payments[0].amount))}</span>
                      </div>
                      {Number(lastOrder.payments[0].change) > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Kembali</span>
                          <span>{formatRp(Number(lastOrder.payments[0].change))}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="border-t border-dashed border-slate-300 my-3" />

                {/* Footer */}
                <div className="text-center text-xs text-slate-500 pb-1 space-y-1">
                  {(receiptWifiName || receiptWifiPassword) && (
                    <div className="border border-dashed border-slate-200 rounded px-3 py-1.5 text-slate-500">
                      WiFi: <span className="font-semibold text-slate-700">{receiptWifiName}</span>
                      {receiptWifiPassword && <> · Pass: <span className="font-semibold text-slate-700">{receiptWifiPassword}</span></>}
                    </div>
                  )}
                  <div className="font-semibold text-slate-700 pt-2">{receiptFooterText || "Terima kasih!"}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 pt-2 space-y-2 border-t border-slate-100">
                {isBluetoothPrintingSupported() && (
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-xs text-slate-400 truncate pr-2">
                      {printer ? `Printer: ${thermalPrinterName(printer)}` : "Printer belum terhubung"}
                    </span>
                    <div className="shrink-0 flex items-center gap-3">
                      {printer && (
                        <button
                          onClick={handleTestPrinter}
                          disabled={printerBusy}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                        >
                          Tes
                        </button>
                      )}
                      <button
                        onClick={handleConnectPrinter}
                        disabled={printerBusy}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                      >
                        <Bluetooth className="w-3 h-3" />
                        {printer ? "Ganti" : "Hubungkan"}
                      </button>
                    </div>
                  </div>
                )}
                {printerBusy && printerStage && (
                  <div className="flex items-center justify-between gap-2 px-1 pb-1">
                    <span className="text-xs text-slate-400 truncate">{printerStage}</span>
                    <button
                      onClick={receiptPrinter.cancel}
                      className="shrink-0 text-xs font-semibold text-red-500 hover:text-red-600"
                    >
                      Batalkan
                    </button>
                  </div>
                )}
                {printerError && <p className="text-xs text-red-500 px-1 pb-1">{printerError}</p>}
                {printerNotice && !printerBusy && <p className="text-xs text-emerald-600 px-1 pb-1">{printerNotice}</p>}
                <button
                  onClick={() => handlePrint()}
                  disabled={printerBusy}
                  className="w-full flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-wait text-slate-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
                >
                  <Printer className={`w-4 h-4 ${printerBusy ? "animate-pulse" : ""}`} />
                  {printerBusy ? "Mengirim ke printer..." : printer ? "Cetak via Bluetooth" : "Cetak Struk"}
                </button>
                <button
                  onClick={resetOrder}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
                >
                  Pesanan Baru
                </button>
              </div>

            </div>
          </div>
        )
      })()}
    </div>
  )
}
