import assert from "node:assert/strict"
import test from "node:test"
import { compactAlertFeed } from "../src/lib/alert-feed"

const alert = (id: string, type: string, referenceId: string | null, severity = "INFO", title = type) => ({
  id, type, referenceId, severity, title, message: title, createdAt: new Date("2026-11-16T01:00:00Z"),
})

test("ambang stok didahulukan dari notifikasi transfer terbaru", () => {
  const oldStock = { ...alert("stock", "LOW_STOCK", null, "WARNING"), createdAt: new Date("2026-11-01") }
  assert.equal(compactAlertFeed([alert("transfer", "TRANSFER_SENT", "t"), oldStock], new Map())[0].id, "stock")
})

test("tiga notifikasi transfer lama menjadi satu tanpa menghilangkan catatan pelaku", () => {
  const result = compactAlertFeed([
    alert("sent", "TRANSFER_SENT", "t"),
    alert("done", "TRANSFER_COMPLETED", "t"),
    alert("actor", "TRANSFER_COMPLETED", "t", "INFO", "Dikirim & diterima oleh orang yang sama"),
  ], new Map([["t", { status: "RECEIVED" }]]))
  assert.equal(result.length, 1)
  assert.equal(result[0].id, "done")
  assert.match(result[0].message, /orang yang sama/)
})

test("selisih kritis transfer mengungguli info selesai, opname berbeda tidak digabung", () => {
  const result = compactAlertFeed([
    alert("done", "TRANSFER_COMPLETED", "t"),
    alert("short", "STOCK_SHORTAGE", "t", "CRITICAL"),
    alert("opname", "STOCK_SHORTAGE", "o", "CRITICAL"),
  ], new Map([["t", { status: "RECEIVED" }]]))
  assert.equal(result.length, 2)
  assert.ok(result.some(item => item.id === "short"))
  assert.ok(result.some(item => item.id === "opname"))
})

test("transfer yang sudah diproses tidak muncul kembali sebagai barang dalam perjalanan", () => {
  assert.equal(compactAlertFeed([alert("old", "TRANSFER_SENT", "t")], new Map([["t", { status: "RECEIVED" }]])).length, 0)
  assert.equal(compactAlertFeed([alert("old", "TRANSFER_SENT", "t")], new Map([["t", { status: "RECEIVED" }]]), false).length, 1)
})
