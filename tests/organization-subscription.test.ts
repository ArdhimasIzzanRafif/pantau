import assert from "node:assert/strict"
import test from "node:test"
import { effectiveOrganizationStatus, hasOrganizationAccess } from "../src/lib/organization-subscription"

const deadline = "2026-12-25T21:30:00+07:00"
const at = new Date(deadline).getTime()

test("langganan aktif tepat sebelum batas waktu, kedaluwarsa tepat pada batasnya", () => {
  for (const status of ["ACTIVE", "TRIAL"]) {
    const org = { status, trialEndsAt: deadline }
    assert.equal(effectiveOrganizationStatus(org, at - 1), status)
    assert.equal(effectiveOrganizationStatus(org, at), "EXPIRED")
    assert.equal(effectiveOrganizationStatus(org, at + 1), "EXPIRED")
    assert.equal(hasOrganizationAccess(org, at - 1), true)
    assert.equal(hasOrganizationAccess(org, at), false)
    assert.equal(hasOrganizationAccess(org, new Date("2026-12-26T12:00:00+07:00").getTime()), false)
  }
})

test("timestamp UTC, WIB, dan Date mengacu ke batas akses yang sama", () => {
  for (const trialEndsAt of [deadline, new Date(deadline), new Date(deadline).toISOString()]) {
    assert.equal(effectiveOrganizationStatus({ status: "ACTIVE", trialEndsAt }, at), "EXPIRED")
  }
})

test("penangguhan/pembatalan tidak dibuka hanya karena tanggal masih berlaku", () => {
  for (const status of ["PENDING", "REJECTED", "SUSPENDED", "CANCELLED", "EXPIRED"]) {
    const org = { status, trialEndsAt: new Date(at + 86400000) }
    assert.equal(effectiveOrganizationStatus(org, at), status)
    assert.equal(hasOrganizationAccess(org, at), false)
  }
})

test("langganan tanpa batas tetap berlaku, tanggal rusak ditolak", () => {
  assert.equal(hasOrganizationAccess({ status: "ACTIVE", trialEndsAt: null }, at), true)
  assert.equal(hasOrganizationAccess({ status: "TRIAL" }, at), true)
  assert.equal(hasOrganizationAccess({ status: "ACTIVE", trialEndsAt: "invalid" }, at), false)
  assert.equal(hasOrganizationAccess({ status: null, trialEndsAt: null }, at), false)
})

test("perpanjangan membuka akses kembali setelah status diaktifkan admin", () => {
  const org = { status: "ACTIVE", trialEndsAt: new Date(at - 1) }
  assert.equal(hasOrganizationAccess(org, at), false)
  org.trialEndsAt = new Date(at + 30 * 86400000)
  assert.equal(hasOrganizationAccess(org, at), true)
})
