"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { signIn, getSession } from "next-auth/react"
import { Eye, EyeOff, Loader2, TrendingUp, Shield, Zap } from "lucide-react"
import { WarningModal } from "@/components/ui/warning-modal"
import { PantauLogo } from "@/components/pantau-logo"

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState<{ title?: string; messages: string[] } | null>(null)
  const [form, setForm] = useState({ email: "", password: "" })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const issues: string[] = []
    if (!form.email.trim()) issues.push("Email wajib diisi")
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) issues.push("Format email tidak valid (contoh: nama@toko.com)")
    if (!form.password) issues.push("Password wajib diisi")
    if (issues.length > 0) {
      setWarning({ title: "Lengkapi data dulu", messages: issues })
      return
    }

    setLoading(true)
    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    })
    if (result?.error) {
      setWarning({ title: "Gagal masuk", messages: ["Email atau password salah. Coba periksa kembali."] })
      setLoading(false)
      return
    }
    const session = await getSession()
    const isSuperAdmin = !!(session?.user as Record<string, unknown>)?.isSuperAdmin
    // Kembali ke tautan yang tadi dibuka (mis. tautan WhatsApp ke Transfer).
    // Hanya alamat di dalam aplikasi ini yang diterima, bukan situs lain.
    const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl")
    const tujuanAman = callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") && !callbackUrl.startsWith("/login")
      ? callbackUrl : null
    router.push(isSuperAdmin ? "/admin" : tujuanAman ?? "/dashboard")
    router.refresh()
  }

  return (
    <div className="auth-page min-h-screen min-h-dvh flex bg-white">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-120 bg-slate-950 flex-col justify-between p-12 shrink-0">
        <Link href="/" className="flex items-center gap-2.5">
          <PantauLogo className="h-9 w-9" priority />
          <span className="text-xl font-bold text-white">Pantau</span>
        </Link>

        <div>
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-4">Dipercaya 200+ bisnis Indonesia</p>
          <blockquote className="text-2xl font-light text-white leading-snug mb-8">
            &ldquo;Operasional 5 outlet<br />jadi terasa kayak 1 outlet.&rdquo;
          </blockquote>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              BA
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Budi Ardianto</div>
              <div className="text-xs text-slate-400">Owner, Burger Bali · 5 outlet</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: TrendingUp, label: "Stok realtime", sub: "semua outlet" },
            { icon: Shield,     label: "Anti selisih", sub: "opname digital" },
            { icon: Zap,        label: "Peringatan",   sub: "otomatis" },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <Icon className="w-5 h-5 text-blue-400 mb-3" />
              <div className="text-sm font-semibold text-white leading-tight">{label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <Link href="/" className="flex items-center gap-2 mb-8 lg:hidden">
            <PantauLogo className="h-9 w-9" priority />
            <span className="text-xl font-bold text-slate-900">Pantau</span>
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-light text-slate-900 mb-2 tracking-tight">Selamat datang kembali</h1>
            <p className="text-slate-500 text-sm">Masuk ke dashboard bisnis Anda</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="nama@bisnis.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <a href="/forgot-password" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Lupa password?</a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2 mt-1"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
              ) : (
                "Masuk"
              )}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500 text-center">
            Belum punya akun?{" "}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 font-semibold">Daftar gratis</Link>
          </p>
        </div>
      </div>

      <WarningModal
        open={warning !== null}
        onClose={() => setWarning(null)}
        title={warning?.title}
        messages={warning?.messages ?? []}
      />
    </div>
  )
}
