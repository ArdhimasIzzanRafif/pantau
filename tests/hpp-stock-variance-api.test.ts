import "dotenv/config"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { encode } from "next-auth/jwt"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import ExcelJS from "exceljs"
import type { HppStockVarianceReport } from "../src/lib/hpp-stock-variance"
import { deleteOrganizationData } from "../src/lib/delete-organization"

test("HPP POS resep + modifier, filter, snapshot, status, dan Excel memakai angka yang sama", { timeout: 90_000 }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })
  const marker = randomUUID()
  const users: string[] = []
  let organizationId: string | undefined
  const base = process.env.TEST_APP_URL || "http://localhost:3000"
  try {
    const org = await db.organization.create({ data: { name: "HPP research API test", slug: `hpp-test-${marker}`, status: "ACTIVE", plan: "PRO" } })
    organizationId = org.id
    const outlet = await db.location.create({ data: { organizationId: org.id, name: "Outlet uji HPP", type: "OUTLET" } })
    const other = await db.location.create({ data: { organizationId: org.id, name: "Outlet belum opname", type: "OUTLET" } })
    const cookies: Record<string, string> = {}
    for (const role of ["OWNER", "SUPERVISOR"] as const) {
      const user = await db.user.create({ data: { name: role, email: `${role}-${marker}@hpp-test.invalid` } })
      users.push(user.id)
      await db.organizationUser.create({ data: { userId: user.id, organizationId: org.id, role } })
      const token = await encode({ secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET!, salt: "authjs.session-token", token: {
        id: user.id, email: user.email, organizationId: org.id, role, orgStatus: "ACTIVE", orgPlan: "PRO", locationIds: [outlet.id, other.id], identityCheckedAt: Math.floor(Date.now() / 1000),
      } })
      cookies[role] = `authjs.session-token=${token}`
    }
    const headers = { Cookie: cookies.OWNER, "Content-Type": "application/json" }
    const beef = await db.inventoryItem.create({ data: { organizationId: org.id, name: "Beef", unit: "kg", costPrice: 200_000, isTrackable: true } })
    const bun = await db.inventoryItem.create({ data: { organizationId: org.id, name: "Bun", unit: "pcs", costPrice: 750, isTrackable: true } })
    const menu = await db.inventoryItem.create({ data: { organizationId: org.id, name: "Burger uji", isMenuItem: true, sellPrice: 30_000, isTrackable: false } })
    await db.recipeItem.createMany({ data: [{ parentItemId: menu.id, childItemId: beef.id, quantity: 0.05 }, { parentItemId: menu.id, childItemId: bun.id, quantity: 1 }] })
    await db.stockBatch.create({ data: { organizationId: org.id, locationId: outlet.id, itemId: beef.id, batchNumber: "BEEF-TEST", initialQuantity: 20, quantity: 20, costPrice: 150_000 } })
    await db.stockBalance.createMany({ data: [{ organizationId: org.id, locationId: outlet.id, itemId: beef.id, quantity: 20 }, { organizationId: org.id, locationId: outlet.id, itemId: bun.id, quantity: 200 }] })
    const group = await db.menuModifierGroup.create({ data: { organizationId: org.id, name: "Extra topping", options: { create: { name: "Extra Beef", price: 10_000, recipeItems: { create: { itemId: beef.id, quantity: 0.05 } } } } }, include: { options: true } })
    await db.inventoryItemModifier.create({ data: { itemId: menu.id, groupId: group.id } })
    const paid: string[] = []
    for (const [qty, extra, expected] of [[100, false, 825_000], [1, true, 15_750]] as const) {
      const response = await fetch(`${base}/api/pos/orders`, { method: "POST", headers, body: JSON.stringify({ locationId: outlet.id, items: [{ menuItemId: menu.id, qty, modifiers: extra ? [{ optionId: group.options[0].id }] : [] }], payment: { method: "CASH", amount: 4_000_000 } }) })
      const data = await response.json()
      assert.equal(response.status, 201, JSON.stringify(data))
      assert.equal(Number(data.cogsAmount), expected)
      assert.equal(data.cogsComplete, true)
      paid.push(data.id)
      await db.pOSOrder.update({ where: { id: data.id }, data: { paidAt: new Date("2026-11-15T12:00:00+07:00") } })
    }
    const at = new Date("2026-11-15T21:00:00+07:00")
    const opname = await db.stockOpname.create({ data: { organizationId: org.id, locationId: outlet.id, periodStart: new Date("2026-11-15T00:00:00+07:00"), periodEnd: at, status: "REVIEWED", items: { create: [
      { itemId: beef.id, systemQty: 5, physicalQty: 4.9, difference: -0.1, unitCostSnapshot: 150_000, absoluteVarianceValue: 15_000 },
      { itemId: bun.id, systemQty: 100, physicalQty: 102, difference: 2, unitCostSnapshot: 750, absoluteVarianceValue: 1_500 },
    ] } } })
    await db.stockOpname.create({ data: { organizationId: org.id, locationId: outlet.id, periodStart: at, periodEnd: new Date("2026-11-15T22:00:00+07:00"), status: "REVIEWED", items: { create: { itemId: beef.id, systemQty: 4.9, physicalQty: 4.9, difference: 0, unitCostSnapshot: 150_000, absoluteVarianceValue: 0 } } } })
    await db.stockAdjustment.create({ data: { organizationId: org.id, locationId: outlet.id, itemId: beef.id, type: "WASTE", quantity: 0.05, unitCost: 150_000, totalCost: 7_500, note: "Isolated test", createdAt: at } })
    // A draft and an unpaid order must not inflate the report.
    await db.stockOpname.create({ data: { organizationId: org.id, locationId: outlet.id, periodStart: at, periodEnd: at, status: "DRAFT", items: { create: { itemId: beef.id, systemQty: 50, physicalQty: 0, difference: -50, unitCostSnapshot: 150_000 } } } })
    await db.pOSOrder.create({ data: { organizationId: org.id, locationId: outlet.id, orderNumber: "TEST-UNPAID", status: "HELD", subtotal: 1_000_000, total: 1_000_000, cogsAmount: 999_999, cogsComplete: true } })
    const params = new URLSearchParams({ from: "2026-11-15", to: "2026-11-15", locationId: outlet.id })
    const reportUrl = `${base}/api/reports/hpp-stock-variance?${params}`
    const read = async () => {
      const response = await fetch(reportUrl, { headers })
      assert.equal(response.status, 200)
      return await response.json() as HppStockVarianceReport
    }
    const report = await read()
    assert.equal(report.summary.cogs, 840_750)
    assert.equal(report.summary.revenue, 3_040_000)
    assert.equal(report.summary.stockVariance, 16_500)
    assert.equal(report.summary.knownLosses, 7_500)
    assert.equal(report.summary.opnameCount, 2)
    assert.equal(report.summary.paidOrders, 2)
    assert.equal(report.summary.calculationStatus, "CALCULATED")
    assert.equal(report.locations.length, 1)
    await db.inventoryItem.updateMany({ where: { id: { in: [beef.id, bun.id] } }, data: { costPrice: 999_999 } })
    assert.deepEqual(await read(), report, "master price changes must not rewrite history")
    const exportResponse = await fetch(`${reportUrl}&format=xlsx`, { headers })
    assert.equal(exportResponse.status, 200)
    assert.match(exportResponse.headers.get("content-type")!, /spreadsheetml/)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0])
    const sheet = workbook.worksheets[0]
    assert.equal(sheet.getCell("C2").value, "Outlet uji HPP")
    assert.equal(sheet.getCell("D2").value, report.summary.revenue)
    assert.equal(sheet.getCell("E2").value, report.summary.cogs)
    assert.equal(sheet.getCell("G2").value, report.summary.stockVariance)
    assert.equal(sheet.getCell("J2").value, Number(report.summary.variancePercentage!.toFixed(2)))
    assert.equal(sheet.getCell("M2").value, 2)
    assert.equal(sheet.getCell("R2").value, "Dapat dihitung")
    assert.equal((await fetch(reportUrl, { headers: { Cookie: cookies.SUPERVISOR } })).status, 403)
    assert.equal((await fetch(`${base}/api/reports/hpp-stock-variance?${new URLSearchParams({ ...Object.fromEntries(params), locationId: "foreign-location" })}`, { headers })).status, 404)
    const all = await (await fetch(`${base}/api/reports/hpp-stock-variance?from=2026-11-15&to=2026-11-15`, { headers })).json() as HppStockVarianceReport
    assert.equal(all.summary.variancePercentage, null)
    const empty = await (await fetch(`${base}/api/reports/hpp-stock-variance?from=2026-11-14&to=2026-11-14&locationId=${outlet.id}`, { headers })).json() as HppStockVarianceReport
    assert.equal(empty.summary.paidOrders, 0)
    assert.equal(empty.summary.opnameCount, 0)
    assert.equal(empty.summary.variancePercentage, null)
    await db.pOSOrder.update({ where: { id: paid[0] }, data: { cogsComplete: false } })
    assert.equal((await read()).summary.variancePercentage, null)
    await db.pOSOrder.update({ where: { id: paid[0] }, data: { cogsComplete: true } })
    await db.stockOpnameItem.updateMany({ where: { opnameId: opname.id, itemId: beef.id }, data: { unitCostSnapshot: null, absoluteVarianceValue: null } })
    const incomplete = await read()
    assert.equal(incomplete.summary.unvaluedVarianceItems, 1)
    assert.equal(incomplete.summary.stockVariance, 1_500, "missing snapshot must not use the current master price")
    assert.equal(incomplete.summary.variancePercentage, null)
  } finally {
    try {
      if (organizationId) await deleteOrganizationData(db, organizationId)
      await db.user.deleteMany({ where: { id: { in: users } } })
    } finally {
      await db.$disconnect()
      await pool.end()
    }
  }
})
