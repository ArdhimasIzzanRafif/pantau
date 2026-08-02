import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { isResponse, ok } from "@/lib/api-helpers"

export async function GET() {
  const admin = await requireAdmin()
  if (isResponse(admin)) return admin

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [posOrders, goodsReceipts, stockTransfers, stockOpnames, alerts, posOrgsCount, opnameOrgsCount] =
    await Promise.all([
      prisma.pOSOrder.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.goodsReceipt.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.stockTransfer.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.stockOpname.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.alert.count({ where: { createdAt: { gte: startOfMonth } } }),
      // orgs using POS this month
      prisma.pOSOrder.groupBy({ by: ["organizationId"], where: { createdAt: { gte: startOfMonth } } }),
      // orgs running opname
      prisma.stockOpname.groupBy({ by: ["organizationId"], where: { createdAt: { gte: startOfMonth } } }),
    ])

  // Usage by org (top 10 by order count)
  const byOrg = await prisma.organization.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      plan: true,
      status: true,
      _count: {
        select: {
          posOrders: true,
          goodsReceipts: true,
          stockTransfers: true,
          stockOpnames: true,
          alerts: true,
        },
      },
    },
  })

  return ok({
    thisMonth: {
      posOrders,
      goodsReceipts,
      stockTransfers,
      stockOpnames,
      alerts,
      orgsUsingPos: posOrgsCount.length,
      orgsRunningOpname: opnameOrgsCount.length,
    },
    features: [
      { name: "Transaksi POS", count: posOrders, icon: "ShoppingBag" },
      { name: "Barang Masuk", count: goodsReceipts, icon: "PackagePlus" },
      { name: "Transfer Stok", count: stockTransfers, icon: "ArrowLeftRight" },
      { name: "Opname Fisik", count: stockOpnames, icon: "ClipboardList" },
      { name: "Alert Stok", count: alerts, icon: "Bell" },
    ],
    byOrg: byOrg.map((o) => ({
      id: o.id,
      name: o.name,
      plan: o.plan,
      status: o.status,
      posOrders: o._count.posOrders,
      goodsReceipts: o._count.goodsReceipts,
      stockTransfers: o._count.stockTransfers,
      opnames: o._count.stockOpnames,
      alerts: o._count.alerts,
    })),
  })
}
