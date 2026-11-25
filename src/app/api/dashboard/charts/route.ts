import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const days = Math.min(Number(searchParams.get("days") ?? 14), 90)
  const orgId = user.organizationId

  // Use WIB (UTC+7) for date grouping so "today" matches user's local calendar
  const TZ_OFFSET_MS = 7 * 60 * 60 * 1000
  const nowWib = new Date(Date.now() + TZ_OFFSET_MS)
  const todayWibStr = nowWib.toISOString().slice(0, 10) // "YYYY-MM-DD" in WIB
  const startDate = new Date(Date.UTC(
    Number(todayWibStr.slice(0, 4)),
    Number(todayWibStr.slice(5, 7)) - 1,
    Number(todayWibStr.slice(8, 10)) - (days - 1),
  ))

  function toWibDateKey(date: Date) {
    return new Date(date.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10)
  }

  const [orders, orderItems] = await Promise.all([
    prisma.pOSOrder.findMany({
      where: { organizationId: orgId, status: "PAID", paidAt: { gte: startDate } },
      select: { paidAt: true, total: true },
    }),
    prisma.pOSOrderItem.findMany({
      where: {
        order: { organizationId: orgId, status: "PAID", paidAt: { gte: startDate } },
      },
      select: {
        menuItemId: true,
        name: true,
        qty: true,
        subtotal: true,
        // Nama terkini menu, supaya penggantian nama tidak memecah laporan.
        menuItem: { select: { name: true } },
      },
    }),
  ])

  // Daily sales
  const dailyMap = new Map<string, { total: number; orders: number }>()
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate.getTime() + i * 86400000)
    const key = toWibDateKey(d)
    dailyMap.set(key, { total: 0, orders: 0 })
  }
  for (const o of orders) {
    if (!o.paidAt) continue
    const key = toWibDateKey(new Date(o.paidAt))
    const entry = dailyMap.get(key)
    if (entry) { entry.total += Number(o.total); entry.orders++ }
  }
  const dailySales = [...dailyMap.entries()].map(([date, v]) => {
    const d = new Date(date)
    return {
      date,
      label: d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
      total: v.total,
      orders: v.orders,
    }
  })

  // Hourly distribution
  const hourlyMap: Record<number, number> = {}
  for (let h = 0; h < 24; h++) hourlyMap[h] = 0
  for (const o of orders) {
    if (!o.paidAt) continue
    const wibHour = new Date(new Date(o.paidAt).getTime() + TZ_OFFSET_MS).getUTCHours()
    hourlyMap[wibHour]++
  }
  const hourlySales = Object.entries(hourlyMap).map(([h, count]) => ({
    hour: Number(h),
    label: `${String(h).padStart(2, "0")}:00`,
    orders: count,
  }))

  // Top products.
  // Dikelompokkan per menuItemId, bukan per nama: dua menu bernama sama tidak
  // lagi tergabung, dan menu yang diganti namanya tetap jadi satu baris.
  // Baris dari menu yang sudah dihapus (menuItemId jadi null) dikelompokkan
  // memakai nama yang tersimpan di transaksi.
  const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const item of orderItems) {
    const key = item.menuItemId ? `id:${item.menuItemId}` : `name:${item.name}`
    const existing = productMap.get(key)
    if (existing) {
      existing.qty += Number(item.qty)
      existing.revenue += Number(item.subtotal)
    } else {
      productMap.set(key, {
        name: item.menuItem?.name ?? item.name,
        qty: Number(item.qty),
        revenue: Number(item.subtotal),
      })
    }
  }
  const topProducts = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0)
  const totalOrders = orders.length
  const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

  return ok({ dailySales, hourlySales, topProducts, totalRevenue, totalOrders, avgOrder })
}
