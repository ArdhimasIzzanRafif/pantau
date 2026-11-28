"use client"

import { signOut, useSession } from "next-auth/react"
import { useState } from "react"
import { Clock, Loader2 } from "lucide-react"
import { PantauLogo } from "@/components/pantau-logo"
import { OrganizationStatusGuard } from "@/components/organization-status-guard"

export default function PendingPage() {
  const { data: session } = useSession()
  const rejected = (session?.user as { orgStatus?: string } | undefined)?.orgStatus === "REJECTED"
  const [signingOut, setSigningOut] = useState(false)

  async function handleAccess() {
    setSigningOut(true)
    await signOut({ redirect: false }); window.location.href = rejected ? "/register" : "/login"
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <OrganizationStatusGuard />
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <PantauLogo className="h-9 w-9" priority />
          <span className="text-xl font-bold text-slate-900 tracking-tight">Pantau</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>

          <h1 className="text-xl font-bold text-slate-900 mb-2">{rejected ? "Pengajuan Ditolak" : "Pendaftaran Diterima"}</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            {rejected
              ? "Anda masih bisa mendaftar ulang melalui formulir Daftar dengan email yang sama. Data bisnis dan password boleh diperbarui; password baru memerlukan verifikasi email. Setelah 3 kali pengajuan ditolak, hanya admin yang dapat mengaktifkan akun."
              : "Akun Anda sedang ditinjau tim kami. Anda akan menerima email saat akun disetujui."}
          </p>

          <button
            onClick={handleAccess}
            disabled={signingOut}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-full transition-colors mb-4"
          >
            {signingOut ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengarahkan...</> : rejected ? "Daftar ulang →" : "Masuk ke Pantau →"}
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
