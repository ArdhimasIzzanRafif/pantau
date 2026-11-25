"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { Pagination } from "@/components/ui/pagination"
import { ALERT_REFRESH_INTERVAL, publishAlertCount } from "@/lib/alert-count-sync"
import { AlertTriangle, ArrowLeftRight, Bell, CheckCircle, ClipboardList, PackageCheck, PackageX } from "lucide-react"

type Alert = {
  id: string
  type: string
  severity: "CRITICAL" | "WARNING" | "INFO"
  title: string
  message: string
  isResolved: boolean
  createdAt: string
  locationId?: string | null
  itemId?: string | null
  canRequestOutlet?: boolean
  fulfillmentWarehouseId?: string | null
  // Status WA stok menipis terakhir; null = belum pernah dikirim.
  waStatus?: WaStatus | null
  referenceId?: string | null
  // Diisi server: dokumen asal peringatan ini, dipakai untuk menautkan ke rinciannya.
  referenceType?: "opname" | "transfer" | "receipt" | null
}

const RINCIAN = {
  opname:   { href: "/dashboard/audit/opname",   label: "Lihat rincian opname" },
  transfer: { href: "/dashboard/audit/transfer", label: "Lihat rincian transfer" },
  receipt:  { href: "/dashboard/audit/receipt",  label: "Lihat rincian barang masuk" },
}

// ── Status WhatsApp dalam bahasa pengguna ───────────────────────────────────
type WaStatus = { ok: boolean; error: string | null; tujuan: string; nomor?: string; at: string }

const TUJUAN_WA: Record<string, string> = {
  GUDANG: "penanggung jawab gudang",
  OWNER: "owner",
  OUTLET: "penanggung jawab outlet",
  LOKASI: "penanggung jawab lokasi",
}

/** 6285714575826 → 0857-1457-5826, supaya mudah dicocokkan pengguna. */
function tampilkanNomor(nomor?: string) {
  if (!nomor) return ""
  const lokal = nomor.replace(/\D/g, "").replace(/^62/, "0")
  return lokal.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3")
}

/** Mengubah pesan teknis dari server menjadi penjelasan + apa yang harus dilakukan. */
function jelaskanGagalWa(error: string | null) {
  const teks = error ?? ""
  if (/daftar izin|dimatikan di lingkungan/i.test(teks)) {
    return "Nomor ini belum diizinkan menerima pesan selama masa uji aplikasi. Minta pengelola aplikasi menambahkan nomor ini."
  }
  if (/Atur WhatsApp bisnis|Integrasi WhatsApp/i.test(teks)) {
    return "WhatsApp bisnis belum dihubungkan. Owner perlu mengaturnya di Pengaturan → Integrasi WhatsApp."
  }
  if (/tidak valid|invalid/i.test(teks)) {
    return "Nomor WhatsApp tujuan tidak valid. Periksa nomornya di Manajemen."
  }
  return "Pesan belum terkirim karena gangguan layanan WhatsApp. Coba kirim ulang beberapa saat lagi."
}

function StatusWa({ status }: { status: WaStatus | null | undefined }) {
  if (!status) {
    return <p className="mt-2 text-xs font-medium text-slate-400">WhatsApp belum dikirim untuk peringatan ini.</p>
  }
  const tujuan = `${TUJUAN_WA[status.tujuan] ?? "penerima"}${status.nomor ? ` (${tampilkanNomor(status.nomor)})` : ""}`
  // Dikirim ke owner = gudang pemasok atau nomornya belum diatur.
  const catatanOwner = status.tujuan === "OWNER"
    ? " Pesan dialihkan ke owner karena gudang pemasok outlet atau nomor WhatsApp gudangnya belum diatur (Manajemen → Outlet / Gudang)."
    : ""
  if (status.ok) {
    return <p className="mt-2 text-xs font-medium text-emerald-600">✓ WhatsApp terkirim ke {tujuan} · {relativeTime(status.at)}.{catatanOwner}</p>
  }
  return (
    <p className="mt-2 text-xs font-medium text-red-600">
      WhatsApp ke {tujuan} belum terkirim. {jelaskanGagalWa(status.error)}{catatanOwner}
    </p>
  )
}

