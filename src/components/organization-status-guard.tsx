"use client"

import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useEffect, useRef } from "react"

const CHECK_INTERVAL_MS = 3_000

function landingPage(role?: string) {
  if (role === "KASIR") return "/pos"
  if (role === "ADMIN_GUDANG") return "/dashboard/goods-receipt"
  if (role === "SUPERVISOR") return "/dashboard/opname"
  return "/dashboard/owner"
}

function destinationFor(status: string | null, pathname: string, role?: string) {
  if (status === "PENDING") return pathname === "/pending" ? null : "/pending"
  if (["SUSPENDED", "EXPIRED", "CANCELLED"].includes(status ?? "")) {
    return pathname === "/suspended" ? null : "/suspended"
  }
  if ((status === "ACTIVE" || status === "TRIAL") && (pathname === "/pending" || pathname === "/suspended")) {
    return landingPage(role)
  }
  return null
}

/**
 * Menjaga halaman aplikasi tetap sesuai status organisasi terbaru. Session JWT
 * ikut diperbarui sebelum navigasi agar Proxy tidak membaca status lama dan
 * mengarahkan pengguna kembali ke halaman sebelumnya.
 */
export function OrganizationStatusGuard() {
  const pathname = usePathname()
  const { data: session, status: sessionStatus, update } = useSession()
  const redirecting = useRef(false)

  useEffect(() => {
    const monitored = ["/dashboard", "/pos", "/pending", "/suspended"].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
    if (!monitored) return

    if (sessionStatus === "unauthenticated") {
      if (pathname === "/pending" || pathname === "/suspended") window.location.replace("/login")
      return
    }
    if (sessionStatus !== "authenticated") return

    let disposed = false
    let checking = false

    const checkStatus = async () => {
      if (checking || redirecting.current || disposed) return
      checking = true
      try {
        const response = await fetch("/api/org/status", { cache: "no-store" })
        if (!response.ok || disposed) return

        const result = await response.json() as { status?: string | null }
        const currentStatus = result.status ?? null
        const user = session?.user as { orgStatus?: string | null; role?: string } | undefined
        const destination = destinationFor(currentStatus, pathname, user?.role)

        if (!destination) return
        redirecting.current = true

        try {
          // Session context dapat sudah berisi status baru sementara cookie JWT
          // yang dibaca Proxy masih lama. Karena itu pembaruan tidak boleh
          // bergantung pada perbandingan nilai di client.
          await update()
        } catch {
          // Proxy tetap menjadi lapisan pengaman bila pembaruan session gagal.
        }
        window.location.replace(destination)
      } catch {
        // Gangguan jaringan sementara tidak boleh mengeluarkan pengguna.
      } finally {
        checking = false
      }
    }

    void checkStatus()
    const interval = window.setInterval(checkStatus, CHECK_INTERVAL_MS)
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkStatus()
    }
    window.addEventListener("focus", checkStatus)
    document.addEventListener("visibilitychange", checkWhenVisible)

    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener("focus", checkStatus)
      document.removeEventListener("visibilitychange", checkWhenVisible)
    }
  }, [pathname, session, sessionStatus, update])

  return null
}
