// Run only against an isolated local app using the local database.
import "dotenv/config"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { encode } from "next-auth/jwt"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

test("tanggal kedaluwarsa menutup API/session/QR meski JWT masih ACTIVE; perpanjangan membuka lagi", { timeout: 120_000 }, async () => {
  const base = process.env.TEST_APP_URL || "http://localhost:3100"
  const connection = process.env.DATABASE_URL!
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "API tests must use a local app")
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(connection).hostname), "API tests must use a local database")
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET!
  assert.ok(secret)
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connection }) })
  let organizationId: string | undefined
  let userId: string | undefined
  try {
    const marker = randomUUID()
    const future = new Date(Date.now() + 86400000)
    const org = await db.organization.create({ data: { name: "Subscription API QA", slug: `subscription-qa-${marker}`, status: "ACTIVE", plan: "PRO", trialEndsAt: future } })
    organizationId = org.id
    const user = await db.user.create({ data: { name: "Subscription QA", email: `${marker}@subscription-test.invalid`, organizations: { create: { organizationId: org.id, role: "OWNER" } } } })
    userId = user.id
    const location = await db.location.create({ data: { organizationId: org.id, name: "Subscription QA outlet", type: "OUTLET" } })
    const token = await encode({ secret, salt: "authjs.session-token", token: {
      id: user.id, email: user.email, organizationId: org.id, role: "OWNER", orgStatus: "ACTIVE", orgPlan: "PRO",
      orgExpiresAt: future.toISOString(), locationIds: [], identityCheckedAt: Math.floor(Date.now() / 1000),
    } })
    const cookie = `authjs.session-token=${token}`
    const fetchApi = (route: string, init?: RequestInit) => fetch(`${base}${route}`, { ...init, redirect: "manual", headers: { Cookie: cookie, ...init?.headers } })
    const privateRoutes = ["/api/dashboard/stats", "/api/inventory", "/api/organization", "/api/pos/products"]
    for (const route of privateRoutes) assert.equal((await fetchApi(route)).status, 200, route)
    assert.equal((await fetch(`${base}/api/public/${location.menuToken}`)).status, 200)
    await db.organization.update({ where: { id: org.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } })
    // Original cookie still claims a future deadline: backend must consult current DB.
    for (const route of privateRoutes) {
      const response = await fetchApi(route)
      assert.equal(response.status, 403, route)
      assert.equal((await response.json()).code, "SUBSCRIPTION_EXPIRED")
    }
    assert.equal((await fetchApi("/api/org/status").then(r => r.json())).status, "EXPIRED")
    assert.equal((await fetch(`${base}/api/public/${location.menuToken}`)).status, 404)
    assert.equal((await fetch(`${base}/api/public/${location.menuToken}/session?sessionId=${randomUUID()}`)).status, 403)
    assert.equal((await fetch(`${base}/api/public/${location.menuToken}/order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 403)
    const expiredCookie = await encode({ secret, salt: "authjs.session-token", token: {
      id: user.id, email: user.email, organizationId: org.id, role: "OWNER", orgStatus: "ACTIVE", orgPlan: "PRO",
      orgExpiresAt: new Date(Date.now() - 1000).toISOString(), identityCheckedAt: Math.floor(Date.now() / 1000),
    } })
    const page = await fetch(`${base}/dashboard/owner`, { redirect: "manual", headers: { Cookie: `authjs.session-token=${expiredCookie}` } })
    assert.equal(page.status, 307)
    assert.equal(new URL(page.headers.get("location")!, base).pathname, "/suspended")
    const session = await fetch(`${base}/api/auth/session`, { headers: { Cookie: `authjs.session-token=${expiredCookie}` } }).then(r => r.json())
    assert.equal(session.user.orgStatus, "EXPIRED")
    await db.organization.update({ where: { id: org.id }, data: { status: "ACTIVE", trialEndsAt: future } })
    assert.equal((await fetchApi("/api/dashboard/stats")).status, 200)
    assert.equal((await fetchApi("/api/org/status").then(r => r.json())).status, "ACTIVE")
    assert.equal((await fetch(`${base}/api/public/${location.menuToken}`)).status, 200)
    // Manual blocks also close API access, regardless of the future date in the cookie.
    for (const status of ["PENDING", "SUSPENDED", "CANCELLED", "EXPIRED"] as const) {
      await db.organization.update({ where: { id: org.id }, data: { status } })
      assert.equal((await fetchApi("/api/dashboard/stats")).status, 403, status)
    }
  } finally {
    if (organizationId) await db.organization.delete({ where: { id: organizationId } })
    if (userId) await db.user.delete({ where: { id: userId } })
    await db.$disconnect()
  }
})
