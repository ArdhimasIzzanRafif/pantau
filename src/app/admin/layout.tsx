"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { signOut } from "next-auth/react"
import { Building2, Inbox, ChevronRight, LogOut, Shield } from "lucide-react"

const navItems = [
  { href: "/admin/businesses", label: "Businesses", icon: Building2, exact: false },
  { href: "/admin/requests",   label: "Permintaan", icon: Inbox,     exact: false },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [trialCount, setTrialCount] = useState(0)

  useEffect(() => {
    fetch("/api/admin/requests")
      .then((r) => r.ok ? r.json() : [])
      .then((d: unknown[]) => setTrialCount(Array.isArray(d) ? d.length : 0))
  }, [])

  async function handleSignOut() {
    await signOut({ redirect: false })
    router.push("/login")
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar — same as dashboard */}
      <aside className="w-56 shrink-0 flex flex-col bg-slate-950 fixed top-0 left-0 h-full z-30">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-white/8 shrink-0">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-tight">Pantau Admin</div>
              <div className="text-[10px] text-slate-500 font-medium">Platform Control</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Platform</span>
          </div>
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-white/6 hover:text-white"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
                {item.href === "/admin/requests" && trialCount > 0
                  ? <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-4.5 text-center">{trialCount}</span>
                  : active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />
                }
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-white/8 shrink-0">
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/6 transition-colors">
              <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">SA</div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium text-white">Super Admin</div>
                <div className="text-[11px] text-slate-500">Platform owner</div>
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <button onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/8 hover:text-white transition-colors">
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-56 min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  )
}
