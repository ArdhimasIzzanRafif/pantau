"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useConfirm } from "@/components/ui/use-confirm"
import { FormAlert } from "@/components/ui/form-alert"
import { isValidEmail, normalizeEmail } from "@/lib/email-validation"
import {
  Users, Plus, Trash2, Loader2, Crown, Package, Eye, EyeOff,
  Warehouse, Store, MapPin, Pencil, Check, X, ShoppingCart, ShieldCheck, ChevronDown,
} from "lucide-react"

type Member = {
  id: string
  role: string
  user: { id: string; name: string | null; email: string }
  assignedLocations: Array<{
    locationId: string
    location: { id: string; name: string; type: "WAREHOUSE" | "OUTLET" }
  }>
}

type Location = {
  id: string
  name: string
  type: "WAREHOUSE" | "OUTLET"
  address: string | null
  whatsappPhone: string | null
  fulfillmentWarehouseId: string | null
  isActive: boolean
}

type LocationForm = {
  name: string
  address: string
  whatsappPhone: string
  fulfillmentWarehouseId: string
}

const emptyLocationForm: LocationForm = {
  name: "",
  address: "",
  whatsappPhone: "",
  fulfillmentWarehouseId: "",
}

const locationInputClass = "min-h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
const locationLabelClass = "mb-2 block text-sm font-medium leading-5 text-slate-700"
const locationHelpClass = "mt-2 text-xs leading-5 text-slate-500"

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
}

function locationsForRole(role: string, locations: Location[]) {
  if (role === "ADMIN_GUDANG") return locations.filter((location) => location.type === "WAREHOUSE")
  if (role === "SUPERVISOR") return locations
  if (role === "KASIR") return locations.filter((location) => location.type === "OUTLET")
  return []
}

function assignmentLabel(role: string) {
  if (role === "ADMIN_GUDANG") return "Penugasan Gudang"
  if (role === "SUPERVISOR") return "Penugasan Lokasi"
  return "Penugasan Outlet"
}

