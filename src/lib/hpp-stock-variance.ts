import Decimal from "decimal.js-light"

type Numeric = number | string | { toString(): string }

export type HppCalculationStatus = "CALCULATED" | "INCOMPLETE" | "NO_OPNAME" | "NO_COGS"

export const HPP_STATUS_LABELS: Record<HppCalculationStatus, string> = {
  CALCULATED: "Hitungan lengkap",
  INCOMPLETE: "Data belum lengkap",
  NO_OPNAME: "Belum cek stok",
  NO_COGS: "Biaya bahan Rp0",
}

type ReportInput = {
  outlets: { id: string; name: string }[]
  orders: { locationId: string; total: Numeric; cogsAmount: Numeric | null; cogsComplete: boolean }[]
  opnames: {
    locationId: string
    items: {
      difference: Numeric | null
      unitCostSnapshot: Numeric | null
      absoluteVarianceValue: Numeric | null
      item: { isTrackable: boolean }
    }[]
  }[]
  adjustments: { locationId: string; totalCost: Numeric | null }[]
}

function add(a: number, b: Numeric) {
  return new Decimal(a).add(b.toString()).toNumber()
}

function indicator(row: {
  cogs: number
  stockVariance: number
  incompleteCogsOrders: number
  opnameCount: number
  incompleteOpnames: number
  unvaluedVarianceItems: number
}) {
  let calculationStatus: HppCalculationStatus = "CALCULATED"
  if (row.incompleteCogsOrders || row.incompleteOpnames || row.unvaluedVarianceItems) calculationStatus = "INCOMPLETE"
  else if (!row.opnameCount) calculationStatus = "NO_OPNAME"
  else if (row.cogs <= 0) calculationStatus = "NO_COGS"
  return {
    calculationStatus,
    variancePercentage: calculationStatus === "CALCULATED"
      ? new Decimal(row.stockVariance).div(row.cogs).mul(100).toNumber()
      : null,
  }
}

/** Nilai historis memakai snapshot; harga master hari ini bukan pengganti data lama. */
export function buildHppStockVarianceReport({ outlets, orders, opnames, adjustments }: ReportInput) {
  const emptyTotals = () => ({
    revenue: 0, cogs: 0, grossProfit: 0, stockVariance: 0,
    shortageValue: 0, surplusValue: 0, knownLosses: 0,
    paidOrders: 0, incompleteCogsOrders: 0, opnameCount: 0,
    incompleteOpnames: 0, unvaluedVarianceItems: 0, unvaluedAdjustments: 0,
  })
  const rows = new Map(outlets.map((outlet) => [outlet.id, {
    locationId: outlet.id, locationName: outlet.name, ...emptyTotals(),
  }]))

  for (const order of orders) {
    const row = rows.get(order.locationId)
    if (!row) continue
    row.revenue = add(row.revenue, order.total)
    if (order.cogsAmount != null) row.cogs = add(row.cogs, order.cogsAmount)
    row.paidOrders += 1
    if (!order.cogsComplete || order.cogsAmount == null) row.incompleteCogsOrders += 1
  }

  for (const opname of opnames) {
    const row = rows.get(opname.locationId)
    if (!row) continue
    // Opname tanpa selisih tetap merupakan siklus yang sudah dilakukan.
    row.opnameCount += 1
    const tracked = opname.items.filter((entry) => entry.item.isTrackable)
    if (!tracked.length || tracked.some((entry) => entry.difference == null)) row.incompleteOpnames += 1
    for (const entry of tracked) {
      if (entry.difference == null) continue
      const difference = new Decimal(entry.difference.toString())
      if (difference.isZero()) continue
      if (entry.unitCostSnapshot == null) {
        row.unvaluedVarianceItems += 1
        continue
      }
      // Rp0 eksplisit sah untuk bahan gratis; null berarti harga belum tersedia.
      const value = entry.absoluteVarianceValue == null
        ? difference.abs().mul(entry.unitCostSnapshot.toString()).toDecimalPlaces(2).toNumber()
        : Number(entry.absoluteVarianceValue.toString())
      row.stockVariance = add(row.stockVariance, value)
      if (difference.isNegative()) row.shortageValue = add(row.shortageValue, value)
      else row.surplusValue = add(row.surplusValue, value)
    }
  }

  for (const adjustment of adjustments) {
    const row = rows.get(adjustment.locationId)
    if (!row) continue
    if (adjustment.totalCost == null) row.unvaluedAdjustments += 1
    else row.knownLosses = add(row.knownLosses, adjustment.totalCost)
  }

  const locations = [...rows.values()].map((row) => ({
    ...row,
    grossProfit: new Decimal(row.revenue).sub(row.cogs).toNumber(),
    ...indicator(row),
  }))
  const totals = emptyTotals()
  for (const row of locations) {
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] = add(totals[key], row[key])
  }
  // Jangan menutupi outlet yang belum punya opname dengan opname outlet lain.
  const summaryIndicator = indicator(totals)
  if (locations.some((row) => row.calculationStatus !== "CALCULATED") && summaryIndicator.calculationStatus === "CALCULATED") {
    summaryIndicator.calculationStatus = "INCOMPLETE"
    summaryIndicator.variancePercentage = null
  }
  return { summary: { ...totals, ...summaryIndicator }, locations }
}

export type HppStockVarianceReport = ReturnType<typeof buildHppStockVarianceReport> & {
  period: { from: string; to: string }
}
