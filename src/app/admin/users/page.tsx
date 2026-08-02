"use client"

import { useEffect, useState } from "react"
import { Building2, Loader2, Search } from "lucide-react"

type OrgUser = {
  id: string; userId: string; email: string; name: string | null
  role: string; joinedAt: string
  org: { id: string; name: string; plan: string; status: string }
}

const ROLE_STYLE: Record<string, string> = {
  OWNER:        "bg-blue-100 text-blue-700",
  ADMIN_GUDANG: "bg-indigo-100 text-indigo-700",
  SUPERVISOR:   "bg-sky-100 text-sky-700",
  EMPLOYEE:     "bg-slate-100 text-slate-600",
  KASIR:        "bg-emerald-100 text-emerald-700",
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner", ADMIN_GUDANG: "Admin Gudang",
  SUPERVISOR: "Supervisor", EMPLOYEE: "Karyawan", KASIR: "Kasir",
}

export default function UsersPage() {
  const [users, setUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterRole, setFilterRole] = useState("all")

  useEffect(() => {
    fetch("/api/admin/users").then((r) => r.ok ? r.json() : []).then((d) => {
      setUsers(d); setLoading(false)
    })
  }, [])

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    const matchSearch = !q || u.email.includes(q) || (u.name ?? "").toLowerCase().includes(q) || u.org.name.toLowerCase().includes(q)
    return matchSearch && (filterRole === "all" || u.role === filterRole)
  })

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  )

  return (
    <div className="p-7 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <p className="text-slate-400 text-sm mt-0.5">{users.length} user lintas semua bisnis</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari email, nama, bisnis..."
              className="border border-slate-200 text-slate-700 text-xs rounded-xl pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52 placeholder-slate-400 bg-white" />
          </div>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
            className="border border-slate-200 text-slate-600 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="all">Semua Role</option>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {["User", "Bisnis", "Role", "Bergabung"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 text-[11px] font-bold shrink-0">
                      {(u.name ?? u.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-slate-800 text-[13px]">{u.name ?? "—"}</div>
                      <div className="text-slate-400 text-[11px]">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3 h-3 text-slate-300" />
                    <span className="text-slate-600 text-[13px]">{u.org.name}</span>
                    <span className="text-[10px] text-slate-400">{u.org.plan}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_STYLE[u.role] ?? "bg-slate-100 text-slate-500"}`}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-slate-400 text-[12px]">
                  {new Date(u.joinedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm">
            {search || filterRole !== "all" ? "Tidak ada hasil" : "Belum ada user"}
          </div>
        )}
      </div>
    </div>
  )
}
