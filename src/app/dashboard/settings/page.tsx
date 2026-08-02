"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { Building2, Save, Loader2, CheckCircle, Lock, QrCode, Upload, Trash2, X, Download, Eye, FileText, Wifi, Camera, ChevronDown, Plus, Power } from "lucide-react"
import jsQR from "jsqr"
import QRCode from "qrcode"

export default function SettingsPage() {
  const { data: session } = useSession()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ businessName: "", email: "", name: "" })


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

  const role = (session?.user as { role?: string })?.role ?? ""
  const isOwner = role === "OWNER"

  const roleLabel: Record<string, string> = {
    OWNER: "Owner",
    ADMIN_GUDANG: "Admin Gudang",
    SUPERVISOR: "Supervisor",
    EMPLOYEE: "Karyawan",
  }

  const generateQr = useCallback(async (token: string) => {
    if (qrDataUrl[token]) return
    const url = `${window.location.origin}/t/${token}`
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: "#0F172A", light: "#FFFFFF" } })
    setQrDataUrl((prev) => ({ ...prev, [token]: dataUrl }))
  }, [qrDataUrl])

  const generateTableQr = useCallback(async (loc: LocationRow, table: TableRow) => {
    if (tableQrDataUrl[table.tableToken]) return
    const url = `${window.location.origin}/t/${loc.menuToken}?meja=${table.tableToken}`
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: "#0F172A", light: "#FFFFFF" } })
    setTableQrDataUrl((prev) => ({ ...prev, [table.tableToken]: dataUrl }))
  }, [tableQrDataUrl])

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

  async function deleteTable(loc: LocationRow, table: TableRow) {
    if (!confirm(`Hapus meja "${table.name}"?`)) return
    const res = await fetch(`/api/tables/${table.id}`, { method: "DELETE" })
    if (res.ok) {
      setTables((prev) => ({ ...prev, [loc.id]: prev[loc.id].filter((t) => t.id !== table.id) }))
    }
  }

  useEffect(() => {
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
      if (d.receiptLogoUrl) setReceiptLogo(d.receiptLogoUrl)
      if (d.receiptWifiName) setReceiptWifiName(d.receiptWifiName)
      if (d.receiptWifiPassword) setReceiptWifiPassword(d.receiptWifiPassword)
      if (d.receiptFooterText) setReceiptFooter(d.receiptFooterText)
    })
    fetch("/api/locations?type=OUTLET").then((r) => r.ok ? r.json() : null).then((d) => {
      if (Array.isArray(d)) setLocations(d)
    })
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
    fd.append("folder", "menu")
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
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      setQrisError("Format file harus PNG, JPG, atau WEBP")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setQrisError("Ukuran file maksimal 10MB")
      return
    }
    setQrisUploading(true)
    try {
      // Baca file sebagai data URL
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      // Compress + decode QR payload dari canvas
      const { compressed, qrisPayload } = await new Promise<{ compressed: string; qrisPayload: string | null }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          try {
            // Decode QR payload dari gambar full-resolution
            const decodeCanvas = document.createElement("canvas")
            decodeCanvas.width = img.naturalWidth
            decodeCanvas.height = img.naturalHeight
            const decodeCtx = decodeCanvas.getContext("2d")
            let payload: string | null = null
            if (decodeCtx) {
              decodeCtx.drawImage(img, 0, 0)
              const imageData = decodeCtx.getImageData(0, 0, decodeCanvas.width, decodeCanvas.height)
              const decoded = jsQR(imageData.data, decodeCanvas.width, decodeCanvas.height)
              payload = decoded?.data ?? null
            }

            // Compress untuk storage (480px JPEG 70%)
            const MAX = 480
            const scale = Math.min(MAX / img.width, MAX / img.height, 1)
            const canvas = document.createElement("canvas")
            canvas.width  = Math.max(1, Math.round(img.width  * scale))
            canvas.height = Math.max(1, Math.round(img.height * scale))
            const ctx = canvas.getContext("2d")
            if (!ctx) { reject(new Error("Browser tidak support canvas, coba browser lain")); return }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            const result = canvas.toDataURL("image/jpeg", 0.70)
            if (!result || result === "data:,") { reject(new Error("Gagal mengompresi gambar")); return }
            resolve({ compressed: result, qrisPayload: payload })
          } catch (err) {
            reject(err)
          }
        }
        img.onerror = () => reject(new Error("Gagal memuat gambar"))
        img.src = rawDataUrl
      })
      // Kirim sebagai JSON — tidak ada multipart, tidak bisa hang
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrisImageUrl: compressed, qrisPayload }),
      })
      let data: { error?: string } = {}
      try { data = await res.json() } catch { /* empty body — lihat status */ }
      if (res.ok) {
        setQrisUrl(compressed)
        setQrisPayloadSaved(!!qrisPayload)
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

  async function handleQrisDelete() {
    if (!confirm("Hapus gambar QRIS?")) return
    await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrisImageUrl: null }),
    })
    setQrisUrl(null)
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
    `w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm transition ${
      editable
        ? "text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        : "text-slate-500 bg-slate-50 cursor-not-allowed"
    }`

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">Informasi Bisnis</div>
            <div className="text-xs text-slate-400">
              {isOwner ? "Kelola detail organisasi Anda" : "Detail organisasi tempat Anda bergabung"}
            </div>
          </div>
        </div>
        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-full transition-colors"
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

      {/* QRIS */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
            <QrCode className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">QRIS Pembayaran</div>
            <div className="text-xs text-slate-400">QR code yang ditampilkan kasir saat pembayaran QRIS</div>
          </div>
        </div>
        <div className="px-6 py-5">
          {qrisError && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{qrisError}</div>
          )}
          {qrisSuccess && (
            <div className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-xl flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {qrisPayloadSaved
                ? "QRIS Dinamis aktif — nominal otomatis masuk ke QR saat transaksi"
                : "QRIS terupload, tapi QR tidak terbaca — pelanggan perlu input nominal manual"}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            {/* Preview */}
            <div className="shrink-0">
              {qrisUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-36 h-36 rounded-2xl overflow-hidden border-2 border-slate-200 bg-white relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrisUrl} alt="QRIS" className="w-full h-full object-contain p-1" />
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    qrisPayloadSaved
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {qrisPayloadSaved ? "Dinamis ✓" : "Statis — upload ulang"}
                  </span>
                </div>
              ) : (
                <div className="w-36 h-36 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2">
                  <QrCode className="w-8 h-8 text-slate-300" />
                  <span className="text-xs text-slate-400 text-center">Belum ada QRIS</span>
                </div>
              )}</div>

            {/* Actions */}
            {isOwner && (
              <div className="flex-1 space-y-3">
                <p className="text-sm text-slate-500 leading-relaxed">
                  Upload screenshot atau foto QRIS dari aplikasi bank Anda. Gambar ini akan muncul di layar kasir saat pelanggan memilih metode QRIS.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => qrisInputRef.current?.click()}
                    disabled={qrisUploading}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-full transition-colors"
                  >
                    {qrisUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {qrisUploading ? "Mengupload..." : qrisUrl ? "Ganti QRIS" : "Upload QRIS"}
                  </button>
                  {qrisUrl && (
                    <button
                      onClick={handleQrisDelete}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 hover:bg-red-50 rounded-full transition-colors"
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
                <p className="text-xs text-slate-400">Format PNG, JPG, WEBP · Maks 5MB</p>
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

      {/* QR Menu Digital */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <QrCode className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="font-semibold text-slate-900 text-sm">QR Menu Digital</div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Hubungi Admin</span>
            </div>
            <div className="text-xs text-slate-400">Satu QR per outlet (nomor meja diisi manual), atau buat QR per meja yang otomatis terkunci</div>
          </div>
        </div>

        <div className="px-6 py-5">
          {locations.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">Belum ada outlet aktif</div>
          ) : (
            <div className="space-y-2">
              {locations.map((loc) => (
                <div key={loc.id} className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="flex items-center gap-3 p-3 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{loc.name}</div>
                    </div>
                    <button
                      onClick={async () => { setQrModal(loc); await generateQr(loc.menuToken) }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" /> Lihat QR Outlet
                    </button>
                    <button
                      onClick={() => toggleExpandLoc(loc)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors shrink-0"
                    >
                      Kelola Meja
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedLoc === loc.id ? "rotate-180" : ""}`} />
                    </button>
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
                            <div key={table.id} className="flex items-center gap-2 bg-white rounded-lg border border-slate-100 px-3 py-2">
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
                              {isOwner && (
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
                          {isOwner && (
                            <div className="flex gap-2 pt-1">
                              <input
                                type="text"
                                value={newTableName}
                                onChange={(e) => setNewTableName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addTable(loc)}
                                placeholder="Contoh: Meja 5"
                                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <button
                                onClick={() => addTable(loc)}
                                disabled={addingTable || !newTableName.trim()}
                                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shrink-0"
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

      {/* QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setQrModal(null) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-900">{qrModal.name}</div>
                <div className="text-xs text-slate-400">QR Menu Digital</div>
              </div>
              <button onClick={() => { setQrModal(null) }} className="p-1.5 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col items-center gap-4">
              {qrDataUrl[qrModal.menuToken] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl[qrModal.menuToken]} alt="QR" className="w-52 h-52 rounded-2xl border border-slate-100" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
              )}
              <button
                onClick={() => downloadQr(qrModal.menuToken, qrModal.name)}
                disabled={!qrDataUrl[qrModal.menuToken]}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-semibold rounded-full"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table QR Modal */}
      {tableQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setTableQrModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="font-bold text-slate-900">{tableQrModal.table.name}</div>
                <div className="text-xs text-slate-400">{tableQrModal.loc.name} · QR Meja (terkunci)</div>
              </div>
              <button onClick={() => setTableQrModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-6 flex flex-col items-center gap-4">
              {tableQrDataUrl[tableQrModal.table.tableToken] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tableQrDataUrl[tableQrModal.table.tableToken]} alt="QR" className="w-52 h-52 rounded-2xl border border-slate-100" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-300" /></div>
              )}
              <p className="text-xs text-slate-400 text-center">Customer yang scan QR ini otomatis masuk ke meja {tableQrModal.table.name} — nomor meja tidak bisa diubah.</p>
              <button
                onClick={() => downloadTableQr(tableQrModal.loc, tableQrModal.table)}
                disabled={!tableQrDataUrl[tableQrModal.table.tableToken]}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-semibold rounded-full"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pengaturan Struk */}
      {isOwner && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-semibold text-slate-900 text-sm">Pengaturan Struk</div>
              <div className="text-xs text-slate-400">Perubahan langsung terlihat di preview</div>
            </div>
          </div>
          <div className="flex flex-col lg:flex-row">
            {/* Form */}
            <div className="flex-1 px-6 py-5 space-y-5 lg:border-r border-slate-100">
              {/* Logo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Logo</label>
                {receiptLogo ? (
                  <div className="flex items-center gap-3">
                    <img src={receiptLogo} alt="Logo struk" className="h-12 w-auto object-contain rounded-xl border border-slate-200 bg-slate-50 p-1" />
                    <button onClick={() => setReceiptLogo(null)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 w-fit px-4 py-2.5 rounded-xl border border-dashed border-slate-300 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer transition-colors text-sm text-slate-500">
                    <input type="file" accept="image/*" className="hidden" onChange={handleReceiptLogoUpload} />
                    {receiptLogoUploading ? <><Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Mengupload...</> : <><Camera className="w-4 h-4" /> Upload Logo</>}
                  </label>
                )}
                <p className="text-xs text-slate-400 mt-1.5">Muncul di atas nama bisnis. PNG/JPG.</p>
              </div>

              {/* WiFi */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                  <Wifi className="w-4 h-4 text-slate-400" /> Info WiFi
                </label>
                <div className="space-y-2">
                  <input type="text" placeholder="Nama WiFi (SSID)"
                    value={receiptWifiName} onChange={(e) => setReceiptWifiName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input type="text" placeholder="Password WiFi"
                    value={receiptWifiPassword} onChange={(e) => setReceiptWifiPassword(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Footer */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Pesan Footer</label>
                <input type="text" placeholder="Contoh: Terima kasih! Follow IG kami @cafekita"
                  value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)}
                  maxLength={120}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">{receiptFooter.length}/120</p>
              </div>

              <button onClick={handleReceiptSave} disabled={receiptSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-full transition-colors"
              >
                {receiptSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</>
                  : receiptSaved ? <><CheckCircle className="w-4 h-4" /> Tersimpan!</>
                  : <><Save className="w-4 h-4" /> Simpan</>}
              </button>
            </div>

            {/* Live Preview */}
            <div className="lg:w-72 bg-slate-50 px-6 py-5 flex flex-col items-center">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-4">Preview Struk</p>
              <div className="w-full max-w-60 bg-white shadow-lg rounded-sm"
                style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: "10px" }}>
                {/* Gigi kertas atas */}
                <div className="w-full overflow-hidden leading-none">
                  <svg viewBox="0 0 240 8" className="w-full" preserveAspectRatio="none">
                    <path d="M0,8 Q6,0 12,8 Q18,0 24,8 Q30,0 36,8 Q42,0 48,8 Q54,0 60,8 Q66,0 72,8 Q78,0 84,8 Q90,0 96,8 Q102,0 108,8 Q114,0 120,8 Q126,0 132,8 Q138,0 144,8 Q150,0 156,8 Q162,0 168,8 Q174,0 180,8 Q186,0 192,8 Q198,0 204,8 Q210,0 216,8 Q222,0 228,8 Q234,0 240,8 L240,8 L0,8 Z" fill="#f8fafc" />
                  </svg>
                </div>

                <div className="px-4 pb-4 pt-1">
                  {/* Logo */}
                  {receiptLogo && (
                    <div className="text-center mb-2">
                      <img src={receiptLogo} alt="Logo" className="h-10 w-auto object-contain mx-auto" />
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
                      { name: "Croissant", qty: 1, price: 18000 },
                      { name: "Es Teh Manis", qty: 1, price: 8000 },
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
                    <span>Rp 76.000</span>
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

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="font-semibold text-slate-900 text-sm">Paket Berlangganan</div>
          <div className="text-xs text-slate-400">Status langganan bisnis ini</div>
        </div>
        <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">Starter</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Aktif</span>
            </div>
            <div className="text-sm text-slate-500 mt-0.5">Hingga 3 outlet, semua fitur dasar</div>
          </div>
          {isOwner && (
            <button className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-xl transition-colors">
              Upgrade
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
