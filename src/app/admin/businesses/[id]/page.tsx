"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Users, MapPin, Loader2, ShoppingBag, CalendarDays, Store, Phone, Mail, Building2, ShieldOff, ShieldCheck, ArrowUpCircle, ArrowDownCircle, CalendarPlus } from "lucide-react"

type Location = { id: string; name: string }
type OrgUser = {
  id: string; role: string; createdAt: string
  user: { id: string; name: string | null; email: string }
  assignedLocations: { location: { id: string; name: string } }[]
}
type OrgDetail = {
  id: string; name: string; slug: string; plan: string; status: string
  ownerPhone: string | null; trialEndsAt: string | null; createdAt: string
  users: OrgUser[]
  locations: Location[]
  _count: { posOrders: number; goodsReceipts: number; stockTransfers: number }
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner", ADMIN_GUDANG: "Admin Gudang",
  SUPERVISOR: "Supervisor", EMPLOYEE: "Karyawan", KASIR: "Kasir",
}
const ROLE_COLOR: Record<string, string> = {
  OWNER:        "bg-blue-50 text-blue-600 border-blue-200",
  ADMIN_GUDANG: "bg-indigo-50 text-indigo-600 border-indigo-200",
  SUPERVISOR:   "bg-sky-50 text-sky-600 border-sky-200",
  EMPLOYEE:     "bg-slate-100 text-slate-500 border-slate-200",
  KASIR:        "bg-emerald-50 text-emerald-600 border-emerald-200",
}
const PLAN_LABEL: Record<string, string> = {
  FREE: "Kasir", STARTER: "Kasir", PRO: "Operasional", ENTERPRISE: "Enterprise",
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Aktif", ACTIVE: "Aktif", PENDING: "Menunggu",
  SUSPENDED: "Ditangguhkan", CANCELLED: "Dibatalkan", EXPIRED: "Kedaluwarsa",
}

