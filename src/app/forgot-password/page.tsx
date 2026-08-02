"use client"

import { useState } from "react"
import Link from "next/link"
import { BarChart3, Loader2, CheckCircle, ArrowLeft } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    if (res.ok) setDone(true)
    else {
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
              <h2 className="text-lg font-bold text-slate-900 mb-2">Cek email kamu</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                Kami sudah kirim link reset password ke <strong>{email}</strong>. Link berlaku 1 jam.
              </p>
              <Link href="/login" className="text-sm text-blue-600 hover:underline font-medium">
                Kembali ke login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900 mb-1">Lupa password?</h1>
              <p className="text-slate-500 text-sm mb-6">
                Masukkan email kamu dan kami kirimkan link untuk reset password.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@bisnis.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim...</> : "Kirim Link Reset"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login" className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1.5 justify-center transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
