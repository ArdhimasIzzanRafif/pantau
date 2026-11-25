"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useCanEdit, DISABLED_ACTION_CLASS, NO_EDIT_PERMISSION_TITLE } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { useSession } from "next-auth/react"
import { Pagination } from "@/components/ui/pagination"
import { AppDatePicker } from "@/components/ui/app-date-picker"
import { FormAlert } from "@/components/ui/form-alert"
import { WarningModal } from "@/components/ui/warning-modal"
import { useConfirm } from "@/components/ui/use-confirm"
import { AppPortal } from "@/components/ui/app-portal"
import { StableDraftInput, StableDraftTextarea } from "@/components/ui/stable-draft-input"
import { compressImage } from "@/lib/compress-image"
import { OutletReplenishment, type Need } from "@/components/outlet-replenishment"
import { parseTransferQuantity } from "@/lib/transfer-quantity"
import { Plus, ArrowRight, CheckCircle, Clock, X, Package, Loader2, AlertTriangle, Camera, ShieldCheck, ChevronDown, FileText, RotateCcw, WandSparkles } from "lucide-react"

type Location = { id: string; name: string }
type Item = { id: string; name: string; unit: string; packSize: number | string | null; packUnit: string | null }
type Transfer = {
  id: string
  status: "PENDING" | "APPROVED" | "SENT" | "RECEIVED" | "REJECTED"
  reservationExpiresAt: string | null
  reservationOverdue: boolean
  createdAt: string
  notes: string | null
  createdById: string | null
  approvedById: string | null
  approvalNotes: string | null
  fromLocationId: string
  toLocationId: string
  autoReplenishment: boolean
  outletRequested: boolean
  needRejectionSnapshot?: { itemId: string } | null
  notificationStatus: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "UNCERTAIN" | "DEAD" | null
  notificationError: string | null
  fromLocation: { name: string }
  toLocation: { name: string }
  items: Array<{ id: string; quantity: number; requestedQuantity: number | null; availableQuantity?: number | null; sourceQuantity?: number | null; receivedQty: number | null; damagedQty: number | null; item: { name: string; unit: string; packSize?: number | string | null; packUnit?: string | null } }>
}

type ReceiveModalItem = {
  id: string
  name: string
  unit: string
  sentQty: number
  damagedQty: string
  missingQty: string
}

type ReceiveModal = {
  transferId: string
  fromLocation: string
  toLocation: string
  items: ReceiveModalItem[]
}
type ReviewModal = {
  transfer: Transfer
  action: "approve" | "reject"
}
type ReviewConditionItem = {
  id: string
  name: string
  unit: string
  sentQty: number
  damagedQty: string
  missingQty: string
}
type Row = { itemId: string; qty: string; inputUnit: "base" | "pack" }
type TransferTab = "shipping" | "history"
type LowStockTransferContext = {
  outlet: { id: string; name: string }
  warehouse: { id: string; name: string }
  alertIds: string[]
  lines: Array<{
    itemId: string
    itemName: string
    unit: string
    outletQuantity: number
    minimumQuantity: number
    warehouseAvailable: number
    suggestedQuantity: number
  }>
}

// `card` & `iconBox` mengikuti gaya kartu Barang Masuk: garis kiri berwarna sesuai status.
const statusConfig = {
  PENDING: { label: "Menunggu Persetujuan", color: "bg-yellow-100 text-yellow-700", icon: Clock, card: "border-amber-100 border-l-amber-400", iconBox: "bg-amber-100 text-amber-600" },
  // Disetujui berarti stoknya sudah dipesan untuk outlet ini, belum berangkat.
  APPROVED: { label: "Disetujui, Siap Dikirim", color: "bg-indigo-50 text-indigo-700", icon: Package, card: "border-indigo-100 border-l-indigo-500", iconBox: "bg-indigo-100 text-indigo-600" },
  SENT: { label: "Menunggu Penerimaan", color: "bg-blue-50 text-blue-700", icon: Clock, card: "border-blue-100 border-l-blue-500", iconBox: "bg-blue-100 text-blue-600" },
  RECEIVED: { label: "Diterima", color: "bg-green-100 text-green-700", icon: CheckCircle, card: "border-emerald-100 border-l-emerald-500", iconBox: "bg-emerald-100 text-emerald-600" },
  REJECTED: { label: "Ditolak", color: "bg-red-100 text-red-700", icon: X, card: "border-red-100 border-l-red-400", iconBox: "bg-red-100 text-red-600" },
}

function LowStockLinkChecking() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center px-4" aria-label="Memeriksa tautan stok">
      <div role="status" className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" />
        <div>
          <p className="font-semibold text-slate-900">Memeriksa tautan</p>
          <p className="mt-0.5 text-sm text-slate-500">Memastikan kebutuhan stok masih aktif…</p>
        </div>
      </div>
    </div>
  )
}

type InitialLowStockLinkState = "idle" | "checking" | "expired"

