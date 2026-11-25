"use client"

import { useEffect, useState } from "react"
import { Loader2, RotateCcw, Save, CheckCircle, Info, Undo2, CircleAlert } from "lucide-react"
import {
  FEATURES, ROLE_DEFAULTS, ROLE_FEATURES, type FeatureKey, type RoleKey,
  type AccessLevel, type OrgPermissions, areOrgPermissionsEqual,
  isViewOnlyFeature, normalizeOrgPermissions,
} from "@/lib/permissions"
import { PERMISSIONS_UPDATED_EVENT, PERMISSIONS_UPDATED_STORAGE_KEY } from "@/lib/use-can-edit"

const ROLES: { key: RoleKey; label: string; color: string }[] = [
  { key: "ADMIN_GUDANG", label: "Admin Gudang", color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  { key: "SUPERVISOR",   label: "Supervisor",   color: "bg-sky-50 text-sky-600 border-sky-200" },
]

export default function PermissionsPage() {
  const [draftPerms, setDraftPerms] = useState<OrgPermissions>({})
  const [savedPerms, setSavedPerms] = useState<OrgPermissions>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const hasUnsavedChanges = !areOrgPermissionsEqual(draftPerms, savedPerms)

  useEffect(() => {
    fetch("/api/permissions", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Gagal memuat pengaturan akses")
        return r.json()
      })
      .then((d) => {
        const loaded = normalizeOrgPermissions(d)
        // Isi default jika belum ada
        const filled: OrgPermissions = {}
        for (const role of ROLES) {
          filled[role.key] = loaded[role.key] ?? { ...ROLE_DEFAULTS[role.key] }
        }
        setDraftPerms(filled)
        setSavedPerms(filled)
        setLoading(false)
      })
      .catch(() => {
        setError("Gagal memuat pengaturan akses. Muat ulang halaman untuk mencoba lagi.")
        setLoading(false)
      })
  }, [])

  function toggle(role: RoleKey, feature: FeatureKey) {
    setSaved(false)
    setDraftPerms((prev) => {
      const rp = { ...prev[role] }
      if (rp[feature]) {
        delete rp[feature]
      } else {
        rp[feature] = isViewOnlyFeature(feature) ? "VIEW" : "EDIT"
      }
      return { ...prev, [role]: rp }
    })
  }

  function setAccess(role: RoleKey, feature: FeatureKey, level: AccessLevel) {
    if (isViewOnlyFeature(feature) && level === "EDIT") return
    setSaved(false)
    setDraftPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [feature]: level },
    }))
  }

  function applyDefault(role: RoleKey) {
    setSaved(false)
    setDraftPerms((prev) => ({ ...prev, [role]: { ...ROLE_DEFAULTS[role] } }))
  }

  function discardChanges() {
    setDraftPerms(savedPerms)
    setSaved(false)
    setError("")
  }

  function isValid() {
    return ROLES.every((r) => Object.keys(draftPerms[r.key] ?? {}).length >= 1)
  }

  async function save() {
    if (!isValid() || !hasUnsavedChanges || saving) return
    setSaving(true)
    setError("")
    const submitted = normalizeOrgPermissions(draftPerms)
    try {
      const response = await fetch("/api/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitted),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? "Gagal menyimpan pengaturan akses")
      }
      const result = await response.json() as { permissions?: OrgPermissions }
      const persisted = normalizeOrgPermissions(result.permissions ?? submitted)
      setSavedPerms(persisted)
      setDraftPerms(persisted)
      setSaved(true)
      // Menu sidebar dan tombol di layar lain langsung menyesuaikan izin baru,
      // tanpa perlu memuat ulang halaman.
      window.dispatchEvent(new Event(PERMISSIONS_UPDATED_EVENT))
      try {
        localStorage.setItem(PERMISSIONS_UPDATED_STORAGE_KEY, String(Date.now()))
      } catch {
        // Tab dan perangkat lain tetap mendapat pembaruan lewat polling.
      }
      setTimeout(() => setSaved(false), 2500)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal menyimpan pengaturan akses")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900">Akses Fitur per Role</h1>
          <p className="text-slate-400 text-sm mt-0.5">Pilih fitur apa yang bisa diakses tiap role. Perubahan berlaku setelah menekan Simpan.</p>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={discardChanges}
              disabled={saving}
              title="Kembalikan ke pengaturan terakhir yang tersimpan"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
            >
              <Undo2 className="h-4 w-4 text-slate-500" />
              Batalkan
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !hasUnsavedChanges || !isValid()}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none sm:flex-none"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Tersimpan!" : "Simpan"}
          </button>
        </div>
      </div>

      {hasUnsavedChanges && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <CircleAlert className="h-4 w-4 text-amber-600" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Perubahan belum disimpan</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700">Akses tim tetap memakai pengaturan terakhir sampai Anda menekan Simpan.</p>
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {ROLES.map((role) => {
        const rp = draftPerms[role.key] ?? {}
        const count = ROLE_FEATURES[role.key].filter((feature) => !!rp[feature]).length
        return (
          <div key={role.key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${role.color}`}>{role.label}</span>
                <span className="text-xs text-slate-400">{count} fitur aktif</span>
                {count === 0 && (
                  <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                    <Info className="w-3.5 h-3.5" /> Minimal 1 fitur harus dipilih
                  </span>
                )}
              </div>
              <button type="button" onClick={() => applyDefault(role.key)} disabled={saving}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Pakai Saran
              </button>
            </div>

            {/* Feature list */}
            <div className="divide-y divide-slate-50">
              {ROLE_FEATURES[role.key].map((key) => {
                const feat = FEATURES[key]
                const enabled = !!rp[key]
                const isDefault = !!ROLE_DEFAULTS[role.key]?.[key]
                return (
                  <div key={key} className={`px-6 py-3.5 flex items-center gap-4 transition-colors ${enabled ? "bg-white" : "bg-slate-50/50"}`}>
                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => toggle(role.key, key)}
                      disabled={saving}
                      aria-label={`${enabled ? "Nonaktifkan" : "Aktifkan"} ${feat.label} untuk ${role.label}`}
                      aria-pressed={enabled}
                      className={`shrink-0 relative rounded-full transition-colors duration-200 ${enabled ? "bg-blue-600" : "bg-slate-200"}`}
                      style={{ width: 52, height: 30, padding: 3 }}
                    >
                      <span
                        className="block bg-white rounded-full transition-transform duration-200"
                        style={{
                          width: 24, height: 24,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.18), 0 0.5px 2px rgba(0,0,0,0.12)",
                          transform: enabled ? "translateX(22px)" : "translateX(0)",
                        }}
                      />
                    </button>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${enabled ? "text-slate-900" : "text-slate-400"}`}>{feat.label}</span>
                        {isDefault && (
                          <span className="text-[10px] bg-blue-50 text-blue-500 border border-blue-100 px-1.5 py-0.5 rounded-full font-semibold">Saran</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {role.key === "SUPERVISOR" && key === "OPNAME"
                          ? "Hitung stok fisik tanpa melihat stok sistem"
                          : role.key === "SUPERVISOR" && key === "ALERTS"
                            ? "Stok menipis/habis, barang masuk, status transfer, dan opname sendiri"
                            : feat.description}
                      </span>
                    </div>

                    {/* VIEW / EDIT */}
                    {enabled && !feat.viewOnly && (
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
                        {(["VIEW", "EDIT"] as AccessLevel[]).map((lvl) => (
                          <button key={lvl} type="button" onClick={() => setAccess(role.key, key, lvl)} disabled={saving}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
                              rp[key] === lvl ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                            }`}>
                            {lvl === "VIEW" ? "Lihat" : "Edit"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-600">
          <strong>Lihat</strong> — hanya bisa melihat data, tombol simpan/edit dinonaktifkan.<br/>
          <strong>Edit</strong> — bisa melihat dan mengubah data.
          <br/><strong>Stok per Lokasi</strong> selalu lihat saja; perubahan jumlah stok dicatat melalui transaksi, transfer, atau opname.
        </div>
      </div>
    </div>
  )
}
