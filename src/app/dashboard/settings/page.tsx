"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"
import { Building2, Save, Loader2, CheckCircle, Lock, QrCode, Upload, Trash2, X, Download, Eye, FileText, Wifi, Camera, ChevronDown, Plus, Power, UserRound } from "lucide-react"
import QRCode from "qrcode"
import { useConfirm } from "@/components/ui/use-confirm"
import { WhatsAppIntegrationSettings } from "@/components/whatsapp-integration-settings"

const PLAN_META: Record<string, { name: string; price: string; desc: string; rank: number }> = {
  STARTER: { name: "Kasir",       price: "Rp 199.000", desc: "Kasir, shift, dan transaksi",     rank: 1 },
  PRO:     { name: "Operasional", price: "Rp 499.000", desc: "Kasir + stok & gudang lengkap",  rank: 2 },
}
const PLAN_ORDER = ["STARTER", "PRO"] as const
const CONFIGURED_APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")

function publicAppUrl() {
  const currentHost = window.location.hostname
  const dashboardOpenedFromNetwork = currentHost !== "localhost" && currentHost !== "127.0.0.1"
  return dashboardOpenedFromNetwork ? window.location.origin : CONFIGURED_APP_URL || window.location.origin
}

function menuUrl(token: string, tableToken?: string) {
  const tableQuery = tableToken ? `?meja=${encodeURIComponent(tableToken)}` : ""
  return `${publicAppUrl()}/t/${encodeURIComponent(token)}${tableQuery}`
}

