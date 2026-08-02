"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
  ChevronDown,
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
} from "lucide-react"
import Link from "next/link"
import { signOut } from "next-auth/react"
import QRCode from "qrcode"
import { makeQrisDynamic } from "@/lib/qris"

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

type Shift = {
  id: string
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

export default function POSPage() {
  const { data: session } = useSession()
  const sessionUser = session?.user as {
    name?: string
    organizationId?: string
    businessName?: string
    role?: string
    locationIds?: string[]
  } | undefined

  const isKasir = sessionUser?.role === "KASIR"

  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [locationDropdown, setLocationDropdown] = useState(false)
  const locationRef = useRef<HTMLDivElement>(null)

  const [products, setProducts] = useState<Product[]>([])
  const [shift, setShift] = useState<Shift | null>(null)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingShift, setLoadingShift] = useState(false)

  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("Semua")

  const [cart, setCart] = useState<CartItem[]>([])
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

  const [showOpenShift, setShowOpenShift] = useState(false)
  const [openingBalance, setOpeningBalance] = useState("")
  const [openingShift, setOpeningShift] = useState(false)

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([])
  const [heldOrderId, setHeldOrderId] = useState<string | null>(null)
  const [batchHeldIds, setBatchHeldIds] = useState<string[]>([])
  const [showHeldModal, setShowHeldModal] = useState(false)
  const [holdingOrder, setHoldingOrder] = useState(false)

  const [qrOrders, setQrOrders] = useState<QrOrder[]>([])
  const [showQrPanel, setShowQrPanel] = useState(false)
  const [tolakConfirm, setTolakConfirm] = useState<QrOrder[] | null>(null)
  const [tolaking, setTolaking] = useState(false)
  const prevQrCount = useRef(0)

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
    if (qrOrders.length > prevQrCount.current) playOrderNotif()
    prevQrCount.current = qrOrders.length
  }, [qrOrders.length])

  const [modifierModal, setModifierModal] = useState<Product | null>(null)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, SelectedModifier[]>>({})

  useEffect(() => { cartRef.current = cart }, [cart])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setLocationDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => {
    fetch("/api/organization").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.qrisImageUrl) setQrisImageUrl(d.qrisImageUrl)
      if (d?.qrisPayload) setQrisPayload(d.qrisPayload)
      if (d?.receiptLogoUrl) setReceiptLogoUrl(d.receiptLogoUrl)
      if (d?.receiptWifiName) setReceiptWifiName(d.receiptWifiName)
      if (d?.receiptWifiPassword) setReceiptWifiPassword(d.receiptWifiPassword)
      if (d?.receiptFooterText) setReceiptFooterText(d.receiptFooterText)
    })
    fetch("/api/discount-rules").then((r) => r.ok ? r.json() : []).then((rules: DiscountRule[]) => {
      setDiscountRules(rules.filter((r) => r.isActive))
    })
  }, [])

  useEffect(() => {
    async function fetchLocations() {
      const res = await fetch("/api/locations?type=OUTLET")
      if (res.ok) {
        const all: Location[] = await res.json()
        const ids = sessionUser?.locationIds ?? []
        const filtered = isKasir && ids.length > 0 ? all.filter((l) => ids.includes(l.id)) : all
        setLocations(filtered)
        if (filtered.length === 1) {
          setSelectedLocation(filtered[0])
        } else if (!isKasir && filtered.length > 0) {
          setSelectedLocation(filtered[0])
        }
      }
    }
    if (sessionUser !== undefined) fetchLocations()
  }, [isKasir, sessionUser?.locationIds?.join(",")])

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
    if (selectedLocation) {
      fetchShift(selectedLocation.id)
      fetchProducts(selectedLocation.id)
    }
  }, [selectedLocation, fetchShift, fetchProducts])

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

  function addToCart(product: Product, chosenModifiers: SelectedModifier[] = []) {
    const price = Number(product.sellPrice ?? 0)

    // Non-blocking warning saat menu belum punya resep — stok tidak akan ter-deduct
    if (product.recipeItems.length === 0) {
      if (noRecipeTimer.current) clearTimeout(noRecipeTimer.current)
      setNoRecipeToast(product.name)
      noRecipeTimer.current = setTimeout(() => setNoRecipeToast(null), 4000)
    }

    // If product has modifiers and none chosen yet → open modal
    if (product.modifierGroups.length > 0 && chosenModifiers.length === 0) {
      setSelectedModifiers({})
      setModifierModal(product)
      return
    }

    const modKey = chosenModifiers.map((m) => m.optionId).sort().join("|")
    const cartKey = `${product.id}::${modKey}`
    const modifierPriceTotal = chosenModifiers.reduce((s, m) => s + m.price, 0)
    const effectivePrice = price + modifierPriceTotal

    const doAdd = () => setCart((prev) => {
      const existing = prev.find((c) => c.cartKey === cartKey)
      if (existing) return prev.map((c) => c.cartKey === cartKey ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { cartKey, productId: product.id, name: product.name, price: effectivePrice, qty: 1, itemDiscountType: "PERCENT" as const, itemDiscountValue: 0, notes: "", modifiers: chosenModifiers }]
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
  const discountAmount =
    discount.type === "PERCENT"
      ? Math.round((subtotal * discount.value) / 100)
      : discount.value
  const applicableRules = discountRules.filter((r) => subtotal >= Number(r.minPurchase) && discount.value === 0)
  const afterDiscount = subtotal - discountAmount
  const taxAmount = Math.round((afterDiscount * taxPercent) / 100)
  const total = afterDiscount + taxAmount

  const cashAmountNum = Number(cashAmount.replace(/\D/g, "")) || 0
  const change = cashAmountNum - total

  // Auto-remove rule-based discount when cart total drops below minimum
  useEffect(() => {
    if (!discount.ruleId || discount.value === 0) return
    const rule = discountRules.find((r) => r.id === discount.ruleId)
    if (rule && subtotal < Number(rule.minPurchase)) {
      setDiscount({ type: "PERCENT", value: 0, label: "", ruleId: null })
    }
  }, [subtotal, discount.ruleId, discount.value, discountRules])

  // Generate dynamic QRIS with embedded amount per transaction
  useEffect(() => {
    if (!showPaymentModal || paymentMethod !== "QRIS" || !qrisPayload || total <= 0) {
      setDynamicQrUrl(null)
      return
    }
    try {
      const dynamicPayload = makeQrisDynamic(qrisPayload, total)
      QRCode.toDataURL(dynamicPayload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 512,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setDynamicQrUrl).catch(() => setDynamicQrUrl(null))
    } catch {
      setDynamicQrUrl(null)
    }
  }, [showPaymentModal, paymentMethod, qrisPayload, total])

  const fetchHeldOrders = useCallback(async () => {
    if (!selectedLocation) return
    try {
      const res = await fetch(`/api/pos/orders?status=HELD&locationId=${selectedLocation.id}`)
      if (res.ok) setHeldOrders(await res.json())
    } catch { /* ignore */ }
  }, [selectedLocation])

  useEffect(() => {
    fetchHeldOrders()
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
    fetchQrOrders()
    const interval = setInterval(fetchQrOrders, 15_000)
    return () => clearInterval(interval)
  }, [fetchQrOrders, shift])

  async function ambilQrOrder(order: QrOrder) {
    await fetch(`/api/pos/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shiftId: shift?.id ?? null }),
    })
    fetchQrOrders()
    fetchHeldOrders()
    setShowQrPanel(false)
    setHoldToast(`Pesanan Meja ${order.tableNumber ?? ""} sudah diambil — lihat Pesanan Ditahan`)
    setTimeout(() => setHoldToast(null), 3500)
  }

  async function ambilQrTable(orders: QrOrder[]) {
    await Promise.all(orders.map(o =>
      fetch(`/api/pos/orders/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: shift?.id ?? null }),
      })
    ))
    fetchQrOrders()
    fetchHeldOrders()
    setShowQrPanel(false)
    const tbl = orders[0]?.tableNumber
    setHoldToast(`${orders.length} pesanan Meja ${tbl ?? ""} sudah diambil — lihat Pesanan Ditahan`)
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
    fetchQrOrders()
  }

  const [holdToast, setHoldToast] = useState<string | null>(null)

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
            modifiers: c.modifiers.map((m) => ({ groupName: m.groupName, optionName: m.optionName, price: m.price })),
          })),
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
    if (orderType === "DINE_IN" && !batchHeldIds.length && !heldOrderId) {
      const tErr = !tableNumber.trim()
      const nErr = !customerName.trim()
      if (tErr) setTableErr(true)
      if (nErr) setNameErr(true)
      if (tErr || nErr) return
    }
    if (paymentMethod === "CASH" && cashAmountNum < total) return

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
            payment: { method: paymentMethod, amount: paymentMethod === "CASH" ? cashAmountNum : total, reference: isDeliveryPlatform || paymentMethod === "OTHER" ? platformOrderNumber || null : paymentRef || null },
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
          setPayError(d.error ?? "Pembayaran gagal")
        }
        setPaying(false)
        return
      }

      const url = heldOrderId
        ? `/api/pos/orders/${heldOrderId}/pay`
        : "/api/pos/orders"
      const body = heldOrderId
        ? { payment: { method: paymentMethod, amount: total, reference: platformOrderNumber || paymentRef || null }, shiftId: shift?.id ?? null }
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
              modifiers: c.modifiers.map((m) => ({ groupName: m.groupName, optionName: m.optionName, price: m.price })),
            })),
            discountType: discount.value > 0 ? discount.type : null,
            discountValue: discount.value,
            discountLabel: discount.label || null,
            platformOrderNumber: isDeliveryPlatform ? platformOrderNumber || null : null,
            taxPercent, notes: null,
            payment: { method: paymentMethod, amount: paymentMethod === "CASH" ? cashAmountNum : total, reference: isDeliveryPlatform || paymentMethod === "OTHER" ? platformOrderNumber || null : paymentRef || null },
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
        setPayError(
          res.status >= 500
            ? "Terjadi kesalahan di server. Coba lagi atau hubungi admin."
            : (data.error ?? "Pembayaran gagal. Periksa data dan coba lagi.")
        )
      }
    } catch {
      setPayError("Tidak dapat terhubung ke server. Periksa koneksi internet.")
    } finally {
      setPaying(false)
    }
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
  }

  async function handleOpenShift() {
    if (!selectedLocation) return
    setOpeningShift(true)
    const res = await fetch("/api/pos/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId: selectedLocation.id,
        openingBalance: Number(openingBalance) || 0,
      }),
    })
    if (res.ok) {
      const s = await res.json()
      setShift(s)
      setShowOpenShift(false)
      setOpeningBalance("")
    }
    setOpeningShift(false)
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

  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      {/* Hold toast */}
      {holdToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 text-sm font-medium px-4 py-3 rounded-2xl shadow-lg max-w-sm w-full mx-4 ${holdToast.startsWith("Gagal") || holdToast.startsWith("Tidak") ? "bg-red-50 border border-red-200 text-red-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
          <Pause className="w-4 h-4 shrink-0" />
          <span>{holdToast}</span>
        </div>
      )}

      {/* No-recipe toast — non-blocking, auto-dismiss */}
      {noRecipeToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-sm font-medium px-4 py-3 rounded-2xl shadow-lg max-w-sm w-full mx-4 animate-in slide-in-from-bottom-2">
          <span className="text-base shrink-0">⚠️</span>
          <span><span className="font-semibold">{noRecipeToast}</span> belum ada resep — stok tidak akan ter-deduct. Bisa menyulitkan opname.</span>
          <button onClick={() => setNoRecipeToast(null)} className="ml-auto shrink-0 text-amber-400 hover:text-amber-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modifier selection modal */}
      {modifierModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
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
      <header className="h-14 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">P</div>
          <span className="text-white font-bold text-sm hidden sm:block">{sessionUser?.businessName ?? "Pantau"}</span>
        </div>

        {isKasir && locations.length <= 1 ? (
          <div className="flex items-center gap-1.5 text-slate-300 text-sm px-3 py-1.5 bg-slate-800 rounded-lg">
            <MapPin className="w-3.5 h-3.5" />
            <span>{selectedLocation?.name ?? "..."}</span>
          </div>
        ) : (
          <div ref={locationRef} className="relative">
            <button
              onClick={() => setLocationDropdown((o) => !o)}
              className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm px-3 py-1.5 bg-slate-800 rounded-lg transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{selectedLocation?.name ?? "Pilih Lokasi"}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {locationDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-xl z-50 w-48 overflow-hidden">
                {locations.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => { setSelectedLocation(loc); setLocationDropdown(false); setShift(null); setCart([]) }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      selectedLocation?.id === loc.id
                        ? "bg-blue-700 text-white"
                        : "text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {loc.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {shift && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-slate-300 font-medium">{shift.shiftNumber}</span>
            <span>· {elapsedTime(shift.openedAt)}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {shift && (
            <button
              onClick={() => { setShowQrPanel(true); fetchQrOrders() }}
              className="relative flex items-center gap-1.5 text-slate-300 hover:text-white text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
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
          <Link
            href={`/pos/orders${selectedLocation ? `?locationId=${selectedLocation.id}` : ""}`}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Riwayat</span>
          </Link>
          <Link
            href="/pos/shift"
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Shift</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
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
          <div className="flex-1 overflow-y-auto p-4">
            {!selectedLocation ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MapPin className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">Pilih lokasi terlebih dahulu</p>
              </div>
            ) : !shift && !loadingShift ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Clock className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-slate-700 font-semibold text-lg mb-1">Buka Shift Dulu</p>
                <p className="text-slate-400 text-sm mb-4">Kasir perlu membuka shift sebelum menerima pesanan</p>
                <button
                  onClick={() => setShowOpenShift(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Buka Shift
                </button>
              </div>
            ) : loadingProducts ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <ShoppingCart className="w-12 h-12 text-slate-300 mb-3" />
                <p className="text-slate-500">Tidak ada menu ditemukan</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredProducts.map((product) => {
                  const totalQty = cart.filter((c) => c.productId === product.id).reduce((s, c) => s + c.qty, 0)
                  const catColor = CATEGORY_COLORS[product.category ?? "Lainnya"] ?? "bg-slate-100 text-slate-600"
                  const hasModifiers = product.modifierGroups.length > 0
                  const lowStock = product.stockQty !== null && product.stockQty <= 0
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={`rounded-2xl p-4 text-left shadow-sm hover:shadow-md active:scale-95 transition-all border relative ${
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
                        QR {product.isAvailableForQr ? "Aktif" : "Mati"}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart Panel */}
        <div className="w-full md:w-80 xl:w-96 flex flex-col bg-white border-t md:border-t-0 md:border-l border-slate-200 shrink-0 max-h-64 md:max-h-none">

          {/* Held orders bar */}
          {heldOrders.length > 0 && (() => {
            const tabCount = new Set(heldOrders.filter(o => o.tableNumber).map(o => o.tableNumber)).size
                           + heldOrders.filter(o => !o.tableNumber).length
            return (
              <button
                onClick={() => setShowHeldModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 hover:bg-amber-100 transition-colors w-full text-left"
              >
                <Pause className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-xs font-semibold text-amber-700 flex-1">
                  {tabCount} tab aktif
                </span>
                <span className="text-xs text-amber-500 font-medium">Lihat →</span>
              </button>
            )
          })()}

          {/* Resume banner */}
          {(heldOrderId || batchHeldIds.length > 0) && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200">
              <Play className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="text-xs font-semibold text-blue-700 flex-1">
                {batchHeldIds.length > 1 ? `Tab Meja ${tableNumber} (${batchHeldIds.length} pesanan)` : "Melanjutkan order ditahan"}
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

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto">
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
                    {cartDiscountId === item.cartKey && (
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
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          placeholder="Nilai diskon"
                          value={item.itemDiscountValue || ""}
                          onChange={(e) => updateItemDiscount(item.cartKey, item.itemDiscountType, Number(e.target.value) || 0)}
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-right bg-white"
                        />
                        {item.itemDiscountValue > 0 && (
                          <button onClick={() => updateItemDiscount(item.cartKey, "PERCENT", 0)} className="text-xs text-red-400 hover:text-red-600 shrink-0">Hapus</button>
                        )}
                      </div>
                    )}
                    {cartNoteId === item.cartKey && (
                      <input
                        autoFocus
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
              {/* Auto-discount suggestions */}
              {applicableRules.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {applicableRules.map((rule) => (
                    <button
                      key={rule.id}
                      onClick={() => setDiscount({ type: rule.type, value: Number(rule.value), label: rule.name, ruleId: rule.id })}
                      className="flex items-center gap-1 px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 text-xs font-medium rounded-full hover:bg-green-100 transition-colors"
                    >
                      <span>✦</span>
                      {rule.name} ({rule.type === "PERCENT" ? `${rule.value}%` : formatRp(Number(rule.value))})
                    </button>
                  ))}
                </div>
              )}

              {/* Discount presets + input */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs shrink-0">
                    <button
                      onClick={() => setDiscount({ ...discount, type: "PERCENT" })}
                      className={`px-3 py-1.5 font-medium transition-colors ${discount.type === "PERCENT" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    >%</button>
                    <button
                      onClick={() => setDiscount({ ...discount, type: "AMOUNT" })}
                      className={`px-3 py-1.5 font-medium transition-colors ${discount.type === "AMOUNT" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    >Rp</button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    placeholder="Diskon order"
                    value={discount.value || ""}
                    onChange={(e) => setDiscount({ ...discount, value: Number(e.target.value) || 0 })}
                    className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>
                {/* Percent presets */}
                {discount.type === "PERCENT" && (
                  <div className="flex gap-1.5 pl-5">
                    {[5, 10, 20, 50].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setDiscount({ ...discount, value: pct })}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${discount.value === pct ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600"}`}
                      >
                        {pct}%
                      </button>
                    ))}
                    {discount.value > 0 && (
                      <button onClick={() => setDiscount({ ...discount, value: 0, label: "", ruleId: null })} className="px-2.5 py-1 text-xs font-medium rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-colors">Hapus</button>
                    )}
                  </div>
                )}
                {/* Label */}
                {discount.value > 0 && (
                  <input
                    type="text"
                    placeholder="Alasan diskon (opsional, muncul di struk)"
                    value={discount.label}
                    onChange={(e) => setDiscount({ ...discount, label: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                )}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatRp(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Diskon{discount.label ? ` (${discount.label})` : ""}</span>
                    <span>-{formatRp(discountAmount)}</span>
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
                  <span className="text-blue-600">{formatRp(total)}</span>
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
                  disabled={!shift}
                  className="flex-1 py-4 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-lg rounded-2xl transition-colors active:scale-95"
                >
                  {!shift ? "Buka Shift Dulu" : "BAYAR"}
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Modal Awal (opsional)</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowOpenShift(false)}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleOpenShift}
                disabled={openingShift}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => { setShowPaymentModal(false); setPayError(null) }} />
          <div className={`relative bg-white rounded-2xl shadow-2xl z-10 overflow-hidden w-full ${
            paymentMethod === "CASH" ? "max-w-2xl" : "max-w-md"
          }`}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Pembayaran</h2>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >{label}</button>
                  )
                })}
                <button onClick={() => setShowPaymentModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg ml-1">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            </div>

            {["GOFOOD", "GRABFOOD", "SHOPEEFOOD"].includes(paymentMethod) ? (
              /* ── PESANAN ONLINE ── */
              <div className="flex flex-col px-6 py-5 gap-4">
                {/* Platform sub-selector */}
                <div className="flex gap-2">
                  {([
                    { m: "GOFOOD",    label: "GoFood",    color: "bg-red-500" },
                    { m: "GRABFOOD",  label: "GrabFood",  color: "bg-green-600" },
                    { m: "SHOPEEFOOD",label: "ShopeeFood",color: "bg-orange-500" },
                  ] as const).map(({ m, label, color }) => (
                    <button key={m}
                      onClick={() => { setPaymentMethod(m); setPlatformOrderNumber("") }}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold text-white transition-colors ${
                        paymentMethod === m ? color : "bg-slate-200 text-slate-500"
                      }`}
                    >{label}</button>
                  ))}
                </div>

                <div className="bg-slate-50 rounded-2xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Tagihan</div>
                    <div className="text-2xl font-bold text-slate-900 mt-0.5">{formatRp(total)}</div>
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
                  className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base rounded-2xl transition-colors shadow-sm"
                >{paying ? "Memproses..." : "Konfirmasi Pembayaran"}</button>
              </div>

            ) : paymentMethod === "TRANSFER" ? (
              /* ── TRANSFER BANK ── */
              <div className="flex flex-col px-6 py-5 gap-4">
                <div className="bg-slate-50 rounded-2xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Tagihan</div>
                    <div className="text-2xl font-bold text-slate-900 mt-0.5">{formatRp(total)}</div>
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
                  className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base rounded-2xl transition-colors shadow-sm"
                >{paying ? "Memproses..." : "Konfirmasi Transfer"}</button>
              </div>

            ) : paymentMethod === "OTHER" ? (
              /* ── LAINNYA ── */
              <div className="flex flex-col px-6 py-5 gap-4">
                <div className="bg-slate-50 rounded-2xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Tagihan</div>
                    <div className="text-2xl font-bold text-slate-900 mt-0.5">{formatRp(total)}</div>
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
                  className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base rounded-2xl transition-colors shadow-sm"
                >{paying ? "Memproses..." : "Konfirmasi Pembayaran"}</button>
              </div>

            ) : paymentMethod === "CASH" ? (
              /* ── TUNAI: 2-column layout ── */
              <div className="flex">
                {/* Left: bill info */}
                <div className="flex-1 p-5 border-r border-slate-100 flex flex-col">
                  <div className="space-y-1 text-sm flex-1">
                    {cart.map((item) => (
                      <div key={item.cartKey} className="flex justify-between text-slate-600">
                        <span className="truncate pr-2">{item.name} × {item.qty}{calcItemDiscount(item) > 0 ? <span className="text-green-600 text-xs ml-1">(-{item.itemDiscountType === "PERCENT" ? `${item.itemDiscountValue}%` : formatRp(item.itemDiscountValue)})</span> : null}</span>
                        <span className="shrink-0">{formatRp(item.price * item.qty - calcItemDiscount(item))}</span>
                      </div>
                    ))}
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-green-600 pt-1 border-t border-slate-100">
                        <span>Diskon{discount.label ? ` (${discount.label})` : ""}</span>
                        <span>-{formatRp(discountAmount)}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-slate-500 text-sm">Total Tagihan</span>
                      <span className="text-xl font-bold text-slate-900">{formatRp(total)}</span>
                    </div>

                    {/* Display uang diterima */}
                    <div className="bg-slate-900 rounded-xl p-4 mb-3">
                      <div className="text-slate-400 text-xs mb-1">Uang Diterima</div>
                      <div className="text-white text-3xl font-bold text-right tabular-nums">
                        {cashAmountNum > 0 ? formatRp(cashAmountNum) : <span className="text-slate-500">Rp 0</span>}
                      </div>
                    </div>

                    {/* Kembalian */}
                    <div className={`rounded-xl p-3 flex justify-between items-center ${
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

                  {payError && (
                    <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-2">
                      <span className="shrink-0 mt-0.5">⚠</span>
                      <span>{payError}</span>
                    </div>
                  )}
                  <button
                    onClick={handlePay}
                    disabled={paying || cashAmountNum < total}
                    className="mt-3 w-full py-3.5 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base rounded-xl transition-colors"
                  >
                    {paying ? "Memproses..." : "Konfirmasi Bayar"}
                  </button>
                </div>

                {/* Right: numpad */}
                <div className="w-52 p-4 flex flex-col gap-2">
                  {/* Quick denominations */}
                  <div className="grid grid-cols-2 gap-1.5 mb-1">
                    {[5000, 10000, 20000, 50000, 100000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setCashAmount(String(cashAmountNum + amt))}
                        className="py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        +{amt >= 1000 ? `${amt / 1000}rb` : amt}
                      </button>
                    ))}
                    <button
                      onClick={() => setCashAmount(String(total))}
                      className="py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Pas
                    </button>
                  </div>

                  {/* Numpad */}
                  <div className="grid grid-cols-3 gap-1.5 flex-1">
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
                        className={`py-3.5 rounded-xl text-base font-bold transition-colors ${
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
              </div>
            ) : (
              /* ── QRIS ── */
              <div className="flex flex-col items-center px-6 py-5 gap-4">
                {/* Tagihan */}
                <div className="w-full bg-slate-50 rounded-2xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Tagihan</div>
                    <div className="text-2xl font-bold text-slate-900 mt-0.5">{formatRp(total)}</div>
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
                  <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-4 flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={dynamicQrUrl} alt="QRIS" className="w-64 h-64 object-contain" />
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <div className="text-[11px] text-slate-400 font-medium">Nominal sudah termasuk dalam QR</div>
                    </div>
                  </div>
                ) : qrisImageUrl ? (
                  <div className="bg-white rounded-3xl shadow-lg border border-slate-100 p-4 flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrisImageUrl} alt="QRIS" className="w-64 h-64 object-contain" />
                    <div className="text-[11px] text-amber-500 font-medium">QR statis — customer input nominal manual</div>
                  </div>
                ) : (
                  <div className="w-64 h-64 bg-slate-100 rounded-3xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-3">
                    <div className="w-14 h-14 bg-slate-200 rounded-2xl flex items-center justify-center text-slate-400 text-xs font-bold">
                      QRIS
                    </div>
                    <p className="text-xs text-slate-400 text-center px-6">
                      QRIS belum dikonfigurasi.<br/>Upload di Pengaturan.
                    </p>
                  </div>
                )}

                {/* Info */}
                <div className="w-full flex items-center gap-2 bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-600">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>
                  </svg>
                  Tunjukkan QR ini ke pelanggan, lalu tekan Konfirmasi setelah pembayaran berhasil
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
                  className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base rounded-2xl transition-colors shadow-sm"
                >
                  {paying ? "Memproses..." : "Konfirmasi Pembayaran"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Held Orders Modal */}
      {showHeldModal && (() => {
        // Grup berdasarkan guestSessionId (jika ada) atau tableNumber
        // Ini memastikan 2 customer beda di meja sama = 2 tab terpisah
        const tableGroups: Record<string, HeldOrder[]> = {}
        const noTable: HeldOrder[] = []
        for (const o of heldOrders) {
          if (o.tableNumber) {
            const key = o.guestSessionId ?? `table::${o.tableNumber}`
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
          if (held.tableNumber) setTableNumber(held.tableNumber)
          if (held.customerName) setCustomerName(held.customerName)
          if (Number(held.discountValue) > 0) {
            setDiscount({ type: (held.discountType ?? "PERCENT") as "PERCENT" | "AMOUNT", value: Number(held.discountValue), label: held.discountLabel ?? "", ruleId: null })
          }
          setShowHeldModal(false)
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
          if (orders[0].tableNumber) setTableNumber(orders[0].tableNumber)
          setShowHeldModal(false)
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
                    {/* Grup per meja */}
                    {Object.entries(tableGroups).map(([table, orders]) => {
                      const tableTotal = orders.reduce((s, o) => s + Number(o.total), 0)
                      const allItems = orders.flatMap(o => o.items)
                      const latest = orders.reduce((a, b) => new Date(a.createdAt) > new Date(b.createdAt) ? a : b)
                      return (
                        <div key={table} className="p-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm">Meja {orders[0].tableNumber}</span>
                                {orders[0].customerName && (
                                  <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">{orders[0].customerName}</span>
                                )}
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
                          <div className="text-xs text-slate-500 mb-3 line-clamp-2">
                            {allItems.map(i => `${i.qty}× ${i.name}`).join(", ")}
                          </div>
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
                              <Play className="w-3 h-3" /> Bayar Sekarang
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
            <div className="flex-1 overflow-y-auto">
              {qrOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                  <UtensilsCrossed className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-slate-400 font-medium text-sm">Belum ada pesanan masuk</p>
                  <p className="text-slate-300 text-xs mt-1">Pesanan dari QR menu akan muncul di sini</p>
                </div>
              ) : (() => {
                // Group by tableNumber so all orders from one table form a single tab
                const groups: Record<string, QrOrder[]> = {}
                for (const o of qrOrders) {
                  const key = o.tableNumber ?? "__none__"
                  ;(groups[key] ??= []).push(o)
                }
                return (
                  <div className="divide-y divide-slate-100">
                    {Object.entries(groups).map(([tableKey, orders]) => {
                      const tableTotal = orders.reduce((s, o) => s + Number(o.total), 0)
                      const allItems = orders.flatMap(o => o.items)
                      const isMulti = orders.length > 1
                      return (
                        <div key={tableKey} className="px-5 py-4">
                          {/* Table header */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {tableKey !== "__none__" ? (
                                <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">Meja {tableKey}</span>
                              ) : (
                                <span className="bg-slate-200 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full">Tanpa Meja</span>
                              )}
                              {isMulti && (
                                <span className="text-xs text-slate-400">{orders.length} pesanan</span>
                              )}
                            </div>
                            <span className="font-black text-slate-900 text-sm">{formatRp(tableTotal)}</span>
                          </div>

                          {/* All items combined */}
                          <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-3 space-y-1">
                            {allItems.map((item) => (
                              <div key={item.id} className="flex justify-between text-xs text-slate-600">
                                <span>{item.qty}× {item.name}</span>
                                <span className="text-slate-400">{formatRp(Number(item.price) * item.qty)}</span>
                              </div>
                            ))}
                          </div>

                          {/* Per-order timestamps for multi-order tables */}
                          {isMulti && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {orders.map(o => (
                                <span key={o.id} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                                  {new Date(o.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            {isMulti ? (
                              <button
                                onClick={() => ambilQrTable(orders)}
                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
                              >
                                Ambil Semua
                              </button>
                            ) : (
                              <button
                                onClick={() => ambilQrOrder(orders[0])}
                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
                              >
                                Ambil
                              </button>
                            )}
                            <button
                              onClick={() => setTolakConfirm(orders)}
                              className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold rounded-xl transition-colors border border-red-200"
                            >
                              Tolak
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
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
                ? `${tolakConfirm.length > 1 ? `${tolakConfirm.length} pesanan dari Meja ${tolakConfirm[0].tableNumber}` : `Pesanan dari Meja ${tolakConfirm[0].tableNumber}`} akan dibatalkan dan tidak bisa dikembalikan.`
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
              <div className="px-6 pt-6 pb-4 max-h-[70vh] overflow-y-auto" id="receipt-content" style={{ fontFamily: "'Courier New', Courier, monospace" }}>

                {/* Header — logo + nama bisnis + outlet + alamat */}
                <div className="text-center mb-4">
                  {receiptLogoUrl && (
                    <img src={receiptLogoUrl} alt="Logo" className="h-14 w-auto object-contain mx-auto mb-2" />
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
                  <div className="font-semibold text-slate-700">{receiptFooterText || "Terima kasih!"}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 pt-2 space-y-2 border-t border-slate-100">
                <button
                  onClick={() => window.print()}
                  className="w-full flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Cetak Struk
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
