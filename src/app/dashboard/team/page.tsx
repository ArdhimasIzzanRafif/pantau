"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import {
  Users, Plus, Trash2, Loader2, Crown, Package, Eye,
  Warehouse, Store, MapPin, Pencil, Check, X, ShoppingCart, ShieldCheck,
} from "lucide-react"

type Member = {
  id: string
  role: string
  user: { id: string; name: string | null; email: string }
}

type Location = {
  id: string
  name: string
  type: "WAREHOUSE" | "OUTLET"
  address: string | null
  isActive: boolean
}

const ROLES = [
  { value: "ADMIN_GUDANG", label: "Admin Gudang", desc: "Kelola inventori & transfer", icon: Package },
  { value: "SUPERVISOR",   label: "Supervisor",   desc: "Konfirmasi opname & transfer", icon: Eye },
  { value: "KASIR",        label: "Kasir",        desc: "Hanya akses POS di outlet yang ditentukan", icon: ShoppingCart },
]

const roleConfig: Record<string, { label: string; color: string }> = {
  OWNER: { label: "Owner", color: "bg-purple-100 text-purple-700" },
  ADMIN_GUDANG: { label: "Admin Gudang", color: "bg-blue-100 text-blue-700" },
  SUPERVISOR: { label: "Supervisor", color: "bg-green-100 text-green-700" },
  KASIR: { label: "Kasir", color: "bg-orange-100 text-orange-700" },
  EMPLOYEE: { label: "Karyawan", color: "bg-slate-100 text-slate-600" },
}

type Tab = "tim" | "gudang" | "outlet"