const STATUS_STYLE: Record<string, string> = {
  TRIAL:     "bg-emerald-50 text-emerald-600 border-emerald-200",
  ACTIVE:    "bg-emerald-50 text-emerald-600 border-emerald-200",
  PENDING:   "bg-amber-50 text-amber-600 border-amber-200",
  SUSPENDED: "bg-red-50 text-red-600 border-red-200",
  CANCELLED: "bg-slate-100 text-slate-400 border-slate-200",
  EXPIRED:   "bg-orange-50 text-orange-600 border-orange-200",
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [org, setOrg] = useState<OrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendDays, setExtendDays] = useState(30)

  async function load() {
    const d = await fetch(`/api/admin/businesses/${id}`).then((r) => r.ok ? r.json() : null)
    setOrg(d); setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function changeStatus(status: string) {
    if (!org) return
    setActing(true)
    await fetch("/api/admin/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: org.id, action: "change_status", status }),
    })
    await load()
    setActing(false)
  }

  async function extendSubscription() {
    if (!org) return
    setActing(true)
    await fetch("/api/admin/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: org.id, action: "extend_trial", trialDays: extendDays }),
    })
    await load()
    setActing(false)
    setExtendOpen(false)
  }

  async function changePlan(plan: string) {
    if (!org) return
    setActing(true)
    await fetch("/api/admin/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: org.id, action: "change_plan", plan }),
    })
    await load()
    setActing(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  )
  if (!org) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 text-slate-400 text-sm">Bisnis tidak ditemukan</div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-7 py-4 flex flex-wrap items-center gap-4 sticky top-0 z-10">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </button>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {org.name[0].toUpperCase()}
          </div>
          <div>
            <span className="font-semibold text-slate-900 text-sm">{org.name}</span>
            <span className="text-slate-400 text-xs ml-2">{org.slug}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLE[org.status] ?? ""}`}>{STATUS_LABEL[org.status] ?? org.status}</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">{PLAN_LABEL[org.plan] ?? org.plan}</span>
          {(org.plan === "STARTER" || org.plan === "FREE") ? (
            <button onClick={() => changePlan("PRO")} disabled={acting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 transition-colors disabled:opacity-50">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
              Upgrade ke Operasional
            </button>
          ) : org.plan === "PRO" ? (
            <button onClick={() => changePlan("STARTER")} disabled={acting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 transition-colors disabled:opacity-50">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
              Downgrade ke Kasir
            </button>
          ) : null}
          {org.status !== "SUSPENDED" && (
            <button onClick={() => setExtendOpen(true)} disabled={acting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 transition-colors disabled:opacity-50">
              <CalendarPlus className="w-3.5 h-3.5" />
              Perpanjang
            </button>
          )}
          {org.status === "SUSPENDED" ? (
            <button onClick={() => changeStatus("ACTIVE")} disabled={acting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              Aktifkan
            </button>
          ) : (org.status === "ACTIVE" || org.status === "TRIAL") ? (
            <button onClick={() => changeStatus("SUSPENDED")} disabled={acting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors disabled:opacity-50">
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
              Tangguhkan
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-4 sm:p-7 space-y-5">
        {/* Info cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Tanggal daftar", value: formatDate(org.createdAt),        icon: CalendarDays, color: "text-slate-500" },
            { label: "Outlet",         value: `${org.locations.length} lokasi`,  icon: Store,        color: "text-blue-600" },
            { label: "Tim",            value: `${org.users.length} orang`,       icon: Users,        color: "text-indigo-600" },
            { label: "Transaksi POS",  value: org._count.posOrders,              icon: ShoppingBag,  color: "text-emerald-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-3">
              <Icon className={`w-4 h-4 shrink-0 ${color}`} />
              <div>
                <div className="text-slate-900 font-semibold text-sm">{value}</div>
                <div className="text-slate-400 text-xs mt-0.5">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Owner info card */}
        {(() => {
          const owner = org.users.find((u) => u.role === "OWNER")
          if (!owner) return null
          const waNumber = org.ownerPhone?.replace(/\D/g, "").replace(/^0/, "62")
          return (
            <div className="bg-white rounded-2xl border border-slate-200 px-6 py-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-slate-400" />
                <h2 className="text-slate-900 font-semibold text-sm">Info Owner</h2>
              </div>
              <div className="flex items-center gap-5 flex-wrap">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {(owner.user.name ?? owner.user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="font-semibold text-slate-900 text-sm">{owner.user.name ?? "—"}</div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <a href={`mailto:${owner.user.email}`}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 transition-colors">
                      <Mail className="w-3.5 h-3.5" />{owner.user.email}
                    </a>
                    {org.ownerPhone && (
                      <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">
                        <Phone className="w-3.5 h-3.5" />{org.ownerPhone}
                        <span className="bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">WA</span>
                      </a>
                    )}
                  </div>
                </div>
                {org.trialEndsAt && (
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-400">Langganan berakhir</div>
                    <div className="text-sm font-semibold text-slate-700">{formatDate(org.trialEndsAt)}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Two columns: outlets + users */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5 items-start">
          {/* Outlets — narrower */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Store className="w-4 h-4 text-slate-400" />
              <h2 className="text-slate-900 font-semibold text-sm">Outlet / Lokasi</h2>
              <span className="ml-auto text-xs text-slate-400">{org.locations.length} lokasi</span>
            </div>
            {org.locations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Store className="w-6 h-6 mb-2 opacity-30" />
                <p className="text-sm">Belum ada lokasi</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {org.locations.map((loc, i) => (
                  <div key={loc.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 text-xs font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-slate-800 text-sm font-medium">{loc.name}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[11px] text-slate-400">Aktif</span>
                      </div>
                    </div>
                    <MapPin className="w-3.5 h-3.5 text-slate-300 ml-auto shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Users — wider */}
          <div className="md:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <h2 className="text-slate-900 font-semibold text-sm">Tim & User</h2>
              <span className="ml-auto text-xs text-slate-400">{org.users.length} orang</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  {["User", "Role", "Akses Lokasi", "Bergabung"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {org.users.map((ou) => (
                  <tr key={ou.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                          {(ou.user.name ?? ou.user.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="text-slate-800 text-sm font-medium">{ou.user.name ?? "—"}</div>
                          <div className="text-slate-400 text-xs">{ou.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${ROLE_COLOR[ou.role] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {ROLE_LABEL[ou.role] ?? ou.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {ou.assignedLocations.length === 0 ? (
                        <span className="text-xs text-slate-300 italic">Semua lokasi</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {ou.assignedLocations.map(({ location }) => (
                            <span key={location.id} className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />{location.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400 whitespace-nowrap">
                      {formatDate(ou.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {org.users.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Users className="w-6 h-6 mb-2 opacity-30" />
                <p className="text-sm">Belum ada user</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extend subscription modal */}
      {extendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <CalendarPlus className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Perpanjang Langganan</h3>
                <p className="text-xs text-slate-400 mt-0.5">{org.name}</p>
              </div>
            </div>

            {org.trialEndsAt && (
              <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4 text-xs text-slate-500">
                Berakhir saat ini: <span className="font-semibold text-slate-700">{formatDate(org.trialEndsAt)}</span>
              </div>
            )}

            <label className="block text-sm font-medium text-slate-700 mb-2">Tambah berapa hari?</label>
            <div className="flex items-center gap-2 mb-5">
              <input
                type="number"
                min={1}
                max={365}
                value={extendDays}
                onChange={(e) => setExtendDays(Math.max(1, Math.min(365, Number(e.target.value))))}
                className="w-24 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-500">hari</span>
              {org.trialEndsAt && (() => {
                const base = new Date(org.trialEndsAt) > new Date() ? new Date(org.trialEndsAt) : new Date()
                const newDate = new Date(base.getTime() + extendDays * 86400000).toISOString()
                return <span className="text-xs text-slate-400 ml-auto">→ {formatDate(newDate)}</span>
              })()}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setExtendOpen(false)} disabled={acting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                Batal
              </button>
              <button onClick={extendSubscription} disabled={acting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Perpanjang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
