"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  RotateCcw,
  Search,
  Trash2,
  MessageCircle,
  PackageCheck,
  ChevronDown,
  Clock3,
  Inbox,
  Package,
  ShoppingCart,
  UserRound,
  X,
} from "lucide-react"
import { Pagination } from "@/components/ui/pagination"
import { FormAlert } from "@/components/ui/form-alert"
import { AppPortal } from "@/components/ui/app-portal"
import Link from "next/link"
import { useConfirm } from "@/components/ui/use-confirm"
import { useCanEdit } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { WarehousePurchaseNeeds, type WarehouseNeed } from "@/components/warehouse-purchase-needs"
import { SupplierOrders } from "@/components/supplier-orders"
import { SupplierInbox } from "@/components/supplier-inbox"

type Supplier = {
  id: string
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  responseTimeoutMinutes: number
  urgentResponseTimeoutMinutes: number
  isActive: boolean
  /// Nomor WA tambahan (admin/sales supplier); balasannya juga dikenali.
  extraPhones?: Array<{ id: string; phone: string; label: string | null }>
  itemSuppliers: Array<{
    id: string
    priority: number
    /// Versi supplier (opsional): nama bahan di nota supplier & satuan belinya.
    supplierItemName: string | null
    purchaseUnit: string | null
    purchaseUnitSize: string | number | null
    item: { id: string; name: string; unit: string }
    location: { id: string; name: string; type: "WAREHOUSE" | "OUTLET" }
  }>
}

type InventoryItem = { id: string; name: string; unit: string; isTrackable: boolean; isActive: boolean }
type Location = { id: string; name: string; type: "WAREHOUSE" | "OUTLET" }
type PurchaseRequest = {
  id: string
  /// Terisi bila baris ini bagian dari pesanan banyak bahan.
  purchaseOrderId: string | null
  orderCode: string
  status: "ACTIVE" | "FULFILLED" | "FAILED" | "CANCELLED"
  supplierReplyStatus: "WAITING" | "READY" | "PARTIAL" | "SHIPPED" | "UNAVAILABLE" | "NEEDS_REVIEW"
  promisedQuantity: number | null
  shippedQuantity: number | null
  supplierLastMessage: string | null
  supplierLastMessageAt: string | null
  messageStatus: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "UNCERTAIN" | "DEAD"
  messageAttempts: number
  lastMessageError: string | null
  providerDeliveryStatus: "UNKNOWN" | "PROVIDER_ACCEPTED" | "WHATSAPP_SENT" | "DELIVERED" | "READ" | "UNDELIVERED"
  deliveryStatusUpdatedAt: string | null
  deliveredAt: string | null
  readAt: string | null
  urgency: "NORMAL" | "URGENT"
  responseDueAt: string | null
  responseOverdueAt: string | null
  reminderCount: number
  lastReminderAt: string | null
  lastReminderStatus: "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "UNCERTAIN" | "DEAD" | null
  lastReminderError: string | null
  quantity: number
  receivedQuantity: number
  createdAt: string
  item: { name: string; unit: string }
  location: { name: string }
  supplier: { name: string; phone: string | null }
  nextSupplier: { id: string; name: string; priority: number } | null
  outstandingQuantity: number
  escalatedFrom: { id: string; orderCode: string; supplier: { name: string } } | null
}

type WhatsAppDevice = { configured: boolean; connected: boolean; status: string | null; error: string | null }

const jumlah = (value: number) => Number(value).toLocaleString("id-ID")

/**
 * Dijanjikan, dikirim, dan diterima adalah tiga fakta berbeda: supplier bisa
 * menjanjikan 30, mengirim 20, dan yang sampai gudang 15. Ditampilkan terpisah
 * supaya selisihnya tidak tersembunyi di balik satu angka.
 */
function quantityBreakdown(request: PurchaseRequest) {
  const unit = request.item.unit
  const parts = [`Dipesan ${jumlah(request.quantity)} ${unit}`]
  if (request.promisedQuantity != null) parts.push(`dijanjikan ${jumlah(request.promisedQuantity)}`)
  if (request.shippedQuantity != null) parts.push(`dikirim ${jumlah(request.shippedQuantity)}`)
  parts.push(`diterima ${jumlah(request.receivedQuantity)}`)
  parts.push(`sisa ${jumlah(Math.max(0, Number(request.quantity) - Number(request.receivedQuantity)))}`)
  return parts.join(" · ")
}

const supplierReplyLabels = {
  WAITING: ["Menunggu jawaban", "bg-amber-50 text-amber-800"],
  READY: ["Supplier siap", "bg-emerald-50 text-emerald-700"],
  PARTIAL: ["Tersedia sebagian", "bg-orange-50 text-orange-700"],
  SHIPPED: ["Dalam pengiriman", "bg-blue-50 text-blue-700"],
  UNAVAILABLE: ["Stok supplier kosong", "bg-red-50 text-red-700"],
  NEEDS_REVIEW: ["Balasan perlu ditinjau", "bg-violet-50 text-violet-700"],
} as const

/// Status pengiriman pesan berdiri sendiri dari status pengadaan: pesan gagal
/// terkirim tidak berarti pengadaannya batal.
const deliveryLabels = {
  PENDING: ["WA: menunggu dikirim", "bg-slate-100 text-slate-600"],
  PROCESSING: ["WA: sedang dikirim", "bg-slate-100 text-slate-600"],
  SENT: ["WA: terkirim", "bg-emerald-50 text-emerald-700"],
  FAILED: ["WA: gagal", "bg-red-50 text-red-700"],
  UNCERTAIN: ["WA: tidak pasti", "bg-amber-50 text-amber-800"],
  DEAD: ["WA: berhenti dicoba", "bg-red-50 text-red-700"],
} as const

