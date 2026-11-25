"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { AppPortal } from "@/components/ui/app-portal"
import { useCanEdit } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { parseTransferQuantity } from "@/lib/transfer-quantity"
import { formatPurchaseOrderMessages } from "@/lib/supplier-replies"
import { ArrowRight, ChevronDown, Loader2, ShoppingCart, X } from "lucide-react"

export type WarehouseNeed = {
  id: string; itemId: string; locationId: string; itemName: string; unit: string
  packSize: number | null; packUnit: string | null; warehouseName: string
  quantity: number; minStock: number; stockUpdatedAt: string; alertCreatedAt: string | null
  /// Stok fisik dikurangi yang sudah direservasi untuk transfer.
  reservedQuantity: number; availableQuantity: number
  /// Kebutuhan outlet dipecah tiga: yang belum diterima, yang sudah punya
  /// alokasi, dan yang benar-benar belum tercakup stok mana pun.
  outletOutstandingQuantity: number; coveredQuantity: number; uncoveredDemandQuantity: number
  /// Kekurangan yang benar-benar perlu dibeli: kebutuhan outlet dikurangi yang
  /// sudah dialokasikan DAN dikurangi stok gudang yang masih tersedia.
  shortfallQuantity: number
  onOrderQuantity: number
  /// Ambang gudang belum tentu sudah diatur; kebutuhan tetap muncul kalau ada
  /// kekurangan nyata.
  thresholdConfigured: boolean
  supplier: {
    id: string; name: string; phone?: string | null
    /// Nama & satuan beli versi supplier dari pemetaan bahan (boleh kosong).
    supplierItemName?: string | null; purchaseUnit?: string | null; purchaseUnitSize?: number | null
  } | null
}
export type DeliveryStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "UNCERTAIN" | "DEAD"
export type SupplierReplyStatus =
  | "WAITING" | "READY" | "PARTIAL" | "SHIPPED" | "UNAVAILABLE" | "NEEDS_REVIEW"
export type ProviderDeliveryStatus = "UNKNOWN" | "PROVIDER_ACCEPTED" | "WHATSAPP_SENT" | "DELIVERED" | "READ" | "UNDELIVERED"
export type ActivePurchase = {
  id: string; quantity: string | number; createdAt: string; messageStatus: DeliveryStatus; lastMessageError: string | null
  orderCode: string
  supplierReplyStatus: SupplierReplyStatus
  promisedQuantity: number | null
  shippedQuantity: number | null
  receivedQuantity: number
  supplierLastMessage: string | null
  supplierLastMessageAt: string | null
  supplierShippedAt: string | null
  providerDeliveryStatus: ProviderDeliveryStatus
  deliveryStatusUpdatedAt: string | null
  responseDueAt: string | null
  responseOverdueAt: string | null
  urgency: "NORMAL" | "URGENT"
  reminderCount: number
  supplier: { name: string }; location: { name: string }; item: { name: string; unit: string }
}

/**
 * Keadaan pesanan dari sisi supplier, beserta tindakan yang menunggu pengguna.
 *
 * Yang membedakan KIRIM dari penerimaan: KIRIM berarti barang sedang menuju
 * gudang, belum tiba. Stok baru bertambah setelah petugas memeriksa fisiknya
 * dan mencatatnya lewat Barang Masuk.
 */
