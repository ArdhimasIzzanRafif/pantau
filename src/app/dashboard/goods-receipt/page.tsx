"use client"

import { Fragment, useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { Pagination } from "@/components/ui/pagination"
import { FormAlert } from "@/components/ui/form-alert"
import { FileText, Plus, Truck, X, Loader2, CheckCircle, Package, Sparkles, AlertTriangle, Camera, ImageIcon, ChevronDown, Phone, RotateCcw, Lock, Ban } from "lucide-react"
import { WarningModal } from "@/components/ui/warning-modal"
import { AppDatePicker } from "@/components/ui/app-date-picker"
import { StableDraftInput } from "@/components/ui/stable-draft-input"
import { compressImage } from "@/lib/compress-image"
import { useCanEdit, DISABLED_ACTION_CLASS, NO_EDIT_PERMISSION_TITLE } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { useConfirm } from "@/components/ui/use-confirm"
import { putuskanTautanPenerimaan } from "@/lib/purchase-receipt-link"
import { PesananSupplierCard, sisaTerkonfirmasi, tombolSekunder, type PesananSupplier } from "@/components/purchase-order-card"

type Location = { id: string; name: string }
type SupplierOption = {
  id: string
  name: string
  contactPerson: string | null
  phone: string | null
}
type Item = {
  id: string
  name: string
  sku: string | null
  unit: string
  packSize: number | null
  packUnit: string | null
  costPrice: number | null
}
type Receipt = {
  id: string
  createdAt: string
  supplier: string | null
  receiptNumber: string | null
  notes: string | null
  imageUrl: string | null
  location: { id: string; name: string }
  items: Array<{
    quantity: number | string
    batchNumber: string | null
    expiryDate: string | null
    item: { name: string; unit: string }
  }>
}
type PurchaseOrder = {
  id: string
  /// Terisi bila baris ini bagian dari pesanan banyak bahan (ditampilkan per pesanan).
  purchaseOrderId: string | null
  orderCode: string
  status: "ACTIVE" | "FULFILLED" | "FAILED" | "CANCELLED"
  supplierReplyStatus: "WAITING" | "READY" | "PARTIAL" | "SHIPPED" | "UNAVAILABLE" | "NEEDS_REVIEW"
  quantity: number | string
  receivedQuantity: number | string
  promisedQuantity: number | string | null
  shippedQuantity: number | string | null
  supplierLastMessage: string | null
  supplierLastMessageAt: string | null
  supplierShippedAt: string | null
  responseDueAt: string | null
  responseOverdueAt: string | null
  /// Supplier berikutnya menurut prioritas; null berarti semuanya sudah dicoba.
  nextSupplier: { id: string; name: string; priority: number } | null
  createdAt: string
  item: { id: string; name: string; unit: string }
  location: { id: string; name: string }
  supplier: { id: string; name: string; phone: string | null }
}
type Row = {
  itemId: string        // "__new__" = item baru belum ada di master
  customName: string
  customUnit: string
  customPackSize: string
  customPackUnit: string
  /// Jumlah barang BAIK — hanya ini yang masuk stok.
  qty: string
  /// Tiba tetapi rusak, dan yang tidak ikut tiba. Dicatat, tidak masuk stok.
  damagedQty: string
  missingQty: string
  cost: string
  exactBaseCost: number | null // sumber harga presisi agar ganti satuan tidak menumpuk pembulatan
  batchNumber: string
  expiryDate: string
  inputUnit: "base" | "pack"   // "pack" = input dalam kemasan (dus)
}
const NEW_ITEM = "__new__"
const UNIT_OPTIONS = ["pcs", "kg", "gram", "liter", "ml", "botol", "dus", "karton", "pack", "lusin", "porsi", "meter"]

const EMPTY_ROW: Row = {
  itemId: "", customName: "", customUnit: "pcs", customPackSize: "", customPackUnit: "",
  qty: "", damagedQty: "", missingQty: "",
  cost: "", exactBaseCost: null, batchNumber: "", expiryDate: "", inputUnit: "base",
}

function formatQty(value: number | string) {
  const qty = Number(value)
  if (!Number.isFinite(qty)) return "0"
  return qty.toLocaleString("id-ID", { maximumFractionDigits: 3 })
}

function parseRupiahInput(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits ? Number(digits) : 0
}

function formatRupiahInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "")
  return digits ? Number(digits).toLocaleString("id-ID") : ""
}

/** Transfer gudang → outlet yang sudah dikirim dan menunggu diterima. */
type KirimanGudang = {
  id: string
  sentAt: string | null
  toLocationId: string
  fromLocation: { name: string }
  toLocation: { name: string }
  items: Array<{ id: string; quantity: number | string; item: { name: string; unit: string } }>
}

