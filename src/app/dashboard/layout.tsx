"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import {
  BarChart3,
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
} from "lucide-react"

import { getEffectivePermissions, FEATURES, type OrgPermissions } from "@/lib/permissions"

type NavItem = { label: string; href: string; icon: React.ElementType; feature?: string }
type NavGroup = { label: string; items: NavItem[] }

// Nav items yang selalu ada untuk OWNER
const OWNER_NAV: NavGroup[] = [
  { label: "Ringkasan",   items: [{ label: "Dashboard", href: "/dashboard/owner", icon: LayoutDashboard }] },
  { label: "Operasional", items: [
    { label: "Master Inventori", href: "/dashboard/inventory",     icon: Package,        feature: "MASTER_INVENTORY" },
    { label: "Master Menu",      href: "/dashboard/menu",          icon: UtensilsCrossed,feature: "MASTER_MENU" },
    { label: "Stok per Lokasi",  href: "/dashboard/stok",          icon: Warehouse,      feature: "STOCK_LOCATION" },
    { label: "Transfer Barang",  href: "/dashboard/transfer",      icon: ArrowLeftRight, feature: "TRANSFER" },
    { label: "Opname Fisik",     href: "/dashboard/opname",        icon: ClipboardList,  feature: "OPNAME" },
    { label: "Barang Masuk",     href: "/dashboard/goods-receipt", icon: Truck,          feature: "GOODS_RECEIPT" },
  ]},
  { label: "Laporan",     items: [
    { label: "Peringatan",        href: "/dashboard/alerts", icon: AlertTriangle, feature: "ALERTS" },
    { label: "Riwayat Aktivitas", href: "/dashboard/audit",  icon: History },
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
  EMPLOYEE: "Karyawan",
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const [orgPerms, setOrgPerms] = useState<OrgPermissions | null>(null)

  useEffect(() => {
    if (!session) return
    fetch("/api/alerts?resolved=false")
      .then((r) => r.ok ? r.json() : [])
      .then((d: unknown[]) => setAlertCount(Array.isArray(d) ? d.length : 0))
    fetch("/api/permissions")
      .then((r) => r.ok ? r.json() : null)
      .then(setOrgPerms)
  }, [session])

  const sessionUser = session?.user as {
    name?: string | null; email?: string | null; role?: string; businessName?: string; orgPlan?: string
  } | undefined

  const role = sessionUser?.role ?? "OWNER"
  const name = sessionUser?.name ?? "Pengguna"
  const businessName = sessionUser?.businessName ?? "Bisnis"
  const avatar = name.slice(0, 2).toUpperCase()
  const orgPlan = sessionUser?.orgPlan ?? ""
  const isStarterPlan = orgPlan === "STARTER" || orgPlan === "FREE"

  const STARTER_BLOCKED_FEATURES = new Set(["TRANSFER", "OPNAME", "GOODS_RECEIPT", "ALERTS", "STOCK_LOCATION"])

  const ownerNav: NavGroup[] = isStarterPlan
    ? OWNER_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || !STARTER_BLOCKED_FEATURES.has(i.feature)) })).filter((g) => g.items.length > 0)
    : OWNER_NAV

  // Build nav berdasarkan role + permissions
  const effectivePerms = getEffectivePermissions(role, orgPerms)
  const noDashboardRoles = ["ADMIN_GUDANG", "SUPERVISOR"]
  const visibleGroups: NavGroup[] = role === "OWNER"
    ? ownerNav
    : [
        ...(!noDashboardRoles.includes(role)
          ? [{ label: "Ringkasan", items: [{ label: "Dashboard", href: ROLE_DASHBOARD[role] ?? "/dashboard/owner", icon: LayoutDashboard }] }]
          : []),
        { label: "Operasional", items: OWNER_NAV[1].items.filter((i) => i.feature && effectivePerms[i.feature as keyof typeof FEATURES]) },
        { label: "Laporan",     items: OWNER_NAV[2].items.filter((i) => i.feature && effectivePerms[i.feature as keyof typeof FEATURES]) },
        { label: "Tim & Akun",  items: [{ label: "Pengaturan", href: "/dashboard/settings", icon: Settings }] },
      ].filter((g) => g.items.length > 0)

  const allVisible = visibleGroups.flatMap((g) => g.items)
  const currentLabel = allVisible.find((n) => pathname.startsWith(n.href))?.label ?? "Dashboard"

  async function handleSignOut() {
    await signOut({ redirect: false })
    router.push("/login")
  }

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-slate-950">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-white/8 shrink-0">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-white tracking-tight">Pantau</span>
        </Link>
      </div>

      {/* Business badge */}
      <div className="px-4 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/6">
          <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-white">{businessName[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-slate-400 leading-none mb-0.5">Bisnis aktif</div>
            <div className="text-sm font-semibold text-white truncate">{businessName}</div>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{group.label}</span>
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = pathname === item.href || pathname.startsWith(item.href + "/")
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:bg-white/6 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                    {item.href === "/dashboard/alerts" && alertCount > 0
                      ? <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-4.5 text-center">{alertCount > 99 ? "99+" : alertCount}</span>
                      : active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />
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
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
              {avatar}
            </div>
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-medium text-white truncate">{name}</div>
              <div className="text-xs text-slate-400">{roleLabel[role] ?? role}</div>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
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
    <div className="h-screen flex overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-60 md:flex-col md:shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-60 z-50">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-400">
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-medium">{currentLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isStarterPlan && (
              <Link
                href="/dashboard/alerts"
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors relative"
              >
                <Bell className="w-4 h-4 text-slate-500" />
              </Link>
            )}
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {avatar}
              </div>
              <span className="text-sm font-medium text-slate-700">{name.split(" ")[0]}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
