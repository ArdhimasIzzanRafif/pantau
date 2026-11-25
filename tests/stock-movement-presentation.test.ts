import assert from "node:assert/strict"
import test from "node:test"
import { posStockMovementNote, stockMovementPresentation } from "../src/lib/stock-movement-presentation"

const referenceId = "cmwf2kus123456789"
test("catatan otomatis lama tidak menampilkan ID dan menautkan sumber yang benar", () => {
  for (const [type, note, text, route] of [
    ["GOODS_IN", "Penerimaan cmwf2kus", "Penerimaan barang", "receipt"],
    ["TRANSFER_OUT", "Transfer cmwf2kus dikirim", "Pengiriman barang ke lokasi tujuan", "transfer"],
    ["OPNAME_CORRECTION", "Koreksi opname cmwf2kus", "Penyesuaian hasil opname", "opname"],
  ]) {
    const result = stockMovementPresentation({ type, note, referenceId })
    assert.equal(result.text, text)
    assert.equal(result.link?.href, `/dashboard/audit/${route}/${referenceId}`)
  }
})

test("nomor surat jalan, nomor pesanan, lokasi, dan keterangan pengguna dipertahankan", () => {
  for (const [type, note] of [
    ["GOODS_IN", "Penerimaan INV-20261114-001"],
    ["TRANSFER_OUT", "Transfer ke Outlet Jakarta"],
    ["TRANSFER_IN", "Transfer dari Gudang 1"],
    ["TRANSFER_VARIANCE", "Selisih 10 dicatat sebagai kehilangan dalam perjalanan: kemasan rusak"],
    ["LOSS", "Barang hilang saat pengiriman"],
    ["POS_SALE", "Penjualan ORD-20261114-0001 · Pemakaian bahan sesuai resep dan modifier"],
  ]) {
    assert.equal(stockMovementPresentation({ type, note, referenceId }).text, note)
  }
})

test("penjualan tanpa modifier dan riwayat teks lama tidak menyatakan modifier dipakai", () => {
  const orderNumber = "ORD-20261114-0001"
  assert.equal(posStockMovementNote(orderNumber), `Penjualan ${orderNumber} · Pemakaian bahan sesuai resep`)
  assert.equal(posStockMovementNote(orderNumber, true), `Penjualan ${orderNumber} · Pemakaian bahan sesuai resep dan modifier`)
  const result = stockMovementPresentation({ type: "POS_SALE", note: `POS ${orderNumber} (termasuk resep modifier)`, referenceId })
  assert.equal(result.text, posStockMovementNote(orderNumber))
})

test("catatan kosong atau berisi ID mentah memakai deskripsi tanpa membuat tautan salah", () => {
  for (const note of [null, "", referenceId]) {
    const result = stockMovementPresentation({ type: "LOSS", note, referenceId })
    assert.equal(result.text, "Pencatatan barang hilang")
    assert.equal(result.link, null)
  }
  assert.equal(stockMovementPresentation({ type: "GOODS_IN", note: null, referenceId: null }).link, null)
  for (const type of ["TRANSFER_IN", "TRANSFER_RETURN", "TRANSFER_VARIANCE"]) {
    assert.equal(stockMovementPresentation({ type, note: null, referenceId }).link?.label, "Lihat transfer")
  }
})
