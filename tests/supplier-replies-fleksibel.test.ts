import assert from "node:assert/strict"
import test from "node:test"
import { applySupplierReply, klasifikasiBalasan, parseOrderReply } from "../src/lib/supplier-replies"

// Tabel kasus Tahap 2: hanya golongan STANDAR yang boleh diterapkan otomatis.
const bahan = [
  { id: "keju", names: ["Cheese Slice", "Keju Slice Cheddar"] },
  { id: "coklat", names: ["Coklat Bubuk"] },
  { id: "saus", names: ["Saus Spesial"] },
]

test("menggolongkan balasan supplier sesuai tabel kasus", () => {
  const kasus: Array<[string, string]> = [
    ["Baik, saya proses Pak", "STANDAR"],
    ["1", "STANDAR"], ["#8EB4 4", "STANDAR"], ["2 30", "STANDAR"], ["Kosong pak", "STANDAR"],
    ["Siap, tapi coklat cuma ada 1 dus", "SEBUT_BAHAN"],
    ["ok tapi coklat kosong", "SEBUT_BAHAN"],
    ["Transfer dulu ya, 1.250.000", "BAYAR"], ["ok transfer dulu", "BAYAR"], ["5", "BAYAR"],
    ["vanilla-nya merk apa?", "TANYA"], ["masih ada?", "TANYA"],
    ["terima kasih 🙏", "BASA_BASI"], ["Pagi pak", "BASA_BASI"],
    ["non-text message", "LAMPIRAN"],
    ["gmn mn", "TAK_DIKENAL"],
  ]
  for (const [pesan, harapan] of kasus) {
    assert.equal(klasifikasiBalasan({ message: pesan }, bahan).kind, harapan, pesan)
  }
})

test("mengusulkan per bahan dan membaca nominal", () => {
  const sebut = klasifikasiBalasan({ message: "Siap, tapi coklat cuma ada 1 dus" }, bahan)
  assert.deepEqual(sebut.kind === "SEBUT_BAHAN" && sebut.bahan, [{ lineId: "coklat", command: "PARTIAL", quantity: 1 }])
  assert.equal(sebut.kind === "SEBUT_BAHAN" && sebut.sisanya, "READY")
  const bayar = klasifikasiBalasan({ message: "Transfer dulu ya, 1.250.000" })
  assert.equal(bayar.kind === "BAYAR" && bayar.nominal, 1_250_000)
  const pdf = klasifikasiBalasan({ message: "inv", url: "https://x/inv.pdf", fileName: "inv.pdf", type: "document" })
  assert.equal(pdf.kind === "LAMPIRAN" && pdf.jenis, "DOKUMEN")

  const satuBahan = klasifikasiBalasan(
    { message: "Selada segar cuman ready 25" },
    [{ id: "selada", names: ["Selada Segar"] }],
  )
  assert.equal(satuBahan.kind, "SEBUT_BAHAN")
  assert.deepEqual(satuBahan.kind === "SEBUT_BAHAN" && satuBahan.bahan, [
    { lineId: "selada", command: "PARTIAL", quantity: 25 },
  ])
})

// Kosakata sehari-hari supplier. Kata negatif/ragu tidak boleh terbaca "siap",
// dan "besok dikirim" berarti disanggupi, BUKAN sudah dikirim.
test("membaca kosakata balasan sehari-hari dengan aman", () => {
  const kasus: Array<[string, string | null, number?]> = [
    // siap
    ["1", "READY"], ["Baik, saya proses Pak", "READY"], ["siappp", "READY"], ["siap kak", "READY"], ["okee pak", "READY"], ["ok", "READY"],
    ["sip", "READY"], ["👍", "READY"], ["👌🙏", "READY"], ["noted kak", "READY"], ["laksanakan", "READY"], ["gas", "READY"], ["inggih", "READY"],
    ["oke kak saya siapkan", "READY"], ["ok makasih", "READY"], ["iya bisa", "READY"], ["bisa pak", "READY"], ["ada pak", "READY"],
    ["stok ada", "READY"], ["ready kak", "READY"], ["acc", "READY"], ["pesanan diterima, diproses ya", "READY"], ["insyaallah besok", null], ["besok ya", null],
    ["besok dikirim ya", "READY"], ["nanti sore dikirim", "READY"], ["siap kirim jam 3", "READY"], ["aman bos", "READY"], ["oke siap", "READY"],
    // dikirim
    ["4", "SHIPPED"], ["sudah otw", "SHIPPED"], ["udah dikirim ya kak", "SHIPPED"], ["barang sudah jalan", "SHIPPED"], ["dikirim pak", "SHIPPED"],
    ["otw", "SHIPPED"], ["kurir lagi di jalan", "SHIPPED"], ["sudah dikirim 20", "SHIPPED", 20],
    // kosong
    ["3", "UNAVAILABLE"], ["tidak ada pak", "UNAVAILABLE"], ["kosong", "UNAVAILABLE"], ["lagi habis kak", "UNAVAILABLE"], ["gak ada stok", "UNAVAILABLE"],
    ["sold out", "UNAVAILABLE"], ["belum ada barangnya", "UNAVAILABLE"],
    // sebagian
    ["2 30", "PARTIAL", 30], ["cuma ada 20", "PARTIAL", 20], ["tinggal 15", "PARTIAL", 15], ["sebagian 10 ya", "PARTIAL", 10], ["hanya bisa 5", "PARTIAL", 5],
    // ragu / tidak pasti → null
    ["belum siap", null], ["gak bisa hari ini", null], ["maaf pak", null], ["saya cek dulu ya", null], ["tunggu sebentar", null],
    ["ok tapi coklat kosong", null], ["gmn ya", null], ["terima kasih", null], ["cuma ada", null], ["besok ya kayaknya", null],
    ["mungkin besok", null], ["harga naik pak", null],
  ]
  for (const [pesan, harapan, jumlah] of kasus) {
    const hasil = parseOrderReply(pesan)
    assert.equal(hasil?.command ?? null, harapan, pesan)
    if (jumlah !== undefined) assert.equal(hasil?.quantity, jumlah, pesan)
  }
})

test("balasan ok menyanggupi seluruh jumlah tanpa menambah stok", () => {
  const parsed = parseOrderReply("ok")
  assert.ok(parsed)
  const orderedQuantity = 30
  const result = applySupplierReply(
    { supplierReplyStatus: "WAITING", promisedQuantity: null, shippedQuantity: null },
    { orderCode: "PB-TEST", command: parsed.command, quantity: parsed.quantity ?? orderedQuantity, unit: null },
    orderedQuantity,
  )
  assert.equal(result.supplierReplyStatus, "READY")
  assert.equal(result.promisedQuantity, 30)
  assert.equal(result.shippedQuantity, null)
  assert.equal(result.confirmed, true)
  assert.equal(result.shipped, false)
})
