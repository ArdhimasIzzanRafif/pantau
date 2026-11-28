// Run only against a disposable local database and its local application server.
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { encode } from "next-auth/jwt"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

test("penerimaan dan pembayaran tetap utuh saat database memerlukan lebih dari lima detik", { timeout: 120_000 }, async (t) => {
  const database = new URL(process.env.DATABASE_URL!)
  const base = new URL(process.env.TEST_APP_URL!)
  assert.ok(["127.0.0.1", "localhost"].includes(database.hostname))
  assert.equal(database.pathname, "/pantau_confirmation_test")
  assert.ok(["127.0.0.1", "localhost"].includes(base.hostname))
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: database.toString() }) })
  const baseline = process.env.EXPECT_TRANSACTION_TIMEOUT === "true"
  try {
    const org = await db.organization.create({ data: { name: "Confirmation QA", slug: `confirmation-${randomUUID()}`, status: "ACTIVE", plan: "PRO" } })
    const user = await db.user.create({ data: { name: "Owner QA", email: `${randomUUID()}@confirmation.invalid` } })
    await db.organizationUser.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } })
    const warehouse = await db.location.create({ data: { organizationId: org.id, name: "Gudang QA", type: "WAREHOUSE" } })
    const outlet = await db.location.create({ data: { organizationId: org.id, name: "Outlet QA", type: "OUTLET" } })
    const beef = await db.inventoryItem.create({ data: { organizationId: org.id, name: "Beef", unit: "pcs", costPrice: 10_000 } })
    const burger = await db.inventoryItem.create({ data: { organizationId: org.id, name: "Burger Tes", isMenuItem: true, sellPrice: 20_000 } })
    await db.recipeItem.create({ data: { parentItemId: burger.id, childItemId: beef.id, quantity: 1 } })
    const shift = await db.pOSShift.create({ data: { organizationId: org.id, locationId: outlet.id, cashierId: user.id, shiftNumber: "QA-1" } })
    const jwt = await encode({ secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", token: {
      id: user.id, email: user.email, organizationId: org.id, role: "OWNER", orgStatus: "ACTIVE", orgPlan: "PRO", orgExpiresAt: null,
      locationIds: [], identityCheckedAt: Math.floor(Date.now() / 1000),
    } })
    const post = async (path: string, body: unknown) => {
      const response = await fetch(new URL(path, base), { method: "POST", headers: { Cookie: `authjs.session-token=${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const text = await response.text()
      let data: Record<string, unknown>
      try { data = JSON.parse(text) } catch { data = { error: text.slice(0, 200) } }
      return { status: response.status, data }
    }
    // Real PostgreSQL delay inside each transaction reproduces remote DB latency.
    await db.$executeRawUnsafe(`CREATE FUNCTION qa_slow_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(5.5); RETURN NEW; END $$`)
    await db.$executeRawUnsafe(`CREATE TRIGGER qa_slow_receipt BEFORE INSERT ON "GoodsReceipt" FOR EACH ROW EXECUTE FUNCTION qa_slow_confirmation()`)
    await db.$executeRawUnsafe(`CREATE TRIGGER qa_slow_payment BEFORE INSERT ON "POSPayment" FOR EACH ROW EXECUTE FUNCTION qa_slow_confirmation()`)

    await t.test("barang masuk 10 Beef tersimpan sekali dan harga/HPP tetap benar", async () => {
      const body = { locationId: warehouse.id, clientRequestId: randomUUID(), imageUrl: "/uploads/qa-only.jpg", items: [{ itemId: beef.id, inputQuantity: 10, inputUnit: "base", inputUnitCost: 10_000 }] }
      const result = await post("/api/goods-receipts", body)
      assert.equal(result.status, baseline ? 500 : 201, JSON.stringify(result))
      assert.equal(await db.goodsReceipt.count({ where: { organizationId: org.id } }), baseline ? 0 : 1)
      if (baseline) return
      assert.equal(Number((await db.stockBalance.findUniqueOrThrow({ where: { itemId_locationId: { itemId: beef.id, locationId: warehouse.id } } })).quantity), 10)
      assert.equal(Number((await db.inventoryItem.findUniqueOrThrow({ where: { id: beef.id } })).costPrice), 10_000)
      const repeat = await post("/api/goods-receipts", body)
      assert.equal(repeat.status, 200, JSON.stringify(repeat))
      assert.equal(repeat.data.id, result.data.id)
      assert.equal(await db.stockMovement.count({ where: { referenceId: String(result.data.id), type: "GOODS_IN" } }), 1)
    })
    const directBody = { locationId: outlet.id, shiftId: shift.id, items: [{ menuItemId: burger.id, qty: 1 }], payment: { method: "CASH", amount: 20_000 } }
    await t.test("bayar langsung dari stok nol berhasil dan mencatat minus, pembayaran, HPP, serta shift", async () => {
      const result = await post("/api/pos/orders", directBody)
      assert.equal(result.status, baseline ? 500 : 201, JSON.stringify(result))
      assert.equal(await db.pOSOrder.count({ where: { organizationId: org.id } }), baseline ? 0 : 1)
      if (baseline) return
      assert.equal(result.data.status, "PAID")
      assert.equal(Number(result.data.cogsAmount), 10_000)
      assert.equal(Number((await db.stockBalance.findUniqueOrThrow({ where: { itemId_locationId: { itemId: beef.id, locationId: outlet.id } } })).quantity), -1)
      assert.equal(await db.pOSPayment.count({ where: { orderId: String(result.data.id) } }), 1)
      const savedShift = await db.pOSShift.findUniqueOrThrow({ where: { id: shift.id } })
      assert.equal(savedShift.totalOrders, 1)
      assert.equal(Number(savedShift.totalSales), 20_000)
    })
    const held = (sessionId?: string) => db.pOSOrder.create({ data: {
      organizationId: org.id, locationId: outlet.id, cashierId: user.id, shiftId: shift.id,
      orderNumber: `QA-${randomUUID()}`, status: "HELD", guestSessionId: sessionId, subtotal: 20_000, total: 20_000,
      items: { create: { menuItemId: burger.id, name: burger.name, price: 20_000, qty: 1, subtotal: 20_000 } },
    } })
    await t.test("tagihan ditahan bisa dibayar dan pembayaran ulang tidak menggandakan stok", { skip: baseline }, async () => {
      const order = await held()
      const result = await post(`/api/pos/orders/${order.id}/pay`, { payment: directBody.payment })
      assert.equal(result.status, 200, JSON.stringify(result))
      assert.equal((await post(`/api/pos/orders/${order.id}/pay`, { payment: directBody.payment })).status, 404)
      assert.equal(await db.pOSPayment.count({ where: { orderId: order.id } }), 1)
      assert.equal(await db.stockMovement.count({ where: { referenceId: order.id, type: "POS_SALE" } }), 1)
    })
    await t.test("dua tagihan satu pelanggan dibayar bersama secara utuh", { skip: baseline }, async () => {
      const session = randomUUID()
      const orders = [await held(session), await held(session)]
      const result = await post("/api/pos/orders/pay-batch", { orderIds: orders.map(o => o.id), payment: { method: "CASH", amount: 40_000 }, shiftId: shift.id })
      assert.equal(result.status, 200, JSON.stringify(result))
      assert.equal(result.data.paidCount, 2)
      assert.equal(await db.pOSOrder.count({ where: { id: { in: orders.map(o => o.id) }, status: "PAID" } }), 2)
      assert.equal(await db.pOSPayment.count({ where: { orderId: { in: orders.map(o => o.id) } } }), 1)
    })
    await t.test("uang kurang membatalkan order, nomor order, stok, pembayaran, dan shift", { skip: baseline }, async () => {
      const before = await db.pOSShift.findUniqueOrThrow({ where: { id: shift.id } })
      const counter = (await db.organization.findUniqueOrThrow({ where: { id: org.id } })).orderCounter
      const count = await db.pOSOrder.count({ where: { organizationId: org.id } })
      assert.equal((await post("/api/pos/orders", { ...directBody, payment: { method: "CASH", amount: 1 } })).status, 422)
      assert.equal(await db.pOSOrder.count({ where: { organizationId: org.id } }), count)
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: org.id } })).orderCounter, counter)
      const after = await db.pOSShift.findUniqueOrThrow({ where: { id: shift.id } })
      assert.equal(after.totalOrders, before.totalOrders)
      assert.equal(Number(after.totalSales), Number(before.totalSales))
    })
  } finally {
    await db.$disconnect()
  }
})
