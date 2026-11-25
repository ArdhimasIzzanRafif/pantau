"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useCanEdit, NO_EDIT_PERMISSION_TITLE } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { Pagination } from "@/components/ui/pagination"
import { FormAlert } from "@/components/ui/form-alert"
import { OpnameQuantityInput } from "@/components/opname-quantity-input"
import { formatInventoryQuantity, parseInventoryQuantity } from "@/lib/inventory-quantity"
import { splitOpnameQuantity } from "@/lib/opname-quantity"
import { WarningModal } from "@/components/ui/warning-modal"
import { AppDatePicker } from "@/components/ui/app-date-picker"
import { Plus, CheckCircle, AlertTriangle, Clock, Loader2, Calendar, XCircle, ChevronDown, MapPin, Search, FileText } from "lucide-react"

type Location = { id: string; name: string }
type BusyLocation = { locationId: string; operatorName: string | null; expiresAt: string }
type ReservedOpnameSession = {
  id: string
  periodStart: string
  periodEnd: string
}
type InventoryItem = {
  id: string; name: string; sku: string | null; unit: string
  packSize: number | null; packUnit: string | null
  costPrice: number | null; isTrackable: boolean
}

type OpnameListItem = {
  id: string
  createdById: string | null
  status: string
  periodStart: string
  periodEnd: string
  shift: string | null
  submittedAt: string | null
  location: { name: string }
  items: Array<{
    difference: number
    estimatedLoss: number
    item: { isTrackable: boolean }
  }>
}

function formatPackBreakdown(quantity: number, item: InventoryItem) {
  if (!item.packSize || !item.packUnit) return ""
  const { packs, loose } = splitOpnameQuantity(quantity, Number(item.packSize))
  return `= ${formatInventoryQuantity(packs)} ${item.packUnit}${loose > 0 ? ` + ${formatInventoryQuantity(loose)} ${item.unit}` : ""}`
}

function OpnameBusyDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return <WarningModal open onClose={onClose} title="Opname sedang dilakukan" messages={[message]} />
}

