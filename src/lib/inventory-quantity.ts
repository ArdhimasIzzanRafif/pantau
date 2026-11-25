import Decimal from "decimal.js-light"

export class QuantityInputError extends Error {}

/** Koma adalah desimal Indonesia; titik ribuan tetap diterima (1.000,05). */
export function parseInventoryDecimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || !value.trim()) return null
  let normalized = value.trim()
  if (normalized.includes(",")) {
    if (!/^-?(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+),\d+$/.test(normalized)) return null
    normalized = normalized.replace(/\./g, "").replace(",", ".")
  } else if (/^-?[1-9]\d{0,2}(?:\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "")
  } else if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseInventoryQuantity(value: unknown, label: string, allowZero = false) {
  const parsed = parseInventoryDecimal(value)
  if (parsed == null || (allowZero ? parsed < 0 : parsed <= 0) || parsed >= 1e12 || new Decimal(parsed).decimalPlaces() > 3) {
    throw new QuantityInputError(`${label} harus ${allowZero ? "0 atau lebih" : "lebih dari 0"}, maksimal 3 angka desimal. Contoh: 0,05.`)
  }
  return parsed
}

export function parseOptionalMinimumStock(value: unknown) {
  return value === "" || value == null ? null : parseInventoryQuantity(value, "Minimum stok", true)
}

export function formatInventoryQuantity(value: number) {
  return value.toLocaleString("id-ID", { maximumFractionDigits: 3, useGrouping: false })
}

export function multiplyInventoryQuantity(quantity: number, factor: number) {
  const result = new Decimal(quantity).mul(factor)
  if (result.decimalPlaces() > 3 || result.gte(1e12)) {
    throw new QuantityInputError("Hasil konversi maksimal 3 angka desimal dalam satuan dasar. Periksa jumlah dan isi per kemasan.")
  }
  return result.toNumber()
}

export function quantityInPackages(baseQuantity: number, packSize: number) {
  return new Decimal(baseQuantity).div(packSize).toDecimalPlaces(3).toNumber()
}

export function costPerBaseUnit(packCost: number, packSize: number) {
  return new Decimal(packCost).div(packSize).toDecimalPlaces(6).toNumber()
}
