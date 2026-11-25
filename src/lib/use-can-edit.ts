"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { areOrgPermissionsEqual, getEffectivePermissions, type FeatureKey, type OrgPermissions } from "@/lib/permissions"

/** Dikirim halaman Manajemen setelah izin tersimpan, supaya layar lain ikut berubah. */
export const PERMISSIONS_UPDATED_EVENT = "permissions-updated"
export const PERMISSIONS_UPDATED_STORAGE_KEY = "permissions-updated-at"

// Perangkat lain tidak menerima event di atas, jadi izin tetap diperiksa ulang
// secara berkala. Endpointnya kecil (satu baris organisasi).
const REFRESH_INTERVAL_MS = 5_000

/**
 * Izin seluruh role pada organisasi ini, mengikuti perubahan tanpa perlu
 * memuat ulang halaman: langsung saat disimpan di tab yang sama, saat layar
 * kembali dibuka, dan berkala untuk perubahan dari perangkat lain.
 */
export function useOrgPermissions() {
  const { data: session } = useSession()
  const [orgPermissions, setOrgPermissions] = useState<OrgPermissions | null>(null)
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch("/api/permissions", { cache: "no-store" })
      if (res.ok) {
        const incoming = await res.json() as OrgPermissions
        setOrgPermissions((previous) =>
          previous && areOrgPermissionsEqual(previous, incoming) ? previous : incoming
        )
      }
    } catch {
      // Pertahankan izin terakhir. Sebelum pembacaan pertama berhasil, menu
      // tetap tersembunyi agar izin bawaan tidak muncul sebagai akses sementara.
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (!session) return

    const refresh = () => { void load() }
    const onStorage = (event: StorageEvent) => {
      if (event.key === PERMISSIONS_UPDATED_STORAGE_KEY) refresh()
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh()
    }
    const firstLoad = window.setTimeout(refresh, 0)
    window.addEventListener(PERMISSIONS_UPDATED_EVENT, refresh)
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisibility)
    const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => {
      window.clearTimeout(firstLoad)
      window.removeEventListener(PERMISSIONS_UPDATED_EVENT, refresh)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisibility)
      window.clearInterval(intervalId)
    }
  }, [session, load])

  return orgPermissions
}

/**
 * Apakah role yang sedang login boleh mengubah data sebuah fitur.
 *
 * Dipakai untuk menonaktifkan tombol tulis supaya pengguna tidak menekan tombol
 * yang pasti ditolak. Ini lapisan tampilan saja — penegakan sesungguhnya ada di
 * `denyUnlessCanEdit` pada server, karena apa pun di browser bisa diakali.
 */
export function useCanEdit(feature: FeatureKey) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role ?? ""
  const orgPermissions = useOrgPermissions()

  return getEffectivePermissions(role, orgPermissions)[feature] === "EDIT"
}

/** Kelas untuk tombol yang tetap terlihat tapi dinonaktifkan karena tanpa izin. */
export const DISABLED_ACTION_CLASS =
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"

export const NO_EDIT_PERMISSION_TITLE = "Role Anda hanya diberi akses lihat untuk fitur ini"