function relativeTime(value: string) {
  const elapsed = new Date(value).getTime() - Date.now()
  const absolute = Math.abs(elapsed)
  const formatter = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" })
  if (absolute < 60_000) return "baru saja"
  if (absolute < 3_600_000) return formatter.format(Math.round(elapsed / 60_000), "minute")
  if (absolute < 86_400_000) return formatter.format(Math.round(elapsed / 3_600_000), "hour")
  if (absolute < 604_800_000) return formatter.format(Math.round(elapsed / 86_400_000), "day")
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState("all")
  const listRef = useRef<HTMLDivElement>(null)
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const organizationId = (session?.user as { organizationId?: string })?.organizationId
  const alertsRequest = useRef({ sequence: 0 })

  const fetchAlerts = useCallback(async ({ silent = false } = {}) => {
    const tracker = alertsRequest.current
    const request = ++tracker.sequence
    if (!silent) setLoading(true)
    // Admin Gudang mengikuti aturan yang sama seperti Supervisor: seluruh
    // notifikasi operasional pada lokasi yang ditugaskan padanya, bukan hanya
    // stok menipis. Penyaring lokasinya sudah ditangani API.
    const params = new URLSearchParams({ resolved: String(showResolved) })
    // Kegagalan wajib terlihat. Sebelumnya respons gagal diabaikan diam-diam,
    // sehingga error server tampil sebagai "Tidak ada peringatan aktif".
    try {
      const res = await fetch(`/api/alerts?${params}`, { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      const data: Alert[] = await res.json()
      if (request !== tracker.sequence) return
      setAlerts(data)
      if (!showResolved && organizationId) publishAlertCount(organizationId, data.length)
      setError("")
    } catch {
      if (request === tracker.sequence) setError("Gagal memuat notifikasi. Coba muat ulang halaman.")
    }
    if (request === tracker.sequence) setLoading(false)
  }, [showResolved, organizationId])

  const [resending, setResending] = useState<string | null>(null)
  const [resendMessage, setResendMessage] = useState<{ id: string; ok: boolean; text: string } | null>(null)

  async function resendWa(id: string) {
    setResending(id)
    setResendMessage(null)
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "RESEND_WA" }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; message?: string }
      // Hasil kirim (berhasil/gagal ke nomor tujuan) sudah tampil di baris status
      // WhatsApp, jadi tidak diulang di sini. Pesan tambahan hanya untuk kasus
      // lain: terlalu cepat, atau belum ada nomor tujuan.
      if (!res.ok && res.status !== 502) setResendMessage({ id, ok: false, text: data.error ?? "WhatsApp belum bisa dikirim ulang." })
      await fetchAlerts({ silent: true })
    } catch {
      setResendMessage({ id, ok: false, text: "Tidak dapat terhubung ke server" })
    } finally {
      setResending(null)
    }
  }

  async function resolve(id: string) {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    await fetchAlerts()
    window.dispatchEvent(new Event("alert-resolved"))
  }

  useEffect(() => {
    const tracker = alertsRequest.current
    const timeoutId = window.setTimeout(() => { void fetchAlerts() }, 0)
    return () => {
      window.clearTimeout(timeoutId)
      tracker.sequence++
    }
  }, [fetchAlerts])

  // Peringatan baru dari aktivitas pengguna lain langsung menyusul.
  useLiveRefresh(() => { void fetchAlerts({ silent: true }) }, ALERT_REFRESH_INTERVAL)

  // Daftar dipotong per halaman supaya tidak menggulung panjang di HP.
  const PER_PAGE = 10
  const isTransfer = (alert: Alert) => alert.referenceType === "transfer" || alert.type.startsWith("TRANSFER")
  const categories = [
    { id: "all", label: "Semua", count: alerts.length },
    { id: "stock", label: "Ambang stok", count: alerts.filter(alert => alert.type === "LOW_STOCK").length },
    { id: "transfer", label: "Transfer", count: alerts.filter(isTransfer).length },
    { id: "other", label: "Lainnya", count: alerts.filter(alert => alert.type !== "LOW_STOCK" && !isTransfer(alert)).length },
  ]
  const filteredAlerts = alerts.filter(alert => category === "all"
    || (category === "stock" ? alert.type === "LOW_STOCK"
      : category === "transfer" ? isTransfer(alert) : alert.type !== "LOW_STOCK" && !isTransfer(alert)))
  const pages = Math.max(1, Math.ceil(filteredAlerts.length / PER_PAGE))
  const currentPage = Math.min(page, pages)
  const shownAlerts = filteredAlerts.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE)

  // Hanya dua tingkat sekarang: Info dan Kritis. Peringatan lama bersever
  // WARNING masih ada di database, jadi tetap dipetakan — diperlakukan sebagai
  // kritis supaya tidak hilang dari hitungan.
  const severityConfig = {
    CRITICAL: { iconBg: "bg-red-50", iconColor: "text-red-600", time: "text-red-700", dot: "bg-red-600" },
    WARNING:  { iconBg: "bg-amber-50", iconColor: "text-amber-600", time: "text-amber-700", dot: "bg-amber-500" },
    INFO:     { iconBg: "bg-blue-50", iconColor: "text-blue-600", time: "text-blue-700", dot: "bg-blue-500" },
  }

  const critical = alerts.filter((a) => a.severity !== "INFO").length
  const info     = alerts.filter((a) => a.severity === "INFO").length

  return (
    <div ref={listRef} className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Notifikasi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {!showResolved ? `${alerts.length} notifikasi aktif` : `${alerts.length} sudah diselesaikan`}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); setPage(1); setShowResolved(!showResolved) }}
          className="min-h-10 shrink-0 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-blue-600 shadow-sm transition-colors hover:bg-slate-50"
        >
          {showResolved ? "Aktif" : "Selesai"}
        </button>
      </div>

      {!showResolved && (
        <div className="hidden grid-cols-3 gap-4 sm:grid">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-center sm:p-4">
            <div className="text-xl font-light tracking-tight sm:text-2xl text-red-600">{critical}</div>
            <div className="text-xs text-slate-500 mt-0.5">Kritis</div>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-center sm:p-4">
            <div className="text-xl font-light tracking-tight sm:text-2xl text-blue-600">{info}</div>
            <div className="text-xs text-slate-500 mt-0.5">Info</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center sm:p-4">
            <div className="text-xl font-light tracking-tight sm:text-2xl text-slate-700">{alerts.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">Total Aktif</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Jenis notifikasi">
        {categories.map(item => (
          <button key={item.id} type="button" aria-pressed={category === item.id}
            onClick={() => { setCategory(item.id); setPage(1) }}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${category === item.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"}`}>
            {item.label}<span className={`text-xs ${category === item.id ? "text-blue-100" : "text-slate-400"}`}>{item.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3" aria-label="Memuat notifikasi">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-[0_10px_35px_-24px_rgba(15,23,42,0.35)]">
              <div className="flex gap-3.5">
                <div className="app-skeleton h-11 w-11 shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-3 pt-0.5">
                  <div className="app-skeleton h-4 w-2/3 rounded-full" />
                  <div className="app-skeleton h-3 w-full rounded-full" />
                  <div className="app-skeleton h-3 w-4/5 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-[1.75rem] border border-red-100 bg-white py-16 text-center shadow-[0_10px_35px_-24px_rgba(15,23,42,0.35)]">
          <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-red-400" />
          <div className="font-semibold text-slate-700">{error}</div>
          <button
            onClick={() => { void fetchAlerts() }}
            className="mt-4 min-h-10 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-blue-600 shadow-sm transition-colors hover:bg-slate-50"
          >
            Muat ulang
          </button>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="rounded-[1.75rem] border border-slate-100 bg-white py-16 text-center shadow-[0_10px_35px_-24px_rgba(15,23,42,0.35)]">
          <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-400" />
          <div className="font-semibold text-slate-700">
            {category !== "all" ? "Tidak ada notifikasi di kategori ini" : showResolved ? "Belum ada peringatan yang diselesaikan" : "Tidak ada peringatan aktif"}
          </div>
          <div className="text-slate-400 text-sm mt-1">
            {!showResolved && category === "all" && "Notifikasi baru akan muncul di sini."}
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {shownAlerts.map((alert, index) => {
            const cfg = severityConfig[alert.severity] ?? severityConfig.INFO
            const rincian = alert.referenceType && alert.referenceId ? RINCIAN[alert.referenceType] : null
            const Icon = alert.type === "LOW_STOCK" ? PackageX
              : alert.type.startsWith("TRANSFER") ? ArrowLeftRight
                : alert.type === "GOODS_RECEIVED" ? PackageCheck
                  : alert.severity === "INFO" ? Bell
                    : AlertTriangle
            return (
              <article
                key={alert.id}
                className={`app-notification-card rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-[0_10px_35px_-24px_rgba(15,23,42,0.35)] sm:p-5 ${showResolved ? "opacity-75" : ""}`}
                style={{ animationDelay: `${Math.min(index * 45, 270)}ms` }}
              >
                <div className="flex items-start gap-3.5">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${cfg.iconBg} ${cfg.iconColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="break-words text-[15px] font-bold leading-snug text-slate-900 sm:text-base">{alert.title}</h2>
                      <span className={`flex shrink-0 items-center gap-1.5 pt-0.5 text-xs font-bold ${showResolved ? "text-slate-400" : cfg.time}`}>
                        {!showResolved && <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />}
                        {relativeTime(alert.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm leading-relaxed text-slate-500">{alert.message}</p>
                    {alert.type === "LOW_STOCK" && !showResolved && <StatusWa status={alert.waStatus} />}
                    {resendMessage?.id === alert.id && (
                      <p role="status" className={`mt-1 text-xs font-medium ${resendMessage.ok ? "text-emerald-600" : "text-red-600"}`}>{resendMessage.text}</p>
                    )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {!showResolved && alert.canRequestOutlet && alert.fulfillmentWarehouseId && alert.itemId && alert.locationId && ["OWNER", "SUPERVISOR", "ADMIN_GUDANG"].includes(role ?? "") && (
                      <Link
                        href={role === "OWNER" || role === "ADMIN_GUDANG"
                          ? `/dashboard/transfer?lowStock=${alert.id}`
                          : `/dashboard/transfer?new=1&fromId=${alert.fulfillmentWarehouseId}&toId=${alert.locationId}&itemId=${alert.itemId}`}
                        className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-blue-600"
                      >Buat pengiriman ke outlet</Link>
                    )}
                    {!showResolved && alert.type === "LOW_STOCK" && (
                      <button
                        type="button"
                        onClick={() => void resendWa(alert.id)}
                        disabled={resending === alert.id}
                        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700 disabled:opacity-50"
                      >
                        {resending === alert.id ? "Mengirim…" : alert.waStatus ? "Kirim ulang WA" : "Kirim WA"}
                      </button>
                    )}
                    {rincian && (
                      <Link
                        href={`${rincian.href}/${alert.referenceId}`}
                        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
                      >
                        <ClipboardList className="h-4 w-4" />
                        {rincian.label}
                      </Link>
                    )}
                    {!showResolved && (
                      <button
                        onClick={() => resolve(alert.id)}
                        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
                      >
                        <CheckCircle className="h-4 w-4" />
                        {alert.severity === "INFO" ? "Tandai dibaca" : "Tinjau dan selesaikan"}
                      </button>
                    )}
                  </div>
                  {showResolved && <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle className="h-4 w-4" /> Selesai</div>}
                </div>
                </div>
              </article>
            )
          })}
          <Pagination
            page={currentPage}
            pages={pages}
            total={filteredAlerts.length}
            perPage={PER_PAGE}
            label="notifikasi"
            loading={loading}
            scrollToRef={listRef}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