export default function GoodsReceiptPage() {
  const canEdit = useCanEdit("GOODS_RECEIPT")
  const { data: session } = useSession()
  const sessionUser = session?.user as { role?: string; locationIds?: string[] } | undefined
  // Kiriman dari gudang juga divalidasi dari halaman ini (foto wajib di form
  // Konfirmasi Penerimaan). Yang boleh menerima: Owner, atau Supervisor yang
  // ditugaskan di lokasi tujuan — sama dengan aturan di halaman Transfer.
  const [kirimanGudang, setKirimanGudang] = useState<KirimanGudang[]>([])
  const fetchKirimanGudang = useCallback(async () => {
    const role = sessionUser?.role
    if (!role || !["OWNER", "SUPERVISOR"].includes(role)) { setKirimanGudang([]); return }
    const res = await fetch("/api/transfers?status=SENT&perPage=30", { cache: "no-store" })
    if (!res.ok) return
    const data = await res.json() as { items: KirimanGudang[] }
    setKirimanGudang(data.items.filter((t) => role === "OWNER" || (sessionUser?.locationIds ?? []).includes(t.toLocationId)))
  }, [sessionUser?.role, sessionUser?.locationIds])
  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchKirimanGudang() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchKirimanGudang])
  // Keputusan pengadaan (alihkan supplier, hentikan, batalkan) adalah pekerjaan
  // yang berbeda dari mencatat penerimaan, jadi izinnya juga berbeda: Owner
  // otomatis punya, peran lain perlu diberi akses ubah pada fitur Supplier.
  const canManageProcurement = useCanEdit("SUPPLIERS")
  const { ask, dialog } = useConfirm()
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null)
  const [waRetryError, setWaRetryError] = useState("")
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [inventoryItems, setInventoryItems] = useState<Item[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [warning, setWarning] = useState<{ title: string; messages: string[] } | null>(null)
  /// Daftar pesanan sudah selesai dimuat — daftar kosong pun dianggap selesai.
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  /// Permintaan daftar pesanan gagal. Berbeda dari daftar kosong: yang ini
  /// berarti kita tidak tahu apa-apa, bukan tahu bahwa tidak ada pesanan.
  const [ordersFailed, setOrdersFailed] = useState(false)

  const [filterLocation, setFilterLocation] = useState("")
  const [filterFrom,     setFilterFrom]     = useState("")
  const [filterTo,       setFilterTo]       = useState("")
  const [draftFilterFrom, setDraftFilterFrom] = useState("")
  const [draftFilterTo, setDraftFilterTo] = useState("")

  const [locationId, setLocationId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [supplierName, setSupplierName] = useState("")
  const [receiptNumber, setReceiptNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoLoadError, setPhotoLoadError] = useState(false)
  const [rows, setRows] = useState<Row[]>([
    { ...EMPTY_ROW },
  ])
  const [purchaseRequestId, setPurchaseRequestId] = useState<string | null>(null)
  /// Pesanan yang sedang dicatat, untuk menampilkan angka terkunci di formulir.
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null)
  /// Pesanan banyak bahan yang sedang dicatat (satu penerimaan untuk semua bahannya).
  const [pesananBanyak, setPesananBanyak] = useState<PesananSupplier | null>(null)
  const [pesananAktif, setPesananAktif] = useState<PesananSupplier[]>([])
  /// Jalur darurat: barang pesanan datang sebelum supplier mengonfirmasi.
  const [alasanTanpaKonfirmasi, setAlasanTanpaKonfirmasi] = useState<string | null>(null)
  const [receivedAt, setReceivedAt] = useState("")
  /// Dibuat sekali tiap formulir dibuka. Dikirim bersama permintaan agar
  /// pengiriman ulang tidak menambah stok dua kali.
  const [clientRequestId, setClientRequestId] = useState("")
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const listRef = useRef<HTMLElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const fetchPurchaseOrders = useCallback(async () => {
    void fetch("/api/purchase-orders?active=true&perPage=30", { cache: "no-store" })
      .then(async (response) => { if (response.ok) setPesananAktif((await response.json()).items) })
      .catch(() => { /* Daftar pesanan lama tetap tampil. */ })
    try {
      const response = await fetch("/api/purchase-requests")
      if (!response.ok) { setOrdersFailed(true); return }
      setPurchaseOrders((await response.json()).filter((request: PurchaseOrder) => request.status === "ACTIVE"))
      setOrdersFailed(false)
    } catch {
      setOrdersFailed(true)
    } finally {
      // Selalu dinyalakan, apa pun hasilnya: tautan langsung menunggu penanda
      // ini, jadi kegagalan pun harus menghentikan penantian.
      setOrdersLoaded(true)
    }
  }, [])

  const fetchReceipts = useCallback(async (nextPage = 1, { silent = false } = {}) => {
    if (!silent) setLoading(true)
    const p = new URLSearchParams({ page: String(nextPage) })
    if (filterFrom)     p.set("from",       filterFrom)
    if (filterTo)       p.set("to",         filterTo)
    if (filterLocation) p.set("locationId", filterLocation)
    const res = await fetch(`/api/goods-receipts?${p}`)
    if (res.ok) {
      const data = await res.json()
      setReceipts(data.items)
      setPage(data.page)
      setPages(data.pages)
      setTotal(data.total)
    }
    setLoading(false)
  }, [filterFrom, filterTo, filterLocation])

  async function fetchData() {
    // Dijalankan berbarengan dengan yang lain, tetapi lewat fungsi yang sama
    // dengan polling supaya penanda selesainya ikut tersetel.
    const pesananSelesai = fetchPurchaseOrders()
    const [lRes, iRes, sRes] = await Promise.all([
      fetch("/api/locations"),
      fetch("/api/inventory"),
      fetch("/api/suppliers?active=true"),
    ])
    if (lRes.ok) {
      const locs = await lRes.json()
      setLocations(locs)
      if (locs.length) setLocationId(locs[0].id)
    }
    if (iRes.ok) setInventoryItems(await iRes.json())
    if (sRes.ok) setSuppliers(await sRes.json())
    await pesananSelesai
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { fetchData() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  // Filter riwayat dijalankan di server, jadi daftar dimuat ulang saat filter berubah.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchReceipts() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchReceipts])

  // Penerimaan barang yang dicatat pengguna lain ikut muncul tanpa memuat ulang.
  // Antrean penerimaan berubah begitu supplier membalas lewat WhatsApp, jadi
  // diperiksa jauh lebih sering daripada bawaan 20 detik.
  useLiveRefresh(() => { void Promise.all([fetchReceipts(page, { silent: true }), fetchPurchaseOrders(), fetchKirimanGudang()]) }, 5000)

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  /**
   * Batas pemeriksaan fisik berasal dari keputusan supplier dan tidak boleh
   * diketik ulang. Petugas hanya mencatat pengecualiannya (rusak/tidak tiba),
   * lalu jumlah baik dihitung dari sisa batas tersebut.
   */
  function confirmedInspectionLimit(row: Row): number | null {
    if (alasanTanpaKonfirmasi !== null) return null

    if (purchaseOrder?.item.id === row.itemId) {
      const orderRemaining = Math.max(0, Number(purchaseOrder.quantity) - Number(purchaseOrder.receivedQuantity))
      const supplierLimit = purchaseOrder.shippedQuantity ?? purchaseOrder.promisedQuantity ?? purchaseOrder.quantity
      return Math.min(orderRemaining, Math.max(0, Number(supplierLimit) - Number(purchaseOrder.receivedQuantity)))
    }

    const line = pesananBanyak?.lines.find((candidate) => candidate.status === "ACTIVE" && candidate.item.id === row.itemId)
    return line ? sisaTerkonfirmasi(line) : null
  }

  /** Acuan pesanan dalam satuan yang sedang dipilih pada baris formulir. */
  function inspectionReferenceForInput(row: Row): number | null {
    const baseReference = confirmedInspectionLimit(row)
    if (baseReference == null || row.inputUnit !== "pack") return baseReference
    const factor = getItem(row.itemId)?.packSize ?? 1
    return factor > 0 ? baseReference / factor : baseReference
  }

  /** Jumlah baik boleh dikoreksi; kekurangan dihitung dari hasil fisik. */
  function updateGoodQuantity(i: number, value: string) {
    const row = rows[i]
    const reference = inspectionReferenceForInput(row)
    const good = Math.max(0, Number(value) || 0)
    const damaged = Math.max(0, Number(row.damagedQty) || 0)
    updateRow(i, {
      qty: value,
      ...(reference == null ? {} : { missingQty: String(Math.max(0, reference - good - damaged)) }),
    })
  }

  function updateDamagedQuantity(i: number, value: string) {
    const row = rows[i]
    const reference = inspectionReferenceForInput(row)
    const good = Math.max(0, Number(row.qty) || 0)
    const damaged = Math.max(0, Number(value) || 0)
    updateRow(i, {
      damagedQty: value,
      ...(reference == null ? {} : { missingQty: String(Math.max(0, reference - good - damaged)) }),
    })
  }

  function getItem(itemId: string): Item | undefined {
    return inventoryItems.find((it) => it.id === itemId)
  }

  function masterCostForInput(row: Row): number | null {
    const item = getItem(row.itemId)
    if (item?.costPrice == null) return null
    const baseCost = Number(item.costPrice)
    return row.inputUnit === "pack" && item.packSize
      ? baseCost * item.packSize
      : baseCost
  }

  function purchaseCostForInput(row: Row): number | null {
    if (!row.cost) return null

    const item = getItem(row.itemId)
    const packSize = item?.packSize
      ?? (row.itemId === NEW_ITEM ? Number(row.customPackSize) || 1 : 1)

    if (row.exactBaseCost != null) {
      return row.exactBaseCost * (row.inputUnit === "pack" ? packSize : 1)
    }

    return parseRupiahInput(row.cost)
  }

  function purchaseLineTotal(row: Row): number {
    return Number(row.qty) * (purchaseCostForInput(row) ?? 0)
  }

  function priceDiff(row: Row): { diff: number; pct: number | null } | null {
    const master = masterCostForInput(row)
    const incoming = purchaseCostForInput(row)
    if (master == null || incoming == null || Math.abs(incoming - master) < 0.5) return null
    return {
      diff: incoming - master,
      // Tidak ada persentase yang bermakna jika titik awalnya Rp0.
      pct: master === 0 ? null : ((incoming - master) / master) * 100,
    }
  }

  function resolvedQty(row: Row): number {
    const qty = Number(row.qty)
    if (!qty) return 0
    if (row.inputUnit === "pack" && row.itemId !== NEW_ITEM) {
      const item = getItem(row.itemId)
      return qty * (item?.packSize ?? 1)
    }
    if (row.inputUnit === "pack" && row.itemId === NEW_ITEM) {
      return qty * (Number(row.customPackSize) || 1)
    }
    return qty
  }

  function openGenericReceipt() {
    setAlasanTanpaKonfirmasi(null)
    setPurchaseRequestId(null)
    setPurchaseOrder(null)
    setPesananBanyak(null)
    setRows([{ ...EMPTY_ROW }])
    setSupplierId("")
    setSupplierName("")
    setReceiptNumber("")
    setNotes("")
    setPhotoUrl(null)
    setError("")
    setShowForm(true)
  }

  /** Satu penerimaan untuk seluruh bahan aktif pesanan; bahan & jumlah sisa terisi. */
  function openOrderReceipt(order: PesananSupplier) {
    // Belum dikonfirmasi supplier → form dibuka dalam mode darurat (wajib alasan + foto).
    setAlasanTanpaKonfirmasi(order.dikonfirmasi ? null : "")
    const rowsPesanan = order.lines
      .filter((line) => line.status === "ACTIVE" && sisaTerkonfirmasi(line) > 0)
      .map((line) => {
        const item = inventoryItems.find((candidate) => candidate.id === line.item.id)
        const baseCost = item?.costPrice == null ? null : Number(item.costPrice)
        const conversionFactor = Number(line.conversionFactor ?? 1)
        // Gunakan satuan pembelian yang dipakai pada pesanan bila cocok dengan
        // kemasan item. Hasilnya sama persis seperti memilih item tersebut pada
        // form Barang Masuk manual: jumlah dan HPP tampil dalam satuan kemasan.
        const usesPack = Boolean(
          item?.packSize && item.packUnit && conversionFactor > 1
          && Math.abs(conversionFactor - item.packSize) < 0.000001,
        )
        const quantity = sisaTerkonfirmasi(line) / (usesPack ? conversionFactor : 1)
        const displayCost = baseCost == null ? null : baseCost * (usesPack ? conversionFactor : 1)
        return {
          ...EMPTY_ROW,
          itemId: line.item.id,
          qty: String(quantity),
          cost: displayCost == null ? "" : formatRupiahInput(Math.round(displayCost)),
          exactBaseCost: baseCost,
          inputUnit: usesPack ? "pack" as const : "base" as const,
        }
      })
    if (rowsPesanan.length === 0) {
      setWarning({ title: "Pesanan sudah diterima lengkap", messages: ["Tidak ada bahan yang masih menunggu penerimaan pada pesanan ini."] })
      return
    }
    setPurchaseRequestId(null)
    setPurchaseOrder(null)
    setPesananBanyak(order)
    setReceivedAt(new Date().toLocaleDateString("sv-SE"))
    setClientRequestId(crypto.randomUUID())
    setLocationId(order.location.id)
    setSupplierId(order.supplier.id)
    setSupplierName(order.supplier.name)
    setReceiptNumber("")
    setNotes(`Penerimaan pesanan #${order.shortCode}`)
    setPhotoUrl(null)
    setRows(rowsPesanan)
    setError("")
    setShowForm(true)
  }

  function openPurchaseReceipt(request: PurchaseOrder) {
    const remaining = Math.max(0, Number(request.quantity) - Number(request.receivedQuantity))
    const supplierLimit = request.shippedQuantity ?? request.promisedQuantity ?? request.quantity
    const confirmedRemaining = Math.max(0, Number(supplierLimit) - Number(request.receivedQuantity))
    const quantityToReceive = Math.min(remaining, confirmedRemaining)
    const sudahDikonfirmasi = ["READY", "PARTIAL", "SHIPPED"].includes(request.supplierReplyStatus)
    const item = inventoryItems.find((candidate) => candidate.id === request.item.id)
    const cost = item?.costPrice == null ? "" : formatRupiahInput(Math.round(Number(item.costPrice)))
    setPurchaseRequestId(request.id)
    setPurchaseOrder(request)
    setPesananBanyak(null)
    setAlasanTanpaKonfirmasi(sudahDikonfirmasi ? null : "")
    setReceivedAt(new Date().toLocaleDateString("sv-SE"))
    setClientRequestId(crypto.randomUUID())
    setLocationId(request.location.id)
    setSupplierId(request.supplier.id)
    setSupplierName(request.supplier.name)
    setReceiptNumber("")
    setNotes(`Penerimaan pesanan ${request.orderCode}`)
    setPhotoUrl(null)
    setRows([{ ...EMPTY_ROW, itemId: request.item.id, qty: String(quantityToReceive), cost, exactBaseCost: item?.costPrice == null ? null : Number(item.costPrice), inputUnit: "base" }])
    setError("")
    setShowForm(true)
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true)
    setPhotoLoadError(false)
    setError("")
    // Foto kamera HP (HEIC / 3-5 MB) dikecilkan & diubah ke JPEG dulu
    const upload = await compressImage(file)
    const fd = new FormData()
    fd.append("file", upload)
    fd.append("folder", "receipts")
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (res.ok) {
      const data = await res.json()
      setPhotoUrl(data.url)
    } else {
      const reason = await res.json().then((d) => d?.error).catch(() => null)
      setError(reason ? `Gagal upload foto: ${reason}` : "Gagal upload foto. Coba lagi.")
    }
    setUploadingPhoto(false)
  }

  async function handleSubmit(confirmations: { freeCost?: boolean; allProblems?: boolean; overage?: boolean } = {}) {
    setError("")
    // Kiriman dari pesanan boleh berjumlah baik 0 — misalnya seluruhnya tiba
    // dalam keadaan rusak — asalkan ada angka yang dicatat.
    const adaAngka = (r: Row) => Number(r.qty) > 0
      || Number(r.damagedQty) > 0 || Number(r.missingQty) > 0
    const validRows = rows.filter(
      (r) => (r.itemId && r.itemId !== NEW_ITEM || (r.itemId === NEW_ITEM && r.customName.trim())) && adaAngka(r)
    )

    const issues: string[] = []
    if (!photoUrl) issues.push("Foto surat jalan atau barang wajib diunggah")
    if ((purchaseOrder || pesananBanyak) && alasanTanpaKonfirmasi !== null && alasanTanpaKonfirmasi.trim().length < 5) {
      issues.push("Isi alasan barang datang tanpa konfirmasi supplier (minimal 5 huruf)")
    }
    if (!validRows.length) {
      issues.push(purchaseOrder || pesananBanyak
        ? "Isi jumlah barang baik, rusak, atau tidak tiba"
        : "Tambahkan minimal 1 item dengan jumlah lebih dari 0")
    }
    const zeroOrBlankCostRows = validRows.filter((row) => row.cost.trim() === "" || parseRupiahInput(row.cost) <= 0)
    const invalidFreeRows = zeroOrBlankCostRows.filter((row) => (
      row.itemId === NEW_ITEM || Number(getItem(row.itemId)?.costPrice) !== 0
    ))
    if (invalidFreeRows.length > 0) {
      const names = invalidFreeRows.map((row) => row.itemId === NEW_ITEM
        ? row.customName.trim() || "Item baru"
        : getItem(row.itemId)?.name ?? "Item").join(", ")
      issues.push(`Harga beli wajib diisi lebih dari Rp0 untuk: ${names}. Jika memang gratis, atur HPP item menjadi Rp0 di Master Inventori terlebih dahulu`)
    }
    if (issues.length > 0) {
      setWarning({ title: "Lengkapi penerimaan barang", messages: issues })
      return
    }
    const allRowsProblematic = validRows.every((row) => !(Number(row.qty) > 0))
    if (!confirmations.freeCost && zeroOrBlankCostRows.length > 0) {
      const names = zeroOrBlankCostRows.map((row) => getItem(row.itemId)?.name ?? "Item").join(", ")
      ask({
        title: "Catat sebagai barang gratis?",
        message: `Harga ${names} kosong atau Rp0 dan HPP Master Inventori sudah Rp0. Barang akan dicatat tanpa nilai pembelian dan tidak mengubah HPP.${allRowsProblematic ? " Tidak ada barang yang diterima baik; semuanya akan dicatat rusak atau tidak tiba." : ""}`,
        confirmLabel: "Ya, catat gratis",
        cancelLabel: "Isi harga",
        onConfirm: () => handleSubmit({
          ...confirmations,
          freeCost: true,
          allProblems: confirmations.allProblems || allRowsProblematic,
        }),
      })
      return
    }
    // Pengaman salah input: tidak ada satu pun barang yang dicatat baik.
    if (!confirmations.allProblems && allRowsProblematic) {
      ask({
        title: "Semua barang dicatat bermasalah?",
        message: "Tidak ada barang yang dicatat diterima baik. Semuanya akan dicatat rusak/tidak tiba dan TIDAK menambah stok. Pastikan angka tidak salah kolom.",
        confirmLabel: "Ya, memang semua bermasalah",
        cancelLabel: "Periksa lagi",
        danger: true,
        onConfirm: () => handleSubmit({ ...confirmations, allProblems: true }),
      })
      return
    }
    const excessRows = validRows.filter((row) => {
      const reference = inspectionReferenceForInput(row)
      return reference != null && Number(row.qty) > reference
    })
    if (!confirmations.overage && excessRows.length > 0) {
      const details = excessRows.map((row) => {
        const item = getItem(row.itemId)
        const reference = inspectionReferenceForInput(row) ?? 0
        const unit = row.inputUnit === "pack" ? item?.packUnit : item?.unit
        return `${item?.name ?? "Item"}: diterima baik ${formatQty(row.qty)} ${unit}, acuan ${formatQty(reference)} ${unit}`
      }).join("; ")
      ask({
        title: "Jumlah diterima melebihi pesanan?",
        message: `${details}. Seluruh jumlah baik akan masuk stok dan kelebihannya dicatat dalam riwayat.`,
        confirmLabel: "Ya, catat jumlah fisik",
        cancelLabel: "Periksa lagi",
        onConfirm: () => handleSubmit({ ...confirmations, overage: true }),
      })
      return
    }

    setSubmitting(true)
    try {
    const resolvedRows: Array<{
      itemId: string
      inputQuantity: number
      inputUnit: "base" | "pack"
      inputUnitCost: number | null
      damagedQuantity: number
      missingQuantity: number
      batchNumber: string | null
      expiryDate: string | null
    }> = []
    for (const r of validRows) {
      if (r.itemId === NEW_ITEM) {
        const enteredCost = purchaseCostForInput(r)
        const costPerBase = enteredCost != null && Number(r.customPackSize) > 1 && r.inputUnit === "pack"
          ? enteredCost / Number(r.customPackSize)
          : enteredCost
        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: r.customName.trim(),
            unit: r.customUnit.trim() || "pcs",
            packSize: r.customPackSize ? Number(r.customPackSize) : null,
            packUnit: r.customPackUnit.trim() || null,
            costPrice: costPerBase,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          setError(`Gagal buat item "${r.customName}": ${d.error ?? "error"}`)
          setSubmitting(false)
          return
        }
        const newItem = await res.json()
        resolvedRows.push({
          itemId: newItem.id,
          inputQuantity: Number(r.qty),
          inputUnit: r.inputUnit,
          inputUnitCost: enteredCost,
          damagedQuantity: Number(r.damagedQty) || 0,
          missingQuantity: Number(r.missingQty) || 0,
          batchNumber: r.batchNumber.trim() || null,
          expiryDate: r.expiryDate || null,
        })
        setInventoryItems((prev) => [...prev, newItem])
      } else {
        resolvedRows.push({
          itemId: r.itemId,
          inputQuantity: Number(r.qty),
          inputUnit: r.inputUnit,
          inputUnitCost: purchaseCostForInput(r),
          damagedQuantity: Number(r.damagedQty) || 0,
          missingQuantity: Number(r.missingQty) || 0,
          batchNumber: r.batchNumber.trim() || null,
          expiryDate: r.expiryDate || null,
        })
      }
    }

    // Auto-append catatan selisih harga
    const diffNotes = validRows
      .filter((r) => r.itemId !== NEW_ITEM && priceDiff(r) !== null)
      .map((r) => {
        const item = getItem(r.itemId)
        const diff = priceDiff(r)!
        const incoming = purchaseCostForInput(r) ?? 0
        const master = masterCostForInput(r) ?? 0
        const unit = r.inputUnit === "pack" ? item?.packUnit : item?.unit
        const changeLabel = diff.pct == null
          ? "dari HPP Rp0"
          : `${diff.diff > 0 ? "+" : ""}${diff.pct.toFixed(1)}%`
        return `${item?.name}: HPP master Rp${Math.round(master).toLocaleString("id-ID")}/${unit}, harga masuk Rp${Math.round(incoming).toLocaleString("id-ID")}/${unit} (${changeLabel})`
      })
    const finalNotes = [notes || null, diffNotes.length ? `Selisih harga: ${diffNotes.join("; ")}` : null]
      .filter(Boolean).join(" | ") || null

    const res = await fetch("/api/goods-receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purchaseRequestId,
        ...(pesananBanyak ? { purchaseOrderId: pesananBanyak.id } : {}),
        ...((purchaseOrder || pesananBanyak) && alasanTanpaKonfirmasi !== null ? { tanpaKonfirmasi: alasanTanpaKonfirmasi.trim() } : {}),
        clientRequestId: clientRequestId || undefined,
        ...(receivedAt ? { receivedAt } : {}),
        locationId,
        supplierId: supplierId || null,
        supplier: supplierName.trim() || null,
        receiptNumber: receiptNumber || null,
        notes: finalNotes,
        imageUrl: photoUrl,
        confirmFreeReceipt: confirmations.freeCost === true,
        items: resolvedRows,
      }),
    })

    if (res.ok) {
      setShowForm(false)
      setRows([{ ...EMPTY_ROW }])
      setSupplierId("")
      setSupplierName("")
      setReceiptNumber("")
      setNotes("")
      setPhotoUrl(null)
      setPurchaseRequestId(null)
      setPurchaseOrder(null)
      setPesananBanyak(null)
      setAlasanTanpaKonfirmasi(null)
      setReceivedAt("")
      setClientRequestId("")
      await Promise.all([fetchReceipts(), fetchData()])
    } else {
      const text = await res.text()
      try { setError(JSON.parse(text).error ?? "Gagal menyimpan penerimaan") }
      catch { setError(`Server error (${res.status}): ${text.slice(0, 120)}`) }
    }
    } catch (e) {
      setError(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const formatRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`

  const today = new Date().toISOString().slice(0, 10)
  const receiptTotal = rows.reduce((total, row) => total + purchaseLineTotal(row), 0)
  const selectedSupplier = suppliers.find((option) => option.id === supplierId) ?? null

  // Dibuka dari tautan "Catat saat barang tiba" pada kartu pembelian, supaya
  // pengguna tidak perlu mencari pesanannya lagi di daftar.
  const tautanSudahDiproses = useRef(false)
  useEffect(() => {
    if (tautanSudahDiproses.current) return
    const id = new URLSearchParams(window.location.search).get("purchaseRequestId")
    if (!id) return
    // Menunggu daftar pesanan selesai dimuat lebih dulu.
    if (!ordersLoaded) return

    tautanSudahDiproses.current = true
    // Parameter dibuang lebih dulu: muat ulang setelah formulir selesai tidak
    // boleh membukanya kembali.
    window.history.replaceState(null, "", "/dashboard/goods-receipt")

    // Dijalankan pada tick berikutnya, mengikuti pola halaman lain: mengubah
    // state langsung di dalam effect memicu render berantai.
    const timer = window.setTimeout(() => {
      const keputusan = putuskanTautanPenerimaan({ id, pesananAktif: purchaseOrders, sudahDimuat: true, gagalMemuat: ordersFailed })
      if (keputusan.aksi === "pesan") {
        setWarning({ title: keputusan.judul, messages: [keputusan.isi] })
        return
      }
      if (keputusan.aksi === "buka") {
        openPurchaseReceipt(keputusan.pesanan as PurchaseOrder)
      }
    }, 0)
    return () => window.clearTimeout(timer)
    // openPurchaseReceipt sengaja tidak masuk daftar: fungsinya dibuat ulang
    // tiap render, dan efek ini hanya boleh berjalan sekali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrders, ordersLoaded, ordersFailed])

  // Tautan "Catat penerimaan" pada kartu pesanan banyak bahan.
  const tautanPesananDiproses = useRef(false)
  useEffect(() => {
    if (tautanPesananDiproses.current || inventoryItems.length === 0) return
    const id = new URLSearchParams(window.location.search).get("purchaseOrderId")
    if (!id) return
    tautanPesananDiproses.current = true
    window.history.replaceState(null, "", "/dashboard/goods-receipt")
    void fetch(`/api/purchase-orders?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const order = response.ok ? ((await response.json()).items as PesananSupplier[])[0] : null
        if (!order) { setWarning({ title: "Pesanan tidak ditemukan", messages: ["Pesanan ini tidak ada atau Anda tidak punya akses ke gudangnya."] }); return }
        if (order.kelompok === "SELESAI") { setWarning({ title: "Pesanan sudah selesai", messages: [`Pesanan #${order.shortCode} sudah ditutup. Tidak ada yang perlu dicatat lagi.`] }); return }
        openOrderReceipt(order)
      })
      .catch(() => setWarning({ title: "Pesanan belum dapat dimuat", messages: ["Periksa koneksi, lalu buka lagi dari daftar pesanan."] }))
    // openOrderReceipt sengaja tidak masuk daftar: efek ini hanya boleh berjalan sekali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryItems])

  // Dibaca dari FAKTA kiriman, bukan dari status balasan terakhir. Supplier
  // sering mengirim obrolan biasa setelah menjawab KIRIM; kalau antreannya
  // bergantung pada status, pesanan yang barangnya sudah di jalan bisa hilang
  // dari daftar hanya karena chat "gmn mn".
  const sudahDikirim = (request: PurchaseOrder) =>
    request.supplierShippedAt != null || request.shippedQuantity != null
  // Baris pesanan banyak bahan ditampilkan per pesanan, bukan per bahan.
  // Pesanan yang formulir penerimaannya sedang terbuka tidak ditampilkan lagi
  // di daftar bawah. Jika formulir dibatalkan, pesanan otomatis muncul kembali.
  const pesananAktifTampil = pesananAktif.filter((order) => !showForm || order.id !== pesananBanyak?.id)
  const pesananLama = purchaseOrders.filter((request) => !request.purchaseOrderId && (!showForm || request.id !== purchaseRequestId))
  const dalamPengiriman = pesananLama.filter(sudahDikirim)
  const belumDikirim = pesananLama.filter((request) => !sudahDikirim(request))
  const targetFormId = pesananBanyak?.id ?? purchaseRequestId ?? (showForm ? "manual" : null)

  // Form ditampilkan sebelum daftar pesanan melalui urutan layout. Saat
  // pengguna membuka penerimaan dari sebuah kartu, pindahkan layar ke awal
  // form setelah elemen itu selesai dirender. scroll-margin menjaga judul form
  // tidak tertutup header mobile.
  useEffect(() => {
    if (!showForm || !targetFormId) return
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showForm, targetFormId])

  async function kirimKeputusan(id: string, action: "ESCALATE" | "STOP" | "CANCEL", note: string) {
    setDecisionBusy(id)
    try {
      const res = await fetch(`/api/purchase-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      })
      const body = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "Gagal memproses keputusan")
      await fetchPurchaseOrders()
    } finally {
      setDecisionBusy(null)
    }
  }

  async function kirimUlangWhatsApp(lineId: string) {
    setDecisionBusy(lineId)
    setWaRetryError("")
    try {
      // API memeriksa status perangkat Fonnte secara langsung sebelum pesan
      // gagal dikembalikan ke antrean. Kalau belum connect, status gagal tetap.
      const res = await fetch(`/api/purchase-requests/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RETRY_MESSAGE" }),
      })
      const body = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "WhatsApp belum dapat dikirim ulang")
      await fetchPurchaseOrders()
    } catch (error) {
      setWaRetryError(error instanceof Error ? error.message : "WhatsApp belum dapat dikirim ulang")
    } finally {
      setDecisionBusy(null)
    }
  }

  async function batalkanPesanan(order: PesananSupplier) {
    setDecisionBusy(order.id)
    setWaRetryError("")
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL_ORDER", note: "Dibatalkan oleh pengguna dari halaman Barang Masuk" }),
      })
      const body = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "Pesanan belum dapat dibatalkan")
      await fetchPurchaseOrders()
    } catch (error) {
      setWaRetryError(error instanceof Error ? error.message : "Pesanan belum dapat dibatalkan")
    } finally {
      setDecisionBusy(null)
    }
  }

  function putuskan(request: PurchaseOrder, action: "ESCALATE" | "STOP" | "CANCEL") {
    const sisa = Math.max(0, Number(request.quantity) - Number(request.receivedQuantity))
    const alasanAlih = request.supplierReplyStatus === "UNAVAILABLE"
      ? "Supplier menyatakan stok tidak tersedia"
      : request.supplierReplyStatus === "PARTIAL"
        ? "Jumlah yang disanggupi supplier sudah diterima; sisa kebutuhan dialihkan"
      : "Batas waktu balasan supplier terlewati"
    const teks = {
      ESCALATE: {
        title: `Alihkan ke ${request.nextSupplier?.name ?? "supplier berikutnya"}?`,
        message: `Pantau mengirim pembatalan ${request.orderCode} ke ${request.supplier.name} lebih dahulu. Hanya jika pembatalan berhasil dikirim, sisa ${formatQty(sisa)} ${request.item.unit} dipesankan ke ${request.nextSupplier?.name}.`,
        confirmLabel: "Ya, batalkan & alihkan", danger: false,
      },
      STOP: {
        title: "Hentikan pengadaan ini?",
        message: sisa > 0
          ? `Masih ada ${formatQty(sisa)} ${request.item.unit} yang belum diterima, jadi ${request.orderCode} ditutup sebagai GAGAL — bukan terpenuhi. Status terpenuhi hanya diberikan setelah barangnya benar-benar tercatat masuk.`
          : `Seluruh jumlah sudah diterima, jadi ${request.orderCode} ditutup sebagai terpenuhi.`,
        confirmLabel: "Ya, hentikan", danger: false,
      },
      CANCEL: {
        title: "Batalkan pengadaan ini?",
        message: `Pesanan ${request.orderCode} ditutup dan kebutuhannya dianggap tidak jadi dibeli. Tidak ada pesan baru yang dikirim.`,
        confirmLabel: "Ya, batalkan", danger: true,
      },
    }[action]

    ask({ ...teks, cancelLabel: "Kembali", onConfirm: () => kirimKeputusan(request.id, action, action === "ESCALATE" ? alasanAlih : teks.title) })
  }

  /** Satu kartu pesanan yang sedang ditunggu kedatangannya. */
  function renderPesanan(request: PurchaseOrder) {
          const ordered = Number(request.quantity)
          const received = Number(request.receivedQuantity)
          const remaining = Math.max(0, ordered - received)
          const labels = {
            WAITING: ["Menunggu jawaban", "bg-amber-50 text-amber-800"],
            READY: ["Supplier siap", "bg-emerald-50 text-emerald-700"],
            PARTIAL: ["Tersedia sebagian", "bg-orange-50 text-orange-700"],
            SHIPPED: ["Dalam pengiriman", "bg-blue-50 text-blue-700"],
            UNAVAILABLE: ["Supplier tidak ready", "bg-red-50 text-red-700"],
            NEEDS_REVIEW: ["Perlu ditinjau", "bg-violet-50 text-violet-700"],
          } as const
          const [label, style] = labels[request.supplierReplyStatus]
          const supplierTerkonfirmasi = ["READY", "PARTIAL", "SHIPPED"].includes(request.supplierReplyStatus)
          return (
            <article key={request.id} className="space-y-4 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold tracking-wide text-slate-900 sm:text-base">{request.orderCode}</p>
                  <Link href={`/dashboard/audit/purchase/${request.id}`}
                    className="mt-1 inline-flex text-xs font-semibold text-blue-600">
                    Lihat riwayat lengkap
                  </Link>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-4 ${style}`}>{label}</span>
              </div>

              <div>
                <p className="text-base font-semibold text-slate-900">{request.item.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">Dipesan {formatQty(ordered)} {request.item.unit}</p>
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-800">{request.supplier.name}</span>
                  <span className="mx-1.5 text-slate-400">→</span>
                  <span className="font-semibold text-slate-800">{request.location.name}</span>
                </p>
                {request.supplierReplyStatus === "SHIPPED" && request.supplierShippedAt && (
                  <p className="mt-2 text-xs font-medium text-blue-700">Dikirim {new Date(request.supplierShippedAt).toLocaleString("id-ID")}</p>
                )}
                {request.supplierReplyStatus === "WAITING" && (
                  <p className={`mt-2 text-xs ${request.responseOverdueAt ? "font-medium text-amber-700" : "text-slate-500"}`}>
                    {request.responseOverdueAt
                      ? "Batas balasan terlewati; pesanan masih menunggu keputusan gudang."
                      : request.responseDueAt
                        ? `Menunggu jawaban supplier sampai ${new Date(request.responseDueAt).toLocaleString("id-ID")}.`
                        : "Menunggu jawaban supplier. Batas waktu dimulai setelah WA pesanan berhasil sampai."}
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium text-slate-500">Sudah diterima</dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">{formatQty(received)} {request.item.unit}</dd>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                  <dt className="text-[11px] font-medium text-amber-700">Sisa pesanan</dt>
                  <dd className="mt-1 text-sm font-semibold text-amber-900">{formatQty(remaining)} {request.item.unit}</dd>
                </div>
                {request.promisedQuantity != null && (
                  <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs">
                    <dt className="text-emerald-700">Disanggupi supplier</dt>
                    <dd className="font-semibold text-emerald-900">{formatQty(request.promisedQuantity)} {request.item.unit}</dd>
                  </div>
                )}
                {request.shippedQuantity != null && (
                  <div className="col-span-2 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs">
                    <dt className="text-blue-700">Dikirim supplier</dt>
                    <dd className="font-semibold text-blue-900">{formatQty(request.shippedQuantity)} {request.item.unit}</dd>
                  </div>
                )}
              </dl>

              <button
                type="button"
                onClick={() => openPurchaseReceipt(request)}
                disabled={!canEdit || remaining <= 0}
                title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
                className={`flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white ${DISABLED_ACTION_CLASS} disabled:opacity-40`}
              >
                {supplierTerkonfirmasi ? "Catat Barang Masuk" : "Barang datang tanpa konfirmasi"}
              </button>

              {/* Keputusan pengadaan. Tetap ditampilkan walau tanpa izin, dalam
                  keadaan nonaktif, supaya pengguna tahu tindakan ini ada dan
                  kepada siapa harus meminta aksesnya. */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Tindakan pengadaan</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">Gunakan bila supplier tidak dapat memenuhi sisa pesanan ini.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => putuskan(request, "ESCALATE")}
                  disabled={!canManageProcurement || decisionBusy === request.id || !request.nextSupplier
                    || !(request.supplierReplyStatus === "UNAVAILABLE"
                      || request.supplierReplyStatus === "WAITING" && Boolean(request.responseOverdueAt)
                      || request.supplierReplyStatus === "PARTIAL" && request.promisedQuantity != null
                        && Number(request.receivedQuantity) >= Number(request.promisedQuantity))}
                  title={!canManageProcurement ? NO_EDIT_PERMISSION_TITLE
                    : !request.nextSupplier ? "Semua supplier untuk bahan ini sudah dicoba"
                      : request.supplierReplyStatus === "WAITING" && !request.responseOverdueAt
                        ? "Tunggu sampai batas waktu balasan supplier terlewati"
                        : request.supplierReplyStatus === "NEEDS_REVIEW" ? "Tinjau balasan supplier terlebih dahulu"
                          : !["WAITING", "UNAVAILABLE", "PARTIAL"].includes(request.supplierReplyStatus)
                            ? "Supplier sudah menyanggupi atau mengirim barang" : undefined}
                  className={`col-span-2 min-h-11 w-full whitespace-normal rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold leading-snug text-slate-700 ${DISABLED_ACTION_CLASS}`}
                >
                  {request.nextSupplier ? `Coba ${request.nextSupplier.name}` : "Tidak ada supplier berikutnya"}
                </button>
                <button
                  type="button"
                  onClick={() => putuskan(request, "STOP")}
                  disabled={!canManageProcurement || decisionBusy === request.id}
                  title={canManageProcurement ? undefined : NO_EDIT_PERMISSION_TITLE}
                  className={`min-h-11 w-full rounded-xl border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 ${DISABLED_ACTION_CLASS}`}
                >
                  Hentikan
                </button>
                <button
                  type="button"
                  onClick={() => putuskan(request, "CANCEL")}
                  disabled={!canManageProcurement || decisionBusy === request.id}
                  title={canManageProcurement ? undefined : NO_EDIT_PERMISSION_TITLE}
                  className={`min-h-11 w-full rounded-xl border border-red-200 px-2 py-2 text-xs font-semibold text-red-700 ${DISABLED_ACTION_CLASS}`}
                >
                  Batalkan
                </button>
                </div>
              </div>
              {!canManageProcurement && (
                <p className="text-xs text-slate-400">Keputusan pengadaan memerlukan akses ubah pada fitur Supplier. Minta Owner mengaturnya lewat Manajemen.</p>
              )}
              {request.supplierLastMessage && (
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Balasan supplier: “{request.supplierLastMessage}”
                  {request.supplierLastMessageAt && <span className="ml-1 text-slate-400">· {new Date(request.supplierLastMessageAt).toLocaleString("id-ID")}</span>}
                </div>
              )}
            </article>
          )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6">
      <div className="order-[-20] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Barang Masuk</h1>
          <p className="text-slate-500 text-sm mt-0.5">Catat penerimaan barang dari supplier</p>
        </div>
        {!showForm && (
          <button
            onClick={openGenericReceipt}
            disabled={!canEdit}
            title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
            className={`flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 ${DISABLED_ACTION_CLASS} disabled:hover:bg-blue-600 sm:w-auto sm:rounded-full`}
          >
            <Plus className="w-4 h-4" />
            Catat Barang Masuk
          </button>
        )}
      </div>

      {waRetryError && <FormAlert message={waRetryError} onClose={() => setWaRetryError("")} />}

      {kirimanGudang.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
          <div className="border-b border-indigo-200 bg-indigo-50 px-4 py-4 sm:px-5">
            <h2 className="font-semibold text-slate-900">Kiriman dari Gudang — Menunggu Diterima</h2>
            <p className="mt-1 text-sm text-slate-600">Barang sudah dikirim gudang. Periksa fisiknya, lalu terima dengan foto — stok outlet baru bertambah setelah penerimaan dikonfirmasi.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {kirimanGudang.map((t) => (
              <article key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{t.fromLocation.name} → {t.toLocation.name}</p>
                  <p className="mt-1 text-sm text-slate-700">{t.items.map((i) => `${i.item.name} ${Number(i.quantity).toLocaleString("id-ID")} ${i.item.unit}`).join(" · ")}</p>
                  {t.sentAt && <p className="mt-1 text-xs text-slate-500">Dikirim {new Date(t.sentAt).toLocaleString("id-ID")}</p>}
                </div>
                <Link href={`/dashboard/transfer?transferId=${t.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
                  <CheckCircle className="h-4 w-4" /> Terima barang
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {pesananAktifTampil.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
          <div className="border-b border-blue-200 bg-blue-50 px-4 py-4 sm:px-5">
            <h2 className="font-semibold text-slate-900">Pesanan Supplier — Menunggu Barang</h2>
            <p className="mt-1 text-sm text-slate-600">Satu pesanan bisa berisi banyak bahan dan dicatat dalam satu penerimaan. Stok baru bertambah setelah fisiknya diperiksa dan dicatat di sini.</p>
          </div>
          <div className="space-y-3 p-3 sm:p-4">
            {pesananAktifTampil.map((order) => {
              const pesanGagal = order.lines.find((line) => line.status === "ACTIVE" && ["FAILED", "DEAD"].includes(line.messageStatus))
              return <PesananSupplierCard key={order.id} order={order}
                onTerima={canEdit ? () => openOrderReceipt(order) : undefined}
                onDarurat={canEdit ? () => openOrderReceipt(order) : undefined}
                onBerubah={() => { void fetchPurchaseOrders() }}
                actions={canManageProcurement ? <>
                  {pesanGagal && <button
                      type="button"
                      disabled={decisionBusy === pesanGagal.id || decisionBusy === order.id}
                      onClick={() => { void kirimUlangWhatsApp(pesanGagal.id) }}
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-blue-600 disabled:opacity-50"
                    >
                      <RotateCcw className={`h-4 w-4 ${decisionBusy === pesanGagal.id ? "animate-spin" : ""}`} />
                      Periksa koneksi &amp; kirim ulang
                    </button>}
                  <button
                    type="button"
                    disabled={decisionBusy === order.id || decisionBusy === pesanGagal?.id}
                    onClick={() => ask({
                      title: `Batalkan pesanan #${order.shortCode}?`,
                      message: "Seluruh bahan yang masih aktif akan ditutup tanpa menambah stok dan pesanan dipindahkan dari daftar Menunggu Barang. Jika pesan sebelumnya sudah sampai, hubungi supplier secara terpisah agar supplier tidak tetap mengirim barang.",
                      confirmLabel: "Ya, batalkan pesanan",
                      cancelLabel: "Kembali",
                      danger: true,
                      onConfirm: () => batalkanPesanan(order),
                    })}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    <Ban className="h-4 w-4" /> Batalkan pesanan
                  </button>
                </> : undefined}
                aksiSekunder={(
                  <Link href={`/dashboard/suppliers?view=orders&orderId=${order.id}`} className={tombolSekunder}>
                    <FileText className="h-4 w-4" />
                    Lihat pesanan
                  </Link>
                )}
              />
            })}
          </div>
        </section>
      )}

      {dalamPengiriman.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
          <div className="border-b border-blue-200 bg-blue-50 px-4 py-4 sm:px-5">
            <h2 className="font-semibold text-slate-900">Menunggu Penerimaan dari Supplier</h2>
            <p className="mt-1 text-sm text-slate-600">Supplier menyatakan barangnya sudah dikirim. Periksa fisiknya lebih dulu — stok baru bertambah setelah penerimaan dicatat di sini.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {dalamPengiriman.map((request) => renderPesanan(request))}
          </div>
        </section>
      )}

      {belumDikirim.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
          <div className="border-b border-blue-100 bg-blue-50/60 px-4 py-4 sm:px-5">
            <h2 className="font-semibold text-slate-900">Pesanan yang ditunggu</h2>
            <p className="mt-1 text-sm text-slate-500">Balasan supplier memperbarui status pesanan. Stok bertambah hanya setelah penerimaan fisik dikonfirmasi di sini.</p>
            <p className="mt-1 text-xs text-slate-500">Barang yang tiba tanpa balasan WhatsApp tetap boleh dicatat — tekan Catat penerimaan pada pesanannya.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {belumDikirim.map((request) => renderPesanan(request))}
          </div>
        </section>
      )}


      {showForm && (
        <div ref={formRef} className="order-[-10] scroll-mt-24 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:space-y-6 sm:p-6 lg:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Penerimaan Barang Baru</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
                {purchaseRequestId || pesananBanyak
                  ? `Terhubung ke pesanan ${pesananBanyak ? `#${pesananBanyak.shortCode}` : purchaseOrder?.orderCode ?? "supplier"}. Gudang, supplier, dan barang sudah terisi; lengkapi hasil penerimaan fisiknya.`
                  : "Lengkapi informasi penerimaan dan barang dari supplier."}
              </p>
            </div>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Tutup formulir" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600">
              <X className="w-4.5 h-4.5" strokeWidth={2.5} />
            </button>
          </div>

          <FormAlert message={error} onClose={() => setError("")} />

          {(purchaseOrder || pesananBanyak) && alasanTanpaKonfirmasi !== null && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Barang datang tanpa konfirmasi supplier</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">Supplier belum memastikan pesanan ini. Penerimaan tetap boleh dicatat, tetapi wajib alasan dan foto barang/surat jalan, dan owner akan mendapat peringatan untuk dicek.</p>
              <label className="mt-3 block text-sm font-medium text-slate-700">Alasan <span className="text-red-500">*</span>
                <textarea value={alasanTanpaKonfirmasi} onChange={(e) => setAlasanTanpaKonfirmasi(e.target.value)} rows={2} maxLength={300}
                  placeholder="mis. supplier konfirmasi lewat telepon, barang langsung diantar"
                  className="mt-1 w-full rounded-xl border border-amber-200 bg-white p-3 text-sm" />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Diterima di <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={locationId}
                  disabled={Boolean(purchaseRequestId || pesananBanyak)}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-11 text-sm text-slate-900 transition-shadow focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 disabled:text-slate-600"
                >
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {purchaseRequestId || pesananBanyak
                  ? <Lock className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  : <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />}
              </div>
              {(purchaseRequestId || pesananBanyak) && <p className="mt-1.5 text-xs text-slate-500">Terkunci sesuai pesanan.</p>}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Supplier {!(purchaseRequestId || pesananBanyak) && <span className="font-normal text-slate-400">(opsional)</span>}
              </label>
              <div className="relative">
                <StableDraftInput
                  type="text"
                  disabled={Boolean(purchaseRequestId || pesananBanyak)}
                  list={suppliers.length > 0 ? "goods-receipt-suppliers" : undefined}
                  value={supplierName}
                  onCommit={(value) => {
                    const match = suppliers.find(
                      (option) => option.name.toLocaleLowerCase("id-ID") === value.trim().toLocaleLowerCase("id-ID"),
                    )
                    setSupplierName(value)
                    setSupplierId(match?.id ?? "")
                  }}
                  placeholder="Pilih atau tulis nama supplier"
                  autoComplete="off"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 transition-shadow placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 disabled:text-slate-600"
                />
                {suppliers.length > 0 && (
                  <datalist id="goods-receipt-suppliers">
                    {suppliers.map((option) => (
                      <option key={option.id} value={option.name}>
                        {option.phone ?? option.contactPerson ?? undefined}
                      </option>
                    ))}
                  </datalist>
                )}
              </div>
              {selectedSupplier?.phone && (
                <a
                  href={`tel:${selectedSupplier.phone.replace(/[^\d+]/g, "")}`}
                  className="mt-2 inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {selectedSupplier.contactPerson ? `${selectedSupplier.contactPerson} · ` : ""}{selectedSupplier.phone}
                </a>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">No. Surat Jalan / Invoice</label>
              <StableDraftInput
                type="text"
                placeholder="SJ-20240601-001"
                value={receiptNumber}
                onCommit={setReceiptNumber}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm text-slate-900 transition-shadow placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Catatan</label>
              <StableDraftInput
                type="text"
                placeholder="Opsional..."
                value={notes}
                onCommit={setNotes}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm text-slate-900 transition-shadow placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
              />
            </div>
          </div>

          {/* Upload foto — wajib */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Foto Struk <span className="text-red-500">*</span>
            </label>
            {photoUrl ? (
              <div className="relative w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Foto barang masuk"
                  onLoad={() => setPhotoLoadError(false)}
                  onError={() => setPhotoLoadError(true)}
                  className="h-44 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain sm:h-52"
                />
                <button
                  type="button"
                  onClick={() => { setPhotoUrl(null); setPhotoLoadError(false) }}
                  aria-label="Hapus foto"
                  title="Hapus foto"
                  className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center bg-slate-900/80 hover:bg-red-600 rounded-full shadow-lg text-white transition-colors"
                >
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
                {photoLoadError && (
                  <div className="absolute inset-x-3 bottom-3 rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white shadow-lg">
                    Preview gagal dimuat. Hapus foto lalu unggah ulang.
                  </div>
                )}
              </div>
            ) : (
              <label className={`flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors ${uploadingPhoto ? "border-blue-200 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/40"}`}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handlePhotoUpload(file)
                  }}
                />
                {uploadingPhoto ? (
                  <>
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <span className="text-sm text-blue-600">Mengupload foto...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-6 h-6 text-slate-400" />
                    <span className="text-sm text-slate-500">Foto struk dari supplier</span>
                    <span className="text-xs text-slate-400">Klik untuk pilih foto · Maks 2MB</span>
                  </>
                )}
              </label>
            )}
          </div>

          <div>
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <label className="block text-sm font-semibold text-slate-800">
                Daftar Barang <span className="text-red-500">*</span>
              </label>
              <div className="text-xs text-slate-400">
                Harga wajib diisi · bahan gratis dikonfirmasi lewat popup
              </div>
            </div>
            <div className="space-y-3">
              {rows.map((row, i) => {
                const item = row.itemId && row.itemId !== NEW_ITEM ? getItem(row.itemId) : null
                const hasPack = item?.packSize != null && item?.packUnit != null
                const packLabel = item?.packUnit ?? ""
                const baseLabel = item?.unit ?? "pcs"
                const inPack = row.inputUnit === "pack"
                const inspectingOrder = Boolean(purchaseOrder || pesananBanyak)
                const quantityUnit = inPack && hasPack ? packLabel : baseLabel

                return (
                  <div key={i} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100/60">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-600">{i + 1}</span>
                        <span className="text-sm font-semibold text-slate-800">{item?.name || row.customName || "Barang"}</span>
                      </div>
                      {!purchaseRequestId && !pesananBanyak && <button
                        type="button"
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        aria-label={`Hapus baris item ${i + 1}`}
                        title="Hapus item"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-4 w-4" strokeWidth={2.5} />
                      </button>}
                    </div>

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-12 lg:items-start">
                      <div className={`col-span-2 min-w-0 ${inspectingOrder ? "lg:col-span-7" : "lg:col-span-5"}`}>
                        <label htmlFor={`receipt-item-${i}`} className="mb-1.5 block text-xs font-medium text-slate-500">Item</label>
                        <div className="relative">
                          <select
                            id={`receipt-item-${i}`}
                            value={row.itemId}
                            disabled={Boolean(purchaseRequestId || pesananBanyak)}
                            onChange={(e) => {
                              const sel = inventoryItems.find((it) => it.id === e.target.value)
                              // HPP Rp0 berarti bahan gratis. Harga transaksi dibiarkan
                              // kosong agar Barang Masuk tidak menganggap Rp0 sebagai harga beli.
                              const costPerBase = sel?.costPrice != null && Number(sel.costPrice) > 0
                                ? Number(sel.costPrice)
                                : null
                              // Pre-fill harga per kemasan jika item punya packSize
                              const costDisplay = costPerBase !== null && sel?.packSize
                                ? formatRupiahInput(Math.round(costPerBase * sel.packSize))
                                : costPerBase !== null ? formatRupiahInput(Math.round(costPerBase)) : ""
                              updateRow(i, {
                                itemId: e.target.value,
                                cost: costDisplay,
                                exactBaseCost: costPerBase,
                                customName: "",
                                customUnit: "pcs",
                                customPackSize: "",
                                customPackUnit: "",
                                batchNumber: "",
                                expiryDate: "",
                                inputUnit: sel?.packSize ? "pack" : "base",
                              })
                            }}
                            className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-10 text-sm text-slate-900 transition-shadow focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                          >
                            <option value="">Pilih item...</option>
                            {inventoryItems.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} ({it.unit}{it.packSize && it.packUnit ? ` · 1 ${it.packUnit}=${it.packSize}` : ""})
                              </option>
                            ))}
                            <option value={NEW_ITEM}>➕ Item baru (tidak ada di daftar)</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        </div>
                      </div>

                      {!inspectingOrder && <div className="col-span-1 min-w-0 lg:col-span-2">
                        <label htmlFor={`receipt-qty-${i}`} className="mb-1.5 block text-xs font-medium text-slate-500">Jumlah</label>
                        <StableDraftInput
                          id={`receipt-qty-${i}`}
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          min="0"
                          value={row.qty}
                          onCommit={(value) => updateGoodQuantity(i, value)}
                          onWheel={(event) => event.currentTarget.blur()}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp" || event.key === "ArrowDown") event.preventDefault()
                          }}
                          className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 text-center text-sm tabular-nums transition-shadow focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>}

                      <div className="col-span-1 min-w-0 lg:col-span-2">
                        <label htmlFor={`receipt-unit-${i}`} className="mb-1.5 block text-xs font-medium text-slate-500">Satuan</label>
                        {hasPack ? (
                          <div className="relative">
                            <select
                              id={`receipt-unit-${i}`}
                              value={row.inputUnit}
                              title={row.inputUnit === "pack" ? packLabel : baseLabel}
                              onChange={(e) => {
                                const newUnit = e.target.value as "base" | "pack"
                                const ps = item?.packSize ?? 1
                                let newCost = row.cost
                                const exactBaseCost = row.exactBaseCost ?? (row.cost
                                  ? parseRupiahInput(row.cost) / (row.inputUnit === "pack" ? ps : 1)
                                  : null)
                                if (exactBaseCost != null && ps > 0) {
                                  const targetCost = newUnit === "pack" ? exactBaseCost * ps : exactBaseCost
                                  newCost = formatRupiahInput(Math.round(targetCost))
                                }
                                updateRow(i, { inputUnit: newUnit, cost: newCost, exactBaseCost })
                              }}
                              className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-sm text-slate-900 transition-shadow focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                            >
                              <option value="base">{baseLabel}</option>
                              <option value="pack">{packLabel}</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                          </div>
                        ) : (
                          <div id={`receipt-unit-${i}`} title={baseLabel} className="flex h-11 w-full items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500">
                            <span className="truncate">{baseLabel}</span>
                          </div>
                        )}
                      </div>

                      <div className={`min-w-0 lg:col-span-3 ${inspectingOrder ? "col-span-1" : "col-span-2"}`}>
                        <label htmlFor={`receipt-cost-${i}`} className="mb-1.5 block truncate text-xs font-medium text-slate-500">
                          Harga/{inPack && hasPack ? packLabel : baseLabel} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                          <StableDraftInput
                            id={`receipt-cost-${i}`}
                            type="text"
                            inputMode="numeric"
                            placeholder="Contoh: 35.000"
                            value={row.cost}
                            formatValue={formatRupiahInput}
                            onCommit={(cost) => {
                              const numericCost = parseRupiahInput(cost)
                              const packSize = item?.packSize
                                ?? (row.itemId === NEW_ITEM ? Number(row.customPackSize) || 1 : 1)
                              updateRow(i, {
                                cost,
                                exactBaseCost: cost
                                  ? numericCost / (row.inputUnit === "pack" ? packSize : 1)
                                  : null,
                              })
                            }}
                            aria-label={`Harga beli per ${inPack && hasPack ? packLabel : baseLabel}`}
                            aria-invalid={row.cost.trim() !== "" && parseRupiahInput(row.cost) <= 0}
                            className={`h-11 w-full rounded-xl border bg-white pl-8 pr-3 text-sm font-semibold tabular-nums transition-shadow focus:outline-none focus:ring-4 ${row.cost.trim() !== "" && parseRupiahInput(row.cost) <= 0 ? "border-red-300 focus:border-red-400 focus:ring-red-50" : "border-slate-200 focus:border-blue-400 focus:ring-blue-50"}`}
                          />
                        </div>
                        {item?.costPrice != null && (
                          <p className="mt-1.5 text-xs text-slate-400">Terisi dari HPP Master Inventori.</p>
                        )}
                      </div>

                    </div>

                    {inspectingOrder && (
                      <div className="space-y-3 border-t border-slate-100 pt-4">
                        <h3 className="text-sm font-semibold text-slate-800">Hasil pemeriksaan</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {[
                            { key: "qty", label: "Diterima baik", value: row.qty, onCommit: (value: string) => updateGoodQuantity(i, value) },
                            { key: "damaged", label: "Jumlah rusak", value: row.damagedQty, onCommit: (value: string) => updateDamagedQuantity(i, value) },
                            { key: "missing", label: "Tidak tiba", value: row.missingQty, onCommit: () => {} },
                          ].map((field) => (
                            <div key={field.key} className="min-w-0">
                              <label htmlFor={`receipt-${field.key}-${i}`} className="mb-1.5 flex min-h-5 items-center justify-between gap-2 text-xs font-medium text-slate-500">
                                {field.label}
                                {field.key === "missing" && <span className="text-[11px] font-normal text-slate-400">Otomatis</span>}
                              </label>
                              <div className={`flex h-11 min-w-0 items-center gap-3 rounded-xl border px-3 transition-shadow ${field.key === "missing" ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50"}`}>
                                <StableDraftInput
                                  id={`receipt-${field.key}-${i}`}
                                  type="number"
                                  inputMode="decimal"
                                  placeholder="0"
                                  min="0"
                                  step="any"
                                  readOnly={field.key === "missing"}
                                  title={field.key === "missing" ? "Acuan pesanan dikurangi jumlah baik dan rusak" : undefined}
                                  value={field.value}
                                  onCommit={field.onCommit}
                                  onWheel={(event) => event.currentTarget.blur()}
                                  onKeyDown={(event) => {
                                    if (event.key === "ArrowUp" || event.key === "ArrowDown") event.preventDefault()
                                  }}
                                  className="h-full w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-left text-sm font-medium tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:outline-none! focus-visible:outline-none! focus:ring-0 read-only:cursor-default [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <span className="shrink-0 text-xs text-slate-500">{quantityUnit}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs leading-relaxed text-slate-500">Hanya barang baik yang menambah stok. Tidak tiba dihitung dari acuan pesanan.</p>
                      </div>
                    )}

                    {row.itemId && (
                      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-500">Nomor batch / lot</label>
                          <StableDraftInput
                            type="text"
                            value={row.batchNumber}
                            onCommit={(value) => updateRow(i, { batchNumber: value })}
                            placeholder="Contoh: LOT-240901-A"
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm transition-shadow placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-500">Tanggal kedaluwarsa</label>
                          <AppDatePicker
                            value={row.expiryDate}
                            onChange={(value) => updateRow(i, { expiryDate: value })}
                            placeholder="Pilih tanggal"
                            ariaLabel={`Tanggal kedaluwarsa ${item?.name ?? (row.customName || "barang")}`}
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm transition-shadow focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
                          />
                        </div>
                        <p className="text-xs text-slate-400 sm:col-span-2">Jika hanya tanggal kedaluwarsa diisi, sistem membuat nomor batch otomatis.</p>
                      </div>
                    )}

                    {/* Warning selisih harga */}
                    {row.itemId && row.itemId !== NEW_ITEM && row.cost && (() => {
                      const diff = priceDiff(row)
                      if (!diff) return null
                      const item = getItem(row.itemId)
                      const masterCost = masterCostForInput(row) ?? 0
                      const incoming = purchaseCostForInput(row) ?? 0
                      const priceUnit = row.inputUnit === "pack" ? item?.packUnit : item?.unit
                      const isUp = diff.diff > 0
                      const isCritical = isUp && diff.pct != null && diff.pct > 20
                      return (
                        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${isCritical ? "bg-red-50 border-red-300 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isCritical ? "text-red-500" : "text-amber-500"}`} />
                          <span>
                            {isCritical && <strong className="text-red-700">⚠ Kenaikan signifikan! </strong>}
                            Harga berbeda dari HPP — master <strong>Rp {Math.round(masterCost).toLocaleString("id-ID")}</strong>/
                            {priceUnit}, masuk <strong>Rp {Math.round(incoming).toLocaleString("id-ID")}</strong>/
                            {priceUnit}{" "}
                            <span className={`font-semibold ${isCritical ? "text-red-700" : isUp ? "text-red-600" : "text-green-700"}`}>
                              ({diff.pct == null ? "dari HPP Rp0" : `${isUp ? "+" : ""}${diff.pct.toFixed(1)}%`})
                            </span>
                            {isCritical && " — peringatan akan dikirim ke dashboard owner."}
                            {!isCritical && " Catatan selisih otomatis ditambahkan."}
                          </span>
                        </div>
                      )
                    })()}

                    {/* Inline form untuk item baru */}
                    {row.itemId === NEW_ITEM && (
                      <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                        <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                          <Sparkles className="w-3.5 h-3.5" />
                          Item baru akan ditambahkan ke Master Inventori
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600">
                              Nama item <span className="text-red-500">*</span>
                            </label>
                            <StableDraftInput
                              type="text"
                              placeholder="Contoh: Saus tomat"
                              value={row.customName}
                              onCommit={(value) => updateRow(i, { customName: value })}
                              className="h-10 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600">Satuan dasar</label>
                            <div className="relative">
                              <select
                                value={row.customUnit}
                                onChange={(e) => updateRow(i, { customUnit: e.target.value })}
                                className="h-10 w-full appearance-none rounded-xl border border-blue-200 bg-white pl-3 pr-9 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                              >
                                {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600">Nama kemasan <span className="font-normal text-slate-400">(opsional)</span></label>
                            <StableDraftInput
                              type="text"
                              placeholder="Contoh: dus"
                              value={row.customPackUnit}
                              onCommit={(value) => updateRow(i, { customPackUnit: value })}
                              className="h-10 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-600">Isi per kemasan</label>
                            <div className="relative">
                              <StableDraftInput
                                type="number"
                                min="1"
                                placeholder="0"
                                value={row.customPackSize}
                                onCommit={(value) => updateRow(i, { customPackSize: value })}
                                onWheel={(event) => event.currentTarget.blur()}
                                onKeyDown={(event) => {
                                  if (event.key === "ArrowUp" || event.key === "ArrowDown") event.preventDefault()
                                }}
                                className="h-10 w-full appearance-none rounded-xl border border-blue-200 bg-white px-3 pr-12 text-right text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{row.customUnit}</span>
                            </div>
                          </div>
                        </div>
                        {row.customPackUnit && Number(row.customPackSize) > 0 && (
                          <div className="rounded-lg bg-white/80 px-3 py-2 text-xs text-blue-700">
                            1 {row.customPackUnit} = {row.customPackSize} {row.customUnit}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {!purchaseRequestId && !pesananBanyak && <button
              type="button"
              onClick={() => setRows([...rows, { ...EMPTY_ROW }])}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-50 sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Tambah Item
            </button>}
          </div>

          {/* Preview total */}
          {rows.some((r) => (r.itemId && r.itemId !== NEW_ITEM) || (r.itemId === NEW_ITEM && r.customName)) && rows.some((r) => r.qty) && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
              <div className="mb-3 text-sm font-semibold text-blue-800">Ringkasan Penerimaan</div>
              <div className="space-y-2">
                {rows.filter((r) => r.qty && Number(r.qty) > 0).map((r, i) => {
                  const item = inventoryItems.find((it) => it.id === r.itemId)
                  const displayName = r.itemId === NEW_ITEM ? (r.customName || "Item baru") : item?.name
                  const baseUnit = r.itemId === NEW_ITEM ? (r.customUnit || "pcs") : item?.unit ?? "pcs"
                  if (!displayName) return null
                  const qtyBase = resolvedQty(r)
                  const total = purchaseLineTotal(r)
                  const inPack = r.inputUnit === "pack"
                  const packLabel = item?.packUnit ?? r.customPackUnit
                  return (
                    <div key={i} className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                      <span className="flex min-w-0 items-start gap-1.5 text-slate-700">
                        {r.itemId === NEW_ITEM && <Sparkles className="w-3 h-3 text-blue-500" />}
                        <span className="break-words">
                          {displayName} ×{" "}
                          {inPack && packLabel ? `${r.qty} ${packLabel} (${qtyBase} ${baseUnit})` : `${qtyBase} ${baseUnit}`}
                        </span>
                      </span>
                      <span className="shrink-0 pl-4 font-semibold tabular-nums text-slate-900 sm:pl-0 sm:text-right">{total > 0 ? formatRp(total) : "—"}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 border-t border-blue-200 pt-3">
                <span className="text-sm font-semibold text-slate-800">Total</span>
                <span className="text-base font-bold tabular-nums text-blue-800">{formatRp(receiptTotal)}</span>
              </div>
              {rows.some((r) => r.itemId === NEW_ITEM && r.customName) && (
                <div className="mt-2 pt-2 border-t border-blue-100 text-xs text-blue-600">
                  Item bertanda ✦ akan otomatis masuk ke Master Inventori
                </div>
              )}
            </div>
          )}

          <div className="dialog-actions grid grid-cols-1 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !canEdit}
              title={canEdit ? undefined : NO_EDIT_PERMISSION_TITLE}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                : <><Truck className="w-4 h-4" /> Konfirmasi Diterima</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Riwayat dibungkus section berpita seperti Transfer Barang & Opname Fisik. */}
      <section ref={listRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-slate-900">Riwayat Barang Masuk</h2>
          <p className="mt-1 text-sm text-slate-600">Penerimaan barang yang sudah dikonfirmasi dan menambah stok.</p>
        </div>

        <div className="border-b border-slate-100 p-4 sm:px-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-800">Filter Riwayat</span>
            {!loading && <span className="text-xs text-slate-400">{total} catatan</span>}
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
                onClick={() => { setFilterLocation(""); setDraftFilterFrom(""); setDraftFilterTo(""); setFilterFrom(""); setFilterTo("") }}
                disabled={!filterLocation && !filterFrom && !filterTo && !draftFilterFrom && !draftFilterTo}
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : receipts.length === 0 ? (
        filterLocation || filterFrom || filterTo ? (
          <div className="px-4 py-14 text-center sm:py-16">
            <div className="text-slate-500 text-sm">Tidak ada data untuk filter yang dipilih</div>
            <button onClick={() => { setFilterLocation(""); setDraftFilterFrom(""); setDraftFilterTo(""); setFilterFrom(""); setFilterTo("") }}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >Reset filter</button>
          </div>
        ) : (
          <div className="px-4 py-14 text-center sm:py-20">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Truck className="w-7 h-7 text-slate-400" />
            </div>
            <div className="text-slate-600 font-semibold">Belum ada penerimaan barang</div>
            <div className="text-slate-400 text-sm mt-1">Catat barang masuk dari supplier di sini</div>
          </div>
        )
      ) : (
        <>
        <div className="space-y-3 p-3 sm:p-4">
          {receipts.map((r) => {
            const totalItems = r.items.reduce((s, i) => s + Number(i.quantity), 0)
            return (
              <Link key={r.id} href={`/dashboard/audit/receipt/${r.id}`} className="block overflow-hidden rounded-2xl border border-l-4 border-emerald-100 border-l-emerald-500 bg-white transition-shadow hover:shadow-md">
                <div className="p-4 sm:p-5">
                  <div className="mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-start gap-3 sm:gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[14px]">
                          <span className="font-semibold text-slate-900">
                          {r.location.name}
                          </span>
                          {r.supplier && <span className="font-normal text-slate-400">· {r.supplier}</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                          {new Date(r.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {r.receiptNumber && <span className="break-all font-mono">{r.receiptNumber}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 pl-[3.25rem] sm:block sm:pl-0 sm:text-right">
                      <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">
                        Dikonfirmasi
                      </span>
                      <div className="text-xs text-slate-400 sm:mt-1.5">{formatQty(totalItems)} unit masuk</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {r.items.map((item, i) => (
                      <Fragment key={i}>
                        <span className="flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                          <Package className="h-3 w-3 shrink-0 text-slate-400" />
                          <span className="truncate">{item.item.name}</span>
                          <span className="shrink-0 font-bold text-emerald-600">+{formatQty(item.quantity)}</span>
                          <span className="shrink-0">{item.item.unit}</span>
                        </span>
                        {(item.batchNumber || item.expiryDate) && (
                          <span className="text-[11px] bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full">
                            {item.batchNumber ? `Lot ${item.batchNumber}` : "Lot otomatis"}
                            {item.expiryDate ? ` · exp ${new Date(item.expiryDate).toLocaleDateString("id-ID")}` : ""}
                          </span>
                        )}
                      </Fragment>
                    ))}
                  </div>

                  {r.imageUrl && (
                    <div className="mt-3">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(r.imageUrl!, "_blank", "noopener,noreferrer") }}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Lihat foto surat jalan
                      </button>
                    </div>
                  )}
                  {r.notes && (
                    <div className="mt-2 break-words rounded-lg bg-slate-50 px-3 py-2 text-xs italic leading-relaxed text-slate-400">{r.notes}</div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
        {/* Pagination sudah punya garis atas sendiri dan tidak dirender jika hanya 1 halaman. */}
        <Pagination page={page} pages={pages} total={total} perPage={30} label="catatan"
          loading={loading} scrollToRef={listRef} onPageChange={fetchReceipts} />
        </>
      )}
      </section>

      <WarningModal
        open={!!warning}
        title={warning?.title}
        messages={warning?.messages ?? []}
        onClose={() => setWarning(null)}
      />
      {dialog}
    </div>
  )
}
