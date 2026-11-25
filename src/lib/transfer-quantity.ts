/** Quantities use the same three decimal places as the inventory ledger. */
export function parseTransferQuantity(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  if (typeof value === "string" && !value.trim()) return null
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity > 0 && quantity < 1_000_000_000_000
    && Number(quantity.toFixed(3)) === quantity ? quantity : null
}