export default function OpnamePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isOwner = role === "OWNER"
  // Panel tetap tampil untuk role yang memang mengurus opname; tombolnya yang
  // dinonaktifkan bila izin Manajemen hanya "Lihat" — server pun menolaknya
  // lewat getOpnameAccess().
  const canEditOpname = useCanEdit("OPNAME")
  const canCreateOpname = role === "OWNER" || role === "SUPERVISOR" || role === "ADMIN_GUDANG"
  const canSeeResult = role === "OWNER" || role === "SUPERVISOR"

  const [opnames, setOpnames] = useState<OpnameListItem[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [busyLocations, setBusyLocations] = useState<Record<string, BusyLocation>>({})
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const listRef = useRef<HTMLElement>(null)
  const [showNew, setShowNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [switchingLocation, setSwitchingLocation] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [busyMessage, setBusyMessage] = useState("")
  const [error, setError] = useState("")

  const [locationId, setLocationId] = useState("")

  // Gunakan waktu lokal (WIB), bukan UTC dari toISOString()
  const nowDate = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }
  const nowTime = () => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
  }
  const [startDate, setStartDate] = useState(nowDate)
  const [startTime, setStartTime] = useState(nowTime)
  const [endDate, setEndDate] = useState(nowDate)
  const [endTime, setEndTime] = useState(nowTime)
  const [endInstant, setEndInstant] = useState(() => new Date().toISOString())
  const [physicalQtys, setPhysicalQtys] = useState<Record<string, string>>({})
  const [opnameItemSearch, setOpnameItemSearch] = useState("")
  const [opnameItemFilter, setOpnameItemFilter] = useState<"all" | "empty" | "filled">("all")
  const [opnameFilteredItemIds, setOpnameFilteredItemIds] = useState<string[] | null>(null)
  // Urutan tampilan di tab "Semua": item yang belum diisi ditaruh di atas supaya
  // tidak perlu digulir mencarinya. Disimpan sebagai daftar id, bukan dihitung
  // langsung dari nilai, agar barisnya tidak melompat saat sedang diketik.
  const [opnameOrderIds, setOpnameOrderIds] = useState<string[] | null>(null)
  const [opnameInputVersion, setOpnameInputVersion] = useState(0)
  const [filterLocation, setFilterLocation] = useState("")
  const [filterFrom, setFilterFrom] = useState("")
  const [filterTo, setFilterTo] = useState("")
  const [draftFilterFrom, setDraftFilterFrom] = useState("")
  const [draftFilterTo, setDraftFilterTo] = useState("")
  const [stockBalances, setStockBalances] = useState<Record<string, number>>({})
  // ID item yang stoknya berubah (ada transaksi masuk/keluar) SETELAH cutoff opname.
  const [incomingChangedIds, setIncomingChangedIds] = useState<string[]>([])
  const [refreshingCutoff, setRefreshingCutoff] = useState(false)
  const [incomingModalOpen, setIncomingModalOpen] = useState(false)
  // Detik tersisa saat penyimpanan opname ditahan karena baru ada transaksi.
  const [submitHoldLeft, setSubmitHoldLeft] = useState(0)
  const [submitHoldOpen, setSubmitHoldOpen] = useState(false)
  // Tipe lokasi opname (untuk teks: outlet = transaksi, gudang = barang masuk/transfer).
  const [opnameLocType, setOpnameLocType] = useState<"OUTLET" | "WAREHOUSE" | null>(null)
  // Hitung mundur masa tenang; reset ke ~30 setiap ada aktivitas stok baru.
  const [activityLeft, setActivityLeft] = useState(0)

  const formatRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`

  function localDateTimeParts(iso: string) {
    const value = new Date(iso)
    return {
      date: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
      time: `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}`,
    }
  }

  function applySessionPeriod(sessionPeriod: ReservedOpnameSession) {
    const start = localDateTimeParts(sessionPeriod.periodStart)
    const end = localDateTimeParts(sessionPeriod.periodEnd)
    setStartDate(start.date)
    setStartTime(start.time)
    setEndDate(end.date)
    setEndTime(end.time)
    setEndInstant(sessionPeriod.periodEnd)
  }

  function formatPeriod(date: string, time: string) {
    return new Date(`${date}T${time}`).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const fetchOpnames = useCallback(async (nextPage = 1, { silent = false } = {}) => {
    if (!silent) setLoading(true)
    const p = new URLSearchParams({ page: String(nextPage) })
    if (filterLocation) p.set("locationId", filterLocation)
    if (filterFrom) p.set("periodFrom", filterFrom)
    if (filterTo)   p.set("periodTo",   filterTo)
    const res = await fetch(`/api/opnames?${p}`)
    if (res.ok) {
      const data = await res.json()
      setOpnames(data.items)
      setPage(data.page)
      setPages(data.pages)
      setTotal(data.total)
    }
    setLoading(false)
  }, [filterLocation, filterFrom, filterTo])

  const fetchBusyLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/opnames/session", { cache: "no-store" })
      if (!res.ok) return
      const sessions = await res.json() as BusyLocation[]
      setBusyLocations(Object.fromEntries(sessions.map((entry) => [entry.locationId, entry])))
    } catch {
      // Kunci di server tetap mencegah sesi ganda saat jaringan sementara putus.
    }
  }, [])

  async function fetchSetup() {
    const [lRes, iRes, sRes] = await Promise.all([
      fetch("/api/locations"),
      fetch("/api/inventory"),
      fetch("/api/opnames/session", { cache: "no-store" }),
    ])
    const sessions = sRes.ok ? await sRes.json() as BusyLocation[] : []
    const busyByLocation = Object.fromEntries(sessions.map((entry) => [entry.locationId, entry])) as Record<string, BusyLocation>
    setBusyLocations(busyByLocation)
    if (lRes.ok) {
      const locs = await lRes.json() as Location[]
      setLocations(locs)
      if (locs.length > 0) setLocationId((locs.find((loc) => !busyByLocation[loc.id]) ?? locs[0]).id)
    }
    if (iRes.ok) {
      const inv = await iRes.json()
      // Semua item dihitung saat opname, termasuk yang tidak dipotong otomatis
      // saat penjualan (bumbu/garnish) — opname yang mencatat pemakaian nyatanya.
      setInventoryItems(inv)
    }
  }

  async function fetchBalances(locId: string, asOf?: string) {
    if (!locId) return
    const url = asOf
      ? `/api/stock-balances?locationId=${locId}&asOf=${encodeURIComponent(asOf)}`
      : `/api/stock-balances?locationId=${locId}`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      const map: Record<string, number> = {}
      for (const b of data) map[b.itemId] = Number(b.quantity)
      setStockBalances(map)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchSetup() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => { void fetchBusyLocations() }, 15_000)
    const onFocus = () => { void fetchBusyLocations() }
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
    }
  }, [fetchBusyLocations])

  // Filter tanggal dijalankan di server, jadi daftar dimuat ulang saat filter berubah.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void fetchOpnames() }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchOpnames])

  // Opname yang disimpan pengguna lain ikut berubah status di sini tanpa perlu
  // memuat ulang halaman.
  useLiveRefresh(() => { void fetchOpnames(page, { silent: true }) })

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (showNew && locationId) void fetchBalances(locationId, endInstant)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [showNew, locationId, endInstant])

  // Pantau aktivitas stok SETELAH cutoff selama opname berlangsung. Server
  // mengembalikan item yang berubah + hitung mundur masa tenang dari aktivitas
  // terakhir (otomatis reset ke ~30 saat ada aktivitas baru) + tipe lokasi.
  useEffect(() => {
    if (!showNew || !locationId || !endInstant) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(
          `/api/opnames/activity?locationId=${locationId}&since=${encodeURIComponent(endInstant)}`,
          { cache: "no-store" },
        )
        if (!res.ok || cancelled) return
        const data = await res.json() as { locationType?: "OUTLET" | "WAREHOUSE"; changedItemIds?: string[]; secondsRemaining?: number }
        if (cancelled) return
        if (data.locationType) setOpnameLocType(data.locationType)
        const changed = data.changedItemIds ?? []
        setIncomingChangedIds(changed)
        if (changed.length === 0) {
          setIncomingModalOpen(false)
          setActivityLeft(0)
        } else {
          setIncomingModalOpen(true)
          // Naikkan ke nilai server saat ada aktivitas baru (reset ke ~30);
          // penurunan halus ditangani hitung mundur lokal per detik.
          const server = data.secondsRemaining ?? 0
          setActivityLeft((prev) => (server > prev ? server : prev))
        }
      } catch {
        // Diabaikan; dicoba lagi pada interval berikutnya.
      }
    }
    void check()
    const intervalId = window.setInterval(() => void check(), 4_000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [showNew, locationId, endInstant])

  // Hitung mundur lokal masa tenang aktivitas (per detik).
  const activityCounting = activityLeft > 0
  useEffect(() => {
    if (!activityCounting) return
    const intervalId = window.setInterval(() => {
      setActivityLeft((seconds) => Math.max(0, seconds - 1))
    }, 1_000)
    return () => window.clearInterval(intervalId)
  }, [activityCounting])

  // Server dapat menahan submit opname bila transaksi baru saja dibukukan.
  // Setelah hitungan selesai, petugas tetap wajib memperbarui cutoff sebelum
  // menyimpan agar stok sistem tidak memakai snapshot lama.
  useEffect(() => {
    if (!submitHoldOpen || submitHoldLeft <= 0) return
    const timeoutId = window.setTimeout(() => {
      setSubmitHoldLeft((seconds) => Math.max(0, seconds - 1))
    }, 1_000)
    return () => window.clearTimeout(timeoutId)
  }, [submitHoldOpen, submitHoldLeft])

  // Perbarui cutoff opname ke sekarang (re-base) tanpa menghapus input fisik yang
  // sudah diisi — agar perbandingan memakai stok sistem terbaru.
  async function refreshCutoff() {
    if (!locationId || refreshingCutoff) return
    setRefreshingCutoff(true)

    // Ambil saldo terbaru tepat sebelum re-base supaya input item yang berubah
    // pasti dikosongkan, meskipun polling 15 detik belum sempat berjalan.
    let changedIds = [...incomingChangedIds]
    try {
      const balanceRes = await fetch(`/api/stock-balances?locationId=${locationId}`, { cache: "no-store" })
      if (balanceRes.ok) {
        const latest = await balanceRes.json() as { itemId: string; quantity: number | string }[]
        const balanceDiff = latest
          .filter((row) => stockBalances[row.itemId] !== undefined && Number(row.quantity) !== stockBalances[row.itemId])
          .map((row) => row.itemId)
        changedIds = [...new Set([...incomingChangedIds, ...balanceDiff])]
      }
    } catch {
      // Daftar dari polling sebelumnya tetap dipakai bila refresh jaringan gagal.
    }

    const previous = draftId
    if (previous) await releaseOpnameSession(previous)
    const next = await reserveOpnameSession(locationId)
    if (!next) {
      setDraftId(null)
      setShowNew(false)
      setIncomingModalOpen(false)
      setActivityLeft(0)
      setSubmitHoldOpen(false)
      setBusyMessage("Gagal memperbarui waktu hitung. Silakan mulai ulang opname.")
      setRefreshingCutoff(false)
      return
    }
    setDraftId(next.id)
    applySessionPeriod(next) // memicu refetch stok sistem sesuai cutoff baru
    // Kosongkan input fisik untuk item yang berubah agar dihitung ulang —
    // angka lama sudah basi karena ada transaksi setelah hitungan sebelumnya.
    if (changedIds.length > 0) {
      setPhysicalQtys((prev) => {
        const next = { ...prev }
        for (const id of changedIds) delete next[id]
        return next
      })
      setOpnameInputVersion((version) => version + 1)
    }
    setIncomingChangedIds([])
    setIncomingModalOpen(false)
    setActivityLeft(0)
    setSubmitHoldOpen(false)
    setSubmitHoldLeft(0)
    setRefreshingCutoff(false)
  }

  useEffect(() => {
    if (!showNew || !draftId) return

    const heartbeat = window.setInterval(async () => {
      try {
        const res = await fetch("/api/opnames/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId }),
        })
        if (res.status === 409) {
          const data = await res.json()
          setBusyMessage(data.error ?? "Sesi opname sudah berakhir. Mulai opname kembali.")
          setDraftId(null)
          setShowNew(false)
        }
      } catch {
        // Kegagalan jaringan sementara tidak langsung membatalkan sesi.
      }
    }, 20_000)

    return () => window.clearInterval(heartbeat)
  }, [showNew, draftId])

  useEffect(() => {
    if (!draftId) return

    const releaseOnLeave = () => {
      const body = JSON.stringify({ draftId })
      const queued = navigator.sendBeacon?.(
        "/api/opnames/session/release",
        new Blob([body], { type: "application/json" }),
      ) ?? false
      if (!queued) {
        void fetch("/api/opnames/session", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        })
      }
    }
    window.addEventListener("pagehide", releaseOnLeave)
    return () => {
      window.removeEventListener("pagehide", releaseOnLeave)
      void releaseOpnameSession(draftId)
    }
  }, [draftId])

  async function reserveOpnameSession(targetLocationId: string) {
    try {
      const res = await fetch("/api/opnames/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: targetLocationId }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setBusyMessage(data.error ?? "Opname sedang dilakukan di lokasi ini.")
          void fetchBusyLocations()
        }
        else setError(data.error ?? "Tidak dapat memulai opname")
        return null
      }
      return {
        id: String(data.id),
        periodStart: String(data.periodStart),
        periodEnd: String(data.periodEnd),
      } satisfies ReservedOpnameSession
    } catch {
      setError("Koneksi gagal saat memulai opname")
      return null
    }
  }

  async function releaseOpnameSession(sessionId: string) {
    try {
      await fetch("/api/opnames/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: sessionId }),
      })
    } catch {
      // Heartbeat akan kedaluwarsa otomatis jika koneksi terputus.
    }
  }

  async function openNewOpname() {
    if (!locationId) {
      setError("Belum ada lokasi yang dapat digunakan untuk opname")
      return
    }
    if (busyLocations[locationId]) {
      setBusyMessage("Lokasi ini sedang diopname. Pilih lokasi lain atau tunggu hingga sesi selesai.")
      return
    }
    setStarting(true)
    setError("")
    const reservedSession = await reserveOpnameSession(locationId)
    setStarting(false)
    if (!reservedSession) return

    applySessionPeriod(reservedSession)
    setPhysicalQtys({})
    setOpnameItemSearch("")
    setOpnameItemFilter("all")
    setOpnameFilteredItemIds(null)
    setOpnameOrderIds(null)
    setOpnameInputVersion((version) => version + 1)
    setIncomingChangedIds([])
    setIncomingModalOpen(false)
    setSubmitHoldOpen(false)
    setSubmitHoldLeft(0)
    setError("")
    setDraftId(reservedSession.id)
    setShowNew(true)
  }

  async function cancelNewOpname() {
    const sessionId = draftId
    setShowNew(false)
    setDraftId(null)
    setPhysicalQtys({})
    setOpnameItemSearch("")
    setOpnameItemFilter("all")
    setOpnameFilteredItemIds(null)
    setOpnameOrderIds(null)
    setSubmitHoldOpen(false)
    setSubmitHoldLeft(0)
    if (sessionId) await releaseOpnameSession(sessionId)
    await Promise.all([fetchOpnames(), fetchBusyLocations()])
  }

  async function changeOpnameLocation(nextLocationId: string) {
    if (!nextLocationId || nextLocationId === locationId) return
    setSwitchingLocation(true)
    setError("")
    const nextSession = await reserveOpnameSession(nextLocationId)
    setSwitchingLocation(false)
    if (!nextSession) return

    const previousSessionId = draftId
    setLocationId(nextLocationId)
    setDraftId(nextSession.id)
    applySessionPeriod(nextSession)
    setPhysicalQtys({})
    setOpnameItemSearch("")
    setOpnameItemFilter("all")
    setOpnameFilteredItemIds(null)
    setOpnameOrderIds(null)
    setOpnameInputVersion((version) => version + 1)
    setSubmitHoldOpen(false)
    setSubmitHoldLeft(0)
    if (previousSessionId) void releaseOpnameSession(previousSessionId)
  }

  // Rincian opname hanya punya satu tampilan, yaitu halaman /dashboard/audit/opname/[id],
  // supaya tampilan dari daftar ini dan dari halaman Peringatan tidak berbeda.
  function openDetail(id: string) {
    router.push(`/dashboard/audit/opname/${id}`)
  }

  function statusLabel(status: string) {
    if (status === "SUBMITTED") return "Data Lama"
    if (status === "REVIEWED") return "Selesai"
    if (status === "REJECTED") return "Tidak Dibukukan"
    if (status === "DRAFT") return "Sedang dilakukan"
    return status
  }

  function statusBadgeClass(status: string) {
    if (status === "REVIEWED") return "bg-emerald-100 text-emerald-700"
    if (status === "REJECTED") return "bg-red-100 text-red-700"
    return "bg-slate-100 text-slate-600"
  }

  async function handleSubmit() {
    if (submitHoldOpen) {
      setError(submitHoldLeft > 0
        ? `Tunggu transaksi selesai dibukukan (${submitHoldLeft} detik lagi)`
        : "Perbarui dan hitung ulang item yang berubah sebelum menyimpan")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const items = inventoryItems
        .filter((item) => physicalQtys[item.id] !== undefined && physicalQtys[item.id] !== "")
        .map((item) => {
          const physicalQty = parseInventoryQuantity(Number(physicalQtys[item.id]), `Stok fisik ${item.name}`, true)
          return { itemId: item.id, physicalQty }
        })

      if (items.length === 0) {
        setError("Isi minimal 1 item fisik")
        setSubmitting(false)
        return
      }

      const res = await fetch("/api/opnames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          submit: true,
          draftId,
          items,
        }),
      })

      if (res.ok) {
        setShowNew(false)
        setDraftId(null)
        setPhysicalQtys({})
        setSubmitHoldOpen(false)
        setSubmitHoldLeft(0)
        // Status "sedang diopname" ikut disegarkan supaya lokasi langsung bisa
        // dipakai lagi; tanpa ini kuncinya baru lepas saat polling berikutnya.
        await Promise.all([fetchOpnames(), fetchBusyLocations()])
      } else {
        const d = await res.json()
        if (res.status === 409 && Array.isArray(d.changedItemIds)) {
          // Server menemukan transaksi pada barang yang dihitung sejak opname
          // dimulai: buka dialog "Perbarui & hitung ulang" untuk barang itu.
          setIncomingChangedIds(d.changedItemIds)
          setIncomingModalOpen(true)
        } else if (res.status === 423 && typeof d.secondsRemaining === "number") {
          // Transaksi didahulukan: tahan simpan opname sampai masa tenang habis.
          setSubmitHoldLeft(d.secondsRemaining)
          setSubmitHoldOpen(true)
        } else if (res.status === 409) {
          setBusyMessage(d.error ?? "Opname sedang dilakukan di lokasi ini.")
          if (String(d.error ?? "").startsWith("Sesi opname")) {
            setShowNew(false)
            setDraftId(null)
          }
          void fetchBusyLocations()
        } else {
          setError(d.error ?? "Gagal submit opname")
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Koneksi gagal, coba lagi")
    } finally {
      setSubmitting(false)
    }
  }

  if (showNew) {
    const trackable = inventoryItems
    const isItemFilled = (itemId: string) => {
      const value = physicalQtys[itemId]
      return value !== undefined && value.trim() !== "" && Number.isFinite(Number(value))
    }
    // Nilai disimpan saat kolom ditinggalkan, lalu isi tab "Belum diisi"/"Terisi"
    // dihitung ulang supaya item berpindah ke tab yang sesuai. Sengaja tidak tiap
    // ketikan: kolom yang sedang diketik akan hilang dari layar di tengah jalan.
    const commitPhysicalQty = (itemId: string, value: string) => {
      const nextQtys = { ...physicalQtys, [itemId]: value }
      setPhysicalQtys(nextQtys)
      const filledAfter = (id: string) => {
        const next = nextQtys[id]
        return next !== undefined && next.trim() !== "" && Number.isFinite(Number(next))
      }
      // Yang belum diisi naik ke atas, yang sudah turun ke bawah.
      setOpnameOrderIds([
        ...trackable.filter((item) => !filledAfter(item.id)).map((item) => item.id),
        ...trackable.filter((item) => filledAfter(item.id)).map((item) => item.id),
      ])
      if (opnameItemFilter === "all") return
      setOpnameFilteredItemIds(
        trackable
          .filter((item) => opnameItemFilter === "filled" ? filledAfter(item.id) : !filledAfter(item.id))
          .map((item) => item.id),
      )
    }
    const filledItemCount = trackable.filter((item) => isItemFilled(item.id)).length
    const emptyItemCount = trackable.length - filledItemCount
    const normalizedItemSearch = opnameItemSearch.trim().toLocaleLowerCase("id-ID")
    const orderPosition = new Map((opnameOrderIds ?? []).map((id, index) => [id, index]))
    const visibleTrackable = trackable
      .filter((item) => {
        const matchesSearch = !normalizedItemSearch
          || item.name.toLocaleLowerCase("id-ID").includes(normalizedItemSearch)
          || item.sku?.toLocaleLowerCase("id-ID").includes(normalizedItemSearch)
        const matchesFilter = opnameItemFilter === "all"
          || opnameFilteredItemIds?.includes(item.id) === true
        return matchesSearch && matchesFilter
      })
      .sort((a, b) => (orderPosition.get(a.id) ?? 0) - (orderPosition.get(b.id) ?? 0))
    const progressPercent = trackable.length > 0
      ? Math.round((filledItemCount / trackable.length) * 100)
      : 0
    return (
      <>
        {busyMessage && <OpnameBusyDialog message={busyMessage} onClose={() => setBusyMessage("")} />}
      <div className="max-w-5xl mx-auto space-y-4">
        <button onClick={() => void cancelNewOpname()} className="text-sm text-slate-500 hover:text-slate-700">
          ← Batal
        </button>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
          <h2 className="font-bold text-slate-900 text-lg mb-1">Opname Baru</h2>
          <p className="text-sm text-slate-500 mb-6">Hitung stok fisik dan bandingkan dengan data sistem</p>

          <FormAlert message={error} onClose={() => setError("")} />

          <div className="space-y-4 mb-6 pb-6 border-b border-slate-100">
            <div>
              <label htmlFor="opname-location" className="block text-sm font-medium text-slate-700 mb-1.5">Lokasi</label>
              <div className="relative">
              <select
                id="opname-location"
                value={locationId}
                disabled={switchingLocation}
                onChange={(e) => void changeOpnameLocation(e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-11 text-sm text-slate-900 transition-shadow focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 disabled:text-slate-500"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.id !== locationId && !!busyLocations[l.id]}>
                    {l.name}{l.id !== locationId && busyLocations[l.id] ? " — Sedang diopname" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                {
                  label: "Periode Dari",
                  help: "Waktu opname terakhir disimpan",
                  date: startDate,
                  time: startTime,
                },
                {
                  label: "Mulai Hitung",
                  help: "Akhir periode dicatat saat opname disimpan",
                  date: endDate,
                  time: endTime,
                },
              ] as const).map((f) => (
                <div key={f.label}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{f.label}</label>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{formatPeriod(f.date, f.time)}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{f.help}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {submitHoldOpen && (() => {
            const isWarehouse = opnameLocType === "WAREHOUSE"
            const noun = isWarehouse ? "barang masuk / transfer" : "transaksi"
            return (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
              <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" />
              <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center gap-2 bg-amber-500 px-5 py-3 text-white">
                  <Clock className="h-4 w-4" />
                  <h3 className="text-sm font-bold">{isWarehouse ? "Aktivitas stok didahulukan" : "Transaksi didahulukan"}</h3>
                </div>
                <div className="px-6 py-6 text-center">
                  {submitHoldLeft > 0 ? (
                    <>
                      <p className="text-sm leading-6 text-slate-600">
                        Ada {noun} yang baru masuk di lokasi ini. Penyimpanan opname ditahan sampai {noun} selesai dibukukan.
                      </p>
                      <div className="my-4 text-4xl font-black tabular-nums text-amber-600">{submitHoldLeft}s</div>
                      <p className="text-xs text-slate-400">Jangan tutup halaman. Data hitungan fisik tetap tersimpan di form.</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mx-auto h-10 w-10 text-emerald-500" />
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {isWarehouse ? "Aktivitas" : "Transaksi"} sudah selesai dibukukan. Perbarui stok sistem, lalu hitung ulang item yang berubah sebelum menyimpan opname.
                      </p>
                    </>
                  )}
                  <button
                    onClick={() => void refreshCutoff()}
                    disabled={submitHoldLeft > 0 || refreshingCutoff}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-wait disabled:opacity-50"
                  >
                    {refreshingCutoff ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                    {submitHoldLeft > 0 ? `Tunggu ${submitHoldLeft} detik` : "Perbarui & hitung ulang"}
                  </button>
                </div>
              </div>
            </div>
            )
          })()}

          {!submitHoldOpen && incomingModalOpen && incomingChangedIds.length > 0 && (() => {
            const ids = [...new Set(incomingChangedIds)]
            const names = ids.map((id) => inventoryItems.find((i) => i.id === id)?.name ?? "Item")
            const isWarehouse = opnameLocType === "WAREHOUSE"
            const title = isWarehouse ? "Aktivitas stok saat opname" : "Transaksi saat opname berlangsung"
            const activityNoun = isWarehouse ? "barang masuk / transfer" : "transaksi baru"
            const counting = activityLeft > 0
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" />
                <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-slate-900">{title}</h3>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                        Ada {activityNoun} untuk{" "}
                        <span className="font-semibold text-slate-800">
                          {names.slice(0, 5).join(", ")}{names.length > 5 ? ` +${names.length - 5} lagi` : ""}
                        </span>{" "}
                        sejak hitungan dimulai <span className="font-medium">{new Date(endInstant).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>. Stok fisik yang kamu hitung mungkin sudah termasuk {isWarehouse ? "aktivitas" : "transaksi"} ini.
                      </p>
                      {counting ? (
                        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-center">
                          <p className="text-xs text-amber-700">Tunggu {isWarehouse ? "aktivitas" : "transaksi"} selesai dibukukan</p>
                          <div className="text-3xl font-black tabular-nums text-amber-600">{activityLeft}s</div>
                          <p className="text-[11px] text-amber-500 mt-0.5">Reset ke 30 detik setiap ada {activityNoun} lagi</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                          Pilih <span className="font-medium text-slate-500">Perbarui &amp; hitung ulang</span> untuk ambil stok sistem terbaru. Input fisik untuk item yang berubah akan <span className="font-medium text-amber-600">dikosongkan</span> agar dihitung ulang; item lain tetap terisi.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-5">
                    <button
                      onClick={refreshCutoff}
                      disabled={refreshingCutoff || counting}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:cursor-wait disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-colors"
                    >
                      {refreshingCutoff ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                      {counting ? `Tunggu ${activityLeft} detik` : "Perbarui & hitung ulang"}
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          <div className="mb-6">
            <h3 className="font-semibold text-slate-900">Input Stok Fisik</h3>
            <p className="mb-4 mt-1 text-sm text-slate-500">Isi kemasan utuh dan satuan lepas sesuai hasil hitung. Kosong berarti belum dihitung; isi 0 jika stok habis.</p>
            <div className="mb-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="font-semibold text-slate-700">{filledItemCount} dari {trackable.length} item terisi</span>
                    <span className="font-bold tabular-nums text-blue-600">{progressPercent}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-[width] duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* HP: cari di atas, tiga filter selebar baris di bawahnya.
                  Layar besar: cari & filter sebaris, filternya segmented ringkas. */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative lg:flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={opnameItemSearch}
                  onChange={(event) => setOpnameItemSearch(event.target.value)}
                  placeholder="Cari nama atau SKU barang"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50 sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 lg:flex lg:shrink-0" aria-label="Filter item opname">
                {([
                  { value: "all", label: "Semua", count: trackable.length },
                  { value: "empty", label: "Belum diisi", count: emptyItemCount },
                  { value: "filled", label: "Terisi", count: filledItemCount },
                ] as const).map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => {
                      setOpnameItemFilter(filter.value)
                      setOpnameFilteredItemIds(
                        filter.value === "all"
                          ? null
                          : trackable
                              .filter((item) => filter.value === "filled" ? isItemFilled(item.id) : !isItemFilled(item.id))
                              .map((item) => item.id),
                      )
                    }}
                    className={`h-9 min-w-0 truncate rounded-full px-3 text-xs font-semibold transition-colors sm:text-sm lg:px-4 ${
                      opnameItemFilter === filter.value
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    {filter.label}
                    <span className={`ml-1.5 tabular-nums ${opnameItemFilter === filter.value ? "text-white/60" : "text-slate-400"}`}>{filter.count}</span>
                  </button>
                ))}
              </div>
              </div>
              {/* HP: tombol simpan di bawah filter, dekat progress — tidak dijejalkan
                  di samping progress dan tidak perlu menggulir ke ujung daftar. */}
              <div className="sm:hidden">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={filledItemCount === 0 || submitting || submitHoldOpen || incomingModalOpen || !canEditOpname}
                  title={canEditOpname ? undefined : NO_EDIT_PERMISSION_TITLE}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan...</>
                    : submitHoldOpen
                      ? <><Clock className="h-4 w-4" /> Transaksi masih diproses</>
                      : incomingModalOpen
                        ? <><Clock className="h-4 w-4" /> Perbarui stok dahulu</>
                        : <><CheckCircle className="h-4 w-4" /> Simpan &amp; Sesuaikan Stok</>}
                </button>
              </div>
            </div>
            <div className="space-y-3 sm:hidden">
              {visibleTrackable.map((item) => {
                const v = physicalQtys[item.id] ?? ""
                const physical = parseFloat(v)
                const hasValue = !isNaN(physical)
                const hasPack = !!(item.packSize && item.packUnit)
                const sysQtyPcs = stockBalances[item.id] ?? 0
                return (
                  <div id={`opname-item-${item.id}`} key={`${opnameInputVersion}-${item.id}`} className="scroll-mt-44 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold text-slate-900">{item.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.unit}{hasPack ? ` · 1 ${item.packUnit} = ${formatInventoryQuantity(Number(item.packSize))} ${item.unit}` : ""}{item.sku ? ` · ${item.sku}` : ""}
                        </p>
                        {!item.isTrackable && (
                          <p className="mt-1 text-[11px] font-medium text-blue-600">Hanya memperbarui jumlah stok, tidak dihitung sebagai selisih</p>
                        )}
                      </div>
                      {hasValue && <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Terisi</span>}
                    </div>
                    {isOwner && (
                      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                        Stok sistem <span className="font-semibold tabular-nums text-slate-900">{formatInventoryQuantity(sysQtyPcs)} {item.unit}</span>
                        {hasPack && sysQtyPcs > 0 && <p className="mt-1 text-slate-500">{formatPackBreakdown(sysQtyPcs, item)}</p>}
                      </div>
                    )}
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <OpnameQuantityInput item={item} value={v} onCommit={(value) => commitPhysicalQty(item.id, value)} />
                    </div>
                  </div>
                )
              })}
              {visibleTrackable.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
                  <p className="text-sm font-medium text-slate-600">Barang tidak ditemukan</p>
                  <button
                    type="button"
                    onClick={() => { setOpnameItemSearch(""); setOpnameItemFilter("all"); setOpnameFilteredItemIds(null); setOpnameOrderIds(null) }}
                    className="mt-2 text-xs font-semibold text-blue-600"
                  >
                    Tampilkan semua barang
                  </button>
                </div>
              )}
            </div>
            <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900">
                    <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3">Nama Item</th>
                    {isOwner && (
                      <th className="w-44 px-4 py-3 text-right text-xs font-semibold text-slate-300">
                        Stok Sistem
                        <div className="mt-0.5 text-[10px] font-normal text-slate-500">
                          s/d {new Date(`${endDate}T${endTime}`).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </th>
                    )}
                    <th className="w-[44%] min-w-72 px-4 py-3 text-left text-xs font-semibold text-slate-300">Stok Fisik</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleTrackable.map((item) => {
                    const v = physicalQtys[item.id] ?? ""
                    const physical = parseFloat(v)
                    const hasValue = !isNaN(physical)
                    const hasPack = !!(item.packSize && item.packUnit)
                    const sysQtyPcs = stockBalances[item.id] ?? 0
                    return (
                      <tr key={`${opnameInputVersion}-${item.id}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-4 align-middle">
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-400">
                            {item.unit}
                            {hasPack && (
                              <span className="ml-1.5 text-blue-600">1 {item.packUnit} = {formatInventoryQuantity(Number(item.packSize))} {item.unit}</span>
                            )}
                            {item.sku ? ` · ${item.sku}` : ""}
                          </div>
                          {!item.isTrackable && (
                            <div className="mt-0.5 text-[11px] font-medium text-blue-600">Hanya memperbarui stok</div>
                          )}
                        </td>
                        {isOwner && (
                          <td className="px-4 py-4 text-right align-middle">
                            <div className="font-semibold tabular-nums text-slate-900">{formatInventoryQuantity(sysQtyPcs)} <span className="text-xs font-normal text-slate-500">{item.unit}</span></div>
                            {hasPack && item.packSize && sysQtyPcs > 0 && (
                              <div className="mt-1 text-xs leading-5 text-slate-500">{formatPackBreakdown(sysQtyPcs, item)}</div>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-4 align-middle">
                          <OpnameQuantityInput item={item} value={v} onCommit={(value) => commitPhysicalQty(item.id, value)} />
                        </td>
                        <td className="px-3 py-4 text-center align-middle">
                          {hasValue
                            ? <span className="text-green-500 text-base">✓</span>
                            : <span className="text-slate-200 text-base">—</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="hidden flex-col-reverse gap-3 sm:flex sm:flex-row">
            <button
              onClick={() => void cancelNewOpname()}
              className="min-h-12 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:flex-1"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || submitHoldOpen || incomingModalOpen || !canEditOpname}
              title={canEditOpname ? undefined : NO_EDIT_PERMISSION_TITLE}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold leading-snug text-white transition-colors hover:bg-blue-700 disabled:opacity-60 sm:flex-1"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                : submitHoldOpen
                  ? <><Clock className="w-4 h-4" /> Transaksi masih diproses</>
                  : incomingModalOpen
                    ? <><Clock className="w-4 h-4" /> Perbarui stok dahulu</>
                    : <><CheckCircle className="w-4 h-4" /> Simpan &amp; Sesuaikan Stok</>}
            </button>
          </div>
        </div>
      </div>
      </>
    )
  }


  // Gaya kartu mengikuti Transfer Barang & Barang Masuk: garis kiri berwarna sesuai status.
  function opnameTone(op: OpnameListItem) {
    const hasDifference = op.items?.some((i) => i.item.isTrackable && Number(i.difference) !== 0) ?? false
    if (op.status === "REJECTED") return { card: "border-red-100 border-l-red-400", iconBox: "bg-red-100 text-red-600", Icon: XCircle }
    if (op.status === "REVIEWED" && canSeeResult && hasDifference) return { card: "border-orange-100 border-l-orange-400", iconBox: "bg-orange-100 text-orange-600", Icon: AlertTriangle }
    if (op.status === "REVIEWED") return { card: "border-emerald-100 border-l-emerald-500", iconBox: "bg-emerald-100 text-emerald-600", Icon: CheckCircle }
    if (op.status === "DRAFT") return { card: "border-blue-100 border-l-blue-500", iconBox: "bg-blue-100 text-blue-600", Icon: Clock }
    return { card: "border-slate-200 border-l-slate-300", iconBox: "bg-slate-100 text-slate-500", Icon: Clock }
  }
  const hasFilter = Boolean(filterLocation || filterFrom || filterTo)
  function resetFilter() {
    setFilterLocation(""); setFilterFrom(""); setFilterTo("")
    setDraftFilterFrom(""); setDraftFilterTo("")
  }

  return (
    <>
    {busyMessage && <OpnameBusyDialog message={busyMessage} onClose={() => setBusyMessage("")} />}
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Opname Fisik</h1>
          <p className="text-slate-500 text-sm mt-0.5">Hitung stok fisik dan sesuaikan selisihnya</p>
        </div>
        {canCreateOpname && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-56">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  aria-label="Lokasi opname"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                  className="h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50 sm:rounded-full"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id} disabled={!!busyLocations[loc.id]}>
                      {loc.name}{busyLocations[loc.id] ? " — Sedang diopname" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <button
                onClick={openNewOpname}
                disabled={starting || !locationId || !!busyLocations[locationId] || !canEditOpname}
                title={canEditOpname ? undefined : NO_EDIT_PERMISSION_TITLE}
                className="flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:rounded-full"
              >
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {starting ? "Memeriksa..." : "Mulai Opname Baru"}
              </button>
            </div>
            {busyLocations[locationId] && (
              <p className="text-xs text-amber-700 sm:text-right">
                Sedang diopname{busyLocations[locationId].operatorName ? ` oleh ${busyLocations[locationId].operatorName}` : ""}. Pilih lokasi lain.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Daftar dibungkus section berpita seperti Transfer Barang. */}
      <section ref={listRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
          <h2 className="font-semibold text-slate-900">Riwayat Opname</h2>
          <p className="mt-1 text-sm text-slate-600">Sesi hitung stok fisik beserta selisih dan status pembukuannya.</p>
        </div>

        <div className="border-b border-slate-100 p-4 sm:px-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-800">Filter Riwayat</span>
            {!loading && <span className="text-xs text-slate-400">{total} sesi</span>}
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
                max={draftFilterTo || undefined}
                placeholder="Pilih tanggal" ariaLabel="Dari tanggal"
                className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-50"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Sampai tanggal</label>
              <AppDatePicker value={draftFilterTo} onChange={setDraftFilterTo}
                min={draftFilterFrom || undefined}
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
                onClick={resetFilter}
                disabled={!hasFilter && !draftFilterFrom && !draftFilterTo}
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
      ) : opnames.length === 0 ? (
        hasFilter ? (
          <div className="px-4 py-14 text-center sm:py-16">
            <div className="text-slate-500 text-sm">Tidak ada opname untuk filter yang dipilih</div>
            <button onClick={resetFilter} className="mt-2 text-sm text-blue-600 hover:underline">Reset filter</button>
          </div>
        ) : (
          <div className="px-4 py-14 text-center sm:py-20">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-slate-400" />
            </div>
            <div className="text-slate-600 font-semibold">Belum ada opname</div>
            <div className="text-slate-400 text-sm mt-1">Mulai opname baru untuk mencatat stok fisik</div>
          </div>
        )
      ) : (
        <>
        <div className="space-y-3 p-3 sm:p-4">
          {opnames.map((op) => {
            const trackedItems = op.items?.filter((i) => i.item.isTrackable) ?? []
            const diffItems    = trackedItems.filter((i) => Number(i.difference) !== 0).length
            const totalLossAmt = trackedItems.reduce((s, i) => s + Number(i.estimatedLoss ?? 0), 0)
            const hasLoss = diffItems > 0
            const isPending = op.status === "SUBMITTED"
            const isReviewed = op.status === "REVIEWED"
            const isRejected = op.status === "REJECTED"
            const tone = opnameTone(op)
            return (
              <button
                key={op.id}
                onClick={() => openDetail(op.id)}
                className={`block w-full overflow-hidden rounded-2xl border border-l-4 bg-white text-left transition-shadow hover:shadow-md ${tone.card}`}
              >
                <div className="space-y-3.5 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-start gap-3 sm:gap-3.5">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.iconBox}`}>
                        <tone.Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="break-words text-[14px] font-semibold text-slate-900">{op.location.name}</div>
                        <div className="mt-1 text-xs leading-relaxed text-slate-400">
                          <span className="whitespace-nowrap">{new Date(op.periodStart).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          {" – "}
                          <span className="whitespace-nowrap">{new Date(op.periodEnd).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>
                    {/* Sama seperti kartu Transfer: di HP badge + ringkasan sejajar di bawah judul. */}
                    <div className="flex shrink-0 items-center justify-between gap-3 pl-13 sm:block sm:pl-0 sm:text-right">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(op.status)}`}>
                        {statusLabel(op.status)}
                      </span>
                      <div className="text-xs text-slate-400 sm:mt-1.5">{op.items?.length ?? 0} item dihitung</div>
                    </div>
                  </div>

                  {(isOwner || op.submittedAt) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isOwner && (
                        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          isPending
                            ? "bg-slate-100 text-slate-600"
                            : isRejected
                              ? "bg-red-50 text-red-700"
                              : hasLoss
                                ? "bg-orange-50 text-orange-700"
                                : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {isPending
                            ? "Data lama"
                            : isRejected
                              ? "Tidak dibukukan"
                              : hasLoss
                                ? `${diffItems} item selisih`
                                : "Semua cocok"}
                        </span>
                      )}
                      {isOwner && isReviewed && totalLossAmt > 0 && (
                        <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600">− {formatRp(totalLossAmt)}</span>
                      )}
                      {op.submittedAt && (
                        <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                          <Clock className="h-3 w-3 text-slate-400" />
                          Dikirim {new Date(op.submittedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  )}

                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600">
                    <FileText className="h-4 w-4" />
                    {isReviewed ? "Lihat dokumen hasil opname" : "Lihat detail opname"}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
        {/* Pagination sudah punya garis atas sendiri dan tidak dirender jika hanya 1 halaman. */}
        <Pagination page={page} pages={pages} total={total} perPage={30} label="sesi"
          loading={loading} scrollToRef={listRef} onPageChange={fetchOpnames} />
        </>
      )}
      </section>
    </div>
    </>
  )
}
