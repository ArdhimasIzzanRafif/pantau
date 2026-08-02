"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { BarChart3, Loader2, CheckCircle, Eye, EyeOff, AlertCircle, Check } from "lucide-react"
import { checkPassword, passwordStrength, isPasswordValid } from "@/lib/password"

export default function ResetPasswordPage() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  const email = params.get("email") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token || !email) setError("Link tidak valid atau sudah kadaluarsa.")
  }, [token, email])

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
      setError(d.error ?? "Terjadi kesalahan")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">Pantau</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          {done ? (
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
                      className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                  <input
                    type="password" required value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Ulangi password"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
                <button type="submit" disabled={loading || !token || !email}
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