function progresSupplier(purchase: ActivePurchase) {
  const unit = purchase.item.unit
  const angka = (value: number | null) => value == null ? null : Number(value).toLocaleString("id-ID")
  const diterima = Number(purchase.receivedQuantity)
  const dipesan = Number(purchase.quantity)

  if (diterima > 0 && diterima < dipesan) {
    return { judul: `Diterima ${angka(diterima)} ${unit}, sisa ${angka(dipesan - diterima)} ${unit}`,
      warna: "bg-amber-50 text-amber-800", tindakan: "Catat penerimaan berikutnya", bisaTerima: true }
  }
  // Diperiksa dari FAKTA kiriman lebih dulu: obrolan biasa setelah KIRIM
  // dapat mengubah status balasan, tetapi tidak mengubah kenyataan bahwa
  // barangnya sudah berangkat.
  if (purchase.supplierShippedAt != null || purchase.shippedQuantity != null) {
    return { judul: "Dalam pengiriman", warna: "bg-blue-50 text-blue-700",
      keterangan: purchase.shippedQuantity != null
        ? `Supplier telah mengirim ${angka(purchase.shippedQuantity)} ${unit}` : undefined,
      tindakan: "Catat saat barang tiba", bisaTerima: true }
  }

  switch (purchase.supplierReplyStatus) {
    case "READY":
      return { judul: `Supplier siap ${angka(purchase.promisedQuantity) ?? "-"} ${unit}`,
        warna: "bg-emerald-50 text-emerald-700", tindakan: "Menunggu pengiriman", bisaTerima: false }
    case "PARTIAL":
      // Disebut apa adanya: sanggup sebagian, bukan sanggup penuh.
      return { judul: `Supplier hanya tersedia ${angka(purchase.promisedQuantity) ?? "-"} dari ${angka(dipesan)} ${unit}`,
        warna: "bg-orange-50 text-orange-700",
        keterangan: purchase.promisedQuantity != null
          ? `Kekurangan ${angka(dipesan - Number(purchase.promisedQuantity))} ${unit} perlu dicarikan supplier lain.` : undefined,
        tindakan: "Menunggu pengiriman", bisaTerima: false }
    case "UNAVAILABLE":
      return { judul: "Supplier tidak dapat memenuhi", warna: "bg-red-50 text-red-700",
        tindakan: "Coba supplier berikutnya melalui halaman Supplier", bisaTerima: false }
    case "NEEDS_REVIEW":
      return { judul: "Balasan perlu ditinjau", warna: "bg-violet-50 text-violet-700",
        tindakan: "Periksa balasan di halaman Supplier", bisaTerima: false }
    default:
      return { judul: "Menunggu jawaban supplier", warna: "bg-slate-100 text-slate-600",
        tindakan: "Tunggu balasan", bisaTerima: false }
  }
}
const deliveryText: Record<DeliveryStatus, string> = {
  PENDING: "menunggu dikirim",
  PROCESSING: "sedang dikirim",
  SENT: "diterima layanan pengiriman",
  FAILED: "gagal",
  UNCERTAIN: "tidak pasti, mungkin sudah sampai",
  DEAD: "berhenti dicoba",
}
const dateFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" })
const dateLabel = (value: string) => `${dateFormat.format(new Date(value))} WIB`

function providerDeliveryText(purchase: ActivePurchase) {
  const labels: Record<ProviderDeliveryStatus, string> = {
    UNKNOWN: "status pengantaran belum tersedia",
    PROVIDER_ACCEPTED: "diterima Fonnte, menunggu status WhatsApp",
    WHATSAPP_SENT: "dikirim ke WhatsApp supplier",
    DELIVERED: "sampai ke perangkat supplier",
    READ: "dibaca supplier",
    UNDELIVERED: "tidak sampai ke perangkat supplier",
  }
  if (purchase.providerDeliveryStatus === "PROVIDER_ACCEPTED" && purchase.deliveryStatusUpdatedAt
    && Date.now() - new Date(purchase.deliveryStatusUpdatedAt).getTime() >= 10 * 60_000) {
    return "status pengantaran belum diketahui — periksa WhatsApp sebelum mengirim ulang"
  }
  return labels[purchase.providerDeliveryStatus]
}

