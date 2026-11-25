import Decimal from "decimal.js-light"
import { parseInventoryQuantity, QuantityInputError } from "@/lib/inventory-quantity"

export function splitOpnameQuantity(quantity: number, packSize: number) {
  const total = new Decimal(quantity).toDecimalPlaces(3)
  const size = new Decimal(packSize)
  const packs = total.div(size).toDecimalPlaces(0, Decimal.ROUND_FLOOR)
  return { packs: packs.toNumber(), loose: total.minus(packs.mul(size)).toNumber() }
}

export function resolveOpnameQuantity(packs: string, loose: string, packSize: number | null): number | null {
  if (!packs.trim() && !loose.trim()) return null
  const base = loose.trim() ? parseInventoryQuantity(loose, "Jumlah satuan lepas", true) : 0
  if (!packSize) return base
  const count = packs.trim() ? parseInventoryQuantity(packs, "Jumlah kemasan", true) : 0
  if (!Number.isInteger(count)) throw new QuantityInputError("Jumlah kemasan utuh harus bilangan bulat. Isi sisanya di satuan lepas.")
  const total = new Decimal(count).mul(packSize).plus(base)
  if (total.decimalPlaces() > 3 || total.gte(1e12)) throw new QuantityInputError("Total stok fisik maksimal 3 angka desimal dan harus kurang dari 1 triliun.")
  return total.toNumber()
}