const providerDeliveryLabels = {
  UNKNOWN: ["Pengantaran belum tersedia", "bg-slate-100 text-slate-600"],
  PROVIDER_ACCEPTED: ["Diterima Fonnte", "bg-blue-50 text-blue-700"],
  WHATSAPP_SENT: ["Dikirim ke WhatsApp", "bg-blue-50 text-blue-700"],
  DELIVERED: ["Sampai ke supplier", "bg-emerald-50 text-emerald-700"],
  READ: ["Dibaca supplier", "bg-emerald-50 text-emerald-700"],
  UNDELIVERED: ["Tidak sampai", "bg-red-50 text-red-700"],
} as const

function providerDeliveryLabel(request: PurchaseRequest): readonly [string, string] {
  if (request.providerDeliveryStatus === "PROVIDER_ACCEPTED" && request.deliveryStatusUpdatedAt
    && Date.now() - new Date(request.deliveryStatusUpdatedAt).getTime() >= 10 * 60_000) {
    return ["Status pengantaran belum diketahui", "bg-amber-50 text-amber-800"] as const
  }
  return providerDeliveryLabels[request.providerDeliveryStatus]
}

type FormState = {
  name: string
  contactPerson: string
  phone: string
  email: string
  address: string
  notes: string
  responseTimeoutMinutes: string
  urgentResponseTimeoutMinutes: string
  /// Dipisah koma, mis. "0812…, 0813…".
  extraPhones: string
}

const EMPTY_FORM: FormState = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  responseTimeoutMinutes: "120",
  urgentResponseTimeoutMinutes: "30",
  extraPhones: "",
}

/**
 * Pasangan "bahan:gudang" yang sudah dipetakan ke SATU supplier. Dipakai agar
 * pasangan yang sama tidak bisa dipilih dua kali untuk supplier itu. Supplier
 * lain tetap boleh memakai bahan yang sama (sebagai cadangan/prioritas lain).
 */
function mappedPairs(supplier: Supplier) {
  return new Set(supplier.itemSuppliers.map((mapping) => `${mapping.item.id}:${mapping.location.id}`))
}