export default function SettingsPage() {
  const { ask, dialog } = useConfirm()
  const { data: session } = useSession()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ businessName: "", email: "", name: "" })
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [profileUploading, setProfileUploading] = useState(false)
  const [profileError, setProfileError] = useState("")
  const profileInputRef = useRef<HTMLInputElement>(null)


  const [receiptLogo, setReceiptLogo]       = useState<string | null>(null)
  const [receiptWifiName, setReceiptWifiName] = useState("")
  const [receiptWifiPassword, setReceiptWifiPassword] = useState("")
  const [receiptFooter, setReceiptFooter]   = useState("")
  const [receiptSaving, setReceiptSaving]   = useState(false)
  const [receiptSaved, setReceiptSaved]     = useState(false)
  const [receiptLogoUploading, setReceiptLogoUploading] = useState(false)

  const [qrisUrl, setQrisUrl]             = useState<string | null>(null)
  const [qrisPayloadSaved, setQrisPayloadSaved] = useState(false)
  const [qrisUploading, setQrisUploading] = useState(false)
  const [qrisError, setQrisError]         = useState("")
  const [qrisSuccess, setQrisSuccess]     = useState(false)
  const qrisInputRef = useRef<HTMLInputElement>(null)

  type LocationRow = { id: string; name: string; menuToken: string }
  type TableRow = { id: string; name: string; tableToken: string; isActive: boolean; sortOrder: number }

  const [locations, setLocations] = useState<LocationRow[]>([])
  const [qrDataUrl, setQrDataUrl] = useState<Record<string, string>>({})
  const [qrModal, setQrModal] = useState<LocationRow | null>(null)

  const [tables, setTables] = useState<Record<string, TableRow[]>>({})
  const [expandedLoc, setExpandedLoc] = useState<string | null>(null)
  const [loadingTables, setLoadingTables] = useState<string | null>(null)
  const [newTableName, setNewTableName] = useState("")
  const [addingTable, setAddingTable] = useState(false)
  const [tableQrModal, setTableQrModal] = useState<{ loc: LocationRow; table: TableRow } | null>(null)
  const [tableQrDataUrl, setTableQrDataUrl] = useState<Record<string, string>>({})

  const [plan, setPlan] = useState<string>("")
  const [planModal, setPlanModal] = useState(false)
  const [planSaving, setPlanSaving] = useState<string | null>(null)
  const [planChangedTo, setPlanChangedTo] = useState<string | null>(null)

  const role = (session?.user as { role?: string })?.role ?? ""
  const isOwner = role === "OWNER"
  // QR meja disiapkan juga oleh Supervisor dan Admin Gudang, sesuai izin yang
  // sama di server (src/app/api/tables).
  const canManageTables = ["OWNER", "SUPERVISOR", "ADMIN_GUDANG"].includes(role ?? "")

  const roleLabel: Record<string, string> = {
    OWNER: "Owner",
    ADMIN_GUDANG: "Admin Gudang",
    SUPERVISOR: "Supervisor",
  }

  const generateQr = useCallback(async (token: string) => {
    if (qrDataUrl[token]) return
    const url = menuUrl(token)
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: "#0F172A", light: "#FFFFFF" } })
    setQrDataUrl((prev) => ({ ...prev, [token]: dataUrl }))
  }, [qrDataUrl])

  const generateTableQr = useCallback(async (loc: LocationRow, table: TableRow) => {
    if (tableQrDataUrl[table.tableToken]) return
    const url = menuUrl(loc.menuToken, table.tableToken)
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: "#0F172A", light: "#FFFFFF" } })
    setTableQrDataUrl((prev) => ({ ...prev, [table.tableToken]: dataUrl }))
  }, [tableQrDataUrl])

  async function handleProfilePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProfileError("")
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setProfileError("Format foto harus JPG, PNG, atau WebP")
      e.target.value = ""
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Ukuran foto maksimal 2MB")
      e.target.value = ""
      return
    }
    setProfileUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "profile")
      const up = await fetch("/api/upload", { method: "POST", body: fd })
      const uploadResult = await up.json().catch(() => ({})) as { url?: string; error?: string }
      if (!up.ok || !uploadResult.url) throw new Error(uploadResult.error ?? "Upload foto gagal")

      const save = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: uploadResult.url }),
      })
      const saveResult = await save.json().catch(() => ({})) as { error?: string }
      if (!save.ok) throw new Error(saveResult.error ?? "Foto gagal disimpan")

      setProfileImage(uploadResult.url)
      window.dispatchEvent(new CustomEvent("profile-image-updated", { detail: uploadResult.url }))
    } catch (uploadError) {
      setProfileError(uploadError instanceof Error ? uploadError.message : "Upload foto gagal")
    } finally {
      setProfileUploading(false)
      if (profileInputRef.current) profileInputRef.current.value = ""
    }
  }

  async function removeProfilePhoto() {
    setProfileError("")
    const response = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: null }),
    })
    if (response.ok) {
      setProfileImage(null)
      window.dispatchEvent(new CustomEvent("profile-image-updated", { detail: null }))
    } else {
      const result = await response.json().catch(() => ({})) as { error?: string }
      setProfileError(result.error ?? "Foto gagal dihapus")
    }
  }

  async function changePlan(newPlan: string) {
    if (newPlan === plan) { setPlanModal(false); return }
    setPlanSaving(newPlan)
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: newPlan }),
    })
    setPlanSaving(null)
    if (res.ok) {
      setPlan(newPlan)
      // Plan/menu tersimpan di sesi login. Sesi JWT tidak bisa di-refresh dari
      // DB tanpa login ulang (auth.config.ts jalan di Edge, tanpa akses DB),
      // jadi user perlu masuk ulang agar menu sesuai paket baru.
      setPlanChangedTo(newPlan)
    }
  }

  function downloadTableQr(loc: LocationRow, table: TableRow) {
    const url = tableQrDataUrl[table.tableToken]
    if (!url) return
    const a = document.createElement("a")
    a.href = url
    a.download = `qr-meja-${loc.name.replace(/\s+/g, "-").toLowerCase()}-${table.name.replace(/\s+/g, "-").toLowerCase()}.png`
    a.click()
  }

  async function toggleExpandLoc(loc: LocationRow) {
    if (expandedLoc === loc.id) { setExpandedLoc(null); return }
    setExpandedLoc(loc.id)
    if (!tables[loc.id]) {
      setLoadingTables(loc.id)
      const res = await fetch(`/api/tables?locationId=${loc.id}`)
      const d = res.ok ? await res.json() : []
      setTables((prev) => ({ ...prev, [loc.id]: Array.isArray(d) ? d : [] }))
      setLoadingTables(null)
    }
  }

  async function addTable(loc: LocationRow) {
    if (!newTableName.trim()) return
    setAddingTable(true)
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: loc.id, name: newTableName.trim() }),
    })
    if (res.ok) {
      const t = await res.json()
      setTables((prev) => ({ ...prev, [loc.id]: [...(prev[loc.id] ?? []), t] }))
      setNewTableName("")
    }
    setAddingTable(false)
  }

  async function toggleTableActive(loc: LocationRow, table: TableRow) {
    const res = await fetch(`/api/tables/${table.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !table.isActive }),
    })
    if (res.ok) {
      setTables((prev) => ({ ...prev, [loc.id]: prev[loc.id].map((t) => (t.id === table.id ? { ...t, isActive: !t.isActive } : t)) }))
    }
  }

  function deleteTable(loc: LocationRow, table: TableRow) {
    ask({
      title: "Hapus meja ini?",
      message: `QR untuk meja "${table.name}" tidak akan bisa dipakai lagi.`,
      confirmLabel: "Hapus",
      danger: true,
      onConfirm: async () => {
        const res = await fetch(`/api/tables/${table.id}`, { method: "DELETE" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(body.error ?? "Gagal menghapus meja")
        }
        setTables((prev) => ({ ...prev, [loc.id]: prev[loc.id].filter((t) => t.id !== table.id) }))
      },
    })
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (session?.user) {
        setForm({
          businessName: (session.user as { businessName?: string }).businessName ?? "",
          email: session.user.email ?? "",
          name: session.user.name ?? "",
        })
      }
      fetch("/api/organization").then((r) => r.ok ? r.json() : null).then((d) => {
        if (!d) return
        setForm((prev) => ({
          ...prev,
          businessName: d.businessName ?? prev.businessName,
          name: d.userName ?? prev.name,
        }))
        if (d.qrisImageUrl) setQrisUrl(d.qrisImageUrl)
        setQrisPayloadSaved(!!d.qrisPayload)
        setReceiptLogo(d.receiptLogoUrl ?? null)
        setReceiptWifiName(d.receiptWifiName ?? "")
        setReceiptWifiPassword(d.receiptWifiPassword ?? "")
        setReceiptFooter(d.receiptFooterText ?? "")
        setProfileImage(d.userImage ?? null)
        if (d.plan) setPlan(d.plan)
      })
      fetch("/api/locations?type=OUTLET").then((r) => r.ok ? r.json() : null).then((d) => {
        if (Array.isArray(d)) setLocations(d)
      })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [session])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const body: Record<string, string> = { userName: form.name }
      if (isOwner) body.businessName = form.businessName
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Gagal menyimpan") }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleReceiptLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptLogoUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    fd.append("folder", "receipts")
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (res.ok) {
      const data = await res.json()
      setReceiptLogo(data.url)
    }
    setReceiptLogoUploading(false)
  }

  async function handleReceiptSave() {
    setReceiptSaving(true)
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiptLogoUrl: receiptLogo ?? null,
        receiptWifiName: receiptWifiName || null,
        receiptWifiPassword: receiptWifiPassword || null,
        receiptFooterText: receiptFooter || null,
      }),
    })
    setReceiptSaving(false)
    if (res.ok) {
      setReceiptSaved(true)
      setTimeout(() => setReceiptSaved(false), 3000)
    }
  }

  async function handleQrisUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setQrisError("")
    setQrisSuccess(false)
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      setQrisError("Format file harus PNG, JPG, atau WEBP")
      e.target.value = ""
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setQrisError("Ukuran file maksimal 5MB")
      e.target.value = ""
      return
    }
    setQrisUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload/qris", { method: "POST", body: formData })
      let data: { error?: string } = {}
      try { data = await res.json() } catch { /* respons kosong */ }
      if (res.ok) {
        const uploaded = data as { url?: string }
        setQrisUrl(uploaded.url ?? null)
        setQrisPayloadSaved(true)
        setQrisSuccess(true)
        setTimeout(() => setQrisSuccess(false), 3000)
      } else {
        setQrisError(data.error ?? `Upload gagal (${res.status})`)
      }
    } catch (err) {
      setQrisError(err instanceof Error ? err.message : "Gagal memproses gambar, coba lagi")
    }
    setQrisUploading(false)
    if (qrisInputRef.current) qrisInputRef.current.value = ""
  }

  function handleQrisDelete() {
    ask({
      title: "Hapus gambar QRIS?",
      message: "Pembeli tidak akan bisa membayar lewat QRIS sampai gambar baru diunggah.",
      confirmLabel: "Hapus",
      danger: true,
      onConfirm: runQrisDelete,
    })
  }

  async function runQrisDelete() {
    setQrisError("")
    const response = await fetch("/api/upload/qris", { method: "DELETE" })
    if (response.ok) {
      setQrisUrl(null)
      setQrisPayloadSaved(false)
      setQrisSuccess(false)
    } else {
      const body = await response.json().catch(() => ({}))
      const message = body.error ?? "Gagal menghapus QRIS"
      setQrisError(message)
      throw new Error(message)
    }
  }

  function downloadQr(token: string, name: string) {
    const url = qrDataUrl[token]
    if (!url) return
    const a = document.createElement("a")
    a.href = url
    a.download = `qr-${name.replace(/\s+/g, "-").toLowerCase()}.png`
    a.click()
  }


  const inputClass = (editable: boolean) =>
    `w-full min-h-11 px-4 py-2.5 rounded-xl border border-slate-200 text-sm transition ${
      editable
        ? "text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        : "text-slate-500 bg-slate-50 cursor-not-allowed"
    }`

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-light text-slate-900 tracking-tight">Pengaturan</h1>
          <p className="text-slate-500 text-sm mt-0.5">Informasi akun dan bisnis Anda</p>
        </div>
        {!isOwner && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
            <Lock className="w-3 h-3" />
            Hanya bisa dilihat
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 text-sm">Informasi Bisnis</div>
            <div className="text-xs text-slate-400">
              {isOwner ? "Kelola detail organisasi Anda" : "Detail organisasi tempat Anda bergabung"}
            </div>
          </div>
        </div>
        <form onSubmit={handleSave} className="space-y-4 p-4 sm:p-6">
          <p className="text-sm font-semibold text-slate-800">Foto profil</p>
          {/* Foto Profil */}
          <div className="flex items-center gap-4">
            {profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileImage}
                alt="Foto profil"
                onError={() => {
                  setProfileImage(null)
                  setProfileError("Foto tidak dapat dimuat. Silakan upload ulang.")
                }}
                className="h-16 w-16 shrink-0 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                <UserRound className="w-7 h-7" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => profileInputRef.current?.click()}
                  disabled={profileUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 disabled:opacity-60 rounded-full transition-colors"
                >
                  {profileUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  {profileUploading ? "Mengupload..." : profileImage ? "Ganti Foto" : "Upload Foto"}
                </button>
                {profileImage && (
                  <button
                    type="button"
                    onClick={removeProfilePhoto}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                )}
              </div>
              <span className="block text-xs text-slate-400">JPG, PNG, atau WebP · Maks 2MB</span>
              {profileError && <span className="block text-xs text-red-600">{profileError}</span>}
            </div>
            <input
              ref={profileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={handleProfilePhoto}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Bisnis</label>
            <input
              type="text"
              value={form.businessName}
              onChange={(e) => isOwner && setForm({ ...form, businessName: e.target.value })}
              readOnly={!isOwner}
              placeholder="Nama bisnis Anda"
              className={inputClass(isOwner)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nama Lengkap</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => isOwner && setForm({ ...form, name: e.target.value })}
                readOnly={!isOwner}
                placeholder="Nama Anda"
                className={inputClass(isOwner)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                readOnly
                disabled
                className={inputClass(false)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Peran Anda</label>
            <div className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
              {roleLabel[role] ?? role}
            </div>
          </div>

          {isOwner && (
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 sm:w-auto sm:rounded-full"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                ) : saved ? (
                  <><CheckCircle className="w-4 h-4" /> Tersimpan</>
                ) : (
                  <><Save className="w-4 h-4" /> Simpan Perubahan</>
                )}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* QRIS hanya untuk Owner. Role lain tidak mengurus pembayaran, dan
          sebelumnya blok ini tetap tampil meski isinya tidak bisa diapa-apakan. */}
      {isOwner && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
              <QrCode className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm">QRIS Pembayaran</div>
              <div className="text-xs text-slate-400">QR code yang ditampilkan kasir saat pembayaran QRIS</div>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            {qrisError && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{qrisError}</div>
            )}
            {qrisSuccess && (
              <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                QRIS berhasil diverifikasi dan disimpan.
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[9rem_minmax(0,1fr)] lg:items-start lg:gap-6">
              {/* Preview */}
              <div className="flex shrink-0 justify-center lg:justify-start">
                {qrisUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-36 h-36 rounded-2xl overflow-hidden border-2 border-slate-200 bg-white relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrisUrl} alt="QRIS" className="w-full h-full object-contain p-1" />
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      qrisPayloadSaved
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {qrisPayloadSaved ? "QRIS terverifikasi ✓" : "Belum terverifikasi"}
                    </span>
                  </div>
                ) : (
                  <div className="w-36 h-36 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2">
                    <QrCode className="w-8 h-8 text-slate-300" />
                    <span className="text-xs text-slate-400 text-center">Belum ada QRIS</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {isOwner && (
                <div className="flex-1 space-y-3">
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Upload foto atau screenshot QRIS yang jelas. Sistem akan membaca kode, memeriksa format QRIS Indonesia, dan menolak gambar biasa atau QR selain QRIS.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      onClick={() => qrisInputRef.current?.click()}
                      disabled={qrisUploading}
                      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 sm:rounded-full"
                    >
                      {qrisUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {qrisUploading ? "Mengupload..." : qrisUrl ? "Ganti QRIS" : "Upload QRIS"}
                    </button>
                    {qrisUrl && (
                      <button
                        onClick={handleQrisDelete}
                        className="flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 sm:rounded-full"
                      >
                        <Trash2 className="w-4 h-4" />
                        Hapus
                      </button>
                    )}
                  </div>
                  <input
                    ref={qrisInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={handleQrisUpload}
                  />
                  <p className="text-xs text-slate-400">Format PNG, JPG, WEBP · Maks 5MB · QRIS wajib terbaca</p>
                </div>
              )}
              {!isOwner && (
                <div className="flex-1 flex items-center">
                  <p className="text-sm text-slate-400">Hanya Owner yang dapat mengubah pengaturan QRIS.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Menu Digital */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-4 sm:items-center sm:px-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100">
            <QrCode className="w-4 h-4 text-purple-600" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 text-sm">QR Menu Digital</div>
            <div className="text-xs text-slate-400">Satu QR per outlet (nomor meja diisi manual), atau buat QR per meja yang otomatis terkunci</div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {locations.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Belum ada outlet aktif</div>
          ) : (
            <div className="space-y-2">
              {locations.map((loc) => (
                <div key={loc.id} className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="flex flex-col gap-3 p-3 hover:bg-slate-50 lg:flex-row lg:items-center">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{loc.name}</div>
                    </div>
                    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto">
                      <button
                        onClick={async () => { setQrModal(loc); await generateQr(loc.menuToken) }}
                        className="flex items-center justify-center gap-1 rounded-lg bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 lg:shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" /> Lihat QR Outlet
                      </button>
                      <button
                        onClick={() => toggleExpandLoc(loc)}
                        className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 lg:shrink-0"
                      >
                        Kelola Meja
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedLoc === loc.id ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {expandedLoc === loc.id && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3 space-y-2">
                      {loadingTables === loc.id ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
                      ) : (
                        <>
                          {(tables[loc.id] ?? []).length === 0 && (
                            <div className="text-xs text-slate-400 text-center py-2">Belum ada meja</div>
                          )}
                          {(tables[loc.id] ?? []).map((table) => (
                            <div key={table.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
                              <div className={`flex-1 min-w-0 text-sm font-medium truncate ${table.isActive ? "text-slate-900" : "text-slate-400 line-through"}`}>
                                {table.name}
                              </div>
                              <button
                                onClick={async () => { setTableQrModal({ loc, table }); await generateTableQr(loc, table) }}
                                className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="Lihat QR meja"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                              </button>
                              {canManageTables && (
                                <>
                                  <button
                                    onClick={() => toggleTableActive(loc, table)}
                                    className={`p-1.5 rounded-lg transition-colors ${table.isActive ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-400 hover:bg-slate-100"}`}
                                    title={table.isActive ? "Nonaktifkan meja" : "Aktifkan meja"}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteTable(loc, table)}
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Hapus meja"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                          {canManageTables && (
                            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                              <input
                                type="text"
                                value={newTableName}
                                onChange={(e) => setNewTableName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addTable(loc)}
                                placeholder="Contoh: Meja 5"
                                className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => addTable(loc)}
                                disabled={addingTable || !newTableName.trim()}
                                className="flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                              >
                                {addingTable ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                Tambah
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isOwner && <WhatsAppIntegrationSettings />}

      {/* QR Modal */}
      {qrModal && (
        <div className="app-overlay z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={() => { setQrModal(null) }} />
          <div className="relative z-10 max-h-[calc(100%-3rem)] w-full max-w-sm overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-900">{qrModal.name}</div>
                <div className="text-xs text-slate-400">QR Menu Digital</div>
              </div>
              <button onClick={() => { setQrModal(null) }} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-4 p-5 sm:p-6">
              {qrDataUrl[qrModal.menuToken] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl[qrModal.menuToken]} alt="QR" className="h-44 w-44 rounded-2xl border border-slate-100 sm:h-52 sm:w-52" />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
              )}
              <div className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-center">
                <div className="text-[11px] text-slate-400 mb-1">Alamat yang dibuka QR</div>
                <a
                  href={menuUrl(qrModal.menuToken)}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs text-blue-600 hover:text-blue-700 break-all underline"
                >
                  {menuUrl(qrModal.menuToken)}
                </a>
              </div>
              <p className="text-xs text-slate-400 text-center">Untuk pengujian lokal, HP harus terhubung ke Wi-Fi yang sama dengan komputer ini.</p>
              <button
                onClick={() => downloadQr(qrModal.menuToken, qrModal.name)}
                disabled={!qrDataUrl[qrModal.menuToken]}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 sm:w-auto"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table QR Modal */}
      {tableQrModal && (
        <div className="app-overlay z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={() => setTableQrModal(null)} />
          <div className="relative z-10 max-h-[calc(100%-3rem)] w-full max-w-sm overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-900">{tableQrModal.table.name}</div>
                <div className="text-xs text-slate-400">{tableQrModal.loc.name} · QR Meja (terkunci)</div>
              </div>
              <button onClick={() => setTableQrModal(null)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-4 p-5 sm:p-6">
              {tableQrDataUrl[tableQrModal.table.tableToken] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tableQrDataUrl[tableQrModal.table.tableToken]} alt="QR" className="h-44 w-44 rounded-2xl border border-slate-100 sm:h-52 sm:w-52" />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
              )}
              <p className="text-xs text-slate-400 text-center">Customer yang scan QR ini otomatis masuk ke meja {tableQrModal.table.name} — nomor meja tidak bisa diubah.</p>
              <a
                href={menuUrl(tableQrModal.loc.menuToken, tableQrModal.table.tableToken)}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-blue-600 hover:text-blue-700 break-all text-center underline"
              >
                {menuUrl(tableQrModal.loc.menuToken, tableQrModal.table.tableToken)}
              </a>
              <button
                onClick={() => downloadTableQr(tableQrModal.loc, tableQrModal.table)}
                disabled={!tableQrDataUrl[tableQrModal.table.tableToken]}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 sm:w-auto"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pengaturan Struk */}
      {isOwner && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
              <FileText className="w-4 h-4 text-slate-500" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 text-sm">Pengaturan Struk</div>
              <div className="text-xs text-slate-400">Perubahan langsung terlihat di preview</div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem]">
            {/* Form */}
            <div className="space-y-5 p-4 sm:p-6 lg:border-r lg:border-slate-100">
              {/* Logo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Logo</label>
                {receiptLogo ? (
                  <div className="flex flex-wrap items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={receiptLogo}
                      alt="Logo struk"
                      className="h-12 w-auto object-contain rounded-xl border border-slate-200 bg-slate-50 p-1"
                      onError={() => setReceiptLogo(null)}
                    />
                    <button onClick={() => setReceiptLogo(null)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </div>
                ) : (
                  <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50/40 sm:w-fit">
                    <input type="file" accept="image/*" className="hidden" onChange={handleReceiptLogoUpload} />
                    {receiptLogoUploading ? <><Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Mengupload...</> : <><Camera className="w-4 h-4" /> Upload Logo</>}
                  </label>
                )}
                <p className="text-xs text-slate-400 mt-1.5">Opsional. Jika kosong, nama bisnis langsung berada di bagian paling atas struk.</p>
              </div>

              {/* WiFi */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                  <Wifi className="w-4 h-4 text-slate-400" /> Info WiFi
                </label>
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                  <input type="text" placeholder="Nama WiFi (SSID)"
                    value={receiptWifiName} onChange={(e) => setReceiptWifiName(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input type="text" placeholder="Password WiFi"
                    value={receiptWifiPassword} onChange={(e) => setReceiptWifiPassword(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Footer */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Pesan Footer</label>
                <input type="text" placeholder="Contoh: Terima kasih! Follow IG kami @cafekita"
                  value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)}
                  maxLength={120}
                  className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">{receiptFooter.length}/120</p>
              </div>

              <button onClick={handleReceiptSave} disabled={receiptSaving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 sm:w-auto sm:rounded-full"
              >
                {receiptSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                  : receiptSaved ? <><CheckCircle className="w-4 h-4" /> Tersimpan!</>
                  : <><Save className="w-4 h-4" /> Simpan</>}
              </button>
            </div>

            {/* Live Preview */}
            <div className="flex flex-col items-center border-t border-slate-100 bg-slate-50 p-4 lg:border-t-0">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-400">Preview Struk</p>
              <div className="w-full max-w-60 bg-white shadow-lg rounded-sm"
                style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: "10px" }}>
                {/* Gigi kertas atas */}
                <div className="w-full overflow-hidden leading-none">
                  <svg viewBox="0 0 240 8" className="w-full" preserveAspectRatio="none">
                    <path d="M0,8 Q6,0 12,8 Q18,0 24,8 Q30,0 36,8 Q42,0 48,8 Q54,0 60,8 Q66,0 72,8 Q78,0 84,8 Q90,0 96,8 Q102,0 108,8 Q114,0 120,8 Q126,0 132,8 Q138,0 144,8 Q150,0 156,8 Q162,0 168,8 Q174,0 180,8 Q186,0 192,8 Q198,0 204,8 Q210,0 216,8 Q222,0 228,8 Q234,0 240,8 L240,8 L0,8 Z" fill="#f8fafc" />
                  </svg>
                </div>

                <div className={`px-4 pb-4 ${receiptLogo ? "pt-1" : "pt-0"}`}>
                  {/* Logo */}
                  {receiptLogo && (
                    <div className="text-center mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={receiptLogo}
                        alt=""
                        className="h-10 w-auto object-contain mx-auto"
                        onError={() => setReceiptLogo(null)}
                      />
                    </div>
                  )}

                  {/* Header */}
                  <div className="text-center mb-2">
                    <div className="font-black tracking-wide uppercase" style={{ fontSize: "11px" }}>
                      {form.businessName || "Nama Bisnis"}
                    </div>
                    <div className="text-slate-500 mt-0.5">Outlet Utama</div>
                    <div className="text-slate-400">Jl. Contoh No. 1, Jakarta</div>
                  </div>

                  <div className="border-t border-dashed border-slate-300 my-2" />

                  {/* Meta */}
                  <div className="text-center text-slate-500 space-y-0.5">
                    <div className="font-semibold text-slate-700">#ORD-0042</div>
                    <div>30 Jun 2026, 10:45</div>
                    <div>Kasir: Demo User</div>
                  </div>

                  <div className="border-t border-dashed border-slate-300 my-2" />

                  {/* Items */}
                  <div className="space-y-1.5">
                    {[
                      { name: "Kopi Susu", qty: 2, price: 25000 },
                    ].map((item) => (
                      <div key={item.name}>
                        <div className="flex justify-between">
                          <span className="text-slate-900 font-medium flex-1 pr-1 leading-tight">{item.name}</span>
                          <span className="text-slate-900 font-semibold shrink-0">Rp {(item.qty * item.price).toLocaleString("id-ID")}</span>
                        </div>
                        <div className="text-slate-400">{item.qty} × Rp {item.price.toLocaleString("id-ID")}</div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-slate-300 my-2" />

                  {/* Total */}
                  <div className="flex justify-between font-black" style={{ fontSize: "12px" }}>
                    <span>TOTAL</span>
                    <span>Rp 50.000</span>
                  </div>

                  <div className="border-t border-dashed border-slate-300 my-2" />

                  {/* WiFi */}
                  {(receiptWifiName || receiptWifiPassword) && (
                    <div className="border border-dashed border-slate-300 rounded px-2 py-1.5 text-center text-slate-500 mb-2">
                      <div>WiFi: <span className="font-semibold text-slate-700">{receiptWifiName || "NamaWifi"}</span></div>
                      {receiptWifiPassword && <div>Pass: <span className="font-semibold text-slate-700">{receiptWifiPassword}</span></div>}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="text-center font-semibold text-slate-700">
                    {receiptFooter || "Terima kasih!"}
                  </div>
                </div>

                {/* Gigi kertas bawah */}
                <div className="w-full overflow-hidden leading-none">
                  <svg viewBox="0 0 240 8" className="w-full" preserveAspectRatio="none">
                    <path d="M0,0 Q6,8 12,0 Q18,8 24,0 Q30,8 36,0 Q42,8 48,0 Q54,8 60,0 Q66,8 72,0 Q78,8 84,0 Q90,8 96,0 Q102,8 108,0 Q114,8 120,0 Q126,8 132,0 Q138,8 144,0 Q150,8 156,0 Q162,8 168,0 Q174,8 180,0 Q186,8 192,0 Q198,8 204,0 Q210,8 216,0 Q222,8 228,0 Q234,8 240,0 L240,0 L0,0 Z" fill="#f8fafc" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="font-semibold text-slate-900 text-sm">Paket Berlangganan</div>
          <div className="text-xs text-slate-400">Status langganan bisnis ini</div>
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">{PLAN_META[plan]?.name ?? "—"}</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Aktif</span>
            </div>
            <div className="text-sm text-slate-500 mt-0.5">
              {PLAN_META[plan] ? `${PLAN_META[plan].price}/bln · ${PLAN_META[plan].desc}` : "Memuat..."}
            </div>
          </div>
          {isOwner && (
            <button
              onClick={() => setPlanModal(true)}
              className="w-full shrink-0 rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-600 transition-colors hover:border-blue-300 hover:text-blue-700 lg:w-auto"
            >
              Ubah Paket
            </button>
          )}
        </div>
      </div>

      {/* Modal Ubah Paket */}
      {planModal && (
        <div className="app-overlay z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={() => setPlanModal(false)} />
          <div className="relative z-10 max-h-[calc(100%-3rem)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
            {planChangedTo ? (
              <div className="p-6 text-center">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-7 h-7 text-emerald-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Paket diubah ke {PLAN_META[planChangedTo]?.name}</h2>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                  Menu dan fitur akan menyesuaikan paket baru setelah Anda masuk kembali.
                </p>
                <button
                  onClick={async () => { await signOut({ redirect: false }); window.location.href = "/login" }}
                  className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Masuk Ulang Sekarang
                </button>
              </div>
            ) : (
            <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-900">Ubah Paket Langganan</div>
                <div className="text-xs text-slate-400">Pilih paket yang sesuai kebutuhan bisnis Anda</div>
              </div>
              <button onClick={() => setPlanModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              {PLAN_ORDER.map((key) => {
                const meta = PLAN_META[key]
                const isCurrent = key === plan
                const currentRank = PLAN_META[plan]?.rank ?? 0
                const action = isCurrent ? "Paket Aktif" : meta.rank > currentRank ? "Upgrade" : "Downgrade"
                return (
                  <div
                    key={key}
                    className={`rounded-2xl border-2 p-4 transition-all ${isCurrent ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}
                  >
                    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${isCurrent ? "text-blue-700" : "text-slate-900"}`}>{meta.name}</span>
                          {isCurrent && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">Aktif</span>}
                        </div>
                        <div className="text-sm font-bold text-slate-700 mt-0.5">{meta.price}<span className="font-normal text-slate-400">/bln</span></div>
                        <div className="text-xs text-slate-500 mt-1">{meta.desc}</div>
                      </div>
                      <button
                        onClick={() => changePlan(key)}
                        disabled={isCurrent || planSaving !== null}
                        className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                          isCurrent
                            ? "bg-slate-100 text-slate-400 cursor-default"
                            : action === "Upgrade"
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {planSaving === key ? <Loader2 className="w-4 h-4 animate-spin" /> : action}
                      </button>
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-slate-400 text-center pt-1">Perubahan paket berlaku langsung setelah dipilih.</p>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {dialog}
    </div>
  )
}
