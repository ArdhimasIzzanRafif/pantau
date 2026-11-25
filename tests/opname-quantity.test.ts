import assert from "node:assert/strict"
import test from "node:test"
import { resolveOpnameQuantity, splitOpnameQuantity } from "../src/lib/opname-quantity"

test("kemasan utuh dan satuan lepas dijumlahkan tepat", () => {
  assert.equal(resolveOpnameQuantity("2", "17", 20), 57)
  assert.equal(resolveOpnameQuantity("", "57", 20), 57)
  assert.equal(resolveOpnameQuantity("2", "", 20), 40)
  assert.equal(resolveOpnameQuantity("138", "0", 0.05), 6.9)
  assert.equal(resolveOpnameQuantity("2", "0,017", 0.05), 0.117)
  assert.equal(resolveOpnameQuantity("", "0,05", null), 0.05)
})

test("stok nol berbeda dari kolom yang belum diisi", () => {
  assert.equal(resolveOpnameQuantity("", "", 20), null)
  assert.equal(resolveOpnameQuantity("0", "", 20), 0)
  assert.equal(resolveOpnameQuantity("", "0", null), 0)
})

test("sisa kemasan tidak memunculkan galat floating point", () => {
  assert.deepEqual(splitOpnameQuantity(6.9, 0.05), { packs: 138, loose: 0 })
  assert.deepEqual(splitOpnameQuantity(57, 20), { packs: 2, loose: 17 })
  assert.deepEqual(splitOpnameQuantity(0.117, 0.05), { packs: 2, loose: 0.017 })
  assert.deepEqual(splitOpnameQuantity(6.899999999999999, 0.05), { packs: 138, loose: 0 })
})

test("input negatif, tidak valid, kemasan pecahan, dan presisi berlebih ditolak", () => {
  for (const [packs, loose, size] of [["-1", "0", 20], ["2", "-17", 20], ["2,5", "0", 20], ["abc", "17", 20], ["1", "0,0001", 20], ["1", "0", 0.0005], ["999999999999", "0", 20]] as const) {
    assert.throws(() => resolveOpnameQuantity(packs, loose, size))
  }
})
