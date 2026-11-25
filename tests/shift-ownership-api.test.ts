import "dotenv/config"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { encode } from "next-auth/jwt"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

test("kasir dan owner dapat membuka shift bersamaan tetapi hanya menutup shift sendiri", { timeout: 60_000 }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })
  const marker = randomUUID()
  const userIds: string[] = []
  let organizationId: string | undefined
  try {
    const org = await db.organization.create({ data: { name: "Shift ownership test", slug: `shift-ownership-${marker}`, status: "ACTIVE", plan: "PRO" } })
    organizationId = org.id
    const outlet = await db.location.create({ data: { organizationId: org.id, name: "Outlet QA", type: "OUTLET" } })
    const credentials: Record<string, string> = {}
    const users: Record<string, string> = {}
    for (const role of ["OWNER", "KASIR", "SUPERVISOR", "ADMIN_GUDANG"] as const) {
      const user = await db.user.create({ data: { name: role === "OWNER" ? "Owner QA" : "Bayu QA", email: `${role}-${marker}@shift-test.invalid` } })
      userIds.push(user.id)
      users[role] = user.id
      await db.organizationUser.create({ data: { userId: user.id, organizationId: org.id, role, assignedLocations: { create: { locationId: outlet.id } } } })
      const jwt = await encode({
        secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET!, salt: "authjs.session-token",
        token: { id: user.id, email: user.email, organizationId: org.id, role, orgStatus: "ACTIVE", orgPlan: "PRO", locationIds: [outlet.id], identityCheckedAt: Math.floor(Date.now() / 1000) },
      })
      credentials[role] = `authjs.session-token=${jwt}`
    }
    const base = `${process.env.TEST_APP_URL || "http://localhost:3000"}/api/pos/shifts`
    const request = async (role: string, path: string, method = "GET", body?: unknown) => {
      const response = await fetch(`${base}${path}`, { method, headers: { Cookie: credentials[role], "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json() }
    }
    const bayu = await request("KASIR", "", "POST", { locationId: outlet.id, openingBalance: 100_000 })
    assert.equal(bayu.status, 201, JSON.stringify(bayu.data))
    const owner = await request("OWNER", "", "POST", { locationId: outlet.id, openingBalance: 200_000 })
    assert.equal(owner.status, 201, JSON.stringify(owner.data))
    assert.equal((await request("KASIR", "", "POST", { locationId: outlet.id })).status, 409)
    const ownerAttemptsBayu = await request("OWNER", `/${bayu.data.id}`, "PATCH", { closingBalance: 1, notes: "Wrong actor" })
    assert.equal(ownerAttemptsBayu.status, 403)
    assert.match(ownerAttemptsBayu.data.error, /sendiri/)
    assert.equal((await request("KASIR", `/${owner.data.id}`, "PATCH", { closingBalance: 1 })).status, 403)
    assert.equal(await db.pOSShift.count({ where: { organizationId: org.id, status: "OPEN" } }), 2)
    const list = await request("OWNER", `?locationId=${outlet.id}`)
    assert.equal(list.data.items.filter((shift: { cashierId: string }) => shift.cashierId === users.OWNER).length, 1)
    const closedBayu = await request("KASIR", `/${bayu.data.id}`, "PATCH", { closingBalance: 90_000 })
    assert.equal(closedBayu.status, 200)
    assert.equal(closedBayu.data.status, "CLOSED")
    assert.equal(closedBayu.data.expectedCash, null)
    assert.equal(Number((await db.pOSShift.findUniqueOrThrow({ where: { id: bayu.data.id } })).expectedCash), 100_000)
    for (const role of ["OWNER", "SUPERVISOR", "KASIR", "ADMIN_GUDANG"]) {
      const canReview = role === "OWNER" || role === "SUPERVISOR"
      const detail = await request(role, `/${bayu.data.id}`)
      assert.equal(detail.status, 200)
      assert.equal(detail.data.expectedCash, canReview ? 100_000 : null, `detail: ${role}`)
      const history = await request(role, `?locationId=${outlet.id}&status=CLOSED`)
      assert.equal(history.status, 200)
      assert.equal(history.data.items.find((shift: { id: string }) => shift.id === bayu.data.id).expectedCash, canReview ? 100_000 : null, `list: ${role}`)
    }
    assert.equal((await db.pOSShift.findUniqueOrThrow({ where: { id: owner.data.id } })).status, "OPEN")
    assert.equal((await request("OWNER", `/${owner.data.id}`, "PATCH", { closingBalance: 200_000 })).status, 200)
    assert.equal(await db.pOSShift.count({ where: { organizationId: org.id, status: "OPEN" } }), 0)
  } finally {
    if (organizationId) await db.organization.delete({ where: { id: organizationId } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.$disconnect()
    await pool.end()
  }
})
