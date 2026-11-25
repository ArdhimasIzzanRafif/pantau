import assert from "node:assert/strict"
import test from "node:test"
import { buildHppStockVarianceReport } from "../src/lib/hpp-stock-variance"

const outlets = [{ id: "a", name: "Outlet aplikasi" }]
const order = (cogsAmount: number | null = 825_000, cogsComplete = true) => ({ locationId: "a", total: 3_000_000, cogsAmount, cogsComplete })
const entry = (difference: number | null, unitCostSnapshot: number | null, isTrackable = true) => ({ difference, unitCostSnapshot, absoluteVarianceValue: null, item: { isTrackable } })
const calculate = (items = [entry(-0.1, 150_000), entry(2, 750)], orders = [order()]) => buildHppStockVarianceReport({
  outlets, orders, opnames: [{ locationId: "a", items }], adjustments: [],
})

test("contoh skripsi: kurang dan lebih tidak saling menghapus, nilai dibandingkan HPP bahan", () => {
  const { summary } = calculate()
  assert.equal(summary.shortageValue, 15_000)
  assert.equal(summary.surplusValue, 1_500)
  assert.equal(summary.stockVariance, 16_500)
  assert.equal(summary.cogs, 825_000)
  assert.equal(summary.variancePercentage, 2)
  assert.equal(summary.calculationStatus, "CALCULATED")
})

test("persentase gabungan memakai total nilai / total HPP, bukan rata-rata persentase siklus", () => {
  const report = buildHppStockVarianceReport({ outlets, orders: [order(), order(82_500)], adjustments: [], opnames: [
    { locationId: "a", items: [entry(-0.11, 150_000)] },
    { locationId: "a", items: [entry(-0.022, 150_000)] },
  ] })
  assert.equal(report.summary.stockVariance, 19_800)
  assert.equal(report.summary.cogs, 907_500)
  assert.ok(Math.abs(report.summary.variancePercentage! - 19_800 / 907_500 * 100) < 1e-10)
  assert.notEqual(report.summary.variancePercentage, 3)
})

test("opname selisih nol tetap dihitung dan menghasilkan nol persen yang sah", () => {
  const { summary } = calculate([entry(0, 150_000)])
  assert.equal(summary.opnameCount, 1)
  assert.equal(summary.variancePercentage, 0)
  assert.equal(summary.calculationStatus, "CALCULATED")
})

test("HPP nol dan belum ada opname tidak ditampilkan sebagai nol persen", () => {
  assert.equal(calculate(undefined, [order(0)]).summary.calculationStatus, "NO_COGS")
  assert.equal(calculate(undefined, [order(0)]).summary.variancePercentage, null)
  const report = buildHppStockVarianceReport({ outlets, orders: [order()], opnames: [], adjustments: [] })
  assert.equal(report.summary.calculationStatus, "NO_OPNAME")
  assert.equal(report.summary.variancePercentage, null)
})

test("HPP null atau estimasi memblokir rasio meskipun ada sebagian biaya", () => {
  for (const orders of [[order(null)], [order(825_000, false)]]) {
    const { summary } = calculate(undefined, orders)
    assert.equal(summary.incompleteCogsOrders, 1)
    assert.equal(summary.calculationStatus, "INCOMPLETE")
    assert.equal(summary.variancePercentage, null)
  }
})

test("harga historis kosong tidak diasumsikan nol; harga eksplisit nol sah untuk bahan gratis", () => {
  const missing = calculate([entry(-1, null)]).summary
  assert.equal(missing.unvaluedVarianceItems, 1)
  assert.equal(missing.variancePercentage, null)
  const free = calculate([entry(-1, 0)]).summary
  assert.equal(free.unvaluedVarianceItems, 0)
  assert.equal(free.variancePercentage, 0)
})

test("hasil fisik belum diisi dan opname tanpa bahan terlacak ditandai belum lengkap", () => {
  for (const items of [[entry(null, 100)], [entry(-1, 100, false)], []]) {
    const { summary } = calculate(items)
    assert.equal(summary.incompleteOpnames, 1)
    assert.equal(summary.variancePercentage, null)
  }
})

test("waste dipisah dari selisih dan item tak terlacak tidak masuk pembilang", () => {
  const { summary } = buildHppStockVarianceReport({
    outlets, orders: [order()], opnames: [{ locationId: "a", items: [entry(-0.1, 150_000), entry(-999, 500, false)] }],
    adjustments: [{ locationId: "a", totalCost: 7_500 }, { locationId: "a", totalCost: null }],
  })
  assert.equal(summary.stockVariance, 15_000)
  assert.equal(summary.knownLosses, 7_500)
  assert.equal(summary.unvaluedAdjustments, 1)
})

test("ringkasan semua outlet tidak menyamarkan outlet yang belum opname", () => {
  const { summary, locations } = buildHppStockVarianceReport({
    outlets: [...outlets, { id: "b", name: "Outlet lain" }], orders: [order()],
    opnames: [{ locationId: "a", items: [entry(0, 100)] }], adjustments: [],
  })
  assert.equal(locations[0].variancePercentage, 0)
  assert.equal(locations[1].calculationStatus, "NO_OPNAME")
  assert.equal(summary.calculationStatus, "INCOMPLETE")
  assert.equal(summary.variancePercentage, null)
})
