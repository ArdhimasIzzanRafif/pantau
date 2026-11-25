import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"
import { NextResponse } from "next/server"
import { effectiveOrganizationStatus } from "@/lib/organization-subscription"

const { auth: withAuth } = NextAuth(authConfig)

// Origin publik yang sebenarnya (mis. domain ngrok), bukan alamat internal.
// Di balik proxy/tunnel, req.url sering me-resolve ke localhost:3000, sehingga
// redirect (mis. ke /login saat logout) salah lempar ke localhost.
function externalOrigin(req: { headers: Headers; nextUrl: { origin: string } }) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  if (!host) return req.nextUrl.origin
  const isLocal = host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("0.0.0.0")
  const proto = req.headers.get("x-forwarded-proto") || (isLocal ? "http" : "https")
  return `${proto}://${host}`
}

export default withAuth((req) => {
  const { pathname } = req.nextUrl
  const origin = externalOrigin(req)
  const isLoggedIn = !!req.auth
  const isSuperAdmin = !!(req.auth?.user as Record<string, unknown>)?.isSuperAdmin

  const protectedPaths = ["/dashboard", "/pos", "/admin"]
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  // /admin hanya untuk super admin
  if (isLoggedIn && pathname.startsWith("/admin")) {
    if (!isSuperAdmin) {
      return NextResponse.redirect(new URL("/dashboard/owner", origin))
    }
  }

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", origin)
    // Simpan tautan LENGKAP (termasuk ?outletId=…&alertId=… dari WhatsApp),
    // supaya setelah login pengguna kembali ke halaman yang dia buka.
    loginUrl.searchParams.set("callbackUrl", pathname + req.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    if (isSuperAdmin) {
      return NextResponse.redirect(new URL("/admin", origin))
    }
    const role = (req.auth?.user as Record<string, unknown>)?.role ?? "OWNER"
    const dest =
      role === "KASIR"
        ? "/pos"
        : role === "ADMIN_GUDANG"
        ? "/dashboard/goods-receipt"
        : role === "SUPERVISOR"
        ? "/dashboard/opname"
        : "/dashboard/owner"

    return NextResponse.redirect(new URL(dest, origin))
  }

  // Block PENDING/SUSPENDED users dari dashboard/pos
  if (isLoggedIn && (pathname.startsWith("/dashboard") || pathname.startsWith("/pos"))) {
    const identity = req.auth?.user as Record<string, unknown>
    const orgStatus = effectiveOrganizationStatus({
      status: typeof identity?.orgStatus === "string" ? identity.orgStatus : null,
      trialEndsAt: typeof identity?.orgExpiresAt === "string" ? identity.orgExpiresAt : null,
    })
    if (orgStatus === "PENDING") {
      return NextResponse.redirect(new URL("/pending", origin))
    }
    if (orgStatus === "SUSPENDED" || orgStatus === "EXPIRED" || orgStatus === "CANCELLED") {
      return NextResponse.redirect(new URL("/suspended", origin))
    }
    const role = (req.auth?.user as Record<string, unknown>)?.role
    if (role === "KASIR" && pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/pos", origin))
    }
    const NO_DASHBOARD_ROLES = ["ADMIN_GUDANG", "SUPERVISOR"]
    const DASHBOARD_ONLY = ["/dashboard/owner", "/dashboard/admin-gudang", "/dashboard/supervisor"]
    if (NO_DASHBOARD_ROLES.includes(role as string) && DASHBOARD_ONLY.some((p) => pathname.startsWith(p))) {
      const fallback = role === "ADMIN_GUDANG" ? "/dashboard/goods-receipt" : "/dashboard/opname"
      return NextResponse.redirect(new URL(fallback, origin))
    }
    const orgPlan = (req.auth?.user as Record<string, unknown>)?.orgPlan as string | undefined
    const STARTER_BLOCKED = [
      "/dashboard/transfer", "/dashboard/opname", "/dashboard/goods-receipt",
      "/dashboard/alerts", "/dashboard/stok",
      "/dashboard/stock-card", "/dashboard/adjustments",
    ]
    if (
      (orgPlan === "STARTER" || orgPlan === "FREE") &&
      STARTER_BLOCKED.some((p) => pathname.startsWith(p))
    ) {
      return NextResponse.redirect(new URL("/dashboard/owner", origin))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
