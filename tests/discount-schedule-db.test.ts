import "dotenv/config"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { resolveOrderDiscount } from "../src/lib/pos-orders"
import { parseDiscountRuleInput } from "../src/lib/discount-rule-validation"

test("jadwal tersimpan dan server POS menolak promo sebelum/sesudah periode meski ID dikirim langsung", async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const rollback = new Error("ROLLBACK_DISCOUNT_SCHEDULE_TEST")
  try {
    await db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: "Discount schedule test", slug: `discount-schedule-${randomUUID()}` } })
      const location = await tx.location.create({ data: { organizationId: org.id, name: "Test outlet", type: "OUTLET" } })
      const now = Date.now()
      const data = parseDiscountRuleInput({ name: "Promo periode", type: "PERCENT", value: 10, scheduleMode: "PERIOD", startsAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 60_000).toISOString() }).data
      const rule = await tx.discountRule.create({ data: { organizationId: org.id, ...data } })
      assert.equal(rule.scheduleMode, "PERIOD")
      const resolve = () => resolveOrderDiscount(tx, org.id, location.id, 30_000, "OWNER", { discountRuleId: rule.id })
      assert.equal((await resolve()).discountAmount, 3_000)
      await tx.discountRule.update({ where: { id: rule.id }, data: { startsAt: new Date(now - 120_000), expiresAt: new Date(now - 60_000) } })
      await assert.rejects(resolve, /sudah berakhir/)
      await tx.discountRule.update({ where: { id: rule.id }, data: { startsAt: new Date(now + 60_000), expiresAt: new Date(now + 120_000) } })
      await assert.rejects(resolve, /belum mulai/)
      const recurring = parseDiscountRuleInput({ scheduleMode: "RECURRING", startsAt: null, expiresAt: null, validDays: null, startMinute: null, endMinute: null }, rule).data
      await tx.discountRule.update({ where: { id: rule.id }, data: recurring })
      assert.equal((await resolve()).discountAmount, 3_000)
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  } finally {
    await db.$disconnect()
  }
})
