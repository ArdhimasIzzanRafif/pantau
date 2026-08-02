"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Users, MapPin, ShoppingBag, Loader2, Search, Trash2 } from "lucide-react"

type Org = {
  id: string; name: string; slug: string; plan: string; status: string
  trialEndsAt: string | null; createdAt: string
  owner: { email: string; name: string | null } | null
  counts: { users: number; locations: number; orders: number }
  health: string; daysOld: number
}

const STATUSES = ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]

const STATUS_FILTER_LABEL: Record<string, string> = {
  ACTIVE: "Aktif", SUSPENDED: "Ditangguhkan", CANCELLED: "Dibatalkan", EXPIRED: "Kedaluwarsa",
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL:     "Aktif",
  ACTIVE:    "Aktif",
  SUSPENDED: "Ditangguhkan",
  CANCELLED: "Dibatalkan",
  EXPIRED:   "Kedaluwarsa",
}

const STATUS_STYLE: Record<string, string> = {
  TRIAL:     "bg-emerald-50 text-emerald-600 border-emerald-200",
  ACTIVE:    "bg-emerald-50 text-emerald-600 border-emerald-200",
  SUSPENDED: "bg-red-50 text-red-600 border-red-200",
  CANCELLED: "bg-slate-100 text-slate-400 border-slate-200",
  EXPIRED:   "bg-orange-50 text-orange-600 border-orange-200",
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

export default function BusinessesPage() {
  const router = useRouter()
  const [orgs, setOrgs]           = useState<Org[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [filterStatus, setFilter] = useState("all")
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    await fetch(`/api/admin/businesses/${id}`, { method: "DELETE" })
    await load()
    setDeleting(null)
    setConfirmId(null)
  }

  async function load() {
    const data = await fetch("/api/admin/businesses").then((r) => r.ok ? r.json() : [])
    setOrgs(data); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = orgs.filter((o) => {
    const q = search.toLowerCase()
    if (q && !o.name.toLowerCase().includes(q) && !(o.owner?.email ?? "").toLowerCase().includes(q)) return false
    if (filterStatus !== "all") {
      const match = filterStatus === "ACTIVE" ? (o.status === "ACTIVE" || o.status === "TRIAL") : o.status === filterStatus
      if (!match) return false
    }
    return true
  })

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-7">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Businesses</h1>
        <p className="text-slate-400 text-sm mt-0.5">{orgs.length} bisnis terdaftar</p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama bisnis atau email owner..."
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">Semua Status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_FILTER_LABEL[s] ?? s}</option>)}
        </select>
        <span className="text-sm text-slate-400 ml-auto">{filtered.length} hasil</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {["Bisnis", "Owner", "Outlet · User · Order", "Plan", "Status", "Bergabung", "Berakhir", "Aksi"].map((h) => (
                <th key={h} className="text-left px-5 py-3.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((org) => {
              const tl = org.trialEndsAt
                ? Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / 86400000)
                : null

              return (
                <tr key={org.id} onClick={() => router.push(`/admin/businesses/${org.id}`)}
                  className="hover:bg-slate-50 transition-colors group cursor-pointer">
                  {/* Bisnis */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {org.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-sm">{org.name}</div>
                        <div className="text-xs text-slate-400">{org.slug}</div>
                      </div>
                    </div>
                  </td>

                  {/* Owner */}
                  <td className="px-5 py-4">
                    {org.owner ? (
                      <div>
                        <div className="text-sm text-slate-700">{org.owner.name ?? "—"}</div>
                        <div className="text-xs text-slate-400 truncate max-w-44">{org.owner.email}</div>
                      </div>
                    ) : <span className="text-slate-300 text-sm">—</span>}
                  </td>

                  {/* Stats */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                        <MapPin className="w-3 h-3 text-slate-300" />{org.counts.locations}
                      </span>
                      <span className="flex items-center gap-1 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                        <Users className="w-3 h-3 text-slate-300" />{org.counts.users}
                      </span>
                      <span className="flex items-center gap-1 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                        <ShoppingBag className="w-3 h-3 text-slate-300" />{org.counts.orders}
                      </span>
                    </div>
                  </td>

                  {/* Plan */}
                  <td className="px-5 py-4">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${PLAN_STYLE[org.plan] ?? "bg-slate-100 text-slate-500"}`}>
                      {PLAN_LABEL[org.plan] ?? org.plan}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border inline-block ${STATUS_STYLE[org.status] ?? ""}`}>
                      {STATUS_LABEL[org.status] ?? org.status}
                    </span>
                  </td>

                  {/* Bergabung */}
                  <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                    {formatDate(org.createdAt)}
                  </td>

                  {/* Berakhir */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {org.trialEndsAt ? (
                      <div>
                        <div className="text-xs text-slate-700 font-medium">{formatDate(org.trialEndsAt)}</div>
                        <div className={`text-[10px] font-semibold mt-0.5 ${tl !== null && tl < 0 ? "text-red-500" : tl !== null && tl <= 7 ? "text-amber-500" : "text-slate-400"}`}>
                          {tl === null ? "" : tl < 0 ? `${Math.abs(tl)} hari lalu` : tl === 0 ? "Hari ini" : `${tl} hari lagi`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>

                  {/* Hapus */}
                  <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                    {deleting === org.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                    ) : (
                      <button
                        onClick={() => setConfirmId(org.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Building2 className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm">{search || filterStatus !== "all" ? "Tidak ada hasil" : "Belum ada bisnis"}</p>
          </div>
        )}
      </div>

      {/* Confirm delete modal */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl max-w-sm w-full mx-4">
            <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Hapus Bisnis?</h3>
            <p className="text-sm text-slate-500 mb-5">
              Semua data bisnis ini — outlet, user, stok, order, dan transaksi — akan dihapus permanen dan tidak bisa dikembalikan.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmId(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                Batal
              </button>
              <button onClick={() => handleDelete(confirmId)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                {deleting === confirmId ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
