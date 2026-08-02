"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RotateCcw, Save, CheckCircle, Info } from "lucide-react"
import {
  FEATURES, ROLE_DEFAULTS, type FeatureKey, type RoleKey,
  type AccessLevel, type OrgPermissions,
} from "@/lib/permissions"

const ROLES: { key: RoleKey; label: string; color: string }[] = [
  { key: "ADMIN_GUDANG", label: "Admin Gudang", color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  { key: "SUPERVISOR",   label: "Supervisor",   color: "bg-sky-50 text-sky-600 border-sky-200" },
]

export default function PermissionsPage() {
  const router = useRouter()
  const [perms, setPerms] = useState<OrgPermissions>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/permissions")
      .then((r) => r.ok ? r.json() : {})
      .then((d) => {
        // Isi default jika belum ada
        const filled: OrgPermissions = {}
        for (const role of ROLES) {
          filled[role.key] = d[role.key] ?? { ...ROLE_DEFAULTS[role.key] }
        }
        setPerms(filled)
        setLoading(false)
      })
  }, [])

  function toggle(role: RoleKey, feature: FeatureKey) {
    setPerms((prev) => {
      const rp = { ...prev[role] }
      if (rp[feature]) {
        delete rp[feature]
      } else {
        rp[feature] = "EDIT"
      }
      return { ...prev, [role]: rp }
    })
  }

  function setAccess(role: RoleKey, feature: FeatureKey, level: AccessLevel) {
    setPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [feature]: level },
    }))
  }

  function applyDefault(role: RoleKey) {
    setPerms((prev) => ({ ...prev, [role]: { ...ROLE_DEFAULTS[role] } }))
  }

  function isValid() {
    return ROLES.every((r) => Object.keys(perms[r.key] ?? {}).length >= 1)
  }

  async function save() {
    if (!isValid()) return
    setSaving(true)
    await fetch("/api/permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(perms),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Akses Fitur per Role</h1>
          <p className="text-slate-400 text-sm mt-0.5">Pilih fitur apa yang bisa diakses tiap role. Minimal 1 fitur per role.</p>
        </div>
        <button onClick={save} disabled={saving || !isValid()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Tersimpan!" : "Simpan"}
        </button>
      </div>

      {ROLES.map((role) => {
        const rp = perms[role.key] ?? {}
        const count = Object.keys(rp).length
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
              <button onClick={() => applyDefault(role.key)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Pakai Saran
              </button>
            </div>

            {/* Feature list */}
            <div className="divide-y divide-slate-50">
              {(Object.entries(FEATURES) as [FeatureKey, typeof FEATURES[FeatureKey]][]).map(([key, feat]) => {
                const enabled = !!rp[key]
                const isDefault = !!ROLE_DEFAULTS[role.key]?.[key]
                return (
                  <div key={key} className={`px-6 py-3.5 flex items-center gap-4 transition-colors ${enabled ? "bg-white" : "bg-slate-50/50"}`}>
                    {/* Toggle */}
                    <button
                      onClick={() => toggle(role.key, key)}
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
                      <span className="text-xs text-slate-400">{feat.description}</span>
                    </div>

                    {/* VIEW / EDIT */}
                    {enabled && (
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
                        {(["VIEW", "EDIT"] as AccessLevel[]).map((lvl) => (
                          <button key={lvl} onClick={() => setAccess(role.key, key, lvl)}
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
        </div>
      </div>
    </div>
  )
}