function requiresLocationAssignment(role: string) {
  return role === "ADMIN_GUDANG" || role === "SUPERVISOR" || role === "KASIR"
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
  const [showMemberPassword, setShowMemberPassword] = useState(false)
  const [memberError, setMemberError] = useState("")
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([])

  // ── Edit member state ──
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editForm, setEditForm] = useState({ name: "", role: "SUPERVISOR", password: "", locationIds: [] as string[] })
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [editError, setEditError] = useState("")
  const [submittingEdit, setSubmittingEdit] = useState(false)

  // ── Locations state ──
  const [locations, setLocations] = useState<Location[]>([])
  const [loadingLoc, setLoadingLoc] = useState(true)
  const [showLocForm, setShowLocForm] = useState(false)
  const [submittingLoc, setSubmittingLoc] = useState(false)
  const [locForm, setLocForm] = useState<LocationForm>(emptyLocationForm)
  const [locError, setLocError] = useState("")
  const [editingLoc, setEditingLoc] = useState<string | null>(null)
  const [editLocForm, setEditLocForm] = useState<LocationForm>(emptyLocationForm)

  const isOwner = (session?.user as { role?: string })?.role === "OWNER"
  const currentUserId = (session?.user as { id?: string })?.id

  const warehouses = locations.filter((l) => l.type === "WAREHOUSE")
  const outlets = locations.filter((l) => l.type === "OUTLET")
  const editAssignableLocations = locationsForRole(editForm.role, locations)
  const memberAssignableLocations = locationsForRole(memberForm.role, locations)

  // ── Fetch ──
  const { ask, dialog } = useConfirm()

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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchTeam()
      void fetchLocations()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  // ── Tim actions ──
  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setMemberError("")
    const normalizedEmail = normalizeEmail(memberForm.email)
    if (!isValidEmail(normalizedEmail)) {
      setMemberError("Format email tidak valid. Gunakan format seperti nama@toko.com")
      return
    }
    setSubmittingMember(true)
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...memberForm, email: normalizedEmail, locationIds: selectedLocIds }),
    })
    if (res.ok) {
      setMemberForm({ name: "", email: "", password: "", role: "SUPERVISOR" })
      setSelectedLocIds([])
      setShowMemberPassword(false)
      setShowMemberForm(false)
      fetchTeam()
    } else {
      const d = await res.json()
      setMemberError(d.error ?? "Gagal menambahkan anggota")
    }
    setSubmittingMember(false)
  }

  function removeMember(userId: string, name: string) {
    ask({
      title: "Hapus anggota dari tim?",
      message: `${name} akan kehilangan akses ke bisnis ini.`,
      confirmLabel: "Hapus",
      danger: true,
      onConfirm: async () => {
        const res = await fetch("/api/team", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? "Gagal menghapus anggota")
        }
        fetchTeam()
      },
    })
  }

  function startEditMember(m: Member) {
    setEditingMember(m)
    setShowEditPassword(false)
    setEditForm({
      name: m.user.name ?? "",
      role: m.role,
      password: "",
      locationIds: m.assignedLocations.map((assignment) => assignment.locationId),
    })
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
      body: JSON.stringify({
        name: locForm.name,
        address: locForm.address || null,
        type,
        whatsappPhone: locForm.whatsappPhone || null,
        fulfillmentWarehouseId: type === "OUTLET" ? locForm.fulfillmentWarehouseId || null : null,
      }),
    })
    if (res.ok) {
      setLocForm(emptyLocationForm)
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
      body: JSON.stringify({
        name: editLocForm.name,
        address: editLocForm.address || null,
        whatsappPhone: editLocForm.whatsappPhone || null,
        fulfillmentWarehouseId: editLocForm.fulfillmentWarehouseId || null,
      }),
    })
    if (res.ok) { setEditingLoc(null); fetchLocations() }
  }

  function deactivateLoc(id: string, name: string) {
    ask({
      title: "Nonaktifkan lokasi ini?",
      message: `"${name}" tidak akan muncul lagi di daftar pilihan.`,
      confirmLabel: "Nonaktifkan",
      danger: true,
      onConfirm: async () => {
        const res = await fetch(`/api/locations/${id}`, { method: "DELETE" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? "Gagal menonaktifkan lokasi")
        }
        fetchLocations()
      },
    })
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
      <div className="grid w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 sm:flex sm:w-fit sm:flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setShowLocForm(false); setShowMemberForm(false) }}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:gap-2 sm:px-4 sm:text-sm ${
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">{members.length} anggota terdaftar</p>
            {isOwner && (
              <button
                onClick={() => {
                  setShowMemberForm(!showMemberForm)
                  setShowMemberPassword(false)
                  setMemberError("")
                }}
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
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Email <span className="font-normal text-slate-400">(tidak bisa diubah)</span>
                    </label>
                    <input
                      type="text"
                      value={editingMember.user.email}
                      readOnly
                      className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500"
                    />
                  </div>
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
                    <div className="relative">
                      <input
                        type={showEditPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Min. 6 karakter"
                        value={editForm.password}
                        onChange={(e) => { setEditForm({ ...editForm, password: e.target.value }); if (editError.includes("karakter")) setEditError("") }}
                        className={`password-with-toggle w-full rounded-xl border py-2.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${editForm.password.length > 0 && editForm.password.length < 6 ? "border-red-300" : "border-slate-200"}`}
                      />
                      <button
                        type="button"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => setShowEditPassword((visible) => !visible)}
                        aria-label={showEditPassword ? "Sembunyikan password baru" : "Tampilkan password baru"}
                        aria-pressed={showEditPassword}
                        title={showEditPassword ? "Sembunyikan password" : "Tampilkan password"}
                        className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                      >
                        {showEditPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
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
                {requiresLocationAssignment(editForm.role) && editAssignableLocations.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {assignmentLabel(editForm.role)}
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="space-y-2">
                      {editAssignableLocations.map((loc) => {
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
                    disabled={submittingEdit || (requiresLocationAssignment(editForm.role) && editForm.locationIds.length === 0)}
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
                      onChange={(e) => {
                        setMemberForm({ ...memberForm, email: e.target.value })
                        if (memberError.startsWith("Format email")) setMemberError("")
                      }}
                      onBlur={() => {
                        if (memberForm.email && !isValidEmail(memberForm.email)) {
                          setMemberError("Format email tidak valid. Gunakan format seperti nama@toko.com")
                        }
                      }}
                      aria-invalid={memberForm.email.length > 0 && !isValidEmail(memberForm.email)}
                      title="Gunakan format email lengkap, misalnya nama@toko.com"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password *</label>
                    <div className="relative">
                      <input
                        type={showMemberPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        placeholder="Min. 6 karakter"
                        value={memberForm.password}
                        onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
                        className="password-with-toggle w-full rounded-xl border border-slate-200 py-2.5 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => setShowMemberPassword((visible) => !visible)}
                        aria-label={showMemberPassword ? "Sembunyikan password anggota" : "Tampilkan password anggota"}
                        aria-pressed={showMemberPassword}
                        title={showMemberPassword ? "Sembunyikan password" : "Tampilkan password"}
                        className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                      >
                        {showMemberPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
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
                {requiresLocationAssignment(memberForm.role) && memberAssignableLocations.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {assignmentLabel(memberForm.role)}
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <div className="space-y-2">
                      {memberAssignableLocations.map((loc) => {
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
                    <p className="text-xs text-slate-400 mt-1.5">
                      {memberForm.role === "KASIR"
                        ? "Kasir hanya bisa mengakses POS outlet yang dipilih"
                        : "Anggota hanya bisa mengakses data lokasi yang dipilih"}
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={submittingMember || (requiresLocationAssignment(memberForm.role) && selectedLocIds.length === 0)}
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
                    <div key={m.id} className="px-4 py-4 hover:bg-slate-50/60 transition-colors sm:px-5">
                      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                          isThisOwner ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-slate-900 text-[13px]">{m.user.name ?? m.user.email}</span>
                            {isThisOwner && <Crown className="w-3.5 h-3.5 shrink-0 text-amber-500" />}
                            {isMe && <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Anda</span>}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-400">{m.user.email}</div>
                          {m.assignedLocations.length > 0 && (
                            <div className="mt-1 text-[11px] text-slate-500">
                              {m.assignedLocations.map((assignment) => assignment.location.name).join(" · ")}
                            </div>
                          )}
                          {/* Badge + aksi: baris sendiri di HP agar nama & email tidak terhimpit */}
                          <div className="mt-2 flex items-center gap-2 sm:hidden">
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${cfg.color}`}>{cfg.label}</span>
                            {isOwner && !isThisOwner && !isMe && (
                              <>
                                <button
                                  onClick={() => startEditMember(m)}
                                  className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                  title="Edit"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => removeMember(m.user.id, m.user.name ?? m.user.email)}
                                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                  title="Hapus"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Layar besar: badge + aksi tetap sebaris di kanan */}
                        <div className="hidden shrink-0 items-center gap-2 sm:flex">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${cfg.color}`}>{cfg.label}</span>
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
                                onClick={() => removeMember(m.user.id, m.user.name ?? m.user.email)}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ── TAB: GUDANG / OUTLET ── */}
      {(activeTab === "gudang" || activeTab === "outlet") && (
        <LocationTab
          type={activeTab === "gudang" ? "WAREHOUSE" : "OUTLET"}
          locations={activeTab === "gudang" ? warehouses : outlets}
          warehouses={warehouses}
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
          onStartEdit={(loc) => {
            setEditingLoc(loc.id)
            setEditLocForm({
              name: loc.name,
              address: loc.address ?? "",
              whatsappPhone: loc.whatsappPhone ?? "",
              fulfillmentWarehouseId: loc.fulfillmentWarehouseId ?? "",
            })
          }}
          onSaveEdit={saveEditLoc}
          onCancelEdit={() => setEditingLoc(null)}
          onDeactivate={deactivateLoc}
        />
      )}

      {dialog}
    </div>
  )
}

function LocationTab({
  type, locations, warehouses, loading, isOwner,
  showForm, setShowForm, form, setForm, error, submitting, onAdd,
  editingId, editForm, setEditForm, onStartEdit, onSaveEdit, onCancelEdit, onDeactivate,
}: {
  type: "WAREHOUSE" | "OUTLET"
  locations: Location[]
  warehouses: Location[]
  loading: boolean
  isOwner: boolean
  showForm: boolean
  setShowForm: (v: boolean) => void
  form: LocationForm
  setForm: (f: LocationForm) => void
  error: string
  submitting: boolean
  onAdd: () => void
  editingId: string | null
  editForm: LocationForm
  setEditForm: (f: LocationForm) => void
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-6 text-lg font-semibold leading-7 text-slate-900">Tambah {label} Baru</h2>
          {error && <div className="mb-6"><FormAlert message={error} /></div>}
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="new-location-name" className={locationLabelClass}>Nama {label} <span className="text-red-500">*</span></label>
              <input
                id="new-location-name"
                type="text"
                required
                placeholder={isGudang ? "Gudang Utama, Gudang Barat..." : "Outlet Denpasar, Cabang Kuta..."}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={locationInputClass}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="new-location-address" className={locationLabelClass}>Alamat <span className="font-normal text-slate-400">(opsional)</span></label>
              <input
                id="new-location-address"
                type="text"
                placeholder="Jl. Contoh No. 1, Kota"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={locationInputClass}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="new-location-phone" className={locationLabelClass}>{isGudang ? "WhatsApp admin gudang" : "WhatsApp penanggung jawab"}</label>
              <input
                id="new-location-phone"
                aria-describedby="new-location-phone-help"
                type="tel"
                inputMode="tel"
                placeholder="Contoh: +62 800-0000-0000"
                value={form.whatsappPhone}
                onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })}
                className={locationInputClass}
              />
              <p id="new-location-phone-help" className={locationHelpClass}>{isGudang ? "Menerima peringatan stok outlet yang dipasok gudang ini." : "Untuk komunikasi operasional outlet."}</p>
            </div>
            {!isGudang && (
              <div className="min-w-0">
                <label htmlFor="new-outlet-warehouse" className={locationLabelClass}>Gudang pemenuhan</label>
                <div className="relative min-w-0">
                  <select
                    id="new-outlet-warehouse"
                    aria-describedby="new-outlet-warehouse-help"
                    value={form.fulfillmentWarehouseId}
                    onChange={(e) => setForm({ ...form, fulfillmentWarehouseId: e.target.value })}
                    className={`${locationInputClass} appearance-none truncate pr-10`}
                  >
                    <option value="">Belum dipasangkan</option>
                    {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
                <p id="new-outlet-warehouse-help" className={locationHelpClass}>Permintaan stok outlet diteruskan ke gudang ini.</p>
              </div>
            )}
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row">
            <button
              onClick={onAdd}
              disabled={submitting || !form.name.trim()}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold leading-6 text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : `Simpan ${label}`}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(emptyLocationForm) }}
              className="min-h-11 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium leading-6 text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              Batal
            </button>
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
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-600">Nama {label}</span>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="min-h-11 w-full rounded-xl border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={`Nama ${label.toLowerCase()}`}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-600">Alamat</span>
                        <input
                          type="text"
                          value={editForm.address}
                          onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                          className="min-h-11 w-full rounded-xl border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Alamat (opsional)"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-600">
                        {isGudang ? "WhatsApp admin gudang" : "WhatsApp penanggung jawab outlet"}
                      </span>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={editForm.whatsappPhone}
                        onChange={(e) => setEditForm({ ...editForm, whatsappPhone: e.target.value })}
                        className="min-h-11 w-full rounded-xl border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Contoh: +62 800-0000-0000"
                      />
                    </label>
                    {!isGudang && (
                      <div>
                        <label htmlFor={`outlet-warehouse-${loc.id}`} className="mb-1.5 block text-xs font-medium text-slate-600">Gudang pemenuhan outlet</label>
                        <div className="relative min-w-0">
                          <select
                            id={`outlet-warehouse-${loc.id}`}
                            value={editForm.fulfillmentWarehouseId}
                            onChange={(e) => setEditForm({ ...editForm, fulfillmentWarehouseId: e.target.value })}
                            className="min-h-11 w-full min-w-0 appearance-none truncate rounded-xl border border-blue-300 bg-blue-50 py-2 pl-3 pr-10 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                          >
                            <option value="">Belum dipasangkan</option>
                            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                          </select>
                          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => onSaveEdit(loc.id)}
                        className="flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                      >
                        <Check className="w-3.5 h-3.5" /> Simpan
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                      >
                        <X className="w-3.5 h-3.5" /> Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isGudang ? "bg-blue-100" : "bg-orange-100"
                    }`}>
                      <Icon className={`w-5 h-5 ${isGudang ? "text-blue-600" : "text-orange-600"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{loc.name}</div>
                      {loc.address && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{loc.address}</span>
                        </div>
                      )}
                      {loc.whatsappPhone && (
                        <div className="mt-0.5 text-xs text-slate-400">WhatsApp: +{loc.whatsappPhone}</div>
                      )}
                      {!isGudang && (
                        <div className="mt-0.5 text-xs text-slate-400">
                          Gudang: {warehouses.find((warehouse) => warehouse.id === loc.fulfillmentWarehouseId)?.name ?? "belum dipasangkan"}
                        </div>
                      )}
                    </div>
                    {isOwner && (
                      <div className="flex shrink-0 items-center gap-1">
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
