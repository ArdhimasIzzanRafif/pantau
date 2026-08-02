"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { BarChart3, Eye, EyeOff, Loader2, CheckCircle, Check } from "lucide-react"
import { checkPassword, passwordStrength, isPasswordValid } from "@/lib/password"

const steps = ["Akun Anda", "Info Bisnis", "Selesai"]

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    businessName: "",
    businessType: "",
    businessTypeCustom: "",
    outletCount: "",
    plan: "",
  })

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    if (step === 0 && !isPasswordValid(form.password)) {
      setError("Password harus memenuhi semua kriteria keamanan")
      return
    }
    setError("")
    if (step < 2) setStep(step + 1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          businessName: form.businessName,
          businessType: form.businessType === "lainnya" && form.businessTypeCustom.trim()
            ? form.businessTypeCustom.trim()
            : form.businessType,
          plan: form.plan,
        }),
      })

      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Terjadi kesalahan"); setLoading(false); return }

      // Auto-login setelah register berhasil
      const login = await signIn("credentials", {
        redirect: false,
        email: form.email,
        password: form.password,
      })

      if (login?.ok) {
        router.push("/pending")
      } else {
        setStep(2)
      }
    } catch {
      setError("Koneksi gagal, coba lagi")
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-8">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-slate-900">Pantau</span>
      </Link>

      {/* Step indicator */}
      {step < 2 && (
        <div className="flex items-center gap-0 mb-8">
          {steps.slice(0, 2).map((s, i) => (
            <div key={s} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < step
                      ? "bg-blue-600 text-white"
                      : i === step
                      ? "bg-blue-600 text-white ring-4 ring-blue-100"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-sm font-medium hidden sm:block ${i === step ? "text-slate-900" : i < step ? "text-blue-600" : "text-slate-400"}`}>
                  {s}
                </span>
              </div>
              {i < 1 && (
                <div className={`mx-3 w-12 h-0.5 transition-colors ${i < step ? "bg-blue-600" : "bg-slate-200"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-8">

        {/* Step 0 — Akun */}
        {step === 0 && (
          <>
            <div className="mb-7">
              <h1 className="text-3xl font-light text-slate-900 mb-2 tracking-tight">Buat akun Anda</h1>
              <p className="text-slate-500 text-sm">Daftar dan langsung pakai setelah akun disetujui</p>
            </div>
            <form onSubmit={handleNext} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  placeholder="Budi Santoso"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  placeholder="budi@toko.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nomor WhatsApp</label>
                <input
                  type="tel"
                  required
                  placeholder="08xxxxxxxxxx"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Buat password yang kuat"
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
                {form.password.length > 0 && (() => {
                  const score = passwordStrength(form.password)
                  const rules = checkPassword(form.password)
                  const labels = ["", "Lemah", "Cukup", "Kuat", "Sangat Kuat"]
                  const colors = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-emerald-500"]
                  const textColors = ["", "text-red-600", "text-orange-500", "text-yellow-600", "text-emerald-600"]
                  return (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-1.5">
                        {[1,2,3,4].map((i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= score ? colors[score] : "bg-slate-200"}`} />
                        ))}
                        <span className={`text-xs font-semibold ml-1 ${textColors[score]}`}>{labels[score]}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {rules.map((r) => (
                          <div key={r.label} className={`flex items-center gap-1.5 text-xs transition-colors ${r.ok ? "text-emerald-600" : "text-slate-400"}`}>
                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors ${r.ok ? "bg-emerald-100" : "bg-slate-100"}`}>
                              {r.ok && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                            </div>
                            {r.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-full transition-colors mt-1"
              >
                Lanjut
              </button>
            </form>
          </>
        )}

        {/* Step 1 — Info Bisnis */}
        {step === 1 && (
          <>
            <div className="mb-7">
              <h1 className="text-3xl font-light text-slate-900 mb-2 tracking-tight">Info bisnis Anda</h1>
              <p className="text-slate-500 text-sm">Kami sesuaikan sistem untuk kebutuhan Anda</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Bisnis</label>
                <input
                  type="text"
                  required
                  placeholder="Burger Bali / Toko Sumber Rejeki"
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Jenis Usaha</label>
                <select
                  required
                  value={form.businessType}
                  onChange={(e) => setForm({ ...form, businessType: e.target.value, businessTypeCustom: "" })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                >
                  <option value="">Pilih jenis usaha</option>
                  <optgroup label="Food &amp; Beverage">
                    <option value="restoran">Restoran</option>
                    <option value="kafe">Kafe / Coffee Shop</option>
                    <option value="fastfood">Fast Food / Burger / Ayam</option>
                    <option value="bakery">Bakery / Roti / Pastry</option>
                    <option value="warung">Warung Makan</option>
                    <option value="katering">Katering</option>
                    <option value="minuman">Minuman / Bubble Tea / Jus</option>
                  </optgroup>
                  <optgroup label="Retail">
                    <option value="minimarket">Minimarket / Toko Kelontong</option>
                    <option value="fashion">Fashion / Pakaian</option>
                    <option value="elektronik">Elektronik / Gadget</option>
                    <option value="apotek">Apotek / Kesehatan</option>
                    <option value="toko-bangunan">Toko Bangunan / Material</option>
                    <option value="toko-lainnya">Toko Lainnya</option>
                  </optgroup>
                  <optgroup label="Lainnya">
                    <option value="campuran">F&amp;B + Retail (Campuran)</option>
                    <option value="lainnya">Lainnya</option>
                  </optgroup>
                </select>
                {form.businessType === "lainnya" && (
                  <input
                    type="text"
                    required
                    placeholder="Tulis jenis usaha Anda..."
                    value={form.businessTypeCustom}
                    onChange={(e) => setForm({ ...form, businessTypeCustom: e.target.value })}
                    className="mt-2 w-full px-4 py-3 rounded-xl border border-blue-300 bg-blue-50/40 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Jumlah Outlet</label>
                <select
                  required
                  value={form.outletCount}
                  onChange={(e) => setForm({ ...form, outletCount: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                >
                  <option value="">Pilih jumlah outlet</option>
                  <option value="1">1 outlet</option>
                  <option value="2-5">2–5 outlet</option>
                  <option value="6-10">6–10 outlet</option>
                  <option value="10+">Lebih dari 10 outlet</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Paket Langganan</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { value: "kasir", label: "Kasir", price: "Rp 199.000", desc: "Kasir, shift, dan transaksi" },
                    { value: "operasional", label: "Operasional", price: "Rp 499.000", desc: "Kasir + stok & gudang lengkap" },
                  ] as const).map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm({ ...form, plan: p.value })}
                      className={`text-left p-3.5 rounded-xl border-2 transition-all ${
                        form.plan === p.value
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className={`text-sm font-semibold mb-0.5 ${form.plan === p.value ? "text-blue-700" : "text-slate-800"}`}>
                        {p.label}
                      </div>
                      <div className={`text-xs font-bold mb-1 ${form.plan === p.value ? "text-blue-600" : "text-slate-600"}`}>
                        {p.price}<span className="font-normal">/bln</span>
                      </div>
                      <div className="text-xs text-slate-400 leading-tight">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-full transition-colors"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={loading || !form.plan}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</> : "Buat Akun"}
                </button>
              </div>
            </form>
          </>
        )}

        {/* Step 2 — Selesai */}
        {step === 2 && (
          <div className="text-center py-6">
            <div className="w-18 h-18 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-9 h-9 text-blue-600" />
            </div>
            <h2 className="text-2xl font-light text-slate-900 mb-2 tracking-tight">Akun berhasil dibuat!</h2>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Selamat datang di Pantau. Mulai kelola bisnis Anda dari satu dashboard.
            </p>
            <Link
              href="/dashboard/owner"
              className="inline-flex w-full items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-full transition-colors"
            >
              Masuk ke Dashboard
            </Link>
            <p className="text-xs text-slate-400 mt-4">Cek email Anda untuk konfirmasi akun</p>
          </div>
        )}
      </div>

      {step < 2 && (
        <p className="mt-6 text-sm text-slate-500">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold">Masuk</Link>
        </p>
      )}
    </div>
  )
}
