import { Prisma } from "@prisma/client"
import { parseInventoryQuantity } from "@/lib/inventory-quantity"

/// Penolakan yang punya pesan untuk pengguna, bukan kesalahan server.
export class UnitError extends Error {}

/**
 * Satuan yang barangnya tidak bisa dibelah.
 *
 * Stok 1,5 pcs tidak punya arti di gudang — barangnya utuh atau tidak ada.
 * Sebaliknya kg, liter, gram memang lazim berpecahan.
 */
const SATUAN_UTUH = new Set([
  "pcs", "buah", "butir", "lembar", "biji", "batang",
  "pack", "box", "dus", "karton", "botol", "kaleng", "sachet", "bungkus",
])

export type BahanKonversi = {
  unit: string
  packSize: Prisma.Decimal | number | null
  packUnit: string | null
}

export function validateInventoryPackaging(unit: string, rawPackSize: unknown, rawPackUnit: unknown) {
  const packUnit = typeof rawPackUnit === "string" ? rawPackUnit.trim() : ""
  const emptySize = rawPackSize == null || rawPackSize === ""
  if (emptySize && !packUnit) return { packSize: null, packUnit: null }
  if (!packUnit || emptySize) throw new UnitError("Jenis kemasan dan isi per kemasan harus diisi bersamaan")
  if (packUnit === unit) throw new UnitError("Satuan kemasan harus berbeda dari satuan dasar")
  const packSize = parseInventoryQuantity(rawPackSize, "Isi per kemasan")
  // Memakai aturan stok yang sama: 0,05 kg sah, tetapi 0,05 pcs tidak sah.
  convertToBase({ unit, packSize, packUnit }, 1, "pack")
  return { packSize, packUnit }
}

export type HasilKonversi = {
  /// Yang diketik pengguna, apa adanya.
  inputQuantity: number
  inputUnit: string
  /// Berapa satuan dasar dalam satu satuan masukan, saat transaksi ini dibuat.
  conversionFactor: number
  /// Hasil konversi, satuan yang dipakai stok dan seluruh validasi.
  baseQuantity: number
  baseUnit: string
}

function bulatkan(value: number, angkaDesimal: number) {
  const pengali = 10 ** angkaDesimal
  return Math.round(value * pengali) / pengali
}

/**
 * Mengubah jumlah yang diketik pengguna menjadi satuan dasar bahan.
 *
 * Seluruh stok, ambang minimum, reservasi, dan perbandingan jumlah memakai
 * satuan dasar. Satuan kemasan hanya cara mengetik yang lebih enak bagi
 * manusia, dan hanya hidup di lapisan masukan serta pesan ke supplier.
 *
 * Faktor konversinya ikut dikembalikan supaya pemanggil dapat menyimpannya
 * sebagai snapshot di transaksi.
 */
export function convertToBase(
  item: BahanKonversi,
  inputQuantity: unknown,
  inputUnit: unknown,
): HasilKonversi {
  const jumlah = Number(inputQuantity)
  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    throw new UnitError("Jumlah harus berupa angka lebih dari 0")
  }
  if (bulatkan(jumlah, 3) !== jumlah) {
    throw new UnitError("Jumlah maksimal 3 angka di belakang koma")
  }

  const satuan = typeof inputUnit === "string" && inputUnit.trim() ? inputUnit.trim() : "base"
  const packSize = item.packSize == null ? null : Number(item.packSize)

  // Satuan harus terdaftar untuk bahan ini: hanya satuan dasarnya sendiri atau
  // satuan kemasan yang memang sudah dikonfigurasi.
  let conversionFactor: number
  let namaSatuan: string
  if (satuan === "base" || satuan === item.unit) {
    conversionFactor = 1
    namaSatuan = item.unit
  } else if (satuan === "pack" || (item.packUnit != null && satuan === item.packUnit)) {
    if (item.packUnit == null || packSize == null) {
      throw new UnitError(`Satuan kemasan untuk bahan ini belum diatur di Master Inventori`)
    }
    if (!Number.isFinite(packSize) || packSize <= 0) {
      throw new UnitError("Faktor konversi satuan kemasan harus lebih besar dari 0")
    }
    conversionFactor = packSize
    namaSatuan = item.packUnit
  } else {
    throw new UnitError(`Satuan "${satuan}" belum terdaftar untuk bahan ini`)
  }

  // Dihitung dengan Decimal, bukan Float, agar 0,75 × 3 tidak menjadi
  // 2,2499999999999996.
  const baseQuantity = new Prisma.Decimal(jumlah).mul(conversionFactor).toNumber()
  const dibulatkan = bulatkan(baseQuantity, 3)
  if (dibulatkan !== baseQuantity) {
    throw new UnitError("Hasil konversi melebihi 3 angka di belakang koma. Periksa faktor konversinya.")
  }
  if (SATUAN_UTUH.has(item.unit.toLowerCase()) && !Number.isInteger(dibulatkan)) {
    throw new UnitError(
      `${item.unit} tidak dapat berupa pecahan. ${jumlah} ${namaSatuan} menjadi ${dibulatkan} ${item.unit}.`,
    )
  }

  return {
    inputQuantity: jumlah,
    inputUnit: namaSatuan,
    conversionFactor,
    baseQuantity: dibulatkan,
    baseUnit: item.unit,
  }
}

/** Menampilkan jumlah dasar kembali dalam satuan yang enak dibaca manusia. */
export function formatWithUnit(baseQuantity: number, item: BahanKonversi) {
  const angka = baseQuantity.toLocaleString("id-ID", { maximumFractionDigits: 3 })
  return `${angka} ${item.unit}`
}
