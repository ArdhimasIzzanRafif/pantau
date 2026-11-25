export class InventoryCostError extends Error {}

/**
 * Harga pokok di master boleh Rp0 untuk bahan yang memang didapat gratis.
 * Nilai kosong tetap dibedakan dari Rp0 agar UI dapat menandainya sebagai
 * "belum diisi", bukan sebagai bahan gratis.
 */
export function parseOptionalInventoryCost(value: unknown): number | null {
  if (value == null || value === "") return null

  const cost = Number(value)
  if (!Number.isFinite(cost)) throw new InventoryCostError("Harga pokok tidak valid")
  if (cost < 0) throw new InventoryCostError("Harga pokok tidak boleh negatif")
  return cost
}

/**
 * Harga pada Barang Masuk adalah harga transaksi. Kosong berarti penerimaan
 * tidak memperbarui HPP; bila diisi, nilainya wajib benar-benar positif.
 */
export function parseOptionalPurchaseCost(value: unknown): number | null {
  if (value == null || value === "") return null

  const cost = Number(value)
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new InventoryCostError(
      "Harga beli harus lebih dari Rp0. Jika barang gratis, kosongkan harga di Barang Masuk dan atur HPP Rp0 di Master Inventori.",
    )
  }
  return cost
}

/**
 * Harga Barang Masuk tidak boleh diam-diam memakai HPP master. Nilai kosong
 * atau Rp0 hanya sah sebagai penerimaan gratis setelah pengguna mengonfirmasi
 * popup, dan master item tersebut memang sudah ditandai gratis (HPP Rp0).
 */
export function resolveReceiptPurchaseCost(
  purchaseCost: unknown,
  masterCost: unknown,
  itemName = "item",
  freeReceiptConfirmed = false,
): number {
  const isBlank = purchaseCost == null || purchaseCost === ""
  const numericCost = isBlank ? null : Number(purchaseCost)

  if (isBlank || numericCost === 0) {
    if (freeReceiptConfirmed && Number(masterCost) === 0 && masterCost != null) return 0

    throw new InventoryCostError(
      `Harga beli ${itemName} wajib diisi lebih dari Rp0. Jika barang gratis, atur HPP Rp0 di Master Inventori lalu konfirmasi penerimaan gratis.`,
    )
  }

  return parseOptionalPurchaseCost(numericCost)!
}
