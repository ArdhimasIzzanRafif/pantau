"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { BarChart3, Clock, Loader2 } from "lucide-react"

export default function PendingPage() {
  const { status } = useSession()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return }
    if (status !== "authenticated") return

    const check = async () => {
      const res = await fetch("/api/org/status")
      if (!res.ok) return
      const { status: orgStatus } = await res.json()
      if (orgStatus === "TRIAL" || orgStatus === "ACTIVE") router.push("/dashboard/owner")
    }

    check()
    const interval = setInterval(check, 8000)
    return () => clearInterval(interval)
  }, [status, router])

  async function handleAccess() {
    setSigningOut(true)
    await signOut({ redirectTo: "/login" })
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

        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>

          <h1 className="text-xl font-bold text-slate-900 mb-2">Pendaftaran Diterima</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            Akun Anda sedang ditinjau tim kami. Anda akan menerima email saat akun disetujui.
          </p>

          <button
            onClick={handleAccess}
            disabled={signingOut}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors mb-4"
          >
            {signingOut ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengarahkan...</> : "Masuk ke Pantau →"}
          </button>

          <p className="text-xs text-slate-400">
            Ada pertanyaan?{" "}
            <a href="mailto:banditclaude@gmail.com" className="text-blue-500 hover:underline">
              Hubungi kami
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
