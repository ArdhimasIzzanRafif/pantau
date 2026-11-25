"use client"

import { signOut } from "next-auth/react"
import { useState } from "react"
import { ShieldOff, Loader2 } from "lucide-react"
import { OrganizationStatusGuard } from "@/components/organization-status-guard"

export default function SuspendedPage() {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut({ redirect: false }); window.location.href = "/login"
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <OrganizationStatusGuard />
      <div className="max-w-sm w-full">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <ShieldOff className="w-8 h-8 text-red-500" />
          </div>

          <h1 className="text-xl font-bold text-slate-900 mb-2">Akun Ditangguhkan</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            Akun bisnis Anda saat ini tidak aktif. Hubungi tim Pantau untuk informasi lebih lanjut.
          </p>

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors mb-4"
          >
            {signingOut ? <><Loader2 className="w-4 h-4 animate-spin" /> Keluar...</> : "Keluar dari Akun"}
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
