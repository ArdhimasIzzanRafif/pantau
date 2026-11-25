import assert from "node:assert/strict"
import test from "node:test"

import {
  InventoryCostError,
  parseOptionalInventoryCost,
  parseOptionalPurchaseCost,
  resolveReceiptPurchaseCost,
} from "../src/lib/inventory-cost"

test("master inventori membedakan harga kosong dan bahan gratis", () => {
  assert.equal(parseOptionalInventoryCost(null), null)
  assert.equal(parseOptionalInventoryCost(""), null)
  assert.equal(parseOptionalInventoryCost(0), 0)
  assert.equal(parseOptionalInventoryCost("0"), 0)
  assert.equal(parseOptionalInventoryCost("35000"), 35_000)
})

test("master inventori menolak harga negatif", () => {
  assert.throws(() => parseOptionalInventoryCost(-1), InventoryCostError)
})

test("parser harga transaksi membedakan kosong dan menolak nol atau negatif", () => {
  assert.equal(parseOptionalPurchaseCost(null), null)
  assert.equal(parseOptionalPurchaseCost(""), null)
  assert.equal(parseOptionalPurchaseCost(35_000), 35_000)
  assert.throws(() => parseOptionalPurchaseCost(0), InventoryCostError)
  assert.throws(() => parseOptionalPurchaseCost(-1), InventoryCostError)
})

test("barang masuk kosong atau nol selalu perlu konfirmasi bahan gratis", () => {
  assert.throws(() => resolveReceiptPurchaseCost(null, 0, "Tomat"), /wajib diisi/)
  assert.throws(() => resolveReceiptPurchaseCost("", 0, "Tomat"), /wajib diisi/)
  assert.throws(() => resolveReceiptPurchaseCost(0, 0, "Tomat"), /wajib diisi/)
  assert.equal(resolveReceiptPurchaseCost(null, 0, "Tomat", true), 0)
  assert.equal(resolveReceiptPurchaseCost(0, 0, "Tomat", true), 0)
})

test("konfirmasi gratis ditolak jika HPP master bukan Rp0", () => {
  assert.throws(() => resolveReceiptPurchaseCost(null, null, "Tomat", true), /wajib diisi/)
  assert.throws(() => resolveReceiptPurchaseCost(null, 35_000, "Beef", true), /wajib diisi/)
  assert.equal(resolveReceiptPurchaseCost(30_000, null, "Beef"), 30_000)
})