export default function SuppliersPage() {
  const canEdit = useCanEdit("SUPPLIERS")
  // Keputusan pesanan supplier (alihkan/hentikan/batalkan) memakai izin Supplier,
  // sama dengan API /api/purchase-requests/[id] dan halaman Barang Masuk.
  const canManageProcurement = canEdit
  const { ask, dialog } = useConfirm()
  const listRef = useRef<HTMLDivElement>(null)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all")
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalAll, setTotalAll] = useState(0)
  const [activeCount, setActiveCount] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [activeView, setActiveView] = useState<"suppliers" | "requests" | "inbox">("suppliers")
  const [jumlahTinjau, setJumlahTinjau] = useState(0)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [warehouseNeeds, setWarehouseNeeds] = useState<WarehouseNeed[]>([])
  const [whatsApp, setWhatsApp] = useState<WhatsAppDevice | null>(null)
  const [checkingWhatsApp, setCheckingWhatsApp] = useState(false)
  const [mappingSupplierId, setMappingSupplierId] = useState<string | null>(null)
  const [mappingForm, setMappingForm] = useState({ itemId: "", locationId: "" })
  const [mappingBusy, setMappingBusy] = useState(false)
  const [editMapping, setEditMapping] = useState<{ id: string; supplierItemName: string; purchaseUnit: string; purchaseUnitSize: string } | null>(null)
  const [requestBusy, setRequestBusy] = useState<string | null>(null)
  const [pesananKey, setPesananKey] = useState(0)

  const fetchProcurementData = useCallback(async () => {
    const [inventoryRes, locationsRes, requestsRes, needsRes, whatsappRes] = await Promise.all([
      fetch("/api/inventory"),
      fetch("/api/locations"),
      fetch("/api/purchase-requests"),
      fetch("/api/purchase-requests?needs=true"),
      fetch("/api/whatsapp/status"),
    ])
    if (inventoryRes.ok) setInventory(await inventoryRes.json())
    if (locationsRes.ok) setLocations(await locationsRes.json())
    if (requestsRes.ok) setRequests(await requestsRes.json())
    if (needsRes.ok) setWarehouseNeeds(await needsRes.json())
    if (whatsappRes.ok) setWhatsApp(await whatsappRes.json())
    setPesananKey((key) => key + 1)
    const inboxRes = await fetch("/api/supplier-inbox?filter=review").catch(() => null)
    if (inboxRes?.ok) setJumlahTinjau(((await inboxRes.json()) as { counts: { review: number } }).counts.review)
  }, [])

  const fetchSuppliers = useCallback(async (nextPage = 1, { silent = false } = {}) => {
    if (!silent) setLoading(true)
    const query = new URLSearchParams({ page: String(nextPage) })
    if (debouncedSearch) query.set("search", debouncedSearch)
    if (status === "active") query.set("active", "true")
    if (status === "inactive") query.set("active", "false")

    const response = await fetch(`/api/suppliers?${query}`)
    if (response.ok) {
      const data = await response.json()
      setSuppliers(data.items)
      setPage(data.page)
      setPages(data.pages)
      setTotal(data.total)
      setTotalAll(data.totalAll)
      setActiveCount(data.activeCount)
    }
    setLoading(false)
  }, [debouncedSearch, status])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timeoutId)
  }, [search])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchSuppliers(1) }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchSuppliers])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchProcurementData() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchProcurementData])

  // Tautan pesanan maupun kebutuhan pembelian dari WA langsung membuka tab Pengadaan.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const view = params.get("view")
    if (view !== "orders" && view !== "procurement" && view !== "inbox" && !params.has("orderId")) return
    const timeoutId = window.setTimeout(() => setActiveView(view === "inbox" ? "inbox" : "requests"), 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  // Supplier yang diubah pengguna lain ikut tampil tanpa memuat ulang halaman.
  useLiveRefresh(() => { void fetchSuppliers(page, { silent: true }) })
  useLiveRefresh(() => { void fetchProcurementData() }, 5_000)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError("")
    setShowForm(true)
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier)
    setForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
      responseTimeoutMinutes: String(supplier.responseTimeoutMinutes),
      urgentResponseTimeoutMinutes: String(supplier.urgentResponseTimeoutMinutes),
      extraPhones: (supplier.extraPhones ?? []).map((row) => row.phone).join(", "),
    })
    setError("")
    setShowForm(true)
  }

  async function saveSupplier(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError("")

    const response = await fetch(editing ? `/api/suppliers/${editing.id}` : "/api/suppliers", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, extraPhones: form.extraPhones.split(/[,\n]/).map((phone) => phone.trim()).filter(Boolean) }),
    })

    if (response.ok) {
      setShowForm(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await fetchSuppliers(editing ? page : 1)
    } else {
      const body = await response.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? "Gagal menyimpan supplier")
    }
    setSubmitting(false)
  }

  function deactivateSupplier(supplier: Supplier) {
    ask({
      title: "Nonaktifkan supplier ini?",
      message: `“${supplier.name}” tidak akan muncul di pilihan Barang Masuk. Riwayat lama tetap tersimpan.`,
      confirmLabel: "Nonaktifkan",
      danger: true,
      onConfirm: async () => {
        const response = await fetch(`/api/suppliers/${supplier.id}`, { method: "DELETE" })
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? "Gagal menonaktifkan supplier")
        }
        await fetchSuppliers(page)
      },
    })
  }

  async function activateSupplier(supplier: Supplier) {
    const response = await fetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    })
    if (response.ok) await fetchSuppliers(page)
  }

  async function addMapping(supplierId: string) {
    if (!mappingForm.itemId || !mappingForm.locationId) return
    setMappingBusy(true)
    setError("")
    const response = await fetch("/api/item-suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...mappingForm, supplierId }),
    })
    if (response.ok) {
      setMappingSupplierId(null)
      setMappingForm({ itemId: "", locationId: "" })
      await fetchSuppliers(page)
    } else {
      const body = await response.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? "Gagal menyimpan pemetaan")
    }
    setMappingBusy(false)
  }

  async function saveMappingDetail() {
    if (!editMapping) return
    setMappingBusy(true)
    setError("")
    const response = await fetch(`/api/item-suppliers/${editMapping.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierItemName: editMapping.supplierItemName,
        purchaseUnit: editMapping.purchaseUnit,
        purchaseUnitSize: editMapping.purchaseUnitSize,
      }),
    })
    if (response.ok) {
      setEditMapping(null)
      await fetchSuppliers(page)
    } else {
      const body = await response.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? "Gagal menyimpan detail pemetaan")
    }
    setMappingBusy(false)
  }

  async function removeMapping(mappingId: string) {
    const response = await fetch(`/api/item-suppliers/${mappingId}`, { method: "DELETE" })
    if (response.ok) await fetchSuppliers(page)
  }

  async function updateRequest(
    id: string,
    action: "RETRY_MESSAGE" | "REMIND_SUPPLIER" | "ESCALATE" | "STOP" | "CANCEL",
    note?: string,
  ) {
    setRequestBusy(id)
    setError("")
    if (action === "RETRY_MESSAGE") {
      const perangkat = await refreshWhatsAppStatus()
      if (!perangkat?.connected) {
        const alasan = perangkat?.error
          ? `Perangkat WhatsApp masih belum terhubung: ${perangkat.error}`
          : "Perangkat WhatsApp belum dapat dipastikan terhubung. Periksa koneksi lalu coba lagi."
        setError(alasan)
        setRequestBusy(null)
        throw new Error(alasan)
      }
    }
    const response = await fetch(`/api/purchase-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(note ? { note } : {}) }),
    })
    const body = await response.json().catch(() => ({})) as { error?: string; message?: string }
    if (!response.ok) {
      setError(body.error ?? "Gagal memperbarui permintaan")
      // Dilempar agar dialog konfirmasi menampilkan alasannya dan tidak menutup
      // diri seolah-olah keputusannya berhasil.
      setRequestBusy(null)
      throw new Error(body.error ?? "Gagal memperbarui permintaan")
    }
    await Promise.all([fetchProcurementData(), fetchSuppliers(page, { silent: true })])
    setRequestBusy(null)
  }

  async function refreshWhatsAppStatus() {
    setCheckingWhatsApp(true)
    try {
      const response = await fetch("/api/whatsapp/status", { cache: "no-store" })
      const body = await response.json().catch(() => null) as WhatsAppDevice | { error?: string } | null
      if (!response.ok) {
        const message = body && "error" in body && body.error ? body.error : "Status perangkat WhatsApp tidak dapat diperiksa"
        const gagal: WhatsAppDevice = { configured: Boolean(whatsApp?.configured), connected: false, status: null, error: message }
        setWhatsApp(gagal)
        return gagal
      }
      const perangkat = body as WhatsAppDevice
      setWhatsApp(perangkat)
      return perangkat
    } catch {
      const gagal: WhatsAppDevice = {
        configured: Boolean(whatsApp?.configured),
        connected: false,
        status: null,
        error: "Koneksi ke pemeriksa WhatsApp gagal. Coba lagi.",
      }
      setWhatsApp(gagal)
      return gagal
    } finally {
      setCheckingWhatsApp(false)
    }
  }

  function decide(request: PurchaseRequest, action: "ESCALATE" | "STOP" | "CANCEL") {
    const alasanAlih = request.supplierReplyStatus === "UNAVAILABLE"
      ? "Supplier menyatakan stok tidak tersedia"
      : request.supplierReplyStatus === "PARTIAL"
        ? "Jumlah yang disanggupi supplier sudah diterima; sisa kebutuhan dialihkan"
      : "Batas waktu balasan supplier terlewati"
    const teks = {
      ESCALATE: {
        title: `Alihkan ke ${request.nextSupplier?.name ?? "supplier berikutnya"}?`,
        message: `Pantau akan mengirim pembatalan ${request.orderCode} ke ${request.supplier.name} lebih dahulu. Hanya jika pembatalan berhasil dikirim, pesanan sisa ${jumlah(request.outstandingQuantity)} ${request.item.unit} dibuat untuk ${request.nextSupplier?.name}.`,
        confirmLabel: "Ya, batalkan & alihkan",
        danger: false,
      },
      STOP: {
        title: "Hentikan pengadaan ini?",
        message: request.outstandingQuantity > 0
          ? `Pakai ini kalau bahannya sudah Anda dapatkan di luar sistem. Karena masih ada ${jumlah(request.outstandingQuantity)} ${request.item.unit} yang belum diterima, pesanan ${request.orderCode} ditutup sebagai GAGAL, bukan terpenuhi — status terpenuhi hanya diberikan setelah barangnya benar-benar tercatat masuk.`
          : `Seluruh ${jumlah(request.quantity)} ${request.item.unit} sudah diterima, jadi pesanan ${request.orderCode} ditutup sebagai terpenuhi.`,
        confirmLabel: "Ya, hentikan",
        danger: false,
      },
      CANCEL: {
        title: "Batalkan pengadaan ini?",
        message: `Pesanan ${request.orderCode} ditutup dan kebutuhannya dianggap tidak jadi dibeli. Tidak ada pesan baru yang dikirim.`,
        confirmLabel: "Ya, batalkan",
        danger: true,
      },
    }[action]

    ask({
      ...teks,
      cancelLabel: "Kembali",
      onConfirm: () => updateRequest(request.id, action, action === "ESCALATE" ? alasanAlih : teks.title),
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Supplier</h1>
          <p className="mt-1 text-sm text-slate-500">Kontak pemasok dan pembelian bahan.</p>
        </div>
        {canEdit && activeView === "suppliers" && (
          <button type="button" onClick={openCreate} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Tambah supplier
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 sm:w-fit" aria-label="Bagian supplier">
        {([
          { key: "suppliers", label: "Supplier", icon: Building2 },
          { key: "requests", label: "Pesanan", icon: ShoppingCart },
          { key: "inbox", label: "Pesan masuk", icon: Inbox },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setActiveView(key)} aria-pressed={activeView === key}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-xs font-semibold transition sm:px-5 sm:text-sm ${activeView === key ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
            <Icon className="hidden h-4 w-4 sm:block" />{label}
            {key === "inbox" && jumlahTinjau > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">{jumlahTinjau}</span>}
          </button>
        ))}
      </div>

      <FormAlert message={error} onClose={() => setError("")} />

      {activeView === "suppliers" ? <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" ref={listRef}>
        <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Daftar supplier <span className="ml-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{totalAll}</span></h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{activeCount} aktif</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input aria-label="Cari supplier" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari supplier atau nomor telepon…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" />
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 sm:shrink-0">
              {([["all", "Semua"], ["active", "Aktif"], ["inactive", "Nonaktif"]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setStatus(value)} aria-pressed={status === value}
                  className={`rounded-lg px-4 py-2 text-xs font-medium transition ${status === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
        ) : suppliers.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Building2 className="h-7 w-7 text-slate-400" />
            </div>
            <div className="mt-4 font-semibold text-slate-700">{search ? "Supplier tidak ditemukan" : "Belum ada supplier"}</div>
            <div className="mt-1 text-sm text-slate-400">{search ? "Coba kata pencarian lain." : "Tambahkan supplier pertama untuk mulai digunakan."}</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {suppliers.map((supplier) => (
              <article key={supplier.id} className="p-4 sm:p-6">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${supplier.isActive ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}><Building2 className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words text-base font-semibold text-slate-900">{supplier.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${supplier.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{supplier.isActive ? "Aktif" : "Nonaktif"}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                      {supplier.contactPerson && <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 shrink-0" />{supplier.contactPerson}</span>}
                      {supplier.phone ? <a href={`tel:${supplier.phone}`} className="inline-flex items-center gap-1.5 hover:text-blue-600"><Phone className="h-3.5 w-3.5 shrink-0" />{supplier.phone}</a> : <span>Nomor telepon belum diisi</span>}
                    </div>
                  </div>
                  {canEdit && <button type="button" onClick={() => openEdit(supplier)} aria-label={`Edit ${supplier.name}`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /><span className="hidden sm:inline">Edit</span></button>}
                </div>

                <div className="mt-5 rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <h4 className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700"><Package className="h-4 w-4 text-slate-400" />Bahan dipasok <span className="font-normal text-slate-400">{supplier.itemSuppliers.length}</span></h4>
                    {canEdit && supplier.isActive && <button type="button" aria-expanded={mappingSupplierId === supplier.id} onClick={() => {
                      setMappingSupplierId(mappingSupplierId === supplier.id ? null : supplier.id)
                      setEditMapping(null)
                      setMappingForm({ itemId: "", locationId: "" })
                      setError("")
                    }} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />Tambah bahan</button>}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {supplier.itemSuppliers.length === 0 ? <p className="px-4 py-5 text-xs text-slate-400">Belum ada bahan. Tambahkan bahan yang dipasok supplier ini.</p> : supplier.itemSuppliers.map((mapping) => (
                      <div key={mapping.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">{mapping.item.name}</span>
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${mapping.priority === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>{mapping.priority === 1 ? "Utama" : `Urutan ${mapping.priority}`}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{mapping.location.name}{mapping.purchaseUnit && mapping.purchaseUnitSize != null && <> · 1 {mapping.purchaseUnit} = {Number(mapping.purchaseUnitSize).toLocaleString("id-ID")} {mapping.item.unit}</>}</p>
                        </div>
                        {canEdit && <div className="flex shrink-0 gap-1">
                          <button type="button" aria-label={`Atur bahan ${mapping.item.name} di ${mapping.location.name}`} aria-expanded={editMapping?.id === mapping.id} onClick={() => {
                            setMappingSupplierId(null)
                            setError("")
                            setEditMapping(editMapping?.id === mapping.id ? null : { id: mapping.id, supplierItemName: mapping.supplierItemName ?? "", purchaseUnit: mapping.purchaseUnit ?? "", purchaseUnitSize: mapping.purchaseUnitSize == null ? "" : String(Number(mapping.purchaseUnitSize)) })
                          }} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => void removeMapping(mapping.id)} aria-label={`Hapus bahan ${mapping.item.name} dari supplier`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>}
                      </div>
                    ))}
                  </div>
                  <div className={mappingSupplierId === supplier.id || supplier.itemSuppliers.some((row) => row.id === editMapping?.id) ? "border-t border-slate-100 p-3 sm:p-4" : ""}>
                      {mappingSupplierId === supplier.id && (
                        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                          <div className="relative min-w-0">
                          <select aria-label="Bahan yang dipasok"
                            value={mappingForm.itemId}
                            onChange={(event) => {
                              const itemId = event.target.value
                              // Gudang yang sudah dipetakan untuk bahan baru ini dikosongkan lagi.
                              const sudahAda = mappedPairs(supplier).has(`${itemId}:${mappingForm.locationId}`)
                              setMappingForm({ itemId, locationId: sudahAda ? "" : mappingForm.locationId })
                            }}
                            className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm outline-none focus:border-blue-400"
                          >
                            <option value="">Pilih bahan</option>
                            {/* Bahan hanya muncul bila masih ada gudang yang belum dipetakan ke supplier ini. */}
                            {inventory
                              .filter((item) => item.isTrackable && item.isActive)
                              .filter((item) => locations.some((location) =>
                                location.type === "WAREHOUSE" && !mappedPairs(supplier).has(`${item.id}:${location.id}`)))
                              .map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          </div>
                          <div className="relative min-w-0">
                          <select aria-label="Gudang tujuan" value={mappingForm.locationId} onChange={(event) => setMappingForm({ ...mappingForm, locationId: event.target.value })} className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm outline-none focus:border-blue-400">
                            <option value="">Pilih gudang</option>
                            {locations.filter((location) => location.type === "WAREHOUSE").map((location) => {
                              const sudahDipetakan = mappedPairs(supplier).has(`${mappingForm.itemId}:${location.id}`)
                              return (
                                <option key={location.id} value={location.id} disabled={sudahDipetakan}>
                                  {location.name}{sudahDipetakan ? " (sudah ditambahkan)" : ""}
                                </option>
                              )
                            })}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          </div>
                          <button type="button" onClick={() => void addMapping(supplier.id)} disabled={mappingBusy || !mappingForm.itemId || !mappingForm.locationId} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                            {mappingBusy ? "Menyimpan..." : "Simpan"}
                          </button>
                        </div>
                      )}
                      {(() => {
                        const mapping = supplier.itemSuppliers.find((row) => row.id === editMapping?.id)
                        if (!mapping || !editMapping) return null
                        return (
                          <div className="rounded-xl bg-slate-50 p-4">
                            <div className="text-xs font-semibold text-slate-700">{mapping.item.name} · {mapping.location.name}</div>
                            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                              Nama dan satuan pada pesanan supplier. Stok tetap dalam {mapping.item.unit}.
                            </p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
                              <label className="text-[11px] font-medium text-slate-500">
                                Nama di supplier
                                <input value={editMapping.supplierItemName} onChange={(event) => setEditMapping({ ...editMapping, supplierItemName: event.target.value })} placeholder={mapping.item.name} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-blue-400" />
                              </label>
                              <label className="text-[11px] font-medium text-slate-500">
                                Satuan beli
                                <input value={editMapping.purchaseUnit} onChange={(event) => setEditMapping({ ...editMapping, purchaseUnit: event.target.value })} placeholder="mis. dus" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-blue-400" />
                              </label>
                              <label className="text-[11px] font-medium text-slate-500">
                                Isi per satuan ({mapping.item.unit})
                                <input type="number" inputMode="decimal" min="0" step="any" value={editMapping.purchaseUnitSize} onChange={(event) => setEditMapping({ ...editMapping, purchaseUnitSize: event.target.value })} placeholder="mis. 100" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-blue-400" />
                              </label>
                              <div className="flex items-end gap-2">
                                <button type="button" onClick={() => setEditMapping(null)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">Batal</button>
                                <button type="button" onClick={() => void saveMappingDetail()} disabled={mappingBusy} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                                  {mappingBusy ? "Menyimpan..." : "Simpan"}
                                </button>
                              </div>
                            </div>
                            {editMapping.purchaseUnit.trim() && Number(editMapping.purchaseUnitSize) > 0 && (
                              <p className="mt-2 text-[11px] text-slate-500">
                                Contoh: pesan 2 {editMapping.purchaseUnit.trim()} = {(2 * Number(editMapping.purchaseUnitSize)).toLocaleString("id-ID")} {mapping.item.unit} masuk stok.
                              </p>
                            )}
                          </div>
                        )
                      })()}
                  </div>
                </div>

                <details className="group mt-4">
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg py-1 text-xs font-medium text-slate-500 hover:text-blue-600 [&::-webkit-details-marker]:hidden">Detail supplier<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary>
                  <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                    {supplier.email && <a href={`mailto:${supplier.email}`} className="flex items-start gap-2 break-all hover:text-blue-600"><Mail className="mt-0.5 h-4 w-4 shrink-0" />{supplier.email}</a>}
                    {supplier.extraPhones?.map((row) => <p key={row.id} className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" />{row.phone}{row.label ? ` · ${row.label}` : ""}</p>)}
                    {supplier.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{supplier.address}</p>}
                    <p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><span>Batas balasan: {supplier.responseTimeoutMinutes} menit · Mendesak: {supplier.urgentResponseTimeoutMinutes} menit</span></p>
                    {supplier.notes && <p className="whitespace-pre-wrap break-words border-t border-slate-200 pt-3">{supplier.notes}</p>}
                    {canEdit && <div className="border-t border-slate-200 pt-3">{supplier.isActive ? (
                      <button type="button" onClick={() => deactivateSupplier(supplier)} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-red-600 hover:bg-red-50"><Power className="h-3.5 w-3.5" />Nonaktifkan supplier</button>
                    ) : <button type="button" onClick={() => void activateSupplier(supplier)} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-50"><CheckCircle2 className="h-3.5 w-3.5" />Aktifkan supplier</button>}</div>}
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}

        <Pagination page={page} pages={pages} total={total} perPage={30} label="supplier" loading={loading} scrollToRef={listRef} onPageChange={(next) => void fetchSuppliers(next)} />
      </div>
      </> : activeView === "inbox" ? (
        <SupplierInbox canManage={canManageProcurement} onBerubah={() => { void fetchProcurementData() }} />
      ) : (
        <div className="space-y-4">
          <div className={`rounded-2xl border px-4 py-3 text-sm ${whatsApp?.connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp {whatsApp?.connected ? "terhubung" : "belum terhubung"}
                </div>
                {whatsApp?.connected
                  ? <p className="mt-1 text-xs">Pesanan dapat dikirim melalui WhatsApp.</p>
                  : <p className="mt-1 text-xs">{whatsApp?.error ?? "Hubungkan WhatsApp untuk mengirim pesanan."}</p>}
              </div>
              <button
                type="button"
                onClick={() => { void refreshWhatsAppStatus() }}
                disabled={checkingWhatsApp}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-current/20 bg-white/70 px-4 text-xs font-semibold disabled:opacity-50 sm:w-auto sm:rounded-full"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${checkingWhatsApp ? "animate-spin" : ""}`} />
                {checkingWhatsApp ? "Memeriksa..." : "Periksa koneksi"}
              </button>
            </div>
          </div>
          <section className="space-y-3">
            <div>
              <h2 className="font-semibold text-slate-900">Perlu dibeli</h2>
              <p className="mt-1 text-sm text-slate-500">Pilih bahan, lalu tentukan jumlah pesanan.</p>
            </div>
            <WarehousePurchaseNeeds
              active={activeView === "requests"}
              onSubmitted={() => { void fetchProcurementData() }}
            >
              {(renderNeed) => warehouseNeeds.length === 0 ? (
                <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Tidak ada yang perlu dibeli</p>
                    <p className="mt-0.5 text-xs text-slate-500">Stok gudang masih di atas minimum.</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">{warehouseNeeds.map((need) => <div key={need.id}>{renderNeed(need)}</div>)}</div>
              )}
            </WarehousePurchaseNeeds>
          </section>
          <div>
            <h2 className="font-semibold text-slate-900">Pesanan ke Supplier</h2>
            <p className="mt-1 text-sm text-slate-500">Pantau pesanan hingga barang diterima.</p>
          </div>
          <SupplierOrders
            canManage={canManageProcurement}
            refreshKey={pesananKey}
            infoBaris={new Map(requests.map((request) => [request.id, request]))}
            busyId={requestBusy}
            onDecide={(lineId, action) => {
              const request = requests.find((row) => row.id === lineId)
              if (request) decide(request, action)
            }}
            onUpdate={(lineId, action) => updateRequest(lineId, action).catch(() => {})}
          />
          {requests.some((request) => !request.purchaseOrderId) && <>
          <div>
            <h2 className="font-semibold text-slate-900">Pesanan sebelumnya</h2>

          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {requests.filter((request) => !request.purchaseOrderId).length === 0 ? (
              <div className="px-4 py-16 text-center">
                <PackageCheck className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">Belum ada permintaan pengadaan</p>
                <p className="mt-1 text-sm text-slate-400">Kebutuhan pembelian muncul saat stok gudang mencapai ambang minimum.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {requests.filter((request) => !request.purchaseOrderId).map((request) => (
                  <div key={request.id} className="space-y-3 p-4 sm:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-slate-900">{request.orderCode} · {request.item.name} · {Number(request.quantity).toLocaleString("id-ID")} {request.item.unit}</div>
                        <div className="mt-1 text-xs text-slate-500">{request.location.name} → {request.supplier.name}{request.supplier.phone ? ` · +${request.supplier.phone}` : ""}</div>
                        <div className="mt-1 text-xs text-slate-600">{quantityBreakdown(request)}</div>
                        <Link href={`/dashboard/audit/purchase/${request.id}`}
                          className="mt-1 inline-flex text-xs font-semibold text-blue-600">
                          Lihat riwayat lengkap
                        </Link>
                        {request.escalatedFrom && (
                          <div className="mt-1 text-xs text-violet-700">
                            Lanjutan dari {request.escalatedFrom.orderCode} · {request.escalatedFrom.supplier.name} tidak dapat memenuhi
                          </div>
                        )}
                        <div className="mt-1 text-xs text-slate-400">{new Date(request.createdAt).toLocaleString("id-ID")}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${supplierReplyLabels[request.supplierReplyStatus][1]}`}>
                          {supplierReplyLabels[request.supplierReplyStatus][0]}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${request.status === "FULFILLED" ? "bg-emerald-50 text-emerald-700" : request.status === "FAILED" ? "bg-red-50 text-red-700" : request.status === "CANCELLED" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`}>
                          {request.status === "FULFILLED" ? "Terpenuhi" : request.status === "FAILED" ? "Supplier gagal" : request.status === "CANCELLED" ? "Dibatalkan" : "Aktif"}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${deliveryLabels[request.messageStatus][1]}`}>
                          {deliveryLabels[request.messageStatus][0]}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${providerDeliveryLabel(request)[1]}`}>
                          {providerDeliveryLabel(request)[0]}
                        </span>
                      </div>
                    </div>
                    {request.messageStatus === "UNCERTAIN" ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Balasan dari penyedia WhatsApp tidak pernah sampai, jadi pesan ini <b>mungkin sudah diterima supplier</b>.
                        Sengaja tidak dikirim ulang otomatis agar supplier tidak menerima pesanan dua kali.
                      </p>
                    ) : request.lastMessageError ? (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{request.lastMessageError}</p>
                    ) : null}
                    {request.supplierLastMessage && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">Balasan supplier: “{request.supplierLastMessage}”{request.supplierLastMessageAt ? ` · ${new Date(request.supplierLastMessageAt).toLocaleString("id-ID")}` : ""}</p>}
                    {request.status === "ACTIVE" && request.supplierReplyStatus === "WAITING" && request.responseOverdueAt ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <p className="font-semibold">Belum dibalas sampai batas waktu</p>
                        <p className="mt-1">Pantau tidak menganggap supplier menolak. Pesanan tetap aktif sampai ada balasan atau keputusan pengguna.</p>
                        {request.lastReminderAt && <p className="mt-1">Pengingat terakhir: {new Date(request.lastReminderAt).toLocaleString("id-ID")} · {request.lastReminderStatus?.toLowerCase() ?? "-"}</p>}
                      </div>
                    ) : request.status === "ACTIVE" && request.supplierReplyStatus === "WAITING" && request.responseDueAt ? (
                      <p className="text-xs text-slate-500">Batas balasan ({request.urgency === "URGENT" ? "mendesak" : "normal"}): {new Date(request.responseDueAt).toLocaleString("id-ID")}</p>
                    ) : null}
                    {canManageProcurement && request.status === "ACTIVE" && (
                      <div className="flex flex-wrap gap-2">
                        {request.supplierReplyStatus === "WAITING" && request.responseOverdueAt && (
                          <button type="button" onClick={() => request.lastReminderStatus === "UNCERTAIN" ? ask({
                            title: "Periksa pengingat di WhatsApp dahulu",
                            message: `Pengiriman pengingat ${request.orderCode} tidak pasti. Pastikan pesan itu belum sampai ke ${request.supplier.name} agar supplier tidak menerima pengingat ganda.`,
                            confirmLabel: "Sudah diperiksa, kirim lagi",
                            cancelLabel: "Batal",
                            onConfirm: () => updateRequest(request.id, "REMIND_SUPPLIER"),
                          }) : void updateRequest(request.id, "REMIND_SUPPLIER")} disabled={requestBusy === request.id || request.lastReminderStatus === "PENDING" || request.lastReminderStatus === "PROCESSING"} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50">
                            <MessageCircle className="h-3.5 w-3.5" /> {request.lastReminderStatus === "FAILED" || request.lastReminderStatus === "DEAD" ? "Coba kirim pengingat lagi" : request.lastReminderStatus === "UNCERTAIN" ? "Periksa pengingat dahulu" : "Kirim pengingat"}
                          </button>
                        )}
                        {(request.messageStatus === "FAILED" || request.messageStatus === "DEAD") && (
                          <button type="button" onClick={() => { void updateRequest(request.id, "RETRY_MESSAGE").catch(() => {}) }} disabled={requestBusy === request.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                            <RotateCcw className={`h-3.5 w-3.5 ${requestBusy === request.id ? "animate-spin" : ""}`} /> Periksa koneksi &amp; kirim ulang
                          </button>
                        )}
                        {request.messageStatus === "UNCERTAIN" && (
                          <button
                            type="button"
                            disabled={requestBusy === request.id}
                            onClick={() => ask({
                              title: "Periksa WhatsApp dahulu",
                              message: `Buka WhatsApp dan pastikan pesanan ${request.orderCode} benar-benar belum sampai ke ${request.supplier.name}. Kalau pesannya ternyata sudah ada di sana, jangan kirim ulang — supplier bisa mengira ada dua pesanan.`,
                              confirmLabel: "Sudah diperiksa, kirim ulang",
                              cancelLabel: "Batal",
                              onConfirm: () => updateRequest(request.id, "RETRY_MESSAGE"),
                            })}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> Periksa WhatsApp dahulu
                          </button>
                        )}
                      </div>
                    )}
                    {canManageProcurement && request.status === "ACTIVE" && (
                      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-700">
                          {request.supplierReplyStatus === "UNAVAILABLE"
                            ? <><b>{request.supplier.name}</b> menyatakan stoknya kosong.</>
                            : <>Kalau <b>{request.supplier.name}</b> tidak dapat memenuhi pesanan ini, pilih salah satu.</>}
                          {" "}
                          {request.nextSupplier
                            ? <>Supplier berikutnya: <b>{request.nextSupplier.name}</b> (prioritas {request.nextSupplier.priority}), untuk sisa {jumlah(request.outstandingQuantity)} {request.item.unit}.</>
                            : <>Tidak ada supplier berikutnya — <b>semua supplier untuk bahan ini sudah dicoba</b>, jadi keputusannya ada di Anda.</>}
                        </p>
                        {request.nextSupplier && request.supplierReplyStatus === "WAITING" && !request.responseOverdueAt && (
                          <p className="text-xs text-slate-500">
                            Pergantian supplier tersedia setelah batas balasan terlewati
                            {request.responseDueAt ? ` (${new Date(request.responseDueAt).toLocaleString("id-ID")})` : " dan pesan pesanan berhasil dikirim"}.
                          </p>
                        )}
                        {request.nextSupplier && (request.supplierReplyStatus === "UNAVAILABLE" || Boolean(request.responseOverdueAt)
                          || request.supplierReplyStatus === "PARTIAL" && request.promisedQuantity != null
                            && request.receivedQuantity >= request.promisedQuantity) && (
                          <p className="text-xs text-slate-500">Pembatalan dikirim ke {request.supplier.name} dahulu. Setelah berhasil, pesanan baru diantrekan ke {request.nextSupplier.name}.</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/dashboard/goods-receipt?purchaseRequestId=${request.id}`}
                            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                          >
                            Catat Barang Masuk
                          </Link>
                          <button
                            type="button"
                            disabled={requestBusy === request.id || !request.nextSupplier
                              || !(request.supplierReplyStatus === "UNAVAILABLE"
                                || request.supplierReplyStatus === "WAITING" && Boolean(request.responseOverdueAt)
                                || request.supplierReplyStatus === "PARTIAL" && request.promisedQuantity != null
                                  && request.receivedQuantity >= request.promisedQuantity)}
                            title={!request.nextSupplier
                              ? "Tidak ada supplier berikutnya untuk bahan ini"
                              : request.supplierReplyStatus === "WAITING" && !request.responseOverdueAt
                                ? "Tunggu sampai batas waktu balasan supplier terlewati"
                                : request.supplierReplyStatus === "NEEDS_REVIEW"
                                  ? "Tinjau balasan supplier lebih dahulu"
                                  : request.supplierReplyStatus === "PARTIAL" && request.promisedQuantity != null
                                    && request.receivedQuantity < request.promisedQuantity
                                    ? `Terima dulu ${jumlah(request.promisedQuantity)} ${request.item.unit} yang disanggupi supplier`
                                  : !["WAITING", "UNAVAILABLE", "PARTIAL"].includes(request.supplierReplyStatus)
                                    ? "Supplier sudah menyanggupi atau mengirim barang"
                                    : undefined}
                            onClick={() => decide(request, "ESCALATE")}
                            className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Coba supplier berikutnya
                          </button>
                          <button
                            type="button"
                            disabled={requestBusy === request.id}
                            onClick={() => decide(request, "STOP")}
                            className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                          >
                            {request.outstandingQuantity > 0 ? "Hentikan pengadaan" : "Tutup, barang sudah lengkap"}
                          </button>
                          <button
                            type="button"
                            disabled={requestBusy === request.id}
                            onClick={() => decide(request, "CANCEL")}
                            className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                          >
                            Batalkan pengadaan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </>}
        </div>
      )}

      {showForm && (
        <AppPortal>
        <div className="app-overlay mobile-fullscreen-dialog z-[9000] flex items-center justify-center sm:p-4">
          <button type="button" aria-label="Tutup formulir" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={() => !submitting && setShowForm(false)} />
          <form onSubmit={saveSupplier} onInvalidCapture={(event) => { const section = (event.target as HTMLElement).closest("details"); if (section) section.open = true }} role="dialog" aria-modal="true" aria-labelledby="supplier-form-title" className="mobile-dialog-panel relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 id="supplier-form-title" className="text-lg font-semibold text-slate-900">{editing ? "Edit supplier" : "Tambah supplier"}</h2>
                <p className="mt-1 text-xs text-slate-500">Isi kontak utama supplier.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={submitting} aria-label="Tutup formulir supplier" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="mobile-dialog-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
              <FormAlert message={error} onClose={() => setError("")} />
              <Field label="Nama supplier" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="Contoh: Bahan Baku Jaya" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nomor WhatsApp" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="08xxxxxxxxxx" type="tel" />
                <Field label="Nama kontak" value={form.contactPerson} onChange={(value) => setForm({ ...form, contactPerson: value })} placeholder="Contoh: Pak Budi" />
              </div>
              <details className="group rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden"><span>Informasi tambahan <span className="ml-1 text-xs font-normal text-slate-400">Opsional</span></span><ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" /></summary>
                <div className="space-y-4 border-t border-slate-100 p-4">
                  <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="supplier@email.com" type="email" />
                  <div>
                    <Field label="Nomor WhatsApp tambahan" value={form.extraPhones} onChange={(value) => setForm({ ...form, extraPhones: value })} placeholder="0812…, 0813…" />
                    <p className="mt-1.5 text-xs text-slate-400">Maksimal 5 nomor, pisahkan dengan koma.</p>
                  </div>
                  <label className="block text-sm font-medium text-slate-700">Alamat<textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} rows={2} placeholder="Alamat supplier" className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" /></label>
                  <label className="block text-sm font-medium text-slate-700">Catatan<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} placeholder="Catatan untuk tim Anda" className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" /></label>
                </div>
              </details>
              <details className="group rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden"><span>Waktu balasan <span className="ml-1 text-xs font-normal text-slate-400">{form.responseTimeoutMinutes} / {form.urgentResponseTimeoutMinutes} menit</span></span><ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" /></summary>
                <div className="space-y-3 border-t border-slate-100 p-4">
                  <p className="text-xs leading-5 text-slate-500">Batas waktu supplier menjawab pesanan.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Normal (menit)" required value={form.responseTimeoutMinutes} onChange={(value) => setForm({ ...form, responseTimeoutMinutes: value })} placeholder="120" type="number" />
                    <Field label="Mendesak (menit)" required value={form.urgentResponseTimeoutMinutes} onChange={(value) => setForm({ ...form, urgentResponseTimeoutMinutes: value })} placeholder="30" type="number" />
                  </div>
                </div>
              </details>
            </div>
            <div className="mobile-dialog-actions flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
              <button type="button" onClick={() => setShowForm(false)} disabled={submitting} className="h-10 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button>
              <button type="submit" disabled={submitting} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Menyimpan..." : "Simpan supplier"}
              </button>
            </div>
          </form>
        </div>
        </AppPortal>
      )}

      {dialog}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = "text", required = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      <input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
    </label>
  )
}
