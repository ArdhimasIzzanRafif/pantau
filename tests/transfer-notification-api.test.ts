import "dotenv/config"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { encode } from "next-auth/jwt"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { deleteOrganizationData } from "../src/lib/delete-organization"

test("transfer memakai satu notifikasi terbaru; stok menipis tidak tenggelam dan duplikat ditutup bersama", { timeout: 60_000 }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })
  let organizationId: string | undefined
  let userId: string | undefined
  try {
    const marker = randomUUID()
    const org = await db.organization.create({ data: { name: "Notification test", slug: `notification-test-${marker}`, status: "ACTIVE", plan: "PRO" } })
    organizationId = org.id
    const user = await db.user.create({ data: { name: "Owner", email: `${marker}@notification-test.invalid` } })
    userId = user.id
    await db.organizationUser.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } })
    const from = await db.location.create({ data: { organizationId: org.id, name: "Gudang", type: "WAREHOUSE" } })
    const to = await db.location.create({ data: { organizationId: org.id, name: "Outlet", type: "OUTLET" } })
    const item = await db.inventoryItem.create({ data: { organizationId: org.id, name: "Bun test", unit: "pcs", costPrice: 750 } })
    const token = await encode({ secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET!, salt: "authjs.session-token", token: {
      id: user.id, email: user.email, organizationId: org.id, role: "OWNER", orgStatus: "ACTIVE", orgPlan: "PRO", identityCheckedAt: Math.floor(Date.now() / 1000),
    } })
    const base = process.env.TEST_APP_URL || "http://localhost:3000"
    const headers = { Cookie: `authjs.session-token=${token}`, "Content-Type": "application/json" }
    const makeSent = async () => {
      const transfer = await db.stockTransfer.create({ data: { organizationId: org.id, fromLocationId: from.id, toLocationId: to.id, status: "SENT", sentAt: new Date(), items: { create: { itemId: item.id, quantity: 2 } } }, include: { items: true } })
      const notification = await db.alert.create({ data: { organizationId: org.id, referenceId: transfer.id, type: "TRANSFER_SENT", severity: "INFO", title: "Transfer Dikirim", message: "Dua bun dikirim" } })
      await db.auditLog.create({ data: { organizationId: org.id, entity: "StockTransfer", entityId: transfer.id, action: "DISPATCH_TRANSFER", userId: user.id } })
      return { transfer, notification }
    }
    const complete = await makeSent()
    const received = await fetch(`${base}/api/transfers/${complete.transfer.id}/confirm`, { method: "POST", headers, body: JSON.stringify({ action: "receive" }) })
    assert.equal(received.status, 200, await received.text())
    const saved = await db.alert.findMany({ where: { organizationId: org.id, referenceId: complete.transfer.id } })
    assert.equal(saved.length, 1)
    assert.equal(saved[0].id, complete.notification.id)
    assert.equal(saved[0].type, "TRANSFER_COMPLETED")
    assert.match(saved[0].message, /orang yang sama/)
    assert.equal((await fetch(`${base}/api/transfers/${complete.transfer.id}/confirm`, { method: "POST", headers, body: JSON.stringify({ action: "receive" }) })).status, 409)

    const shortage = await makeSent()
    const shortResponse = await fetch(`${base}/api/transfers/${shortage.transfer.id}/confirm`, { method: "POST", headers, body: JSON.stringify({ action: "receive", notes: "Satu tidak tiba", receivedItems: [{ id: shortage.transfer.items[0].id, receivedQty: 1, damagedQty: 0 }] }) })
    assert.equal(shortResponse.status, 200, await shortResponse.text())
    const shortAlerts = await db.alert.findMany({ where: { organizationId: org.id, referenceId: shortage.transfer.id } })
    assert.equal(shortAlerts.length, 1)
    assert.equal(shortAlerts[0].severity, "CRITICAL")
    assert.equal(shortAlerts[0].type, "STOCK_SHORTAGE")

    const old = new Date(Date.now() - 86_400_000)
    await db.inventoryLocationSetting.create({ data: { organizationId: org.id, itemId: item.id, locationId: to.id, minStock: 5 } })
    const stockAlert = await db.alert.create({ data: { organizationId: org.id, itemId: item.id, locationId: to.id, type: "LOW_STOCK", severity: "WARNING", title: "Bun menipis", message: "Ambang stok", createdAt: old } })
    // More than the old query limit of 100 routine updates must not hide stock/critical alerts.
    await db.alert.createMany({ data: Array.from({ length: 110 }, (_, i) => ({ organizationId: org.id, type: "GOODS_RECEIVED" as const, severity: "INFO" as const, title: `Info ${i}`, message: "Aktivitas rutin" })) })
    const list = await (await fetch(`${base}/api/alerts`, { headers })).json() as Array<{ id: string; type: string; referenceId: string }>
    assert.equal(list[0].id, stockAlert.id)
    assert.ok(list.some(alert => alert.id === shortAlerts[0].id))

    // Legacy duplicates are one card and resolving the card closes all stages.
    await db.alert.deleteMany({ where: { organizationId: org.id, type: "GOODS_RECEIVED" } })
    const duplicate = await db.alert.create({ data: { organizationId: org.id, referenceId: complete.transfer.id, type: "TRANSFER_COMPLETED", severity: "INFO", title: "Dikirim & diterima oleh orang yang sama", message: "Cocokkan foto" } })
    await db.alert.create({ data: { organizationId: org.id, referenceId: complete.transfer.id, type: "TRANSFER_SENT", severity: "INFO", title: "Transfer Dikirim", message: "Info lama" } })
    const compact = await (await fetch(`${base}/api/alerts`, { headers })).json() as Array<{ id: string; referenceId: string }>
    assert.equal(compact.filter(alert => alert.referenceId === complete.transfer.id).length, 1)
    assert.equal((await fetch(`${base}/api/alerts`, { method: "PATCH", headers, body: JSON.stringify({ id: duplicate.id }) })).status, 200)
    assert.equal(await db.alert.count({ where: { organizationId: org.id, referenceId: complete.transfer.id, isResolved: false } }), 0)
    const resolved = await (await fetch(`${base}/api/alerts?resolved=true`, { headers })).json() as Array<{ referenceId: string }>
    assert.equal(resolved.filter(alert => alert.referenceId === complete.transfer.id).length, 1)
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
