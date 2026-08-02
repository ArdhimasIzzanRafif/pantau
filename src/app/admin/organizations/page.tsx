"use client"

import { useEffect, useState } from "react"
import { Building2, Users, ShoppingBag, MapPin, ChevronDown, Loader2, Check } from "lucide-react"

type Org = {
  id: string
  name: string
  slug: string
  plan: string
  createdAt: string
  owner: { email: string; name: string | null } | null
  userCount: number
  locationCount: number
  orderCount: number
  itemCount: number
  totalRevenue: number
}

const PLANS = ["STARTER", "PRO", "ENTERPRISE"]

const PLAN_LABEL: Record<string, string> = {
  FREE:       "Kasir",
  STARTER:    "Kasir",
  PRO:        "Operasional",
  ENTERPRISE: "Enterprise",
}

const PLAN_COLOR: Record<string, string> = {
  FREE:       "bg-blue-900/60 text-blue-300",
  STARTER:    "bg-blue-900/60 text-blue-300",
  PRO:        "bg-violet-900/60 text-violet-300",
  ENTERPRISE: "bg-amber-900/60 text-amber-300",
}

function formatRp(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`
  return `Rp ${n}`
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [changingPlan, setChangingPlan] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setOrgs(d); setLoading(false) })
  }, [])

  async function handlePlanChange(orgId: string, plan: string) {
    setChangingPlan(orgId)
    setOpenDropdown(null)
    await fetch("/api/admin/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: orgId, plan }),
    })
    setOrgs((prev) => prev.map((o) => o.id === orgId ? { ...o, plan } : o))
    setChangingPlan(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6" onClick={() => setOpenDropdown(null)}>
      <div>
        <h1 className="text-2xl font-bold text-white">Organisasi</h1>
        <p className="text-slate-400 text-sm mt-1">{orgs.length} bisnis terdaftar</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Bisnis</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Owner</th>
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">User</th>
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Lokasi</th>
              <th className="text-center px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Transaksi</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Revenue</th>
              <th className="text-center px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Plan</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Bergabung</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org, i) => (
              <tr key={org.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${i === orgs.length - 1 ? "border-0" : ""}`}>
                {/* Bisnis */}
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">{org.name}</div>
                      <div className="text-slate-500 text-xs">{org.slug}</div>
                    </div>
                  </div>
                </td>

                {/* Owner */}
                <td className="px-5 py-4">
                  {org.owner ? (
                    <div>
                      <div className="text-slate-300 text-sm">{org.owner.name ?? "-"}</div>
                      <div className="text-slate-500 text-xs truncate max-w-[160px]">{org.owner.email}</div>
                    </div>
                  ) : (
                    <span className="text-slate-600 text-sm">—</span>
                  )}
                </td>

                {/* Stats */}
                <td className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-slate-300 text-sm">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    {org.userCount}
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-slate-300 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    {org.locationCount}
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-slate-300 text-sm">
                    <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
                    {org.orderCount.toLocaleString("id-ID")}
                  </div>
                </td>

                {/* Revenue */}
                <td className="px-5 py-4 text-right">
                  <span className="text-white font-semibold text-sm">{formatRp(org.totalRevenue)}</span>
                </td>

                {/* Plan dropdown */}
                <td className="px-5 py-4 text-center">
                  <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenDropdown(openDropdown === org.id ? null : org.id)}
                      disabled={changingPlan === org.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${PLAN_COLOR[org.plan] ?? PLAN_COLOR.STARTER} hover:opacity-80`}
                    >
                      {changingPlan === org.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          {PLAN_LABEL[org.plan] ?? org.plan}
                          <ChevronDown className="w-3 h-3" />
                        </>
                      )}
                    </button>
                    {openDropdown === org.id && (
                      <div className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden w-32">
                        {PLANS.map((plan) => (
                          <button
                            key={plan}
                            onClick={() => handlePlanChange(org.id, plan)}
                            className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-700 flex items-center justify-between transition-colors"
                          >
                            {PLAN_LABEL[plan] ?? plan}
                            {org.plan === plan && <Check className="w-3 h-3 text-violet-400" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </td>

                {/* Date */}
                <td className="px-5 py-4 text-right">
                  <span className="text-slate-400 text-xs">
                    {new Date(org.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {orgs.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            Belum ada organisasi terdaftar
          </div>
        )}
      </div>
    </div>
  )
}