export function PurchaseOrderCard({ purchase }: { purchase: ActivePurchase }) {
  return <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex items-center gap-3"><ShoppingCart className="h-5 w-5 shrink-0 text-blue-600" /><p className="text-sm font-semibold">{purchase.supplier.name} → {purchase.location.name}</p></div>
    <p className="text-xs font-semibold tracking-wide text-slate-400">{purchase.orderCode}</p>
    <p className="text-sm font-semibold">{purchase.item.name} · Dipesan {Number(purchase.quantity).toLocaleString("id-ID")} {purchase.item.unit}</p>
    {(() => {
      const progres = progresSupplier(purchase)
      return <>
        <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${progres.warna}`}>{progres.judul}</span>
        {progres.keterangan && <p className="text-sm text-slate-700">{progres.keterangan}</p>}
        {purchase.supplierLastMessageAt && <p className="text-xs text-slate-500">Balasan diterima: {dateLabel(purchase.supplierLastMessageAt)}</p>}
        <p className="text-xs text-slate-500">Diajukan: {dateLabel(purchase.createdAt)}</p>
        <p className="text-sm text-slate-600">WhatsApp: {deliveryText[purchase.messageStatus]}</p>
        <p className="text-xs text-slate-500">Pengantaran: {providerDeliveryText(purchase)}</p>
        {purchase.responseOverdueAt ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Belum dibalas sampai batas waktu. Tindak lanjuti melalui halaman Supplier.</p>
          : purchase.responseDueAt && purchase.supplierReplyStatus === "WAITING" ? <p className="text-xs text-slate-500">Batas balasan: {dateLabel(purchase.responseDueAt)}</p> : null}
        {purchase.messageStatus !== "UNCERTAIN" && purchase.lastMessageError && <p className="text-xs text-red-600">{purchase.lastMessageError}</p>}
        {purchase.messageStatus === "UNCERTAIN" && <p className="text-xs text-amber-700">Periksa WhatsApp dahulu sebelum mengirim ulang, lewat halaman Supplier.</p>}
        <div className="flex flex-wrap gap-2">
          {progres.bisaTerima ? (
            <Link href={`/dashboard/goods-receipt?purchaseRequestId=${purchase.id}`}
              className="inline-flex min-h-11 items-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white">
              {progres.tindakan}
            </Link>
          ) : (
            <span className="inline-flex min-h-11 items-center text-sm text-slate-500">{progres.tindakan}</span>
          )}
          <Link href="/dashboard/suppliers" className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-600">Lihat pembelian supplier</Link>
        </div>
      </>
    })()}
  </div>
}

/** Satuan beli dari pemetaan supplier, bila diatur (mis. dus = 100 pcs). */
function satuanBeli(need: WarehouseNeed) {
  const isi = Number(need.supplier?.purchaseUnitSize ?? 0)
  return need.supplier?.purchaseUnit && isi > 0 ? { nama: need.supplier.purchaseUnit, isi } : null
}

/**
 * Jumlah minimal agar kebutuhan tertutup: kekurangan outlet, atau sampai stok
 * tersedia kembali ke ambang. Hanya saran — jumlah tetap diisi manusia.
 */
function saranDasar(need: WarehouseNeed) {
  const keAmbang = need.thresholdConfigured ? Number(need.minStock) - Number(need.availableQuantity) : 0
  return Math.max(Number(need.shortfallQuantity), keAmbang, 0)
}

export function WarehousePurchaseNeeds({ active, onSubmitted, children }: {
  active: boolean; onSubmitted: () => void; children: (renderNeed: (need: WarehouseNeed) => ReactNode) => ReactNode
}) {
  const canEdit = useCanEdit("TRANSFER")
  // Bahan yang diklik; pesanan memuat bahan ini + bahan lain dari supplier & gudang yang sama.
  const [selected, setSelected] = useState<WarehouseNeed | null>(null)
  const [allNeeds, setAllNeeds] = useState<WarehouseNeed[]>([])
  const [jumlah, setJumlah] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT">("NORMAL")
  const [organizationName, setOrganizationName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [linkError, setLinkError] = useState("")
  const [linkAlertId, setLinkAlertId] = useState<string | null>(null)
  const handled = useRef(false)
  function open(need: WarehouseNeed) {
    setSelected(need); setLinkAlertId(null); setJumlah({}); setNotes(""); setError(""); setUrgency("NORMAL")
  }
  const muatSemuaKebutuhan = useCallback(() => {
    void fetch("/api/purchase-requests?needs=true", { cache: "no-store" })
      .then(async (response) => { if (response.ok) setAllNeeds(await response.json()) })
      .catch(() => { /* Daftar gabungan hanya bantuan; server tetap memeriksa ulang. */ })
  }, [])
  useEffect(() => {
    if (!active) return
    muatSemuaKebutuhan()
    void fetch("/api/organization").then(async (response) => {
      if (response.ok) setOrganizationName(((await response.json()) as { name?: string }).name ?? "")
    }).catch(() => {})
  }, [active, muatSemuaKebutuhan])
  useEffect(() => {
    if (!active || handled.current) return
    const params = new URLSearchParams(window.location.search)
    const warehouseId = params.get("warehouseId"), itemId = params.get("itemId")
    if (!warehouseId || !itemId) return
    handled.current = true
    void fetch(`/api/purchase-requests?${new URLSearchParams({ need: "true", warehouseId, itemId, fromLink: "true", alertId: params.get("alertId") ?? "" })}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Kebutuhan belum dapat dimuat")
        if (!data[0]) throw new Error("Kebutuhan sudah berubah atau pesanan supplier masih aktif.")
        open(data[0])
        setLinkAlertId(params.get("alertId"))
      }).catch((reason: Error) => setLinkError(reason.message))
  }, [active])
  useLiveRefresh(() => {
    if (!active || busy) return
    muatSemuaKebutuhan()
    if (!selected) return
    const { itemId, locationId } = selected
    void fetch(`/api/purchase-requests?${new URLSearchParams({ need: "true", warehouseId: locationId, itemId })}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return
        const fresh = (await response.json() as WarehouseNeed[])[0]
        if (fresh) setSelected((current) => current?.itemId === fresh.itemId && current.locationId === fresh.locationId ? fresh : current)
      }).catch(() => { /* Submission always rechecks eligibility on the server. */ })
  }, selected ? 3000 : 10_000)
  useEffect(() => {
    if (!selected) return
    const main = document.querySelector("main"), previous = main?.style.overflowY ?? ""
    if (main) main.style.overflowY = "hidden"
    return () => { if (main) main.style.overflowY = previous }
  }, [selected])

  /** Kebutuhan lain yang bisa digabung: supplier #1 dan gudang yang sama. */
  const satuGrup = (need: WarehouseNeed) => allNeeds.filter((row) => row.id !== need.id
    && row.locationId === need.locationId && row.supplier != null && row.supplier.id === need.supplier?.id)
  const grup = selected ? [selected, ...satuGrup(selected)] : []
  const terisi = grup.filter((need) => (jumlah[need.itemId] ?? "").trim() !== "")
  const tidakValid = terisi.some((need) => parseTransferQuantity(jumlah[need.itemId]) == null)
  const pratinjau = selected?.supplier && terisi.length > 0 && !tidakValid ? formatPurchaseOrderMessages({
    supplierName: selected.supplier.name,
    organizationName: organizationName || "usaha Anda",
    destinationName: selected.warehouseName,
    shortCode: "····",
    lines: terisi.map((need) => ({
      name: need.supplier?.supplierItemName?.trim() || need.itemName,
      quantity: Number(jumlah[need.itemId]),
      unit: satuanBeli(need)?.nama ?? need.unit,
    })),
    notes,
  }) : []

  function tutup() {
    if (busy) return
    setSelected(null)
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || !selected.supplier || busy || !canEdit) return
    if (terisi.length === 0) { setError("Isi jumlah minimal untuk satu bahan."); return }
    if (tidakValid) { setError("Jumlah harus lebih dari 0, maksimal 3 angka desimal."); return }
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: selected.locationId, supplierId: selected.supplier.id, urgency, notes,
          lines: terisi.map((need) => ({ itemId: need.itemId, quantity: Number(jumlah[need.itemId]) })),
          ...(linkAlertId ? { fromLink: true, alertId: linkAlertId, linkItemId: selected.itemId } : {}),
        }) })
      const data = await response.json()
      if (!response.ok) { setError(data.error || "Pesanan gagal disimpan"); muatSemuaKebutuhan(); return }
      setSelected(null); setLinkAlertId(null)
      const url = new URL(window.location.href)
      if (url.searchParams.has("warehouseId")) {
        for (const key of ["warehouseId", "itemId", "alertId"]) url.searchParams.delete(key)
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
      }
      muatSemuaKebutuhan()
      onSubmitted()
    } catch { setError("Koneksi terputus. Periksa daftar pesanan sebelum mencoba lagi.") }
    finally { setBusy(false) }
  }
  const renderNeed = (need: WarehouseNeed) => <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><ShoppingCart className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{need.itemName}</p><p className="mt-1 text-xs text-slate-500">{need.warehouseName}</p></div>
      <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">Perlu dibeli</span>
    </div>
    <div className="my-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
      <div><p className="text-xs text-slate-500">Tersedia</p><p className="mt-1 text-base font-semibold text-slate-900">{Number(need.availableQuantity).toLocaleString("id-ID")} <span className="text-xs font-normal text-slate-500">{need.unit}</span></p></div>
      <div><p className="text-xs text-slate-500">{need.shortfallQuantity > 0 ? "Kekurangan outlet" : "Stok minimum"}</p><p className="mt-1 text-base font-semibold text-slate-900">{need.shortfallQuantity > 0 ? Number(need.shortfallQuantity).toLocaleString("id-ID") : need.thresholdConfigured ? Number(need.minStock).toLocaleString("id-ID") : "—"} <span className="text-xs font-normal text-slate-500">{need.shortfallQuantity > 0 || need.thresholdConfigured ? need.unit : ""}</span></p></div>
    </div>
    <p className="text-xs text-slate-500">Supplier <span className="ml-1 font-medium text-slate-800">{need.supplier?.name ?? "Belum diatur"}</span></p>
    {need.onOrderQuantity > 0 && <p className="mt-2 text-xs text-blue-600">Sudah dipesan: {Number(need.onOrderQuantity).toLocaleString("id-ID")} {need.unit}</p>}
    {!need.supplier && <p className="mt-2 text-xs text-amber-700">Tambahkan bahan ini pada tab Supplier untuk mulai memesan.</p>}
    <details className="group mt-3">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-medium text-slate-500 [&::-webkit-details-marker]:hidden">Rincian stok<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary>
      <div className="mt-2 space-y-2">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-3">
      {[
        ["Stok fisik", need.quantity],
        ["Direservasi", need.reservedQuantity],
        ["Tersedia", need.availableQuantity],
        ["Kebutuhan outlet", need.outletOutstandingQuantity],
        ["Sudah dialokasikan", need.coveredQuantity],
        ["Kekurangan", need.shortfallQuantity],
      ].map(([label, value]) => (
        <div key={label as string}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="mt-0.5 font-semibold text-slate-800">{Number(value).toLocaleString("id-ID")} {need.unit}</dd>
        </div>
      ))}
    </dl>
    <p className="text-xs text-slate-400">Diperbarui {dateLabel(need.alertCreatedAt || need.stockUpdatedAt)}</p>
      </div>
    </details>
    {need.supplier && satuGrup(need).length > 0 && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">Bisa digabung dengan {satuGrup(need).length} bahan lain.</p>}
    <div className="mt-auto pt-4"><button type="button" disabled={!canEdit || !need.supplier} onClick={() => open(need)} className="min-h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Buat pesanan</button></div>
  </div>
  return <>
    {linkError && <p role="alert" className="text-sm text-red-600">{linkError}</p>}
    {children(renderNeed)}
    {selected && <AppPortal><div className="app-overlay mobile-fullscreen-dialog z-50 flex items-end justify-center overflow-hidden sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="warehouse-purchase-title">
      <button type="button" aria-label="Tutup pesanan" className="absolute inset-0 bg-slate-950/55" onClick={tutup} />
      <form onSubmit={submit} className="mobile-dialog-panel relative z-10 flex max-h-[calc(100%-1.5rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[calc(100%-2rem)] sm:rounded-3xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="warehouse-purchase-title" className="truncate text-lg font-bold text-slate-900">Pesanan Supplier</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">{selected.supplier?.name ?? "Supplier belum diatur"} · {selected.warehouseName}</p>
          </div>
          <button type="button" disabled={busy} aria-label="Tutup formulir pesanan" onClick={tutup} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>

        <div className="mobile-dialog-scroll min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {linkAlertId && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-800">
              Gudang, supplier, dan bahan sudah dipilih dari peringatan stok. Isi jumlah yang ingin dibeli.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">Supplier</p>
              <div className="truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">{selected.supplier?.name ?? "—"}</div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">Gudang tujuan</p>
              <div className="truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">{selected.warehouseName}</div>
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Daftar Bahan</h3>
                <p className="mt-0.5 text-xs text-slate-400">Kosongkan bahan yang tidak ingin dipesan.</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-400">{grup.length} bahan</span>
            </div>
            <ul className="space-y-2">
              {grup.map((need, index) => {
                const satuan = satuanBeli(need)
                const nilai = jumlah[need.itemId] ?? ""
                const valid = parseTransferQuantity(nilai)
                const dasarSaran = saranDasar(need)
                const saran = dasarSaran > 0 ? (satuan ? Math.ceil(dasarSaran / satuan.isi) : Math.ceil(dasarSaran * 1000) / 1000) : null
                return <li key={need.id} className={`space-y-2 rounded-xl border bg-white p-3 transition ${nilai.trim() ? "border-blue-200" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-500">Item {index + 1}</span>
                    {need.supplier?.supplierItemName && need.supplier.supplierItemName !== need.itemName && (
                      <span className="truncate text-[11px] text-slate-400">Nama supplier: {need.supplier.supplierItemName}</span>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-500">Bahan</p>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">{need.itemName}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`purchase-quantity-${need.itemId}`} className="mb-1 block text-[11px] font-semibold text-slate-500">Jumlah</label>
                      <input id={`purchase-quantity-${need.itemId}`} type="number" min="0" step="0.001" inputMode="decimal" placeholder="0"
                        value={nilai} onChange={(event) => setJumlah({ ...jumlah, [need.itemId]: event.target.value })}
                        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-blue-500 ${nilai.trim() && valid == null ? "border-red-300 bg-red-50" : "border-slate-200"}`} />
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold text-slate-500">Satuan</p>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">{satuan?.nama ?? need.unit}</div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium leading-relaxed text-blue-700">
                    Stok gudang {Number(need.quantity).toLocaleString("id-ID")} {need.unit}
                    {need.thresholdConfigured ? ` · minimum ${Number(need.minStock).toLocaleString("id-ID")} ${need.unit}` : ""}
                    {saran != null ? ` · saran ${saran.toLocaleString("id-ID")} ${satuan?.nama ?? need.unit}` : ""}
                  </div>
                  {Number(need.shortfallQuantity) > 0 && (
                    <p className="text-xs text-amber-700">Kekurangan untuk outlet: {Number(need.shortfallQuantity).toLocaleString("id-ID")} {need.unit}</p>
                  )}
                  {satuan && valid != null && (
                    <p className="text-xs text-blue-700">{valid.toLocaleString("id-ID")} {satuan.nama} = {(valid * satuan.isi).toLocaleString("id-ID", { maximumFractionDigits: 3 })} {need.unit}</p>
                  )}
                </li>
              })}
            </ul>
          </section>

          <section>
            <p className="mb-2 text-sm font-medium text-slate-700">Prioritas balasan</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button type="button" onClick={() => setUrgency("NORMAL")} className={`rounded-lg px-3 py-2.5 text-left transition ${urgency === "NORMAL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                <span className="block text-sm font-semibold">Normal</span><span className="mt-0.5 block text-[11px]">Balasan sekitar 2 jam</span>
              </button>
              <button type="button" onClick={() => setUrgency("URGENT")} className={`rounded-lg px-3 py-2.5 text-left transition ${urgency === "URGENT" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500"}`}>
                <span className="block text-sm font-semibold">Mendesak</span><span className="mt-0.5 block text-[11px]">Balasan sekitar 30 menit</span>
              </button>
            </div>
          </section>

          <label className="block text-sm font-medium text-slate-700">Catatan <span className="font-normal text-slate-400">(opsional)</span>
            <textarea maxLength={500} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contoh: kirim sebelum jam 10"
              className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-blue-500" />
          </label>

          {pratinjau.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Lihat pesan WhatsApp</summary>
              {pratinjau.map((isi, index) => (
                <p key={index} className="mt-3 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-700">{isi}</p>
              ))}
            </details>
          )}
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        </div>

        <footer className="mobile-dialog-actions grid grid-cols-[auto_1fr] gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:grid-cols-2 sm:gap-3 sm:px-6">
          <button type="button" disabled={busy} onClick={tutup} className="min-h-12 rounded-xl border border-slate-200 px-5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Batal</button>
          <button type="submit" disabled={busy || !canEdit || !selected.supplier || terisi.length === 0 || tidakValid} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim…</> : <><ArrowRight className="h-4 w-4" /> {terisi.length > 0 ? `Kirim Pesanan (${terisi.length})` : "Kirim Pesanan"}</>}
          </button>
        </footer>
      </form>
    </div></AppPortal>}
  </>
}
