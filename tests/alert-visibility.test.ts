import assert from "node:assert/strict"
import test from "node:test"
import { AlertType } from "@prisma/client"
import { isAlertLocationVisible, isSupervisorAlertVisible } from "../src/lib/alert-visibility"

test("Supervisor melihat opname selesai siapa pun yang mengerjakannya", () => {
  assert.equal(isSupervisorAlertVisible({ type: AlertType.OPNAME_COMPLETED }), true)
})

test("Supervisor melihat selisih opname maupun selisih transfer", () => {
  assert.equal(isSupervisorAlertVisible({ type: AlertType.STOCK_SHORTAGE }), true)
  assert.equal(isSupervisorAlertVisible({ type: AlertType.STOCK_SURPLUS }), true)
})

test("Supervisor tetap melihat status stok, barang masuk, dan transfer", () => {
  for (const type of [
    AlertType.LOW_STOCK,
    AlertType.GOODS_RECEIVED,
    AlertType.TRANSFER_REJECTED,
    AlertType.TRANSFER_COMPLETED,
  ]) {
    assert.equal(isSupervisorAlertVisible({ type }), true)
  }
})

test("notifikasi di luar ranah Supervisor tetap tersembunyi", () => {
  for (const type of [
    AlertType.PRICE_ANOMALY,
    AlertType.ITEM_NO_COST_PRICE,
    AlertType.POS_ITEM_UNMAPPED,
  ]) {
    assert.equal(isSupervisorAlertVisible({ type }), false)
  }
})

test("notifikasi lokasi yang sudah dicabut tidak terlihat", () => {
  const accessible = new Set(["outlet-1", "outlet-2"])
  assert.equal(isAlertLocationVisible(
    { locationId: "gudang-pusat", referenceId: "receipt-1" },
    accessible,
    new Map([["receipt-1", ["gudang-pusat"]]]),
  ), false)
  assert.equal(isAlertLocationVisible(
    { locationId: "outlet-1", referenceId: null },
    accessible,
    new Map(),
  ), true)
})

test("notifikasi transfer terlihat jika salah satu lokasinya masih ditugaskan", () => {
  const accessible = new Set(["outlet-1"])
  assert.equal(isAlertLocationVisible(
    { locationId: null, referenceId: "transfer-visible" },
    accessible,
    new Map([["transfer-visible", ["gudang-pusat", "outlet-1"]]]),
  ), true)
  assert.equal(isAlertLocationVisible(
    { locationId: null, referenceId: "transfer-hidden" },
    accessible,
    new Map([["transfer-hidden", ["gudang-pusat", "outlet-2"]]]),
  ), false)
})

test("Owner tetap melihat notifikasi seluruh lokasi", () => {
  assert.equal(isAlertLocationVisible(
    { locationId: "gudang-pusat", referenceId: null },
    null,
    new Map(),
  ), true)
})
