import assert from "node:assert/strict"
import test from "node:test"
import {
  extractSupplierOrderCode,
  formatSupplierOrderMessage,
  parseSupplierReply,
} from "../src/lib/supplier-replies"

test("membuat pesan pesanan yang ringkas dan dapat dibalas mesin", () => {
  const message = formatSupplierOrderMessage({
    supplierName: "Supplier A",
    organizationName: "Three Patties",
    orderCode: "PO-260921-A1B2C3",
    destinationName: "Gudang 725A",
    itemName: "Beef Patty",
    quantity: 30,
    unit: "pcs",
    context: "Persiapan long weekend",
  })

  assert.match(message, /\*Kode pesanan:\* PO-260921-A1B2C3/)
  assert.match(message, /\*Jumlah diminta:\* 30 pcs/)
  assert.match(message, /PO-260921-A1B2C3 READY 30/)
  assert.match(message, /PO-260921-A1B2C3 SEBAGIAN \[jumlah tersedia\]/)
  assert.match(message, /PO-260921-A1B2C3 KOSONG 0/)
  assert.match(message, /PO-260921-A1B2C3 KIRIM \[jumlah dikirim\]/)
})

test("membaca balasan pemasok dengan format yang didukung", () => {
  assert.deepEqual(parseSupplierReply("PO-260921-A1B2C3 READY 25"), {
    orderCode: "PO-260921-A1B2C3",
    command: "READY",
    quantity: 25,
    unit: null,
  })
  assert.deepEqual(parseSupplierReply("po-260921-a1b2c3 sebagian 12,5"), {
    orderCode: "PO-260921-A1B2C3",
    command: "PARTIAL",
    quantity: 12.5,
    unit: null,
  })
  assert.deepEqual(parseSupplierReply("PO-260921-A1B2C3 KIRIM 10"), {
    orderCode: "PO-260921-A1B2C3",
    command: "SHIPPED",
    quantity: 10,
    unit: null,
  })
  assert.deepEqual(parseSupplierReply("PO-260921-A1B2C3 KOSONG 0"), {
    orderCode: "PO-260921-A1B2C3",
    command: "UNAVAILABLE",
    quantity: null,
    unit: null,
  })
})

test("menolak format ambigu atau jumlah tidak valid", () => {
  assert.equal(parseSupplierReply("Barangnya ada, besok dikirim"), null)
  assert.equal(parseSupplierReply("PO-260921-A1B2C3 READY"), null)
  assert.equal(parseSupplierReply("PO-260921-A1B2C3 READY 0"), null)
  assert.equal(parseSupplierReply("PO-260921-A1B2C3 KOSONG 5"), null)
})

test("kode pesanan baru dan kode lama tetap dikenali", () => {
  assert.equal(
    extractSupplierOrderCode("Untuk PO-260921-a1b2c3, barang baru ada besok"),
    "PO-260921-A1B2C3"
  )
  assert.equal(extractSupplierOrderCode("PB-LEGACY-123 READY 2"), "PB-LEGACY-123")
  assert.equal(extractSupplierOrderCode("barang baru ada besok"), null)
})
