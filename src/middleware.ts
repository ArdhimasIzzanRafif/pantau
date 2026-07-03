import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const isSuperAdmin = !!(req.auth?.user as Record<string, unknown>)?.isSuperAdmin

  const protectedPaths = ["/dashboard", "/pos", "/admin"]
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  // /admin hanya untuk super admin
  if (isLoggedIn && pathname.startsWith("/admin")) {
    if (!isSuperAdmin) {
      return NextResponse.redirect(new URL("/dashboard/owner", req.url))
    }
  }

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    if (isSuperAdmin) {
      return NextResponse.redirect(new URL("/admin", req.url))
    }
    const role = (req.auth?.user as Record<string, unknown>)?.role ?? "OWNER"
    const dest =
      role === "KASIR" || role === "EMPLOYEE"
        ? "/pos"
        : role === "ADMIN_GUDANG"
        ? "/dashboard/goods-receipt"
        : role === "SUPERVISOR"
        ? "/dashboard/opname"
        : "/dashboard/owner"

    return NextResponse.redirect(new URL(dest, req.url))
  }

  // Block PENDING/SUSPENDED users dari dashboard/pos
  if (isLoggedIn && (pathname.startsWith("/dashboard") || pathname.startsWith("/pos"))) {
    const orgStatus = (req.auth?.user as Record<string, unknown>)?.orgStatus
    if (orgStatus === "PENDING") {
      return NextResponse.redirect(new URL("/pending", req.url))
    }
    if (orgStatus === "SUSPENDED" || orgStatus === "EXPIRED") {
      return NextResponse.redirect(new URL("/suspended", req.url))
    }
    const role = (req.auth?.user as Record<string, unknown>)?.role
    if ((role === "KASIR" || role === "EMPLOYEE") && pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/pos", req.url))
    }
    const NO_DASHBOARD_ROLES = ["ADMIN_GUDANG", "SUPERVISOR"]
    const DASHBOARD_ONLY = ["/dashboard/owner", "/dashboard/admin-gudang", "/dashboard/supervisor"]
    if (NO_DASHBOARD_ROLES.includes(role as string) && DASHBOARD_ONLY.some((p) => pathname.startsWith(p))) {
      const fallback = role === "ADMIN_GUDANG" ? "/dashboard/goods-receipt" : "/dashboard/opname"
      return NextResponse.redirect(new URL(fallback, req.url))
    }
    const orgPlan = (req.auth?.user as Record<string, unknown>)?.orgPlan as string | undefined
    const STARTER_BLOCKED = [
      "/dashboard/transfer", "/dashboard/opname", "/dashboard/goods-receipt",
      "/dashboard/alerts", "/dashboard/stok",
    ]
    if (
      (orgPlan === "STARTER" || orgPlan === "FREE") &&
      STARTER_BLOCKED.some((p) => pathname.startsWith(p))
    ) {
      return NextResponse.redirect(new URL("/dashboard/owner", req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
