"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect, useCallback, useRef } from "react"
import { useSession, signOut } from "next-auth/react"
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ClipboardList,
  ArrowLeftRight,
  Truck,
  Bell,
  LogOut,
  Menu,
  X,
  AlertTriangle,
  Settings,
  Users,
  UtensilsCrossed,
  ChevronRight,
  History,
  BookOpenText,
  ClipboardMinus,
  UserRound,
  ShoppingCart,
  Handshake,
  ChartColumn,
} from "lucide-react"

import { featureForDashboardPath, getEffectivePermissions, FEATURES } from "@/lib/permissions"
import { useOrgPermissions } from "@/lib/use-can-edit"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { useViewportHeight } from "@/components/use-viewport-height"
import { PantauLogo } from "@/components/pantau-logo"
import { NavigationProgress } from "@/components/ui/navigation-progress"
import { OrganizationStatusGuard } from "@/components/organization-status-guard"
import { ALERT_COUNT_UPDATED, ALERT_REFRESH_INTERVAL, readAlertCountUpdate } from "@/lib/alert-count-sync"

type NavItem = { label: string; href: string; icon: React.ElementType; feature?: string }
type NavGroup = { label: string; items: NavItem[] }

// Nav items yang selalu ada untuk OWNER
const OWNER_NAV: NavGroup[] = [
  { label: "Ringkasan",   items: [{ label: "Dashboard", href: "/dashboard/owner", icon: LayoutDashboard }] },
  { label: "Operasional", items: [
    { label: "Master Inventori", href: "/dashboard/inventory",     icon: Package,        feature: "MASTER_INVENTORY" },
    { label: "Supplier",         href: "/dashboard/suppliers",     icon: Handshake,      feature: "SUPPLIERS" },
    { label: "Master Menu",      href: "/dashboard/menu",          icon: UtensilsCrossed,feature: "MASTER_MENU" },
    { label: "Stok per Lokasi",  href: "/dashboard/stok",          icon: Warehouse,      feature: "STOCK_LOCATION" },
    { label: "Kartu Stok",       href: "/dashboard/stock-card",    icon: BookOpenText,   feature: "STOCK_LOCATION" },
    { label: "Transfer Barang",  href: "/dashboard/transfer",      icon: ArrowLeftRight, feature: "TRANSFER" },
    { label: "Opname Fisik",     href: "/dashboard/opname",        icon: ClipboardList,  feature: "OPNAME" },
    { label: "Barang Masuk",     href: "/dashboard/goods-receipt", icon: Truck,          feature: "GOODS_RECEIPT" },
    { label: "Waste & Penyesuaian", href: "/dashboard/adjustments", icon: ClipboardMinus, feature: "ADJUSTMENTS" },
  ]},
  { label: "Laporan",     items: [
    { label: "Biaya & Selisih Stok", href: "/dashboard/reports/hpp-stock-variance", icon: ChartColumn },
    { label: "Peringatan",        href: "/dashboard/alerts",     icon: AlertTriangle, feature: "ALERTS" },
    { label: "Riwayat",           href: "/dashboard/audit",      icon: History, feature: "HISTORY" },
  ]},
  { label: "Tim & Akun",  items: [
    { label: "Manajemen",  href: "/dashboard/team",     icon: Users },
    { label: "Pengaturan", href: "/dashboard/settings", icon: Settings },
  ]},
]

const ROLE_DASHBOARD: Record<string, string> = {
  ADMIN_GUDANG: "/dashboard/admin-gudang",
  SUPERVISOR:   "/dashboard/supervisor",
}

