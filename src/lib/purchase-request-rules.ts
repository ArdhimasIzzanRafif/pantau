export function parseMinimumStock(value: number | null | undefined) {
  if (value == null) return null
  const minimum = Number(value)
  return Number.isFinite(minimum) && minimum >= 0 ? minimum : null
}

export function hasReachedMinimumStock(currentQuantity: number, minimumStock: number) {
  return Number.isFinite(currentQuantity) && currentQuantity <= minimumStock
}

export function calculatePurchaseQuantity(currentQuantity: number, minimumStock: number) {
  const targetStock = minimumStock * 2
  return Math.max(targetStock - currentQuantity, minimumStock, 1)
}

export function calculateWarehouseReplenishment(
  requestedQuantity: number,
  onHandQuantity: number,
  reservedQuantity: number,
) {
  const requested = Math.max(0, Number(requestedQuantity) || 0)
  const available = Math.max(0, (Number(onHandQuantity) || 0) - (Number(reservedQuantity) || 0))
  return {
    requestedQuantity: requested,
    availableQuantity: available,
    shortfallQuantity: Math.max(0, requested - available),
  }
}
