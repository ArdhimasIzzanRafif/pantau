"use client"

import Link from "next/link"
import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { Eye, EyeOff, Loader2, CheckCircle, Check, X, Store, UtensilsCrossed } from "lucide-react"
import { checkPassword, passwordStrength, isPasswordValid } from "@/lib/password"
import { WarningModal } from "@/components/ui/warning-modal"
import { PantauLogo } from "@/components/pantau-logo"
import { RegistrationSelect } from "@/components/ui/registration-select"

const steps = ["Akun Anda", "Info Bisnis", "Selesai"]

const businessTypes = [
  { label: "Food & Beverage", options: [
    { value: "restoran", label: "Restoran" },
    { value: "kafe", label: "Kafe / Coffee Shop" },
    { value: "fastfood", label: "Fast Food / Burger / Ayam" },
    { value: "bakery", label: "Bakery / Roti / Pastry" },
    { value: "warung", label: "Warung Makan" },
    { value: "katering", label: "Katering" },
    { value: "minuman", label: "Minuman / Bubble Tea / Jus" },
  ] },
  { label: "Retail", options: [
    { value: "minimarket", label: "Minimarket / Toko Kelontong" },
    { value: "fashion", label: "Fashion / Pakaian" },
    { value: "elektronik", label: "Elektronik / Gadget" },
    { value: "apotek", label: "Apotek / Kesehatan" },
    { value: "toko-bangunan", label: "Toko Bangunan / Material" },
    { value: "toko-lainnya", label: "Toko Lainnya" },
  ] },
  { label: "Lainnya", options: [
    { value: "campuran", label: "F&B + Retail (Campuran)" },
    { value: "lainnya", label: "Lainnya" },
  ] },
]

const outletCounts = [{ options: [
  { value: "1", label: "1 outlet" },
  { value: "2-5", label: "2–5 outlet" },
  { value: "6-10", label: "6–10 outlet" },
  { value: "10+", label: "Lebih dari 10 outlet" },
] }]

export default function RegisterPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>}><RegistrationForm /></Suspense>
}

function RegistrationForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const retryToken = searchParams.get("retryToken") ?? ""
  const [step, setStep] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const [warning, setWarning] = useState<{ title?: string; messages: string[] } | null>(null)
  const [form, setForm] = useState({
    name: "",
    email: retryToken ? searchParams.get("email") ?? "" : "",
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

    const issues: string[] = []
    if (!form.name.trim()) issues.push("Nama lengkap wajib diisi")
    if (!form.email.trim()) issues.push("Email wajib diisi")
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) issues.push("Format email tidak valid (contoh: nama@toko.com)")
    if (!form.phone.trim()) issues.push("Nomor WhatsApp wajib diisi")
    if (!form.password) issues.push("Password wajib diisi")
    else if (!isPasswordValid(form.password)) {
      checkPassword(form.password).filter((r) => !r.ok).forEach((r) => issues.push(`Password: ${r.label}`))
    }

    if (issues.length > 0) {
      setWarning({ title: "Lengkapi data dulu", messages: issues })
      return
    }
    if (step < 2) setStep(step + 1)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const issues: string[] = []
    if (!form.businessName.trim()) issues.push("Nama bisnis wajib diisi")
    if (!form.businessType) issues.push("Jenis usaha wajib dipilih")
    else if (form.businessType === "lainnya" && !form.businessTypeCustom.trim()) issues.push("Tulis jenis usaha Anda")
    if (!form.outletCount) issues.push("Jumlah outlet wajib dipilih")
    if (!form.plan) issues.push("Pilih salah satu paket langganan")

    if (issues.length > 0) {
      setWarning({ title: "Lengkapi data bisnis", messages: issues })
      return
    }
    setLoading(true)

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email.trim().toLowerCase(),
          phone: form.phone,
          password: form.password,
          businessName: form.businessName,
          businessType: form.businessType === "lainnya" && form.businessTypeCustom.trim()
            ? form.businessTypeCustom.trim()
            : form.businessType,
          plan: form.plan,
          ...(retryToken ? { retryToken } : {}),
        }),
      })

      const data = await res.json()
      if (data.requiresEmailVerification) {
        setVerificationMessage(data.message)
        setLoading(false)
        return
      }
      if (!res.ok) { setWarning({ title: "Pendaftaran belum berhasil", messages: [data.error ?? "Terjadi kesalahan"] }); setLoading(false); return }

      // Auto-login setelah register berhasil
      const login = await signIn("credentials", {
        redirect: false,
        email: data.email ?? form.email.trim().toLowerCase(),
        password: form.password,
      })

      if (login?.ok) {
        router.push("/pending")
      } else {
        setStep(2)
      }
    } catch {
      setWarning({ title: "Koneksi gagal", messages: ["Tidak dapat terhubung ke server, coba lagi."] })
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-8">
        <PantauLogo className="h-9 w-9" priority />
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
              <p className="mt-3 text-xs leading-relaxed text-slate-500">Pernah ditolak? Daftar ulang dengan email yang sama. Nama, toko, WhatsApp, dan password boleh diperbarui. Password baru memerlukan verifikasi email. Maksimal 3 pengajuan.</p>
              {retryToken && <p role="status" className="mt-3 rounded-xl bg-blue-50 p-3 text-sm leading-relaxed text-blue-700">Lanjutkan daftar ulang dengan email yang terisi di bawah. Lengkapi data Anda dan masukkan password baru, lalu kirim pengajuan.</p>}
            </div>
            <form onSubmit={handleNext} noValidate className="space-y-4">
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
                  readOnly={!!retryToken}
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
                          <div key={r.label} className={`flex items-center gap-1.5 text-xs transition-colors ${r.ok ? "text-emerald-600" : "text-red-500"}`}>
                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors ${r.ok ? "bg-emerald-100" : "bg-red-100"}`}>
                              {r.ok ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <X className="w-2.5 h-2.5 text-red-500" />}
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
            {verificationMessage && <div role="status" className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-800"><p className="mb-1 font-semibold">Periksa email Anda</p><p>{verificationMessage}</p></div>}
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
                <label htmlFor="business-type" className="block text-sm font-medium text-slate-700 mb-1.5">Jenis Usaha</label>
                <RegistrationSelect
                  id="business-type"
                  value={form.businessType}
                  onValueChange={(value) => setForm({ ...form, businessType: value, businessTypeCustom: "" })}
                  placeholder="Pilih jenis usaha"
                  icon={UtensilsCrossed}
                  groups={businessTypes}
                />
                {form.businessType === "lainnya" && (
                  <input
                    type="text"
                    required
                    placeholder="Tulis jenis usaha Anda..."
                    value={form.businessTypeCustom}
                    onChange={(e) => setForm({ ...form, businessTypeCustom: e.target.value })}
                    className="mt-2 w-full px-4 py-3 rounded-xl border border-blue-300 bg-blue-50/40 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                )}
              </div>
              <div>
                <label htmlFor="outlet-count" className="block text-sm font-medium text-slate-700 mb-1.5">Jumlah Outlet</label>
                <RegistrationSelect
                  id="outlet-count"
                  value={form.outletCount}
                  onValueChange={(value) => setForm({ ...form, outletCount: value })}
                  placeholder="Pilih jumlah outlet"
                  icon={Store}
                  groups={outletCounts}
                />
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
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</> : verificationMessage ? "Kirim ulang tautan" : retryToken ? "Kirim pengajuan ulang" : "Buat Akun"}
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

      <WarningModal
        open={warning !== null}
        onClose={() => setWarning(null)}
        title={warning?.title}
        messages={warning?.messages ?? []}
      />
    </div>
  )
}
