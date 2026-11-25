import "dotenv/config"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { encode } from "next-auth/jwt"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { deleteOrganizationData } from "../src/lib/delete-organization"

test("saldo awal bukan riwayat transaksi; saldo dan paginasi kartu stok tetap benar", { timeout: 60_000 }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })
  let organizationId: string | undefined
  let userId: string | undefined
  try {
    const marker = randomUUID()
    const org = await db.organization.create({ data: { name: "Stock card test", slug: `stock-card-${marker}`, status: "ACTIVE", plan: "PRO" } })
    organizationId = org.id
    const user = await db.user.create({ data: { name: "Owner test", email: `${marker}@stock-card.invalid` } })
    userId = user.id
    await db.organizationUser.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } })
    const location = await db.location.create({ data: { organizationId: org.id, name: "Outlet", type: "OUTLET" } })
    const item = await db.inventoryItem.create({ data: { organizationId: org.id, name: "Beef test", unit: "kg" } })
    const token = await encode({ secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET!, salt: "authjs.session-token", token: {
      id: user.id, email: user.email, organizationId: org.id, role: "OWNER", orgStatus: "ACTIVE", orgPlan: "PRO", identityCheckedAt: Math.floor(Date.now() / 1000),
    } })
    const read = async (extra = "") => {
      const response = await fetch(`${process.env.TEST_APP_URL || "http://localhost:3000"}/api/stock-movements?from=2026-11-01&to=2026-11-30&locationId=${location.id}${extra}`, { headers: { Cookie: `authjs.session-token=${token}` } })
      assert.equal(response.status, 200)
      return response.json()
    }
    const scope = { organizationId: org.id, itemId: item.id, locationId: location.id }
    await db.stockMovement.create({ data: { ...scope, type: "INITIAL_STOCK", quantity: 10, effectiveAt: new Date("2026-11-02T00:00:00+07:00") } })
    assert.equal((await read()).total, 0)
    const initial = await read(`&itemId=${item.id}`)
    assert.deepEqual(initial.summary, { opening: 10, incoming: 0, outgoing: 0, closing: 10 })
    assert.equal(initial.movements.length, 0)
    // A second location's opening can fall between transactions in an all-location card.
    // Exercise the same chronology here to ensure hidden rows still affect running balances.
    await db.stockMovement.create({ data: { ...scope, type: "INITIAL_STOCK", quantity: 5, effectiveAt: new Date("2026-11-10T00:00:30+07:00") } })
    await db.stockMovement.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ ...scope, type: "POS_SALE" as const, quantity: -0.05, effectiveAt: new Date(new Date("2026-11-10T00:00:00+07:00").getTime() + i * 1000) })) })
    const first = await read(`&itemId=${item.id}`)
    assert.deepEqual(first.summary, { opening: 15, incoming: 0, outgoing: 2.75, closing: 12.25 })
    assert.equal(first.total, 55)
    assert.equal(first.movements.length, 50)
    assert.equal(first.movements[0].runningBalance, 12.25)
    assert.ok(first.movements.every((row: { type: string }) => row.type !== "INITIAL_STOCK"))
    const second = await read(`&itemId=${item.id}&page=2`)
    assert.equal(second.movements.length, 5)
    assert.ok(Math.abs(second.movements[0].runningBalance - 9.75) < 1e-9)
    assert.equal(new Set([...first.movements, ...second.movements].map((row: { id: string }) => row.id)).size, 55)
    assert.equal((await read()).total, 55)
  } finally {
    try {
      if (organizationId) await deleteOrganizationData(db, organizationId)
      if (userId) await db.user.delete({ where: { id: userId } })
    } finally {
      await db.$disconnect()
      await pool.end()
    }
  }
})
