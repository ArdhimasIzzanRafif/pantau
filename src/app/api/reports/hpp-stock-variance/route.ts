import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { buildHppStockVarianceReport, HPP_STATUS_LABELS } from "@/lib/hpp-stock-variance"
import { createStyledExcelReport } from "@/lib/excel-report"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function jakartaDateRange(from: string, to: string) {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return null
  const start = new Date(`${from}T00:00:00.000+07:00`)
  const end = new Date(`${to}T23:59:59.999+07:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return null
  return { start, end }
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Laporan ini hanya dapat dilihat Owner", 403)

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const from = req.nextUrl.searchParams.get("from") ?? `${today.slice(0, 7)}-01`
  const to = req.nextUrl.searchParams.get("to") ?? today
  const locationId = req.nextUrl.searchParams.get("locationId")
  const range = jakartaDateRange(from, to)
  if (!range) return err("Periode laporan tidak valid")

  const outlets = await prisma.location.findMany({
    where: {
      organizationId: user.organizationId,
      type: "OUTLET",
      ...(locationId ? { id: locationId } : {}),
    },
    select: { id: true, name: true, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  if (locationId && outlets.length === 0) return err("Outlet tidak ditemukan", 404)
  const outletIds = outlets.map((outlet) => outlet.id)

  const [orders, opnames, adjustments] = await Promise.all([
    prisma.pOSOrder.findMany({
      where: {
        organizationId: user.organizationId,
        locationId: { in: outletIds },
        status: "PAID",
        paidAt: { gte: range.start, lte: range.end },
      },
      select: { locationId: true, total: true, cogsAmount: true, cogsComplete: true },
    }),
    prisma.stockOpname.findMany({
      where: {
        organizationId: user.organizationId,
        locationId: { in: outletIds },
        status: { in: ["SUBMITTED", "REVIEWED"] },
        periodEnd: { gte: range.start, lte: range.end },
      },
      select: {
        locationId: true,
        items: { select: {
          difference: true,
          absoluteVarianceValue: true,
          unitCostSnapshot: true,
          item: { select: { isTrackable: true } },
        } },
      },
    }),
    prisma.stockAdjustment.findMany({
      where: {
        organizationId: user.organizationId,
        locationId: { in: outletIds },
        createdAt: { gte: range.start, lte: range.end },
      },
      select: { locationId: true, totalCost: true },
    }),
  ])

  const report = { period: { from, to }, ...buildHppStockVarianceReport({ outlets, orders, opnames, adjustments }) }
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const rows = [...report.locations.map((row) => ({ ...row, locationName: row.locationName })), { ...report.summary, locationName: "TOTAL" }].map((row) => ({
      "Dari": from, "Sampai": to, "Outlet": row.locationName,
      "Omzet": row.revenue, "HPP bahan": row.cogs, "Laba kotor": row.grossProfit,
      "Selisih stok": row.stockVariance, "Stok kurang": row.shortageValue, "Stok lebih": row.surplusValue,
      "% selisih": row.variancePercentage == null ? "Tidak dihitung" : Number(row.variancePercentage.toFixed(2)),
      "Kerugian tercatat": row.knownLosses, "Transaksi lunas": row.paidOrders, "Siklus opname": row.opnameCount,
      "Transaksi HPP belum lengkap": row.incompleteCogsOrders, "Opname belum lengkap": row.incompleteOpnames,
      "Item selisih tanpa harga historis": row.unvaluedVarianceItems, "Pengurangan tanpa biaya": row.unvaluedAdjustments,
      "Status perhitungan": HPP_STATUS_LABELS[row.calculationStatus],
    }))
    const buffer = await createStyledExcelReport({
      title: `HPP bahan dan selisih stok ${from} s.d. ${to}`,
      sheetName: "HPP dan Selisih", rows,
      headers: Object.keys(rows[0]), widths: [14, 14, 30, 20, 20, 20, 20, 20, 20, 18, 22, 18, 18, 28, 26, 30, 26, 26],
      currencyHeaders: ["Omzet", "HPP bahan", "Laba kotor", "Selisih stok", "Stok kurang", "Stok lebih", "Kerugian tercatat"],
    })
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="hpp-selisih-${from}-${to}.xlsx"`,
      "Cache-Control": "no-store",
    } })
  }
  return ok(report)
}
