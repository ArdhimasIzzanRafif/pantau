import assert from "node:assert/strict"
import test from "node:test"
import { historyActorId } from "../src/lib/history-scope"

test("Owner melihat seluruh riwayat organisasi", () => {
  assert.equal(historyActorId({ id: "owner-1", role: "OWNER" }, true), undefined)
})

test("mode ACTOR tersedia hanya untuk riwayat yang memang bersifat personal", () => {
  assert.equal(historyActorId({ id: "supervisor-1", role: "SUPERVISOR" }, true), "supervisor-1")
})

test("riwayat operasional dapat mengikuti lokasi meski dibuat Owner", () => {
  assert.equal(historyActorId(
    { id: "supervisor-1", role: "SUPERVISOR" }, true, "LOCATION",
  ), undefined)
})

test("endpoint operasional biasa tidak ikut dibatasi sebagai riwayat", () => {
  assert.equal(historyActorId({ id: "supervisor-1", role: "SUPERVISOR" }, false), undefined)
})
