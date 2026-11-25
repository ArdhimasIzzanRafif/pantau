"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Loader2, CheckCircle, Eye, EyeOff, AlertCircle, Check, Link2Off, ArrowLeft } from "lucide-react"
import { checkPassword, passwordStrength, isPasswordValid } from "@/lib/password"

type LinkStatus = "checking" | "valid" | "invalid" | "expired" | "unavailable"

function ResetPasswordContent() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  const email = params.get("email") ?? ""
  const linkKey = email && token ? `${email}\u0000${token}` : ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  const [linkValidation, setLinkValidation] = useState<{ key: string; status: LinkStatus }>(() => ({
    key: linkKey,
    status: linkKey ? "checking" : "invalid",
  }))
  const [validationAttempt, setValidationAttempt] = useState(0)
  const linkStatus = linkValidation.key === linkKey
    ? linkValidation.status
    : linkKey
      ? "checking"
      : "invalid"

  useEffect(() => {
    if (!linkKey) return

    const controller = new AbortController()

    async function validateLink() {
      try {
        const query = new URLSearchParams({ email, token })
        const response = await fetch(`/api/auth/reset-password?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        const data = await response.json()

        if (response.ok && data.valid) {
          setLinkValidation({ key: linkKey, status: "valid" })
        } else {
          setLinkValidation({
            key: linkKey,
            status: data.reason === "EXPIRED" ? "expired" : "invalid",
          })
        }
      } catch (validationError) {
        if ((validationError as Error).name !== "AbortError") {
          setLinkValidation({ key: linkKey, status: "unavailable" })
        }
      }
    }

    void validateLink()
    return () => controller.abort()
  }, [email, linkKey, token, validationAttempt])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isPasswordValid(password)) { setError("Password harus memenuhi semua kriteria keamanan"); return }
    if (password !== confirm) { setError("Password tidak cocok"); return }
    setLoading(true)
    setError("")
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    })
    if (res.ok) {
      setDone(true)
      setTimeout(() => router.push("/login"), 3000)
    } else {
      const d = await res.json()
      if (d.reason === "INVALID" || d.reason === "EXPIRED") {
        setPassword("")
        setConfirm("")
        setLinkValidation({
          key: linkKey,
          status: d.reason === "EXPIRED" ? "expired" : "invalid",
        })
      } else {
        setError(d.error ?? "Terjadi kesalahan")
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          {linkStatus === "checking" ? (
            <div className="py-8 text-center" role="status">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
              <h1 className="text-lg font-bold text-slate-900 mb-1">Memeriksa link</h1>
              <p className="text-slate-500 text-sm">Tunggu sebentar, ya.</p>
            </div>
          ) : linkStatus !== "valid" ? (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                <Link2Off className="h-7 w-7" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">
                {linkStatus === "expired"
                  ? "Link sudah kedaluwarsa"
                  : linkStatus === "unavailable"
                    ? "Link belum bisa diperiksa"
                    : "Link reset tidak berlaku"}
              </h1>
              <p className="text-slate-500 text-sm leading-6 mb-6">
                {linkStatus === "expired"
                  ? "Demi keamanan, link reset hanya berlaku selama 1 jam. Silakan minta link baru."
                  : linkStatus === "unavailable"
                    ? "Ada kendala saat memeriksa link. Periksa koneksi lalu coba lagi."
                    : "Link ini tidak valid atau sudah pernah digunakan. Minta link reset baru untuk melanjutkan."}
              </p>

              {linkStatus === "unavailable" ? (
                <button
                  type="button"
                  onClick={() => {
                    setLinkValidation({ key: linkKey, status: "checking" })
                    setValidationAttempt((attempt) => attempt + 1)
                  }}
                  className="w-full rounded-full bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Coba Periksa Lagi
                </button>
              ) : (
                <Link
                  href="/forgot-password"
                  className="block w-full rounded-full bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Kirim Link Reset Baru
                </Link>
              )}

              <Link
                href="/login"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Kembali ke login
              </Link>
            </div>
          ) : done ? (
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-slate-900 mb-2">Password berhasil diubah!</h2>
              <p className="text-slate-500 text-sm">Kamu akan diarahkan ke halaman login...</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900 mb-1">Buat password baru</h1>
              <p className="text-slate-500 text-sm mb-6">Untuk akun <strong>{email}</strong></p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Password baru</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"} required
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="Buat password yang kuat"
                      autoComplete="new-password"
                      className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    <button
                      type="button"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => setShowPw((visible) => !visible)}
                      aria-label={showPw ? "Sembunyikan password baru" : "Tampilkan password baru"}
                      aria-pressed={showPw}
                      title={showPw ? "Sembunyikan password" : "Tampilkan password"}
                      className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {password.length > 0 && (() => {
                    const score = passwordStrength(password)
                    const rules = checkPassword(password)
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
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Konfirmasi password</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"} required value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Ulangi password"
                      autoComplete="new-password"
                      className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    <button
                      type="button"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => setShowConfirm((visible) => !visible)}
                      aria-label={showConfirm ? "Sembunyikan konfirmasi password" : "Tampilkan konfirmasi password"}
                      aria-pressed={showConfirm}
                      title={showConfirm ? "Sembunyikan password" : "Tampilkan password"}
                      className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {confirm.length > 0 && confirm !== password && (
                    <p className="mt-1.5 text-xs text-red-600">Belum sama dengan password baru</p>
                  )}
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : "Simpan Password Baru"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                  Kembali ke login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={(
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )}>
      <ResetPasswordContent />
    </Suspense>
  )
}
