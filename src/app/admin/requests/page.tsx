"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, CheckCircle, XCircle, CalendarClock, RefreshCw, ExternalLink, Phone } from "lucide-react"

type Request = {
  id: string; name: string; slug: string; plan: string; status: string
  trialEndsAt: string | null; createdAt: string; daysLeft: number | null
  owner: { name: string | null; email: string } | null
  ownerPhone: string | null
  counts: { locations: number; users: number }
}

const PLAN_LABEL: Record<string, string> = {
  FREE:       "Kasir",
  STARTER:    "Kasir",
  PRO:        "Operasional",
  ENTERPRISE: "Enterprise",
}

const PLAN_STYLE: Record<string, string> = {
  FREE:       "bg-blue-50 text-blue-600",
  STARTER:    "bg-blue-50 text-blue-600",
  PRO:        "bg-indigo-50 text-indigo-600",
  ENTERPRISE: "bg-amber-50 text-amber-600",
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export default function RequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [doing, setDoing] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const data = await fetch("/api/admin/requests").then((r) => r.ok ? r.json() : [])
    setRequests(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function act(id: string, action: string, plan?: string) {
    setDoing(id)
    await fetch("/api/admin/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, plan }),
    })
    await load()
    setDoing(null)
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-7">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Permintaan Trial</h1>
          <p className="text-slate-400 text-sm mt-0.5">{requests.length} permintaan pendaftaran aktif</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white border border-slate-200 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Tidak ada permintaan pendaftaran aktif</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {req.name[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm">{req.name}</span>
                      <span className="text-xs text-slate-400">{req.slug}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PLAN_STYLE[req.plan] ?? "bg-slate-100 text-slate-500"}`}>
                        {PLAN_LABEL[req.plan] ?? req.plan}
                      </span>
                      <button onClick={() => router.push(`/admin/businesses/${req.id}`)}
                        className="text-blue-500 hover:text-blue-700">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {req.owner && (
                      <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{req.owner.name ?? "—"} · {req.owner.email}</span>
                        {req.ownerPhone && (
                          <a
                            href={`https://wa.me/${req.ownerPhone.replace(/\D/g, "").replace(/^0/, "62")}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-medium"
                          >
                            <Phone className="w-3 h-3" />{req.ownerPhone}
                          </a>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" /> Daftar {formatDate(req.createdAt)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {req.counts.users} user · {req.counts.locations} lokasi
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {doing === req.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : (
                      <>
                        <button onClick={() => act(req.id, "reject")}
                          className="text-xs px-3 py-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 font-medium transition-colors flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" /> Tolak
                        </button>
                        <button onClick={() => act(req.id, "approve")}
                          className="text-xs px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> Aktifkan
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