function TransferPageContent({ initialLowStockLinkState }: { initialLowStockLinkState: InitialLowStockLinkState }) {
  const { data: session, status: sessionStatus } = useSession()
  const sessionUser = session?.user as { id?: string; role?: string; locationIds?: string[] } | undefined
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const listRef = useRef<HTMLElement>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [inventoryItems, setInventoryItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedTab, setSelectedTab] = useState<TransferTab | null>(null)
  // Filter riwayat (sama seperti Barang Masuk): lokasi langsung berlaku,
  // tanggal baru berlaku setelah "Terapkan" supaya tidak memuat ulang tiap klik.
  const [filterLocation, setFilterLocation] = useState("")
  const [filterFrom, setFilterFrom] = useState("")
  const [filterTo, setFilterTo] = useState("")
  const [draftFilterFrom, setDraftFilterFrom] = useState("")
  const [draftFilterTo, setDraftFilterTo] = useState("")
  const fetchSequence = useRef(0)
  const [fromId, setFromId] = useState("")
  const [toId, setToId] = useState("")
  const [notes, setNotes] = useState("")
  const [rows, setRows] = useState<Row[]>([{ itemId: "", qty: "", inputUnit: "base" }])
  const [error, setError] = useState("")
  const [receiveModal, setReceiveModal] = useState<ReceiveModal | null>(null)
  const [receiptNotes, setReceiptNotes] = useState("")
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null)
  // Validasi yang menghalangi kiriman ditampilkan sebagai popup, bukan tombol mati:
  // tombol mati tidak memberi tahu apa yang kurang.
  const [warning, setWarning] = useState<{ title: string; messages: string[] } | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState("")
  const [rejectModal, setRejectModal] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectError, setRejectError] = useState("")
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewModal, setReviewModal] = useState<ReviewModal | null>(null)
  const [reviewConditions, setReviewConditions] = useState<ReviewConditionItem[]>([])
  const [reviewNotes, setReviewNotes] = useState("")
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>({})
  const [dispatchUnits, setDispatchUnits] = useState<Record<string, "base" | "pack">>({})
  const [dispatchStock, setDispatchStock] = useState<Record<string, number | null>>({})
  const [reviewError, setReviewError] = useState("")
  const [varianceResolution, setVarianceResolution] = useState<"RECORD_LOSS" | "RETURN_TO_SOURCE">("RECORD_LOSS")
  // allBalances: { [locationId]: { [itemId]: qty_in_base_unit } }
  const [allBalances, setAllBalances] = useState<Record<string, Record<string, number>>>({})
  const [lowStockAlertIds, setLowStockAlertIds] = useState<string[]>([])
  const [lowStockAvailable, setLowStockAvailable] = useState<Record<string, number>>({})
  const [lowStockDetails, setLowStockDetails] = useState<Record<string, { outlet: number; minimum: number; suggestion: number }>>({})
  const [lowStockLinkState, setLowStockLinkState] = useState<"idle" | "checking" | "valid" | "expired">(
    initialLowStockLinkState,
  )
  const deepLinkHandled = useRef(false)
  const [retryingNotificationId, setRetryingNotificationId] = useState<string | null>(null)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)
  const { ask, dialog } = useConfirm()

  const dialogOpen = Boolean(reviewModal || receiveModal || rejectModal)
  useEffect(() => {
    if (!dialogOpen) return
    const pageScroller = document.querySelector("main")
    const previousPageOverflow = pageScroller?.style.overflowY ?? ""
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    if (pageScroller) pageScroller.style.overflowY = "hidden"
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      if (pageScroller) pageScroller.style.overflowY = previousPageOverflow
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [dialogOpen])

  const stockBalances = allBalances[fromId] ?? {}
  const role = sessionUser?.role ?? ""
  // Owner/supervisor dapat membuat transfer manual; tautan stok outlet dari
  // Peringatan membuka form ini untuk gudang pemenuhan yang bersangkutan.
  const canRequestOutlet = ["OWNER", "SUPERVISOR"].includes(role)
  const activeTab = selectedTab ?? "shipping"
  const [needsRefresh, setNeedsRefresh] = useState(0)
  const [shippingNeeds, setShippingNeeds] = useState<Need[]>([])
  const [shippingOrder, setShippingOrder] = useState<Array<{ kind: "need" | "transfer"; id: string; itemId: string | null; locationId: string | null }>>([])
  const [shippingTotal, setShippingTotal] = useState(0)
  // Catatan: getEffectivePermissions() selalu memberi Supervisor TRANSFER=EDIT,
  // jadi pengaturan "Lihat" pada fitur ini hanya berlaku untuk Admin Gudang.
  const canEditTransfer = useCanEdit("TRANSFER")
  const canRequestTransfer = ["OWNER", "SUPERVISOR", "ADMIN_GUDANG"].includes(role)
  const canManageTransfer = ["OWNER", "SUPERVISOR"].includes(role)
  const sourceLocations = role === "OWNER"
    ? locations
    : locations.filter((location) => sessionUser?.locationIds?.includes(location.id))

  const fetchTransfers = useCallback(async (nextPage = 1, { silent = false } = {}) => {
    const sequence = ++fetchSequence.current
    if (!silent) setLoading(true)
    const p = new URLSearchParams({ page: String(nextPage), perPage: "5" })
    p.set("status", activeTab === "shipping" ? "PENDING,APPROVED,SENT" : "RECEIVED,REJECTED")
    if (filterLocation) p.set("locationId", filterLocation)
    if (filterFrom) p.set("from", filterFrom)
    if (filterTo) p.set("to", filterTo)
    try {
      const res = await fetch(activeTab === "shipping" ? `/api/replenishment?feed=true&page=${nextPage}` : `/api/transfers?${p}`)
      if (!res.ok) throw new Error("Gagal memuat transfer")
      const data = await res.json()
      if (sequence !== fetchSequence.current) return
      setTransfers(activeTab === "shipping" ? data.transfers : data.items)
      if (activeTab === "shipping") {
        setShippingNeeds(data.items)
        setShippingOrder(data.order)
        setShippingTotal(data.total)
      }
      setPage(data.page)
      setPages(data.pages)
      setStatusCounts(data.statusCounts ?? {})
    } catch {
      if (sequence === fetchSequence.current) setError("Daftar transfer belum dapat dimuat. Coba buka tab kembali.")
    } finally { if (sequence === fetchSequence.current) setLoading(false) }
  }, [activeTab, filterLocation, filterFrom, filterTo])

  async function fetchData() {
    const deepLink = new URLSearchParams(window.location.search)
    const lowStockKey = deepLink.get("lowStock")
    const requestedFrom = deepLink.get("new") === "1" ? deepLink.get("fromId") : null
    const requestedTo = deepLink.get("new") === "1" ? deepLink.get("toId") : null
    const requestedItems = deepLink.get("new") === "1"
      ? (deepLink.get("itemIds") ?? deepLink.get("itemId") ?? "").split(",").map((id) => id.trim()).filter(Boolean)
      : []
    const [lRes, iRes, bRes, contextRes] = await Promise.all([
      fetch("/api/locations"),
      fetch("/api/inventory"),
      fetch("/api/stock-balances"),
      lowStockKey
        ? fetch(`/api/alerts/transfer-context?alerts=${encodeURIComponent(lowStockKey)}`)
        : Promise.resolve(null),
    ])
    let stockContext: LowStockTransferContext | null = null
    if (contextRes) {
      if (contextRes.ok) {
        stockContext = await contextRes.json() as LowStockTransferContext
        setLowStockLinkState("valid")
        setLowStockAlertIds(stockContext.alertIds)
        setLowStockAvailable(Object.fromEntries(stockContext.lines.map((line) => [line.itemId, line.warehouseAvailable])))
        setLowStockDetails(Object.fromEntries(stockContext.lines.map((line) => [line.itemId, {
          outlet: line.outletQuantity,
          minimum: line.minimumQuantity,
          suggestion: line.suggestedQuantity,
        }])))
      } else {
        setLowStockAlertIds([])
        setLowStockAvailable({})
        setLowStockDetails({})
        if (contextRes.status === 409 || contextRes.status === 410) {
          // Jangan jatuhkan pengguna ke halaman transfer biasa. Tautan lama
          // berhenti di peringatan kedaluwarsa sampai pengguna kembali.
          setLowStockLinkState("expired")
          setShowNew(false)
          setError("")
        } else if (contextRes.status === 403) {
          const data = await contextRes.json().catch(() => null) as { error?: string } | null
          const cleanUrl = new URL(window.location.href)
          cleanUrl.searchParams.delete("lowStock")
          window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
          setLowStockLinkState("idle")
          setShowNew(false)
          setError(data?.error ?? "Tautan ini bukan untuk akun yang sedang digunakan.")
        } else {
          const data = await contextRes.json().catch(() => null) as { error?: string } | null
          setLowStockLinkState("idle")
          setError(data?.error ?? "Data stok dari tautan WA tidak dapat dimuat.")
        }
      }
    } else {
      setLowStockLinkState("idle")
      setLowStockAlertIds([])
      setLowStockAvailable({})
      setLowStockDetails({})
    }
    if (lRes.ok) {
      const locs = await lRes.json() as Location[]
      setLocations(locs)
      const sessionRole = sessionUser?.role ?? ""
      const allowedSources = sessionRole === "OWNER"
        ? locs
        : locs.filter((location: Location) => sessionUser?.locationIds?.includes(location.id))
      const contextFrom = stockContext?.warehouse.id ?? requestedFrom
      const contextTo = stockContext?.outlet.id ?? requestedTo
      const initialFrom = allowedSources.some((location: Location) => location.id === contextFrom)
        ? contextFrom!
        : allowedSources[0]?.id ?? ""
      setFromId(initialFrom)
      setToId(locs.some((location: Location) => location.id === contextTo && location.id !== initialFrom)
        ? contextTo!
        : locs.find((location: Location) => location.id !== initialFrom)?.id ?? "")
    }
    if (iRes.ok) {
      const loadedItems = await iRes.json() as Item[]
      setInventoryItems(loadedItems)
      if (stockContext) {
        const validLines = stockContext.lines.filter((line) => loadedItems.some((item) => item.id === line.itemId))
        setRows(validLines.map((line) => ({
          itemId: line.itemId,
          // Saran hanya menjadi informasi. Keputusan jumlah kirim tetap harus
          // diisi sendiri oleh penanggung jawab gudang.
          qty: "",
          inputUnit: "base",
        })))
      } else {
        const validRequestedItems = requestedItems.filter((id) => loadedItems.some((item) => item.id === id))
        if (validRequestedItems.length > 0) {
          setRows(validRequestedItems.map((itemId) => ({ itemId, qty: "", inputUnit: "base" })))
        }
      }
    }
    if (bRes.ok) {
      const balances = await bRes.json()
      const map: Record<string, Record<string, number>> = {}
      for (const b of balances) {
        if (!map[b.locationId]) map[b.locationId] = {}
        map[b.locationId][b.itemId] = Number(b.quantity)
      }
      setAllBalances(map)
    }
  }

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !showNew) return
    const timeoutId = window.setTimeout(() => { void fetchData() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [sessionStatus, showNew])

  // Tab menyaring di server, jadi daftar dimuat ulang saat tab berganti.
  useEffect(() => {
    if (sessionStatus !== "authenticated") return
    const timeoutId = window.setTimeout(() => { void fetchTransfers() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [sessionStatus, fetchTransfers])

  useEffect(() => {
    if (sessionStatus !== "authenticated" || deepLinkHandled.current) return
    const query = new URLSearchParams(window.location.search)
    if (query.has("lowStock") && initialLowStockLinkState === "expired") {
      deepLinkHandled.current = true
      return
    }
    if (query.get("new") === "1" || query.has("lowStock")) {
      const timeoutId = window.setTimeout(() => {
        // Dependensi sesi bisa berubah tepat setelah autentikasi. Tandai selesai
        // di dalam callback agar cleanup efek pertama tidak membuat tautan
        // dianggap sudah ditangani padahal form belum pernah dibuka.
        if (deepLinkHandled.current) return
        deepLinkHandled.current = true
        if (query.has("lowStock")) setLowStockLinkState("checking")
        setSelectedTab("shipping")
        setShowNew(true)
        setNotes("Pengiriman karena stok outlet mencapai ambang minimum")
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
    const transferId = query.get("transferId")
    if (!transferId) return
    deepLinkHandled.current = true
    void (async () => {
      const res = await fetch(`/api/transfers/${transferId}`)
      if (!res.ok) {
        setError("Transfer dari tautan WhatsApp tidak ditemukan atau tidak dapat diakses.")
        return
      }
      const transfer = await res.json() as Transfer
      setSelectedTab(["RECEIVED", "REJECTED"].includes(transfer.status) ? "history" : "shipping")
      const allowed = transfer.status === "PENDING"
        && (!transfer.autoReplenishment || transfer.outletRequested)
        && (role === "OWNER" || (sessionUser?.locationIds ?? []).includes(transfer.fromLocationId))
        && (["OWNER", "SUPERVISOR"].includes(role) || (role === "ADMIN_GUDANG" && transfer.autoReplenishment))
      if (allowed) openReviewModal(transfer, "approve")
      // Dari Barang Masuk: kiriman yang sudah berangkat langsung dibuka di
      // form Konfirmasi Penerimaan (foto wajib). Server tetap memeriksa hak.
      const bolehTerima = transfer.status === "SENT"
        && ["OWNER", "SUPERVISOR"].includes(role)
        && (role === "OWNER" || (sessionUser?.locationIds ?? []).includes(transfer.toLocationId))
      if (bolehTerima) openReceiveModal(transfer)
    })()
  }, [sessionStatus, role, sessionUser?.locationIds, initialLowStockLinkState])

  // Transfer yang diajukan atau dikonfirmasi pengguna lain ikut tampil tanpa
  // perlu memuat ulang halaman.
  useLiveRefresh(() => { void fetchTransfers(page, { silent: true }) }, 3000)

  // Aksi transfer memindahkan stok, jadi saldo ikut dimuat ulang bersama daftarnya.
  async function reloadAll() {
    setNeedsRefresh((value) => value + 1)
    await Promise.all([fetchTransfers(page), ...(showNew ? [fetchData()] : [])])
  }

  function getItem(itemId: string): Item | undefined {
    return inventoryItems.find((it) => it.id === itemId)
  }

  function qtyInBase(row: Row): number {
    const q = Number(row.qty)
    if (!q || !row.itemId) return 0
    if (row.inputUnit === "pack") {
      const item = getItem(row.itemId)
      return q * Number(item?.packSize ?? 1)
    }
    return q
  }

  function receiveCondition(item: ReceiveModalItem) {
    const roundQty = (value: number) => Math.round(value * 1000) / 1000
    const damaged = roundQty(Number(item.damagedQty) || 0)
    const missing = roundQty(Number(item.missingQty) || 0)
    const good = roundQty(item.sentQty - damaged - missing)
    return {
      good: Math.max(0, good),
      damaged,
      missing,
      invalid: damaged < 0 || missing < 0 || good < 0,
    }
  }

  function reviewCondition(item: ReviewConditionItem) {
    const roundQty = (value: number) => Math.round(value * 1000) / 1000
    const damaged = roundQty(Number(item.damagedQty) || 0)
    const missing = roundQty(Number(item.missingQty) || 0)
    const good = roundQty(item.sentQty - damaged - missing)
    return {
      good: Math.max(0, good),
      damaged,
      missing,
      invalid: damaged < 0 || missing < 0 || good < 0,
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError("")
    try {
    if (fromId === toId) {
      setError("Lokasi asal dan tujuan tidak boleh sama")
      setSubmitting(false)
      return
    }
    const validRows = rows.filter((r) => r.itemId && Number(r.qty) > 0)
    if (!validRows.length) {
      setError("Tambahkan minimal 1 item")
      setSubmitting(false)
      return
    }
    const overStockRow = validRows.find((r) => {
      const availPcs = lowStockAvailable[r.itemId] ?? stockBalances[r.itemId] ?? 0
      return qtyInBase(r) > availPcs
    })
    if (overStockRow) {
      const item = getItem(overStockRow.itemId)
      const availPcs = lowStockAvailable[overStockRow.itemId] ?? stockBalances[overStockRow.itemId] ?? 0
      const packSize = item?.packSize
      const availDisplay = packSize
        ? `${availPcs} ${item?.unit} (= ${Math.floor(availPcs / Number(packSize))} ${item?.packUnit})`
        : `${availPcs} ${item?.unit}`
      setError(`Stok "${item?.name}" tidak cukup — tersedia ${availDisplay}`)
      setSubmitting(false)
      return
    }
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromLocationId: fromId,
        toLocationId: toId,
        notes: notes || null,
        items: validRows.map((r) => ({ itemId: r.itemId, quantity: qtyInBase(r) })),
        lowStockAlertIds,
      }),
    })
    if (res.ok) {
      setShowNew(false)
      setRows([{ itemId: "", qty: "", inputUnit: "base" }])
      setNotes("")
      setLowStockAlertIds([])
      setLowStockAvailable({})
      setLowStockDetails({})
      void reloadAll()
    } else {
      const d = await res.json()
      setError(d.error ?? "Gagal membuat transfer")
    }
    } catch {
      setError("Koneksi gagal, coba lagi")
    } finally {
      setSubmitting(false)
    }
  }

  function openReceiveModal(t: Transfer) {
    setReceiveModal({
      transferId: t.id,
      fromLocation: t.fromLocation.name,
      toLocation: t.toLocation.name,
      items: t.items.map((i) => ({
        id: i.id,
        name: i.item.name,
        unit: i.item.unit,
        sentQty: Number(i.quantity),
        damagedQty: "",
        missingQty: "",
      })),
    })
    setReceiptNotes("")
    setReceiptPhoto(null)
    setVarianceResolution("RECORD_LOSS")
  }

  function openReviewModal(transfer: Transfer, action: "approve" | "reject") {
    setReviewModal({ transfer, action })
    setDispatchQuantities(Object.fromEntries(transfer.items.map((item) => [item.id, String(item.quantity)])))
    setDispatchUnits({})
    setDispatchStock({})
    if (action === "approve" && transfer.outletRequested) {
      void fetch(`/api/transfers/${transfer.id}`).then((res) => res.ok ? res.json() : null).then((fresh: Transfer | null) => {
        if (fresh) setDispatchStock(Object.fromEntries(fresh.items.map((item) => [item.id, item.availableQuantity ?? null])))
      }).catch(() => { /* Server rechecks stock when approving. */ })
    }
    setReviewConditions(transfer.items.map((item) => ({
      id: item.id,
      name: item.item.name,
      unit: item.item.unit,
      sentQty: Number(item.quantity),
      damagedQty: "",
      missingQty: "",
    })))
    setReviewNotes("")
    setReviewError("")
    setReceiptPhoto(null)
  }

  function dispatchBaseQuantity(item: Transfer["items"][number]) {
    return Number((Number(dispatchQuantities[item.id]) * Number(dispatchUnits[item.id] === "pack" ? item.item.packSize ?? 1 : 1)).toFixed(3))
  }

  async function reviewTransfer(sudahDikonfirmasi = false) {
    if (!reviewModal) return
    const { transfer, action } = reviewModal
    const isAutomaticDispatch = action === "approve" && transfer.autoReplenishment
    if (isAutomaticDispatch) {
      const invalid = transfer.items.some((item) => parseTransferQuantity(dispatchQuantities[item.id]) == null || parseTransferQuantity(dispatchBaseQuantity(item)) == null)
      if (invalid) { setReviewError("Isi jumlah kirim lebih dari 0, maksimal 3 angka desimal."); return }
      const changed = transfer.items.some((item) => dispatchBaseQuantity(item) !== Number(item.requestedQuantity ?? item.quantity))
      if (changed && !reviewNotes.trim()) { setReviewError("Isi alasan jumlah kirim berbeda dari permintaan outlet."); return }
    }
    if (action === "reject" && !reviewNotes.trim()) {
      setWarning({ title: "Lengkapi dulu", messages: ["Alasan penolakan wajib diisi."] })
      return
    }
    const conditionInvalid = action === "approve" && !isAutomaticDispatch && reviewConditions.some((item) => reviewCondition(item).invalid)
    if (conditionInvalid) {
      setWarning({ title: "Jumlah tidak masuk akal", messages: ["Jumlah rusak dan tidak tiba tidak boleh melebihi jumlah request."] })
      return
    }
    const hasConditionIssue = action === "approve" && !isAutomaticDispatch && reviewConditions.some((item) => {
      const condition = reviewCondition(item)
      return condition.damaged > 0 || condition.missing > 0
    })
    const kurang: string[] = []
    if (action === "approve" && !isAutomaticDispatch && !receiptPhoto) kurang.push("Foto barang wajib diunggah sebelum konfirmasi.")
    if (hasConditionIssue && !reviewNotes.trim()) kurang.push("Catatan wajib diisi jika ada barang rusak atau tidak tiba.")
    if (kurang.length > 0) {
      setWarning({ title: "Lengkapi dulu", messages: kurang })
      return
    }
    // Pengaman salah input: tidak ada satu pun barang yang diterima baik.
    if (!sudahDikonfirmasi && action === "approve" && !isAutomaticDispatch
      && reviewConditions.length > 0 && reviewConditions.every((item) => reviewCondition(item).good <= 0)) {
      ask({
        title: "Semua barang dicatat bermasalah?",
        message: "Tidak ada barang yang dicatat diterima baik. Semuanya akan dicatat rusak/tidak tiba dan TIDAK menambah stok. Pastikan angka tidak salah kolom.",
        confirmLabel: "Ya, memang semua bermasalah",
        cancelLabel: "Periksa lagi",
        danger: true,
        onConfirm: () => reviewTransfer(true),
      })
      return
    }

    setReviewingId(transfer.id)
    setReviewError("")
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: reviewNotes.trim() || null,
          ...(isAutomaticDispatch ? { sentItems: transfer.items.map((item) => ({ id: item.id, quantity: dispatchQuantities[item.id], inputUnit: dispatchUnits[item.id] ?? "base" })) } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setReviewError(data.error ?? "Gagal memproses transfer")
        return
      }
      if (action === "approve" && !isAutomaticDispatch) {
        // Setujui kini hanya MENGUNCI stok. Untuk transfer manual yang
        // dikonfirmasi sekaligus diterima di sini, barang dikirim dulu
        // (stok gudang berkurang) baru dicatat penerimaannya.
        const dispatchRes = await fetch(`/api/transfers/${transfer.id}/dispatch`, { method: "POST" })
        if (!dispatchRes.ok) {
          const dispatchData = await dispatchRes.json().catch(() => ({})) as { error?: string }
          setReviewModal(null)
          setError(`Transfer sudah disetujui, tetapi belum terkirim: ${dispatchData.error ?? "tekan Kirim Barang pada kartunya"}`)
          await reloadAll()
          return
        }
        const confirmRes = await fetch(`/api/transfers/${transfer.id}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "receive",
            receivedItems: reviewConditions.map((item) => ({
              id: item.id,
              receivedQty: reviewCondition(item).good,
              damagedQty: reviewCondition(item).damaged,
            })),
            notes: reviewNotes.trim() || null,
            imageUrl: receiptPhoto,
            varianceResolution: "RECORD_LOSS",
          }),
        })
        const confirmData = await confirmRes.json().catch(() => ({}))
        if (!confirmRes.ok) {
          setReviewModal(null)
          setError(`Pengiriman sudah disetujui, tetapi penerimaan belum selesai: ${confirmData.error ?? "silakan konfirmasi dari kartu transfer"}`)
          await reloadAll()
          return
        }
      }
      setReviewModal(null)
      setReviewNotes("")
      setReviewConditions([])
      setReceiptPhoto(null)
      await reloadAll()
    } catch {
      setReviewError("Tidak dapat terhubung ke server")
    } finally {
      setReviewingId(null)
    }
  }

  async function dispatchTransfer(transferId: string) {
    setDispatchingId(transferId)
    setError("")
    try {
      const res = await fetch(`/api/transfers/${transferId}/dispatch`, { method: "POST" })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) setError(data.error ?? "Gagal mengirim transfer")
      await fetchTransfers(page, { silent: true })
    } catch {
      setError("Tidak dapat terhubung ke server")
    } finally {
      setDispatchingId(null)
    }
  }

  function extendReservation(transferId: string) {
    ask({
      title: "Perpanjang tenggat reservasi?",
      message: "Stok tetap dipesan untuk permintaan ini, hanya tenggat pengirimannya yang digeser. Perpanjangan ini tercatat di riwayat.",
      confirmLabel: "Ya, perpanjang",
      cancelLabel: "Kembali",
      onConfirm: async () => {
        const res = await fetch(`/api/transfers/${transferId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extend", notes: "Pengiriman tertunda" }),
        })
        const data = await res.json().catch(() => ({})) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? "Gagal memperpanjang reservasi")
        await fetchTransfers(page, { silent: true })
      },
    })
  }

  function cancelApproved(transferId: string) {
    ask({
      title: "Batalkan transfer ini?",
      message: "Stok gudang yang sudah dipesan untuk permintaan ini akan dilepas kembali. Stok fisik tidak berubah karena barangnya memang belum dikirim.",
      confirmLabel: "Ya, batalkan",
      cancelLabel: "Kembali",
      danger: true,
      onConfirm: async () => {
        const res = await fetch(`/api/transfers/${transferId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel", notes: "Dibatalkan oleh gudang" }),
        })
        const data = await res.json().catch(() => ({})) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? "Gagal membatalkan transfer")
        await fetchTransfers(page, { silent: true })
      },
    })
  }

  async function retryWarehouseNotification(transferId: string) {
    setRetryingNotificationId(transferId)
    setError("")
    try {
      const res = await fetch(`/api/transfers/${transferId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RETRY_NOTIFICATION" }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) setError(data.error ?? "Gagal mengirim ulang WhatsApp")
      await fetchTransfers(page, { silent: true })
    } catch {
      setError("Tidak dapat terhubung ke server")
    } finally {
      setRetryingNotificationId(null)
    }
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true)
    setConfirmError("")
    setReviewError("")
    // Foto kamera HP (HEIC / 3-5 MB) dikecilkan & diubah ke JPEG dulu,
    // kalau tidak server akan menolaknya.
    const upload = await compressImage(file)
    const fd = new FormData()
    fd.append("file", upload)
    fd.append("folder", "receipts")
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (res.ok) {
      const data = await res.json()
      setReceiptPhoto(data.url)
    } else {
      // Tampilkan alasan asli dari server, bukan pesan "periksa koneksi"
      const reason = await res.json().then((d) => d?.error).catch(() => null)
      const message = reason ? `Gagal upload foto: ${reason}` : "Gagal upload foto. Coba lagi atau periksa koneksi."
      setConfirmError(message)
      setReviewError(message)
    }
    setUploadingPhoto(false)
  }

  async function handleReceiveSubmit(sudahDikonfirmasi = false) {
    if (!receiveModal) return
    const hasInvalidQuantity = receiveModal.items.some((item) => receiveCondition(item).invalid)
    if (hasInvalidQuantity) {
      setWarning({ title: "Jumlah tidak masuk akal", messages: ["Jumlah barang baik dan rusak tidak boleh melebihi jumlah yang dikirim."] })
      return
    }
    const hasIssue = receiveModal.items.some((item) => {
      const condition = receiveCondition(item)
      return condition.damaged > 0 || condition.missing > 0
    })
    const kurang: string[] = []
    if (!receiptPhoto) kurang.push("Foto barang wajib diunggah sebelum konfirmasi.")
    if (hasIssue && !receiptNotes.trim()) kurang.push("Catatan wajib diisi jika ada barang rusak atau tidak tiba.")
    if (kurang.length > 0) {
      setWarning({ title: "Lengkapi dulu", messages: kurang })
      return
    }
    // Pengaman salah input: tidak ada satu pun barang yang diterima baik.
    if (!sudahDikonfirmasi && receiveModal.items.every((item) => receiveCondition(item).good <= 0)) {
      const total = receiveModal.items.reduce((sum, item) => sum + item.sentQty, 0)
      ask({
        title: "Semua barang dicatat bermasalah?",
        message: `Seluruh ${total.toLocaleString("id-ID")} barang akan dicatat rusak/tidak tiba dan TIDAK menambah stok outlet. Pastikan angka tidak salah kolom.`,
        confirmLabel: "Ya, memang semua bermasalah",
        cancelLabel: "Periksa lagi",
        danger: true,
        onConfirm: () => handleReceiveSubmit(true),
      })
      return
    }
    setConfirming(true)
    setConfirmError("")
    try {
      const res = await fetch(`/api/transfers/${receiveModal.transferId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "receive",
          receivedItems: receiveModal.items.map((i) => ({
            id: i.id,
            receivedQty: receiveCondition(i).good,
            damagedQty: receiveCondition(i).damaged,
          })),
          notes: receiptNotes || null,
          imageUrl: receiptPhoto,
          varianceResolution,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setConfirmError(d.error ?? "Gagal mengkonfirmasi penerimaan")
        return
      }
      setReceiveModal(null)
      setReceiptPhoto(null)
      setReceiptNotes("")
      void reloadAll()
    } catch {
      setConfirmError("Tidak dapat terhubung ke server")
    } finally {
      setConfirming(false)
    }
  }

  async function rejectTransfer(id: string) {
    setRejecting(true)
    setRejectError("")
    try {
      const res = await fetch(`/api/transfers/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      })
      if (!res.ok) {
        const d = await res.json()
        setRejectError(d.error ?? "Gagal menolak transfer")
        return
      }
      setRejectModal(null)
      setRejectError("")
      void reloadAll()
    } catch {
      setRejectError("Tidak dapat terhubung ke server")
    } finally {
      setRejecting(false)
    }
  }

  // Angka tab datang dari server supaya tidak ikut terpotong pagination.
  const countOf = (...statuses: string[]) =>
    statuses.reduce((sum, st) => sum + (statusCounts[st] ?? 0), 0)
  const pendingCount  = countOf("PENDING", "APPROVED", "SENT")
  const historyCount = countOf("RECEIVED", "REJECTED")
  const tabTotal = activeTab === "shipping" ? pendingCount : historyCount
  const tabs: { key: TransferTab; label: string }[] = [
    { key: "shipping", label: "Pengiriman" },
    { key: "history", label: "Riwayat" },
  ]
  const today = new Date().toISOString().slice(0, 10)
  const hasHistoryFilter = Boolean(filterLocation || filterFrom || filterTo)
  function resetHistoryFilter() {
    setFilterLocation(""); setFilterFrom(""); setFilterTo("")
    setDraftFilterFrom(""); setDraftFilterTo("")
  }

  function changeTab(tab: TransferTab) {
    if (tab === activeTab) return
    ++fetchSequence.current
    setSelectedTab(tab)
    setPage(1)
    setTransfers([])
    setLoading(true)
    setShowNew(false)
    setError("")
  }

  if (lowStockLinkState === "checking") {
    return <LowStockLinkChecking />
  }

  if (lowStockLinkState === "expired") {
    const returnPath = role === "ADMIN_GUDANG" ? "/dashboard/goods-receipt" : "/dashboard/owner"
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white px-4" aria-label="Tautan stok kedaluwarsa">
        <section role="alert" className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-4 px-6 py-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-6 text-slate-900">Tautan kedaluwarsa</h1>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">Tautan ini sudah tidak berlaku karena stok telah pulih atau kebutuhannya sudah diproses.</p>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">
            <button type="button" onClick={() => { window.location.href = returnPath }} className="min-h-10 w-full rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700">
              Mengerti
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Transfer Barang</h1>
          <p className="text-slate-500 text-sm mt-0.5">Kirim barang dari gudang ke outlet</p>
        </div>
        {!showNew && canRequestTransfer && (
          <button
            onClick={() => { changeTab("shipping"); setShowNew(true); setError("") }}
            disabled={!canEditTransfer}
            title={canEditTransfer ? undefined : NO_EDIT_PERMISSION_TITLE}
            className={`flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 ${DISABLED_ACTION_CLASS} disabled:hover:bg-blue-600 sm:w-auto sm:rounded-full`}
          >
            <Plus className="w-4 h-4" />
            Buat Request Transfer
          </button>
        )}
      </div>

      {error && !showNew && <FormAlert message={error} onClose={() => setError("")} />}
      {showNew && (
        <div role="region" aria-label="Request Transfer Baru" className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-lg">Request Transfer Baru</h2>
            <button onClick={() => setShowNew(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <FormAlert message={error} onClose={() => setError("")} />

          {lowStockAlertIds.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-800">
              Gudang, outlet, dan barang sudah divalidasi dari peringatan stok. Saran kebutuhan ditampilkan, sedangkan jumlah kirim tetap Anda tentukan sendiri.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Dari</label>
              <div className="relative">
              <select
                value={fromId}
                disabled={lowStockAlertIds.length > 0}
                onChange={(e) => {
                  const newFrom = e.target.value
                  setFromId(newFrom)
                  if (toId === newFrom) {
                    const fallback = locations.find((l) => l.id !== newFrom)
                    setToId(fallback?.id ?? "")
                  }
                }}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {sourceLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Ke</label>
              <div className="relative">
              <select
                value={toId}
                disabled={lowStockAlertIds.length > 0}
                onChange={(e) => setToId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                {locations.filter((l) => l.id !== fromId).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Daftar Barang</label>
            <div className="space-y-2">
              {rows.map((row, i) => {
                const item = row.itemId ? getItem(row.itemId) : undefined
                const hasPack = !!(item?.packSize && item?.packUnit)
                const inPack = row.inputUnit === "pack"
                const availPcs = row.itemId ? (lowStockAvailable[row.itemId] ?? stockBalances[row.itemId] ?? 0) : null
                const qtyPcs = qtyInBase(row)
                const overStock = availPcs !== null && qtyPcs > availPcs
                const lowStockDetail = row.itemId ? lowStockDetails[row.itemId] : undefined

                return (
                  <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Item {i + 1}</span>
                      {lowStockAlertIds.length === 0 && (
                        <button
                          onClick={() => setRows(rows.filter((_, j) => j !== i))}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors shrink-0"
                          aria-label={`Hapus item ${i + 1}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="block text-[11px] font-semibold text-slate-500">Barang</label>
                      <div className="relative">
                        <select
                        value={row.itemId}
                        disabled={lowStockAlertIds.length > 0}
                        onChange={(e) => {
                          const selectedItem = getItem(e.target.value)
                          const updated = [...rows]
                          updated[i] = {
                            ...updated[i],
                            itemId: e.target.value,
                            inputUnit: selectedItem?.packSize && selectedItem.packUnit ? "pack" : "base",
                          }
                          setRows(updated)
                        }}
                        className="w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 sm:flex-1"
                      >
                        <option value="">Pilih item...</option>
                        {inventoryItems.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} ({it.unit}{it.packSize && it.packUnit ? ` · 1 ${it.packUnit}=${it.packSize}` : ""})
                          </option>
                        ))}
                      </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>

                      {/* Qty + satuan toggle */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-500">Jumlah</label>
                        <StableDraftInput
                          type="number"
                          placeholder="0"
                          min="1"
                          value={row.qty}
                          onCommit={(value) => {
                            const updated = [...rows]
                            updated[i].qty = value
                            setRows(updated)
                          }}
                          className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            overStock ? "border-red-300 bg-red-50" : "border-slate-200"
                          }`}
                        />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-500">Satuan</label>
                          {hasPack ? (
                            <div className="relative">
                              <select
                              value={row.inputUnit}
                              onChange={(e) => {
                                const updated = [...rows]
                                updated[i].inputUnit = e.target.value as "base" | "pack"
                                setRows(updated)
                              }}
                              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="base">{item?.unit}</option>
                              <option value="pack">{item?.packUnit}</option>
                            </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </div>
                          ) : (
                            <div className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                              {item?.unit ?? "—"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {lowStockDetail && item && (
                      <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
                        Stok outlet {lowStockDetail.outlet} {item.unit} · minimum {lowStockDetail.minimum} {item.unit} · saran {lowStockDetail.suggestion} {item.unit}
                      </div>
                    )}

                    {/* Stok info bar */}
                    {item && availPcs !== null && (
                      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                        overStock
                          ? "bg-red-50 text-red-600"
                          : availPcs === 0
                          ? "bg-orange-50 text-orange-600"
                          : "bg-slate-50 text-slate-500"
                      }`}>
                        <Package className="w-3.5 h-3.5 shrink-0" />
                        <span>Stok tersedia:</span>
                        <span className="font-bold">
                          {availPcs} {item.unit}
                          {hasPack && item.packSize
                            ? ` (= ${Math.floor(availPcs / Number(item.packSize))} ${item.packUnit})`
                            : ""}
                        </span>
                        {inPack && hasPack && row.qty && (
                          <span className="ml-1 text-blue-600">
                            · {row.qty} {item.packUnit} × {item.packSize} {item.unit} = <strong>{qtyPcs} {item.unit}</strong>
                          </span>
                        )}
                        {overStock && <span className="ml-auto font-semibold text-red-500">Melebihi stok!</span>}
                        {availPcs === 0 && !overStock && <span className="ml-auto font-semibold">Stok kosong</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {lowStockAlertIds.length === 0 && (
              <button
                onClick={() => setRows([...rows, { itemId: "", qty: "", inputUnit: "base" }])}
                className="mt-2 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-600 font-medium"
              >
                <Plus className="w-4 h-4" />
                Tambah Item
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Catatan (opsional)</label>
            <StableDraftTextarea
              placeholder="Contoh: Pengiriman rutin mingguan..."
              rows={2}
              value={notes}
              onCommit={setNotes}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => setShowNew(false)}
              className="shrink-0 rounded-xl border border-slate-200 px-5 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:flex-1 sm:px-4"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !canEditTransfer}
              title={canEditTransfer ? undefined : NO_EDIT_PERMISSION_TITLE}
              className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengajukan...</> : <><ArrowRight className="w-4 h-4" /> Ajukan Request</>}
            </button>
          </div>
        </div>
      )}

      {/* Daftar dibungkus section berpita seperti "Pesanan Supplier" di Barang Masuk.
          Pengiriman & Riwayat diambil terpisah, jadi pemilihnya ada di pita section. */}
      <section ref={listRef} className={`scroll-mt-24 overflow-hidden rounded-2xl border bg-white shadow-sm ${activeTab === "shipping" ? "border-blue-200" : "border-slate-200"}`}>
        <div className={`flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${activeTab === "shipping" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">{activeTab === "shipping" ? "Pengiriman Aktif" : "Riwayat Transfer"}</h2>
            <p className="mt-1 text-sm text-slate-600">{activeTab === "shipping" ? "Menunggu persetujuan, siap dikirim, atau dalam perjalanan ke outlet." : "Transfer yang sudah diterima atau ditolak."}</p>
          </div>
          <div role="tablist" aria-label="Alur transfer barang" className="grid shrink-0 grid-cols-2 gap-1 rounded-full border border-slate-200 bg-white p-1 sm:flex">
            {tabs.map((tab, index) => <button key={tab.key} type="button" role="tab" id={`transfer-tab-${tab.key}`}
              aria-selected={activeTab === tab.key} aria-controls={`transfer-panel-${tab.key}`} tabIndex={activeTab === tab.key ? 0 : -1}
              onClick={() => changeTab(tab.key)}
              onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null
                if (next == null) return
                event.preventDefault(); changeTab(tabs[next].key)
                document.getElementById(`transfer-tab-${tabs[next].key}`)?.focus()
              }}
              className={`min-h-10 min-w-0 rounded-full px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === tab.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
              {tab.label}
            </button>)}
          </div>
        </div>

        {activeTab === "history" && (
          <div className="border-b border-slate-100 p-4 sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-800">Filter Riwayat</span>
              {!loading && <span className="text-xs text-slate-400">{tabTotal} transfer</span>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Lokasi</label>
                <div className="relative">
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="">Semua Lokasi</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Dari tanggal</label>
                <AppDatePicker value={draftFilterFrom} onChange={setDraftFilterFrom}
                  max={today}
                  placeholder="Pilih tanggal" ariaLabel="Dari tanggal"
                  className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Sampai tanggal</label>
                <AppDatePicker value={draftFilterTo} onChange={setDraftFilterTo}
                  min={draftFilterFrom || undefined}
                  max={today}
                  placeholder="Pilih tanggal" ariaLabel="Sampai tanggal"
                  className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
                <button
                  type="button"
                  onClick={() => { setFilterFrom(draftFilterFrom); setFilterTo(draftFilterTo) }}
                  disabled={draftFilterFrom === filterFrom && draftFilterTo === filterTo}
                  className="h-10 rounded-xl bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-default disabled:bg-slate-100 disabled:text-slate-400"
                >
                  Terapkan
                </button>
                <button
                  type="button"
                  onClick={resetHistoryFilter}
                  disabled={!hasHistoryFilter && !draftFilterFrom && !draftFilterTo}
                  className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        <div role="tabpanel" id={`transfer-panel-${activeTab}`} aria-labelledby={`transfer-tab-${activeTab}`}>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === "history" && transfers.length === 0 && hasHistoryFilter ? (
        <div className="px-4 py-14 text-center sm:py-16">
          <div className="text-slate-500 text-sm">Tidak ada transfer untuk filter yang dipilih</div>
          <button onClick={resetHistoryFilter} className="mt-2 text-sm text-blue-600 hover:underline">Reset filter</button>
        </div>
      ) : activeTab === "history" && transfers.length === 0 ? (
        <div className="px-4 py-14 text-center sm:py-20">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-slate-400" />
          </div>
          <div className="text-slate-600 font-semibold">Belum ada riwayat transfer</div>
          <div className="text-slate-400 text-sm mt-1">Transfer yang selesai atau ditolak akan muncul di sini.</div>
        </div>
      ) : (
        <>
        <div className="space-y-3 p-3 sm:p-4">
          <OutletReplenishment active={activeTab === "shipping" && canRequestOutlet} refreshKey={needsRefresh}
            providedNeeds={shippingNeeds} onSubmitted={() => { void fetchTransfers(page, { silent: true }) }}
            renderList={(renderNeed) => {
            const transferCards = new Map(transfers.map((t) => {
            const cfg = statusConfig[t.status]
            const StatusIcon = cfg.icon
            const canReview = t.status === "PENDING"
              && (!t.autoReplenishment || t.outletRequested)
              && canEditTransfer
              && (role === "OWNER" || (sessionUser?.locationIds ?? []).includes(t.fromLocationId))
              && (["OWNER", "SUPERVISOR"].includes(sessionUser?.role ?? "")
                || (sessionUser?.role === "ADMIN_GUDANG" && t.autoReplenishment))
            return [t.id, (
              <div data-shipping-kind="transfer" data-shipping-id={t.id} key={t.id} className={`overflow-hidden rounded-2xl border border-l-4 bg-white transition-shadow hover:shadow-md ${cfg.card}`}>
                <div className="space-y-3.5 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-start gap-3 sm:gap-3.5">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.iconBox}`}>
                        <StatusIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] font-semibold text-slate-900">
                          <span>{t.fromLocation.name}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>{t.toLocation.name}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                          {new Date(t.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {t.autoReplenishment && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                              <WandSparkles className="h-3 w-3" /> {t.needRejectionSnapshot ? "Kebutuhan ditolak sebelum diajukan" : t.outletRequested ? "Permintaan dari outlet" : "Usulan lama dari stok minimum"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Sama seperti kartu Barang Masuk: di HP badge + ringkasan sejajar di bawah judul. */}
                    <div className="flex shrink-0 items-center justify-between gap-3 pl-[3.25rem] sm:block sm:pl-0 sm:text-right">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <div className="text-xs text-slate-400 sm:mt-1.5">{t.items.length} barang</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {t.items.map((item, i) => {
                      const sentQty = Number(item.quantity)
                      const goodQty = item.receivedQty != null ? Number(item.receivedQty) : sentQty
                      const damagedQty = Number(item.damagedQty ?? 0)
                      const missingQty = Math.max(0, sentQty - goodQty - damagedQty)
                      const hasIssue = t.status === "RECEIVED" && (damagedQty > 0 || missingQty > 0)
                      return (
                        <span key={i} className={`flex max-w-full items-start gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                          hasIssue
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          <Package className={`mt-px h-3 w-3 shrink-0 ${hasIssue ? "text-red-400" : "text-slate-400"}`} />
                          <span className="min-w-0">
                          {item.item.name}{" "}
                          {t.needRejectionSnapshot ? "· Jumlah belum diisi" : t.status === "RECEIVED" ? (
                            <>
                              <strong>{goodQty}</strong> baik
                              {damagedQty > 0 && <> · <strong>{damagedQty}</strong> rusak</>}
                              {missingQty > 0 && <> · <strong>{missingQty}</strong> tidak tiba</>}
                              {" "}{item.item.unit}
                            </>
                          ) : (
                            <>{t.outletRequested ? t.status === "PENDING" ? "Diminta " : "Dikirim " : ""}<strong>{sentQty}</strong> {item.item.unit}</>
                          )}
                          {t.outletRequested && t.status !== "PENDING" && item.requestedQuantity != null && <> · Diminta {Number(item.requestedQuantity)} {item.item.unit}</>}
                          </span>
                        </span>
                      )
                    })}
                  </div>

                  {t.notes && (
                    <div className="break-words rounded-lg bg-slate-50 px-3 py-2 text-xs italic leading-relaxed text-slate-400">{t.notes}</div>
                  )}

                  {t.status === "PENDING" && <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    <p className="font-semibold">Stok di {t.fromLocation.name}</p>
                    {t.items.map((item) => item.sourceQuantity != null && <p key={item.id}>{item.item.name}: <strong>{item.sourceQuantity.toLocaleString("id-ID")} {item.item.unit}</strong></p>)}
                    <p className="text-slate-400">Saldo saat ini, belum dikurangi permintaan yang menunggu persetujuan.</p>
                  </div>}
                  {t.approvalNotes && <p className="text-sm text-slate-600">{t.needRejectionSnapshot ? "Alasan penolakan" : "Catatan gudang"}: {t.approvalNotes}</p>}

                  {t.status === "APPROVED" && canEditTransfer
                    && (role === "OWNER" || (sessionUser?.locationIds ?? []).includes(t.fromLocationId))
                    && (["OWNER", "SUPERVISOR"].includes(sessionUser?.role ?? "")
                      || (sessionUser?.role === "ADMIN_GUDANG" && t.autoReplenishment)) && (
                    <div className="space-y-2">
                      <p className={`rounded-xl px-3 py-2 text-xs ${t.reservationOverdue ? "bg-amber-50 text-amber-900" : "bg-indigo-50 text-indigo-800"}`}>
                        {t.reservationOverdue
                          ? <><b>Reservasi terlambat.</b> Stok gudang sudah dipesan untuk permintaan ini sejak lewat tenggat{t.reservationExpiresAt ? ` ${new Date(t.reservationExpiresAt).toLocaleString("id-ID")}` : ""}, dan selama itu tidak dapat dipakai transfer lain. Kirim barangnya, perpanjang tenggatnya, atau batalkan.</>
                          : <>Stok gudang sudah dipesan untuk permintaan ini dan tidak dapat dipakai transfer lain. Stok baru berkurang setelah barangnya benar-benar dikirim.{t.reservationExpiresAt ? ` Tenggat kirim: ${new Date(t.reservationExpiresAt).toLocaleString("id-ID")}.` : ""}</>}
                      </p>
                      {/* HP: "Kirim Barang" selebar penuh di atas, dua tombol lain berdampingan
                          di bawah. Layar lebar: ketiganya sejajar. */}
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <button
                          onClick={() => void dispatchTransfer(t.id)}
                          disabled={dispatchingId === t.id}
                          className="col-span-2 flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 sm:flex-1"
                        >
                          <ArrowRight className="h-4 w-4" />
                          {dispatchingId === t.id ? "Mengirim..." : "Kirim Barang"}
                        </button>
                        <button
                          onClick={() => void extendReservation(t.id)}
                          disabled={dispatchingId === t.id}
                          className="min-h-11 whitespace-nowrap rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          Perpanjang
                        </button>
                        <button
                          onClick={() => void cancelApproved(t.id)}
                          disabled={dispatchingId === t.id}
                          className="min-h-11 whitespace-nowrap rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          Batalkan
                        </button>
                      </div>
                    </div>
                  )}

                  {t.status === "SENT" && (
                    (canManageTransfer && canEditTransfer
                      && (!t.outletRequested || role === "OWNER" || (sessionUser?.locationIds ?? []).includes(t.toLocationId))) ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openReceiveModal(t)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Konfirmasi Penerimaan
                        </button>
                        <button
                          onClick={() => { setRejectModal(t.id); setRejectError("") }}
                          className="px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium rounded-full transition-colors"
                        >
                          Tolak
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                        Menunggu petugas yang memiliki akses outlet tujuan mengonfirmasi penerimaan.
                      </div>
                    )
                  )}
                  {t.status === "PENDING" && (
                    <div className="space-y-2">
                      {t.autoReplenishment && t.outletRequested && t.notificationStatus && (
                        <div className={`rounded-xl border px-3 py-2 text-xs ${
                          t.notificationStatus === "FAILED" || t.notificationStatus === "DEAD"
                            ? "border-red-100 bg-red-50 text-red-700"
                            : t.notificationStatus === "UNCERTAIN"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : t.notificationStatus === "SENT"
                                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                : "border-blue-100 bg-blue-50 text-blue-700"
                        }`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              WhatsApp gudang: {
                                t.notificationStatus === "SENT" ? "terkirim"
                                  : t.notificationStatus === "FAILED" ? "gagal"
                                  : t.notificationStatus === "DEAD" ? "berhenti dicoba"
                                  : t.notificationStatus === "UNCERTAIN" ? "tidak pasti, mungkin sudah sampai"
                                  : "sedang diproses"
                              }
                              {t.notificationStatus !== "UNCERTAIN" && t.notificationError ? ` · ${t.notificationError}` : ""}
                            </span>
                            {(t.notificationStatus === "FAILED" || t.notificationStatus === "DEAD") && canReview && (
                              <button
                                type="button"
                                onClick={() => void retryWarehouseNotification(t.id)}
                                disabled={retryingNotificationId === t.id}
                                className="inline-flex items-center gap-1 font-semibold text-red-700 underline underline-offset-2 disabled:opacity-50"
                              >
                                <RotateCcw className={`h-3 w-3 ${retryingNotificationId === t.id ? "animate-spin" : ""}`} />
                                Kirim ulang
                              </button>
                            )}
                            {t.notificationStatus === "UNCERTAIN" && canReview && (
                              <button
                                type="button"
                                disabled={retryingNotificationId === t.id}
                                onClick={() => ask({
                                  title: "Periksa WhatsApp dahulu",
                                  message: "Balasan dari penyedia WhatsApp tidak pernah sampai, jadi pemberitahuan ini mungkin sudah diterima gudang. Buka WhatsApp gudang dan pastikan pesannya belum ada sebelum mengirim ulang.",
                                  confirmLabel: "Sudah diperiksa, kirim ulang",
                                  cancelLabel: "Batal",
                                  onConfirm: () => retryWarehouseNotification(t.id),
                                })}
                                className="inline-flex items-center gap-1 font-semibold text-amber-900 underline underline-offset-2 disabled:opacity-50"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Periksa WhatsApp dahulu
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {canReview ? (
                        <div className="flex gap-2">
                          {t.autoReplenishment && !t.outletRequested ? (
                            <p className="flex-1 text-sm text-amber-700">Jumlah menunggu konfirmasi outlet melalui bagian Kebutuhan outlet.</p>
                          ) : (
                          <button
                            onClick={() => openReviewModal(t, "approve")}
                            disabled={reviewingId === t.id}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-full transition-colors"
                          >
                            {reviewingId === t.id ? "Memproses..." : t.autoReplenishment ? "Setujui Pengiriman" : "Konfirmasi Transfer"}
                          </button>
                          )}
                          <button
                            onClick={() => openReviewModal(t, "reject")}
                            disabled={reviewingId === t.id}
                            className="px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium rounded-full"
                          >
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                          {t.autoReplenishment && !t.outletRequested ? "Menunggu outlet mengisi jumlah pada kartu Menunggu pengisian kebutuhan di tab Pengiriman." : t.autoReplenishment ? "Menunggu penanggung jawab gudang (admin gudang atau supervisor yang ditugaskan) menyetujui pengiriman." : "Menunggu konfirmasi owner atau supervisor yang memiliki akses lokasi asal."}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rincian transfer hanya punya satu tampilan, yaitu halaman
                      /dashboard/audit/transfer/[id] — sama seperti dari Peringatan. */}
                  <Link
                    href={`/dashboard/audit/transfer/${t.id}`}
                    className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
                  >
                    <FileText className="h-4 w-4" />
                    Lihat rincian
                  </Link>
                </div>
              </div>
            )] as const
          }))
          return <div className="space-y-3">{activeTab === "shipping"
            ? shippingOrder.length === 0 ? (
              <div className="py-14 text-center sm:py-16">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <Package className="h-7 w-7 text-slate-400" />
                </div>
                <div className="font-semibold text-slate-600">Tidak ada pengiriman aktif</div>
                <div className="mt-1 text-sm text-slate-400">Permintaan yang diajukan akan muncul di sini.</div>
              </div>
            ) : shippingOrder.map((entry) => {
              if (entry.kind === "transfer") return transferCards.get(entry.id)
              const need = shippingNeeds.find((row) => row.itemId === entry.itemId && row.locationId === entry.locationId)
              return need ? <div key={entry.id} data-shipping-kind="need" data-shipping-id={entry.id}>{renderNeed(need)}</div> : null
            }) : [...transferCards.values()]}</div>
          }} />
        </div>
        {/* Pagination sudah punya garis atas sendiri dan tidak dirender jika hanya 1 halaman. */}
        <Pagination page={page} pages={pages} total={activeTab === "shipping" ? shippingTotal : tabTotal} perPage={5} label={activeTab === "shipping" ? "permintaan" : "transfer"}
          loading={loading} scrollToRef={listRef} onPageChange={fetchTransfers} />
        </>
      )}
        </div>
      </section>

      <WarningModal
        open={warning !== null}
        title={warning?.title}
        messages={warning?.messages ?? []}
        onClose={() => setWarning(null)}
      />

      {reviewModal && (() => {
        const { transfer, action } = reviewModal
        const isApprove = action === "approve"
        const isAutomaticDispatch = isApprove && transfer.autoReplenishment
        const isProcessing = reviewingId === transfer.id
        const dispatchChanged = isAutomaticDispatch && transfer.items.some((item) => dispatchBaseQuantity(item) !== Number(item.requestedQuantity ?? item.quantity))
        const hasConditionIssue = isApprove && !isAutomaticDispatch && reviewConditions.some((item) => {
          const condition = reviewCondition(item)
          return condition.damaged > 0 || condition.missing > 0
        })
        return (
          <AppPortal>
          <div className="app-overlay mobile-fullscreen-dialog z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="review-transfer-title">
            <button
              type="button"
              aria-label="Tutup konfirmasi"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
              onClick={() => { if (!isProcessing) setReviewModal(null) }}
            />
            <div className="mobile-dialog-panel relative z-10 flex max-h-[calc(100%-3rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/60 bg-white shadow-2xl sm:max-h-[calc(100%-2rem)] sm:rounded-3xl">
              <div className={`h-1.5 shrink-0 ${isApprove ? "bg-blue-600" : "bg-red-500"}`} />
              <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-5">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 id="review-transfer-title" className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                      {isAutomaticDispatch ? "Atur jumlah pengiriman" : isApprove ? "Konfirmasi Transfer" : "Tolak Request Transfer"}
                    </h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:mt-1 sm:text-sm">
                      {isApprove
                        ? isAutomaticDispatch
                          ? "Isi jumlah yang benar-benar dikirim. Outlet akan mengonfirmasi penerimaan setelah barang tiba."
                          : "Isi hanya jumlah barang bermasalah. Jika semuanya baik, langsung konfirmasi."
                        : "Request akan ditutup dan tidak ada stok yang dipindahkan."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewModal(null)}
                    disabled={isProcessing}
                    aria-label="Tutup"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div className="mobile-dialog-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className="truncate">{transfer.fromLocation.name}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{transfer.toLocation.name}</span>
                  </div>
                  {isAutomaticDispatch ? (
                    <div className="mt-3 space-y-3">
                      {transfer.items.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-800">{item.item.name}</p>
                        <p className="mt-1 text-sm text-slate-500">Diminta outlet: {Number(item.requestedQuantity ?? item.quantity)} {item.item.unit}</p>
                        <p className="text-sm text-slate-500">Stok gudang saat ini: {dispatchStock[item.id] == null ? "diperiksa saat persetujuan" : `${dispatchStock[item.id]} ${item.item.unit}`}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2"><label className="min-w-0 text-sm font-medium text-slate-700">Jumlah
                          <input type="number" inputMode="decimal" min="0.001" step="0.001" value={dispatchQuantities[item.id] ?? ""}
                            onChange={(event) => { setDispatchQuantities((current) => ({ ...current, [item.id]: event.target.value })); setReviewError("") }}
                            className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-base outline-none focus:ring-2 focus:ring-blue-500" />
                        </label>
                        <label className="min-w-0 text-sm font-medium text-slate-700">Satuan
                          {item.item.packSize && Number(item.item.packSize) > 0 && item.item.packUnit ? <div className="relative mt-1"><select value={dispatchUnits[item.id] ?? "base"} onChange={(event) => setDispatchUnits((current) => ({ ...current, [item.id]: event.target.value as "base" | "pack" }))} className="w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white p-3 pr-8 text-base">
                            <option value="base">{item.item.unit}</option><option value="pack">{item.item.packUnit}</option>
                          </select><ChevronDown className="pointer-events-none absolute right-2 top-4 h-4 w-4 text-slate-400" /></div>
                          : <input readOnly value={item.item.unit} className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-base" />}
                        </label></div>
                        {item.item.packSize && item.item.packUnit && <p className="mt-2 text-xs text-slate-500">1 {item.item.packUnit} = {item.item.packSize} {item.item.unit}</p>}
                        {parseTransferQuantity(dispatchBaseQuantity(item)) != null && <p className="mt-2 text-xs text-blue-700">Total kirim: {dispatchBaseQuantity(item).toLocaleString("id-ID")} {item.item.unit}</p>}
                      </div>)}
                      {transfer.notes && <p className="text-sm text-slate-600">Catatan outlet: {transfer.notes}</p>}
                      {dispatchChanged && <p className="text-sm text-amber-700">Jumlah berubah dari permintaan. Jelaskan alasannya dalam catatan. Setelah outlet menerima barang, selisihnya tetap tercatat dan dilanjutkan saat stok gudang tersedia.</p>}
                    </div>
                  ) : isApprove ? (
                    <div className="mt-3 space-y-2.5">
                      {reviewConditions.map((item, index) => {
                        const condition = reviewCondition(item)
                        return (
                          <div key={item.id} className={`rounded-xl border bg-white p-3 ${condition.invalid ? "border-red-300" : "border-slate-200"}`}>
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-sm font-semibold text-slate-800">{item.name}</span>
                              <span className="shrink-0 text-xs text-slate-500">Request {item.sentQty} {item.unit}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2.5">
                              <label>
                                <span className="mb-1 block text-[11px] font-medium text-slate-500">Barang rusak?</span>
                                <div className="relative">
                                  <StableDraftInput
                                    type="number"
                                    min="0"
                                    max={item.sentQty}
                                    step="any"
                                    placeholder="0"
                                    value={item.damagedQty}
                                    onCommit={(value) => {
                                      const updated = [...reviewConditions]
                                      updated[index] = { ...updated[index], damagedQty: value }
                                      setReviewConditions(updated)
                                      setReviewError("")
                                    }}
                                    className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-12 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  />
                                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{item.unit}</span>
                                </div>
                              </label>
                              <label>
                                <span className="mb-1 block text-[11px] font-medium text-slate-500">Tidak tiba?</span>
                                <div className="relative">
                                  <StableDraftInput
                                    type="number"
                                    min="0"
                                    max={item.sentQty}
                                    step="any"
                                    placeholder="0"
                                    value={item.missingQty}
                                    onCommit={(value) => {
                                      const updated = [...reviewConditions]
                                      updated[index] = { ...updated[index], missingQty: value }
                                      setReviewConditions(updated)
                                      setReviewError("")
                                    }}
                                    className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-12 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                  />
                                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{item.unit}</span>
                                </div>
                              </label>
                            </div>
                            <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${condition.invalid ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                              {condition.invalid
                                ? "Jumlah masalah melebihi jumlah request."
                                : <><strong>{condition.good} {item.unit}</strong> otomatis masuk stok</>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {transfer.items.map((item) => (
                        <span key={item.id} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
                          <strong className="font-semibold text-slate-800">{item.item.name}</strong>
                          {" · "}{Number(item.quantity).toLocaleString("id-ID")} {item.item.unit}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {isApprove ? (isAutomaticDispatch ? "Catatan pengiriman" : "Catatan") : "Alasan penolakan"}
                    {isApprove
                      ? hasConditionIssue || dispatchChanged
                        ? <span className="ml-1 text-red-500">*</span>
                        : <span className="font-normal text-slate-400"> (opsional)</span>
                      : <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <StableDraftTextarea
                    rows={3}
                    value={reviewNotes}
                    onCommit={(value) => { setReviewNotes(value); setReviewError("") }}
                    placeholder={isApprove ? (isAutomaticDispatch ? "Contoh: dikirim sebagian karena stok belum mencukupi" : "Jelaskan kondisi barang jika ada yang rusak atau tidak tiba...") : "Jelaskan alasan request ditolak..."}
                    className={`w-full resize-none rounded-xl border px-3.5 py-3 text-sm outline-none transition-shadow focus:ring-4 ${reviewError && !isApprove ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200 focus:border-slate-400 focus:ring-slate-100"}`}
                  />
                </div>

                {isApprove && !isAutomaticDispatch && (
                  <div className="mt-4">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Foto Barang <span className="text-red-500">*</span>
                    </label>
                    {receiptPhoto ? (
                      <div className="relative flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                        <img src={receiptPhoto} alt="Kondisi barang transfer" className="h-24 w-24 shrink-0 rounded-lg bg-white object-contain" />
                        <div className="min-w-0 pr-8">
                          <p className="text-sm font-semibold text-slate-800">Foto barang terunggah</p>
                          <p className="mt-1 text-xs text-slate-500">Bukti kondisi barang siap dikirim.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReceiptPhoto(null)}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/75 text-white shadow"
                          aria-label="Hapus foto"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50/40">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(event) => { const file = event.target.files?.[0]; if (file) void handlePhotoUpload(file) }}
                        />
                        {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        {uploadingPhoto ? "Mengunggah..." : "Tambah foto bukti"}
                      </label>
                    )}
                    {!receiptPhoto && <p className="mt-1.5 text-xs text-red-500">Wajib upload foto barang sebelum konfirmasi.</p>}
                  </div>
                )}

                {reviewError && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{reviewError}</span>
                  </div>
                )}

              </div>
              <div className="mobile-dialog-actions grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
                  <button
                    type="button"
                    onClick={() => setReviewModal(null)}
                    disabled={isProcessing}
                    className="min-h-12 rounded-xl border border-slate-200 px-2 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => void reviewTransfer()}
                    disabled={isProcessing || uploadingPhoto}
                    className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-center text-xs font-semibold leading-tight text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm ${isApprove ? "bg-blue-600 hover:bg-blue-700" : "bg-red-500 hover:bg-red-600"}`}
                  >
                    {isProcessing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Memproses...</>
                    ) : isApprove ? (
                      <><ShieldCheck className="h-4 w-4" /> {isAutomaticDispatch ? "Setujui Pengiriman" : "Konfirmasi Transfer"}</>
                    ) : (
                      "Tolak Request"
                    )}
                  </button>
              </div>
            </div>
          </div>
          </AppPortal>
        )
      })()}

      {/* Receive Validation Modal */}
      {receiveModal && (() => {
        const hasIssue = receiveModal.items.some((item) => {
          const condition = receiveCondition(item)
          return condition.damaged > 0 || condition.missing > 0
        })
        return (
          <AppPortal>
          <div className="app-overlay mobile-fullscreen-dialog z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="receive-transfer-title">
            <button
              type="button"
              aria-label="Tutup konfirmasi"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
              onClick={() => { if (!confirming) setReceiveModal(null) }}
            />
            <div className="mobile-dialog-panel relative z-10 flex max-h-[calc(100%-3rem)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/60 bg-white shadow-2xl sm:max-h-[calc(100%-2rem)] sm:rounded-3xl">
              <div className="h-1.5 shrink-0 bg-blue-600" />
              <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-5">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 id="receive-transfer-title" className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Konfirmasi Penerimaan</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500 sm:mt-1 sm:text-sm">
                      Isi hanya jumlah barang bermasalah. Jika semuanya baik, langsung konfirmasi.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReceiveModal(null)}
                    disabled={confirming}
                    aria-label="Tutup"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div className="mobile-dialog-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span className="truncate">{receiveModal.fromLocation}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{receiveModal.toLocation}</span>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {receiveModal.items.map((item, index) => {
                      const condition = receiveCondition(item)
                      return (
                        <div key={item.id} className={`rounded-xl border bg-white p-3 ${condition.invalid ? "border-red-300" : "border-slate-200"}`}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-semibold text-slate-800">{item.name}</span>
                            <span className="shrink-0 text-xs text-slate-500">Request {item.sentQty} {item.unit}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2.5">
                            <label>
                              <span className="mb-1 block text-[11px] font-medium text-slate-500">Barang rusak?</span>
                              <div className="relative">
                                <StableDraftInput
                                  type="number"
                                  min="0"
                                  max={item.sentQty}
                                  step="any"
                                  placeholder="0"
                                  value={item.damagedQty}
                                  onCommit={(value) => {
                                    const updated = [...receiveModal.items]
                                    updated[index] = { ...updated[index], damagedQty: value }
                                    setReceiveModal({ ...receiveModal, items: updated })
                                    setConfirmError("")
                                  }}
                                  className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-12 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{item.unit}</span>
                              </div>
                            </label>
                            <label>
                              <span className="mb-1 block text-[11px] font-medium text-slate-500">Tidak tiba?</span>
                              <div className="relative">
                                <StableDraftInput
                                  type="number"
                                  min="0"
                                  max={item.sentQty}
                                  step="any"
                                  placeholder="0"
                                  value={item.missingQty}
                                  onCommit={(value) => {
                                    const updated = [...receiveModal.items]
                                    updated[index] = { ...updated[index], missingQty: value }
                                    setReceiveModal({ ...receiveModal, items: updated })
                                    setConfirmError("")
                                  }}
                                  className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-12 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{item.unit}</span>
                              </div>
                            </label>
                          </div>
                          <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${condition.invalid ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
                            {condition.invalid
                              ? "Jumlah masalah melebihi jumlah request."
                              : <><strong>{condition.good} {item.unit}</strong> otomatis masuk stok</>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Catatan
                    {hasIssue ? <span className="ml-1 text-red-500">*</span> : <span className="font-normal text-slate-400"> (opsional)</span>}
                  </label>
                  <StableDraftTextarea
                    rows={3}
                    value={receiptNotes}
                    onCommit={(value) => { setReceiptNotes(value); setConfirmError("") }}
                    placeholder="Jelaskan kondisi barang jika ada yang rusak atau tidak tiba..."
                    className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition-shadow focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </div>

                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Foto Barang <span className="text-red-500">*</span></label>
                  {receiptPhoto ? (
                    <div className="relative flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <img src={receiptPhoto} alt="Kondisi barang transfer" className="h-24 w-24 shrink-0 rounded-lg bg-white object-contain" />
                      <div className="min-w-0 pr-8">
                        <p className="text-sm font-semibold text-slate-800">Foto barang terunggah</p>
                        <p className="mt-1 text-xs text-slate-500">Bukti kondisi barang siap dikirim.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReceiptPhoto(null)}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/75 text-white shadow"
                        aria-label="Hapus foto"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50/40">
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handlePhotoUpload(file) }} />
                      {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {uploadingPhoto ? "Mengunggah..." : "Tambah foto barang"}
                    </label>
                  )}
                  {!receiptPhoto && <p className="mt-1.5 text-xs text-red-500">Wajib upload foto barang sebelum konfirmasi.</p>}
                </div>

                {confirmError && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{confirmError}</span>
                  </div>
                )}

              </div>
              <div className="mobile-dialog-actions grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
                  <button
                    type="button"
                    onClick={() => { setReceiveModal(null); setConfirmError("") }}
                    disabled={confirming}
                    className="min-h-12 rounded-xl border border-slate-200 px-2 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReceiveSubmit()}
                    disabled={confirming || uploadingPhoto}
                    className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-2 py-3 text-center text-xs font-semibold leading-tight text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                  >
                    {confirming ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses...</> : <><ShieldCheck className="h-4 w-4" /> Konfirmasi Penerimaan</>}
                  </button>
              </div>
            </div>
          </div>
          </AppPortal>
        )
      })()}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={() => { if (!rejecting) setRejectModal(null) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="font-semibold text-slate-900 text-base mb-1">Tolak Transfer Ini?</div>
              <div className="text-sm text-slate-500">Stok akan dikembalikan ke lokasi asal. Tindakan ini tidak bisa dibatalkan.</div>
            </div>
            {rejectError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{rejectError}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectModal(null); setRejectError("") }}
                disabled={rejecting}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => rejectTransfer(rejectModal)}
                disabled={rejecting}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {rejecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</> : "Ya, Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}
    {dialog}
    </div>
  )
}

export default function TransferPageClient({ initialLowStockLinkState }: { initialLowStockLinkState: InitialLowStockLinkState }) {
  return <TransferPageContent initialLowStockLinkState={initialLowStockLinkState} />
}