export default function ManagementPage() {
  const { data: session } = useSession()
  const orgPlan = (session?.user as Record<string, unknown>)?.orgPlan as string | undefined
  const isStarterPlan = orgPlan === "STARTER" || orgPlan === "FREE"
  const visibleRoles = isStarterPlan ? ROLES.filter((r) => r.value === "KASIR") : ROLES
  const [activeTab, setActiveTab] = useState<Tab>("tim")

  // ── Tim state ──
  const [members, setMembers] = useState<Member[]>([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [submittingMember, setSubmittingMember] = useState(false)
  const [memberForm, setMemberForm] = useState({ name: "", email: "", password: "", role: "SUPERVISOR" })
  const [memberError, setMemberError] = useState("")
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([])

  // ── Edit member state ──
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editForm, setEditForm] = useState({ name: "", role: "SUPERVISOR", password: "", locationIds: [] as string[] })
  const [editError, setEditError] = useState("")
  const [submittingEdit, setSubmittingEdit] = useState(false)

  // ── Locations state ──
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingLoc, setLoadingLoc] = useState(true)
  const [showLocForm, setShowLocForm] = useState(false)
  const [submittingLoc, setSubmittingLoc] = useState(false)
  const [locForm, setLocForm] = useState({ name: "", address: "" })
  const [locError, setLocError] = useState("")
  const [editingLoc, setEditingLoc] = useState<string | null>(null)
  const [editLocForm, setEditLocForm] = useState({ name: "", address: "" })

  const isOwner = (session?.user as { role?: string })?.role === "OWNER"
  const currentUserId = (session?.user as { id?: string })?.id

  const warehouses = locations.filter((l) => l.type === "WAREHOUSE")
  const outlets = locations.filter((l) => l.type === "OUTLET")

  // ── Fetch ──
  async function fetchTeam() {
    setLoadingTeam(true)
    const res = await fetch("/api/team")
    if (res.ok) setMembers(await res.json())
    setLoadingTeam(false)
  }

  async function fetchLocations() {
    setLoadingLoc(true)
    const res = await fetch("/api/locations")
    if (res.ok) setLocations(await res.json())
    setLoadingLoc(false)
  }

  useEffect(() => { fetchTeam(); fetchLocations() }, [])

  // ── Tim actions ──
  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setSubmittingMember(true)
    setMemberError("")
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...memberForm, locationIds: selectedLocIds }),
    })
    if (res.ok) {
      setMemberForm({ name: "", email: "", password: "", role: "SUPERVISOR" })
      setSelectedLocIds([])
      setShowMemberForm(false)
      fetchTeam()
    } else {
      const d = await res.json()
      setMemberError(d.error ?? "Gagal menambahkan anggota")
    }
    setSubmittingMember(false)
  }

  async function removeMember(userId: string) {
    if (!confirm("Hapus anggota ini dari tim?")) return
    await fetch("/api/team", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    fetchTeam()
  }

  function startEditMember(m: Member) {
    setEditingMember(m)
    setEditForm({ name: m.user.name ?? "", role: m.role, password: "", locationIds: [] })
    setEditError("")
    setShowMemberForm(false)
  }

  async function saveMember(e: React.FormEvent) {
    e.preventDefault()
    if (!editingMember) return
    setSubmittingEdit(true)
    setEditError("")
    if (editForm.password.length > 0 && editForm.password.length < 6) {
      setEditError("Password minimal 6 karakter")
      setSubmittingEdit(false)
      return
    }
    const body: Record<string, unknown> = {
      userId: editingMember.user.id,
      role: editForm.role,
      locationIds: editForm.locationIds,
    }
    if (editForm.name.trim()) body.name = editForm.name.trim()
    if (editForm.password.length >= 6) body.password = editForm.password
    const res = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setEditingMember(null)
      fetchTeam()
    } else {
      const d = await res.json()
      setEditError(d.error ?? "Gagal memperbarui anggota")
    }
    setSubmittingEdit(false)
  }

  // ── Location actions ──
  async function addLocation(type: "WAREHOUSE" | "OUTLET") {
    setSubmittingLoc(true)
    setLocError("")
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: locForm.name, address: locForm.address || null, type }),
    })
    if (res.ok) {
      setLocForm({ name: "", address: "" })
      setShowLocForm(false)
      fetchLocations()
    } else {
      const d = await res.json()
      setLocError(d.error ?? "Gagal menambahkan lokasi")
    }
    setSubmittingLoc(false)
  }

  async function saveEditLoc(id: string) {
    const res = await fetch(`/api/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editLocForm.name, address: editLocForm.address || null }),
    })
    if (res.ok) { setEditingLoc(null); fetchLocations() }
  }

  async function deactivateLoc(id: string, name: string) {
    if (!confirm(`Nonaktifkan lokasi "${name}"? Lokasi tidak akan muncul di daftar pilihan.`)) return
    await fetch(`/api/locations/${id}`, { method: "DELETE" })
    fetchLocations()
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "tim", label: "Tim", icon: Users, count: members.length },
    { id: "gudang", label: "Gudang", icon: Warehouse, count: warehouses.length },
    { id: "outlet", label: "Outlet", icon: Store, count: outlets.length },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-light text-slate-900 tracking-tight">Manajemen</h1>
        <p className="text-slate-500 text-sm mt-0.5">Kelola anggota tim, gudang, dan outlet bisnis</p>
      </div>

      {/* Permission shortcut */}
      <Link href="/dashboard/team/permissions"
        className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-5 py-3.5 hover:bg-blue-100 transition-colors group">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-blue-900">Atur Akses Fitur per Role</div>
          <div className="text-xs text-blue-500">Pilih fitur apa yang bisa diakses Admin Gudang & Supervisor</div>
        </div>
        <span className="text-xs text-blue-400 group-hover:text-blue-600 transition-colors">Atur →</span>
      </Link>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setShowLocForm(false); setShowMemberForm(false) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === t.id ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"
                }`}>{t.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── TAB: TIM ── */}
      {activeTab === "tim" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{members.length} anggota terdaftar</p>
            {isOwner && (
              <button
                onClick={() => { setShowMemberForm(!showMemberForm); setMemberError("") }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors"
              >
                <Plus className="w-4 h-4" />
                Tambah Anggota
              </button>
            )}
          </div>

          {/* ── Edit member form ── */}
          {editingMember && isOwner && (
            <div className="bg-white rounded-2xl border border-blue-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-slate-900">Edit Anggota</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{editingMember.user.email}</p>
                </div>
                <button onClick={() => setEditingMember(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={saveMember} className="space-y-4">
                {editError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{editError}</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Lengkap</label>
                    <input
                      type="text"
                      placeholder={editingMember.user.name ?? "Nama anggota"}
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password Baru <span className="text-slate-400 font-normal">(kosongkan jika tidak diganti)</span></label>
                    <input
                      type="password"
                      placeholder="Min. 6 karakter"
                      value={editForm.password}
                      onChange={(e) => { setEditForm({ ...editForm, password: e.target.value }); if (editError.includes("karakter")) setEditError("") }}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${editForm.password.length > 0 && editForm.password.length < 6 ? "border-red-300" : "border-slate-200"}`}
                    />
                    {editForm.password.length > 0 && editForm.password.length < 6 && (
                      <p className="text-xs text-red-500 mt-1">Password minimal 6 karakter ({editForm.password.length}/6)</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Peran</label>
                  <div className="space-y-2">
                    {visibleRoles.map((r) => {
                      const Icon = r.icon
                      return (
                        <label key={r.value} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          editForm.role === r.value ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                        }`}>
                          <input type="radio" name="editRole" value={r.value} checked={editForm.role === r.value}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value, locationIds: [] })}
                            className="sr-only"
                          />
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${editForm.role === r.value ? "bg-blue-100" : "bg-slate-100"}`}>
                            <Icon className={`w-4 h-4 ${editForm.role === r.value ? "text-blue-600" : "text-slate-500"}`} />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{r.label}</div>
                            <div className="text-xs text-slate-400">{r.desc}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
                {(editForm.role === "KASIR" || editForm.role === "SUPERVISOR" || editForm.role === "EMPLOYEE") && outlets.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Penugasan Outlet
                      {editForm.role === "KASIR" && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <div className="space-y-2">
                      {outlets.map((loc) => {
                        const checked = editForm.locationIds.includes(loc.id)
                        return (
                          <label key={loc.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            checked ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                          }`}>
                            <input type="checkbox" checked={checked}
                              onChange={(e) => setEditForm({ ...editForm, locationIds: e.target.checked ? [...editForm.locationIds, loc.id] : editForm.locationIds.filter((id) => id !== loc.id) })}
                              className="w-4 h-4 accent-blue-600 rounded"
                            />
                            <span className="text-sm font-medium text-slate-800">{loc.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submittingEdit || (editForm.role === "KASIR" && editForm.locationIds.length === 0)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-full transition-colors"
                  >
                    {submittingEdit ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : "Simpan Perubahan"}
                  </button>
                  <button type="button" onClick={() => setEditingMember(null)}
                    className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          )}

          {showMemberForm && isOwner && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-semibold text-slate-900 mb-4">Tambah Anggota Baru</h2>
              <form onSubmit={addMember} className="space-y-4">
                {memberError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
                    {memberError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      placeholder="Budi Santoso"
                      value={memberForm.name}
                      onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="budi@email.com"
                      value={memberForm.email}
                      onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Min. 6 karakter"
                      value={memberForm.password}
                      onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">Anggota bisa ganti password nanti di Pengaturan</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Peran</label>
                  <div className="space-y-2">
                    {visibleRoles.map((r) => {
                      const Icon = r.icon
                      return (
                        <label key={r.value} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          memberForm.role === r.value ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                        }`}>
                          <input
                            type="radio"
                            name="role"
                            value={r.value}
                            checked={memberForm.role === r.value}
                            onChange={(e) => { setMemberForm({ ...memberForm, role: e.target.value }); setSelectedLocIds([]) }}
                            className="sr-only"
                          />
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            memberForm.role === r.value ? "bg-blue-100" : "bg-slate-100"
                          }`}>
                            <Icon className={`w-4 h-4 ${memberForm.role === r.value ? "text-blue-600" : "text-slate-500"}`} />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{r.label}</div>
                            <div className="text-xs text-slate-400">{r.desc}</div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
                {(memberForm.role === "KASIR" || memberForm.role === "SUPERVISOR" || memberForm.role === "EMPLOYEE") && outlets.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Penugasan Outlet
                      {memberForm.role === "KASIR"
                        ? <span className="text-red-500 ml-1">*</span>
                        : <span className="text-slate-400 font-normal ml-1">(opsional)</span>}
                    </label>
                    <div className="space-y-2">
                      {outlets.map((loc) => {
                        const checked = selectedLocIds.includes(loc.id)
                        return (
                          <label key={loc.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            checked ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                          }`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedLocIds(e.target.checked
                                  ? [...selectedLocIds, loc.id]
                                  : selectedLocIds.filter((id) => id !== loc.id))
                              }
                              className="w-4 h-4 accent-blue-600 rounded"
                            />
                            <span className="text-sm font-medium text-slate-800">{loc.name}</span>
                          </label>
                        )
                      })}
                    </div>
                    {memberForm.role === "KASIR" && (
                      <p className="text-xs text-slate-400 mt-1.5">Kasir hanya bisa akses POS outlet yang dipilih</p>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submittingMember || (memberForm.role === "KASIR" && selectedLocIds.length === 0)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-full transition-colors"
                  >
                    {submittingMember ? <><Loader2 className="w-4 h-4 animate-spin" /> Menambahkan...</> : "Tambahkan"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowMemberForm(false); setMemberError("") }}
                    className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {loadingTeam ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <div className="py-20 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-slate-400" />
                </div>
                <div className="text-slate-600 font-semibold">Belum ada anggota tim</div>
                <div className="text-slate-400 text-sm mt-1">Tambahkan anggota untuk mulai berkolaborasi</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {members.map((m) => {
                  const cfg = roleConfig[m.role] ?? { label: m.role, color: "bg-slate-100 text-slate-600" }
                  const isThisOwner = m.role === "OWNER"
                  const isMe = m.user.id === currentUserId
                  const initials = (m.user.name ?? m.user.email).slice(0, 2).toUpperCase()
                  return (
                    <div key={m.id} className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50/60 transition-colors">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                        isThisOwner ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-[13px]">{m.user.name ?? m.user.email}</span>
                          {isThisOwner && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                          {isMe && <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Anda</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{m.user.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>{cfg.label}</span>
                        {isOwner && !isThisOwner && !isMe && (
                          <>
                            <button
                              onClick={() => startEditMember(m)}
                              className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeMember(m.user.id)}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: GUDANG / OUTLET ── */}
      {(activeTab === "gudang" || activeTab === "outlet") && (
        <LocationTab
          type={activeTab === "gudang" ? "WAREHOUSE" : "OUTLET"}
          locations={activeTab === "gudang" ? warehouses : outlets}
          loading={loadingLoc}
          isOwner={isOwner}
          showForm={showLocForm}
          setShowForm={(v) => { setShowLocForm(v); setLocError("") }}
          form={locForm}
          setForm={setLocForm}
          error={locError}
          submitting={submittingLoc}
          onAdd={() => addLocation(activeTab === "gudang" ? "WAREHOUSE" : "OUTLET")}
          editingId={editingLoc}
          editForm={editLocForm}
          setEditForm={setEditLocForm}
          onStartEdit={(loc) => { setEditingLoc(loc.id); setEditLocForm({ name: loc.name, address: loc.address ?? "" }) }}
          onSaveEdit={saveEditLoc}
          onCancelEdit={() => setEditingLoc(null)}
          onDeactivate={deactivateLoc}
        />
      )}
    </div>
  )
}

function LocationTab({
  type, locations, loading, isOwner,
  showForm, setShowForm, form, setForm, error, submitting, onAdd,
  editingId, editForm, setEditForm, onStartEdit, onSaveEdit, onCancelEdit, onDeactivate,
}: {
  type: "WAREHOUSE" | "OUTLET"
  locations: Location[]
  loading: boolean
  isOwner: boolean
  showForm: boolean
  setShowForm: (v: boolean) => void
  form: { name: string; address: string }
  setForm: (f: { name: string; address: string }) => void
  error: string
  submitting: boolean
  onAdd: () => void
  editingId: string | null
  editForm: { name: string; address: string }
  setEditForm: (f: { name: string; address: string }) => void
  onStartEdit: (loc: Location) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDeactivate: (id: string, name: string) => void
}) {
  const isGudang = type === "WAREHOUSE"
  const Icon = isGudang ? Warehouse : Store
  const label = isGudang ? "Gudang" : "Outlet"
  const emptyDesc = isGudang ? "Tempat penyimpanan stok utama" : "Cabang atau titik penjualan"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{locations.length} {label.toLowerCase()} aktif</p>
        {isOwner && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah {label}
          </button>
        )}
      </div>

      {showForm && isOwner && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Tambah {label} Baru</h2>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl mb-4">{error}</div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama {label} *</label>
              <input
                type="text"
                required
                placeholder={isGudang ? "Gudang Utama, Gudang Barat..." : "Outlet Denpasar, Cabang Kuta..."}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Alamat</label>
              <input
                type="text"
                placeholder="Jl. Contoh No. 1, Kota... (opsional)"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={onAdd}
                disabled={submitting || !form.name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-full transition-colors"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : `Simpan ${label}`}
              </button>
              <button
                onClick={() => { setShowForm(false); setForm({ name: "", address: "" }) }}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : locations.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Icon className="w-7 h-7 text-slate-400" />
            </div>
            <div className="text-slate-600 font-semibold">Belum ada {label.toLowerCase()}</div>
            <div className="text-slate-400 text-sm mt-1">{emptyDesc}</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {locations.map((loc) => (
              <div key={loc.id} className="px-5 py-4">
                {editingId === loc.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="px-3 py-2 rounded-xl border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                        placeholder="Nama lokasi"
                      />
                      <input
                        type="text"
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        className="px-3 py-2 rounded-xl border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                        placeholder="Alamat (opsional)"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onSaveEdit(loc.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" /> Simpan
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" /> Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isGudang ? "bg-blue-100" : "bg-orange-100"
                    }`}>
                      <Icon className={`w-5 h-5 ${isGudang ? "text-blue-600" : "text-orange-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 text-sm">{loc.name}</div>
                      {loc.address && (
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {loc.address}
                        </div>
                      )}
                    </div>
                    {isOwner && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onStartEdit(loc)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeactivate(loc.id, loc.name)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Nonaktifkan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
