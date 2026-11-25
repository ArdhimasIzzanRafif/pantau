import assert from "node:assert/strict"
import test from "node:test"
import { getDiscountScheduleStatus } from "../src/lib/discount-schedule"
import { parseDiscountRuleInput } from "../src/lib/discount-rule-validation"
import { discountScheduleInput, jakartaTimeInput, type DiscountScheduleForm } from "../src/lib/discount-schedule-form"

const form: DiscountScheduleForm = {
  scheduleMode: "PERIOD", startsAt: "2026-11-14", expiresAt: "2026-11-15",
  startTime: "12:00", endTime: "13:00", validDays: [6],
}
const ruleInput = { name: "Promo uji", type: "PERCENT", value: 10 }
const status = (rule: Parameters<typeof getDiscountScheduleStatus>[0], at: string) => getDiscountScheduleStatus(rule, new Date(at))

test("periode 14 pukul 12 sampai 15 pukul 13 berjalan terus dan berakhir tepat waktu", () => {
  const { data } = parseDiscountRuleInput({ ...ruleInput, ...discountScheduleInput(form) })
  assert.equal(data.startsAt?.toISOString(), "2026-11-14T05:00:00.000Z")
  assert.equal(data.expiresAt?.toISOString(), "2026-11-15T06:00:00.000Z")
  assert.equal(status(data, "2026-11-14T11:59:59+07:00"), "UPCOMING")
  for (const at of ["2026-11-14T12:00:00+07:00", "2026-11-14T20:00:00+07:00", "2026-11-15T00:00:00+07:00", "2026-11-15T12:59:59+07:00"]) {
    assert.equal(status(data, at), "ACTIVE")
  }
  assert.equal(status(data, "2026-11-15T13:00:00+07:00"), "EXPIRED")
  assert.equal(status(data, "2026-11-16T12:00:00+07:00"), "EXPIRED")
})

test("berulang 14–15 hanya aktif pukul 12–13 setiap hari", () => {
  const { data } = parseDiscountRuleInput({ ...ruleInput, ...discountScheduleInput({ ...form, scheduleMode: "RECURRING", validDays: [] }) })
  for (const day of [14, 15]) {
    assert.equal(status(data, `2026-11-${day}T11:59:59+07:00`), "OUTSIDE_SCHEDULE")
    assert.equal(status(data, `2026-11-${day}T12:00:00+07:00`), "ACTIVE")
    assert.equal(status(data, `2026-11-${day}T12:59:59+07:00`), "ACTIVE")
    assert.equal(status(data, `2026-11-${day}T13:00:00+07:00`), "OUTSIDE_SCHEDULE")
    assert.equal(status(data, `2026-11-${day}T20:00:00+07:00`), "OUTSIDE_SCHEDULE")
  }
  assert.equal(status(data, "2026-11-16T12:00:00+07:00"), "EXPIRED")
})

test("filter hari tetap membatasi berulang dan jadwal melewati tengah malam memakai hari awal", () => {
  const { data } = parseDiscountRuleInput({ ...ruleInput, scheduleMode: "RECURRING", validDays: "6", startMinute: 22 * 60, endMinute: 2 * 60 })
  assert.equal(status(data, "2026-11-14T22:00:00+07:00"), "ACTIVE")
  assert.equal(status(data, "2026-11-15T01:59:59+07:00"), "ACTIVE")
  assert.equal(status(data, "2026-11-15T02:00:00+07:00"), "OUTSIDE_SCHEDULE")
  assert.equal(status(data, "2026-11-15T22:00:00+07:00"), "OUTSIDE_SCHEDULE")
})

test("mode sekali membuang filter berulang dan tombol aktif/nonaktif tidak mengubah waktu tersimpan", () => {
  const { data } = parseDiscountRuleInput({ ...ruleInput, ...discountScheduleInput(form), validDays: "6", startMinute: 720, endMinute: 780 })
  assert.equal(data.validDays, null)
  assert.equal(data.startMinute, null)
  assert.equal(data.endMinute, null)
  const toggled = parseDiscountRuleInput({ isActive: false }, data).data
  assert.equal(toggled.scheduleMode, "PERIOD")
  assert.deepEqual(toggled.startsAt, data.startsAt)
  assert.equal(status(toggled, "2026-11-14T13:00:00+07:00"), "INACTIVE")
  assert.equal(jakartaTimeInput(data.startsAt!.toISOString()), "12:00")
  assert.equal(jakartaTimeInput(data.expiresAt!.toISOString()), "13:00")
})

test("periode boleh punya jam sama pada tanggal berbeda tetapi tidak boleh kosong, sama persis, atau terbalik", () => {
  assert.doesNotThrow(() => discountScheduleInput({ ...form, endTime: "12:00" }))
  for (const patch of [{ startsAt: "" }, { endTime: "" }, { expiresAt: "2026-11-14", endTime: "12:00" }, { expiresAt: "2026-11-13" }]) {
    assert.throws(() => discountScheduleInput({ ...form, ...patch }))
  }
  for (const patch of [{ startsAt: null }, { expiresAt: null }, { startsAt: "2026-11-14" }, { expiresAt: "2026-11-14T11:00:00+07:00" }, { scheduleMode: "INVALID" }]) {
    assert.throws(() => parseDiscountRuleInput({ ...ruleInput, ...discountScheduleInput(form), ...patch }))
  }
})

test("jadwal berulang lama dan sepanjang hari tetap didukung; jam parsial ditolak", () => {
  const { data } = parseDiscountRuleInput({ ...ruleInput, validDays: "6" })
  assert.equal(data.scheduleMode, "RECURRING")
  assert.equal(status(data, "2026-11-14T23:59:59+07:00"), "ACTIVE")
  assert.equal(status(data, "2026-11-15T12:00:00+07:00"), "OUTSIDE_SCHEDULE")
  assert.throws(() => parseDiscountRuleInput({ ...ruleInput, startMinute: 720 }))
  assert.throws(() => discountScheduleInput({ ...form, scheduleMode: "RECURRING", startTime: "" }))
})