const roleLabel: Record<string, string> = {
  OWNER: "Owner",
  ADMIN_GUDANG: "Admin Gudang",
  SUPERVISOR: "Supervisor",
  KASIR: "Kasir",
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const [actionCounts, setActionCounts] = useState({ transfer: 0, goodsReceipt: 0 })
  const orgPerms = useOrgPermissions()
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const organizationId = (session?.user as { organizationId?: string } | undefined)?.organizationId
  const countRequest = useRef({ sequence: 0 })

  const refreshAlertCount = useCallback(async () => {
    if (!organizationId) return
    const tracker = countRequest.current
    const request = ++tracker.sequence
    try {
      const response = await fetch("/api/alerts?resolved=false", { cache: "no-store" })
      if (!response.ok) return
      const data: unknown = await response.json()
      if (request === tracker.sequence && Array.isArray(data)) setAlertCount(data.length)
    } catch {
      // Gangguan jaringan tidak boleh membuat badge mendadak menjadi nol.
    }
  }, [organizationId])

  const refreshActionCounts = () => {
    fetch("/api/dashboard/action-counts", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { transfer?: number; goodsReceipt?: number } | null) => {
        if (!data) return
        setActionCounts({
          transfer: Number(data.transfer) || 0,
          goodsReceipt: Number(data.goodsReceipt) || 0,
        })
      })
  }

  useEffect(() => {
    if (!session) return
    refreshActionCounts()
  }, [session])

  useEffect(() => {
    const tracker = countRequest.current
    const timeout = window.setTimeout(() => { void refreshAlertCount() }, 0)
    return () => {
      window.clearTimeout(timeout)
      // Abaikan respons dari halaman/organisasi sebelumnya.
      tracker.sequence++
    }
  }, [pathname, refreshAlertCount])

  useEffect(() => {
    const syncCount = (event: Event) => {
      const count = readAlertCountUpdate(event, organizationId)
      if (count === null) return
      countRequest.current.sequence++
      setAlertCount(count)
    }
    window.addEventListener("alert-resolved", refreshAlertCount)
    window.addEventListener(ALERT_COUNT_UPDATED, syncCount)
    return () => {
      window.removeEventListener("alert-resolved", refreshAlertCount)
      window.removeEventListener(ALERT_COUNT_UPDATED, syncCount)
    }
  }, [organizationId, refreshAlertCount])

  // Samakan angka badge dengan daftar notifikasi, termasuk ketika notifikasi
  // baru dibuat atau aturan visibilitas role berubah di server.
  useLiveRefresh(refreshAlertCount, ALERT_REFRESH_INTERVAL)
  useLiveRefresh(refreshActionCounts, 5_000)

  useViewportHeight()

  // Kunci scroll halaman selama drawer terbuka, supaya gesture tidak "bocor"
  // menggulung konten di belakang drawer.
  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = previous }
  }, [mobileOpen])

  useEffect(() => {
    if (!session) return

    let cancelled = false

    fetch("/api/organization")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && data) {
          setProfileImage(data.userImage ?? null)
        }
      })

    const handleProfileUpdate = (event: Event) => {
      const image = (event as CustomEvent<string | null>).detail ?? null
      setProfileImage(image)
    }
    window.addEventListener("profile-image-updated", handleProfileUpdate)
    return () => {
      cancelled = true
      window.removeEventListener("profile-image-updated", handleProfileUpdate)
    }
  }, [session])

  const sessionUser = session?.user as {
    name?: string | null; email?: string | null; role?: string; businessName?: string; orgPlan?: string
  } | undefined

  const role = sessionUser?.role ?? "OWNER"
  const name = sessionUser?.name ?? "Pengguna"
  const businessName = sessionUser?.businessName ?? "Bisnis"
  const orgPlan = sessionUser?.orgPlan ?? ""
  const isStarterPlan = orgPlan === "STARTER" || orgPlan === "FREE"

  const STARTER_BLOCKED_FEATURES = new Set(["TRANSFER", "OPNAME", "GOODS_RECEIPT", "ADJUSTMENTS", "ALERTS", "STOCK_LOCATION"])

  const ownerNav: NavGroup[] = isStarterPlan
    ? OWNER_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || !STARTER_BLOCKED_FEATURES.has(i.feature)) })).filter((g) => g.items.length > 0)
    : OWNER_NAV

  // Build nav berdasarkan role + permissions
  const effectivePerms = getEffectivePermissions(role, orgPerms)
  const noDashboardRoles = ["ADMIN_GUDANG", "SUPERVISOR", "KASIR"]
  const visibleGroups: NavGroup[] = role === "OWNER"
    ? ownerNav
    : [
        ...(!noDashboardRoles.includes(role)
          ? [{ label: "Ringkasan", items: [{ label: "Dashboard", href: ROLE_DASHBOARD[role] ?? "/dashboard/owner", icon: LayoutDashboard }] }]
          : []),
        // Menu baru ditampilkan setelah izin organisasi selesai dimuat. Sebelum
        // itu orgPerms masih null dan perhitungan jatuh ke izin bawaan role,
        // sehingga menu yang sebenarnya dinonaktifkan sempat terlihat sekilas.
        { label: "Operasional", items: orgPerms === null ? [] : OWNER_NAV[1].items.filter((i) =>
          i.feature && effectivePerms[i.feature as keyof typeof FEATURES]
          && (role !== "SUPERVISOR" || i.href !== "/dashboard/stock-card")
        ) },
        { label: "Laporan",     items: orgPerms === null ? [] : OWNER_NAV[2].items.filter((i) => i.feature && effectivePerms[i.feature as keyof typeof FEATURES]) },
        { label: "Tim & Akun",  items: role === "KASIR" ? [] : [{ label: "Pengaturan", href: "/dashboard/settings", icon: Settings }] },
      ].filter((g) => g.items.length > 0)

  const allVisible = visibleGroups.flatMap((g) => g.items)
  const currentLabel = allVisible.find((n) => pathname.startsWith(n.href))?.label ?? "Dashboard"
  const currentFeature = featureForDashboardPath(pathname)
  const teamOwnerOnlyPage = pathname === "/dashboard/team"
    || pathname.startsWith("/dashboard/team/")
  const supervisorHiddenPage = role === "SUPERVISOR"
    && (pathname === "/dashboard/stock-card" || pathname.startsWith("/dashboard/stock-card/"))
  const ownerOnlyPage = teamOwnerOnlyPage
    || pathname === "/dashboard/reports/hpp-stock-variance"
    || pathname.startsWith("/dashboard/reports/hpp-stock-variance/")
  const currentPageLoading = sessionStatus === "loading"
    || (role !== "OWNER" && orgPerms === null && (!!currentFeature || ownerOnlyPage))
  const currentPageDenied = sessionStatus === "authenticated" && role !== "OWNER" && orgPerms !== null
    && (ownerOnlyPage || supervisorHiddenPage || (!!currentFeature && !effectivePerms[currentFeature]))
  const fallbackPath = allVisible.find((item) => item.feature)?.href
    ?? (role === "KASIR" ? "/pos" : "/dashboard/settings")

  useEffect(() => {
    if (currentPageDenied && pathname !== fallbackPath) router.replace(fallbackPath)
  }, [currentPageDenied, fallbackPath, pathname, router])

  async function handleSignOut() {
    // redirectTo melakukan full redirect dari server — router.push() saja
    // menyisakan cache RSC dashboard sehingga halaman terlihat menggantung.
    await signOut({ redirect: false }); window.location.href = "/login"
  }

  const renderSidebar = () => (
    <aside className="flex flex-col h-full bg-slate-950">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-white/8 shrink-0">
        <Link href="/" className="flex items-center gap-2.5">
          <PantauLogo className="h-8 w-8" priority />
          <span className="text-base font-bold text-white tracking-tight">Pantau</span>
        </Link>
      </div>

      {/* Business badge */}
      <div className="px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/6">
          {profileImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profileImage}
              alt={`Foto ${businessName}`}
              onError={() => setProfileImage(null)}
              className="h-6 w-6 shrink-0 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600">
              <span className="text-[10px] font-bold text-white">{businessName[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="text-xs text-slate-400 leading-none mb-0.5">Bisnis aktif</div>
            <div className="text-sm font-semibold text-white truncate">{businessName}</div>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto overscroll-contain space-y-4">
        {/* Owner dapat membuka POS langsung tanpa mengetik alamat /pos.
            Diletakkan di dalam area scroll agar ikut tergulung, tidak menempel. */}
        {role === "OWNER" && (
          <div className="px-1">
            <Link
              href="/pos"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition-colors hover:bg-blue-500"
            >
              <ShoppingCart className="h-4 w-4 shrink-0" />
              <span className="flex-1">Buka Kasir</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            </Link>
          </div>
        )}
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{group.label}</span>
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                const actionCount = item.href === "/dashboard/transfer"
                  ? actionCounts.transfer
                  : item.href === "/dashboard/goods-receipt"
                    ? actionCounts.goodsReceipt
                    : 0
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    title={item.label}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:bg-white/6 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.label}</span>
                    {(item.href === "/dashboard/alerts" ? alertCount : actionCount) > 0
                      ? <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white">{(item.href === "/dashboard/alerts" ? alertCount : actionCount) > 99 ? "99+" : (item.href === "/dashboard/alerts" ? alertCount : actionCount)}</span>
                      : active && <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
                    }
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-white/8 shrink-0">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/6 transition-colors"
          >
            {profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileImage}
                alt="Foto profil"
                onError={() => setProfileImage(null)}
                className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-slate-300 shrink-0">
                <UserRound className="w-4 h-4" />
              </div>
            )}
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-medium text-white truncate">{name}</div>
              <div className="text-xs text-slate-400">{roleLabel[role] ?? role}</div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          </button>

          {userMenuOpen && (
            <div className="app-popover-enter absolute bottom-full left-0 right-0 mb-1 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
              <Link
                href="/dashboard/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-3 text-sm text-slate-300 hover:bg-white/6 hover:text-white transition-colors"
              >
                <Settings className="w-4 h-4" />
                Pengaturan
              </Link>
              <div className="border-t border-white/8" />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Keluar
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )

  return (
    <div data-app-shell className="app-shell app-motion-scope backoffice-app flex overflow-hidden bg-slate-50">
      <OrganizationStatusGuard />
      <NavigationProgress />
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-60 md:flex-col md:shrink-0">
        {renderSidebar()}
      </div>

      {/* Mobile sidebar overlay */}
      <div
        aria-hidden={!mobileOpen}
        className={`fixed inset-0 z-40 overscroll-contain transition-[visibility] duration-300 md:hidden ${
          mobileOpen ? "visible" : "pointer-events-none invisible"
        }`}
      >
        <button
          type="button"
          aria-label="Tutup navigasi"
          tabIndex={mobileOpen ? 0 : -1}
          className={`absolute inset-0 bg-slate-950/45 transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`absolute bottom-0 left-0 top-0 z-50 w-60 transform-gpu transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {renderSidebar()}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka navigasi"
              aria-expanded={mobileOpen}
              className="rounded-lg p-2 transition-colors hover:bg-slate-100 md:hidden"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-400">
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-medium">{currentLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isStarterPlan && (role === "OWNER" || !!effectivePerms.ALERTS) && (
              <Link
                href="/dashboard/alerts"
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors relative"
              >
                <Bell className="w-4 h-4 text-slate-500" />
              </Link>
            )}
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
              {profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profileImage}
                  alt="Foto profil"
                  onError={() => setProfileImage(null)}
                  className="w-7 h-7 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                  <UserRound className="w-3.5 h-3.5" />
                </div>
              )}
              <span className="text-sm font-medium text-slate-700">{name.split(" ")[0]}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6" style={{ scrollbarGutter: "stable" }}>
          {currentPageDenied || currentPageLoading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">
              {currentPageDenied ? "Akses fitur berubah. Mengalihkan halaman..." : "Memeriksa akses fitur..."}
            </div>
          ) : children}
        </main>
      </div>
    </div>
  )
}
