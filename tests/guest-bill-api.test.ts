// Run against the local dev server with DOTENV_CONFIG_PATH=.env.local.
import "dotenv/config"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { guestBillKey } from "../src/lib/guest-bill"

test("Budi dan Arman satu meja: nama terkunci, riwayat terpisah, tagihan tetap ada saat browser berganti", { timeout: 60_000 }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })
  const marker = randomUUID()
  let organizationId: string | undefined
  let cashierId: string | undefined
  try {
    const org = await db.organization.create({ data: { name: "Guest bill API test", slug: `guest-bill-${marker}` } })
    organizationId = org.id
    const cashier = await db.user.create({ data: { email: `${marker}@guest-bill-test.invalid`, name: "Test cashier" } })
    cashierId = cashier.id
    const location = await db.location.create({ data: { organizationId: org.id, name: "Test outlet", type: "OUTLET" } })
    const otherLocation = await db.location.create({ data: { organizationId: org.id, name: "Other outlet", type: "OUTLET" } })
    await db.pOSShift.create({ data: { organizationId: org.id, locationId: location.id, cashierId: cashier.id, shiftNumber: "TEST-1" } })
    const menu = await db.inventoryItem.create({ data: { organizationId: org.id, name: "Test burger", isMenuItem: true, isTrackable: false, sellPrice: 30_000 } })
    const table = await db.table.create({ data: { organizationId: org.id, locationId: location.id, name: "Meja 1" } })
    const base = `${process.env.TEST_APP_URL || "http://localhost:3000"}/api/public/${location.menuToken}`
    // The menu must already be visible in HTML, before any browser JS/API fetch.
    const html = await (await fetch(`${process.env.TEST_APP_URL || "http://localhost:3000"}/t/${location.menuToken}?meja=${table.tableToken}`)).text()
    assert.match(html, />Test burger<\/p>/)
    assert.match(html, /Meja 1/)
    assert.ok(!html.includes('aria-label="Memuat menu"'))
    const budi = randomUUID()
    const arman = randomUUID()
    const post = async (session: string, name: string, table = "1") => {
      const response = await fetch(`${base}/order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestSessionId: session, customerName: name, tableNumber: table, items: [{ menuItemId: menu.id, qty: 1 }] }) })
      const text = await response.text()
      assert.ok(text, `Empty HTTP ${response.status} from order API`)
      return { status: response.status, data: JSON.parse(text) }
    }
    const session = async (id: string, url = base) => {
      const response = await fetch(`${url}/session?sessionId=${id}&table=1`)
      assert.equal(response.status, 200)
      return response.json()
    }
    const first = await post(budi, "Budi")
    assert.equal(first.status, 201, JSON.stringify(first.data))
    // Even direct API tampering cannot rename an established bill.
    const extra = await post(budi, "Arman")
    assert.equal(extra.status, 201)
    assert.equal(extra.data.customerName, "Budi")
    assert.equal((await post(budi, "Budi", "2")).status, 409)
    const newGuest = await post(arman, "Arman")
    assert.equal(newGuest.status, 201)
    assert.equal(newGuest.data.customerName, "Arman")
    const own = await session(budi)
    assert.equal(own.orders.length, 2)
    assert.ok(own.orders.every((order: { customerName: string; isMine: boolean }) => order.customerName === "Budi" && order.isMine))
    assert.equal(own.myTotal, 60_000)
    assert.equal((await session(arman)).orders.length, 1)
    assert.deepEqual((await session(randomUUID())).orders, []) // cleared storage/new browser
    assert.deepEqual((await session(budi, `${base.replace(location.menuToken, otherLocation.menuToken)}`)).orders, [])
    assert.equal(await db.pOSOrder.count({ where: { locationId: location.id, guestSessionId: budi } }), 2)
    const open = await db.pOSOrder.findMany({ where: { locationId: location.id } })
    assert.equal(new Set(open.map(guestBillKey)).size, 2)
    // Arman can settle first without changing Budi's unpaid session.
    await db.pOSOrder.update({ where: { id: newGuest.data.orderId }, data: { status: "PAID" } })
    assert.equal((await session(budi)).sessionStatus, "OPEN")
    assert.equal((await post(arman, "Arman")).status, 409)
    assert.equal((await post(randomUUID(), "Pelanggan berikutnya")).status, 201)
    assert.equal((await post("1", "Budi")).status, 400)
    // Parallel first requests share one immutable identity as well.
    const concurrentId = randomUUID()
    const concurrent = await Promise.all([post(concurrentId, "Pertama"), post(concurrentId, "Kedua")])
    assert.ok(concurrent.every(result => result.status === 201), JSON.stringify(concurrent))
    assert.equal(new Set((await session(concurrentId)).orders.map((order: { customerName: string }) => order.customerName)).size, 1)
  } finally {
    if (organizationId) await db.organization.delete({ where: { id: organizationId } })
    if (cashierId) await db.user.delete({ where: { id: cashierId } })
    await db.$disconnect()
    await pool.end()
  }
})
