import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { isResponse, ok } from "@/lib/api-helpers"
import { NextResponse } from "next/server"
import { effectiveOrganizationStatus } from "@/lib/organization-subscription"

export async function GET() {
  try {
    const admin = await requireAdmin()
    if (isResponse(admin)) return admin

    const now = Date.now()
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const sevenDaysAgo = new Date(now - 7 * 86400000)
    const thirtyDaysAgo = new Date(now - 30 * 86400000)

    const [
      totalOrgs, totalUsers, totalLocations,
      ordersThisMonth,
      freeCount, starterCount, proCount, enterpriseCount,
      recentOrgs,
      usagePOS, usageReceipts, usageTransfers, usageOpnames, usageAlerts,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.location.count(),
      prisma.pOSOrder.count({ where: { status: "PAID", paidAt: { gte: startOfMonth } } }),
      prisma.organization.count({ where: { plan: "FREE" } }),
      prisma.organization.count({ where: { plan: "STARTER" } }),
      prisma.organization.count({ where: { plan: "PRO" } }),
      prisma.organization.count({ where: { plan: "ENTERPRISE" } }),
      prisma.organization.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.pOSOrder.count({ where: { status: "PAID", paidAt: { gte: startOfMonth } } }),
      prisma.goodsReceipt.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.stockTransfer.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.stockOpname.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.alert.count({ where: { createdAt: { gte: startOfMonth } } }),
    ])

    // Health distribution
    const allOrgs = await prisma.organization.findMany({
      select: { id: true, status: true, trialEndsAt: true, createdAt: true }
    })
    const recentActiveOrgs = await prisma.pOSOrder.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { organizationId: true },
      distinct: ["organizationId"],
    })
    const activeIds = new Set(recentActiveOrgs.map((r) => r.organizationId))

    const healthCounts = { healthy: 0, at_risk: 0, inactive: 0, churn_risk: 0 }
    const statusCounts = { PENDING: 0, TRIAL: 0, ACTIVE: 0, SUSPENDED: 0, CANCELLED: 0, EXPIRED: 0 }
    for (const org of allOrgs) {
      const status = effectiveOrganizationStatus(org, now)
      statusCounts[status]++
      const isActive = activeIds.has(org.id)
      const daysOld = Math.floor((now - org.createdAt.getTime()) / 86400000)
      let h: keyof typeof healthCounts
      if (status === "SUSPENDED" || status === "EXPIRED") {
        h = "churn_risk"
      } else if (isActive) {
        h = "healthy"
      } else if (daysOld > 30) {
        h = "at_risk"
      } else {
        h = "inactive"
      }
      healthCounts[h]++
    }

    // Daily signups last 14 days
    const recentSignups = await prisma.organization.findMany({
      where: { createdAt: { gte: new Date(now - 14 * 86400000) } },
      select: { createdAt: true },
    })
    const dailySignups: Record<string, number> = {}
    for (let i = 13; i >= 0; i--) {
      const key = new Date(now - i * 86400000).toLocaleDateString("en-CA")
      dailySignups[key] = 0
    }
    for (const o of recentSignups) {
      const key = new Date(o.createdAt).toLocaleDateString("en-CA")
      if (key in dailySignups) dailySignups[key]++
    }

    return ok({
      totals: { orgs: totalOrgs, users: totalUsers, locations: totalLocations, ordersThisMonth },
      byStatus: statusCounts,
      byPlan: { FREE: freeCount, STARTER: starterCount, PRO: proCount, ENTERPRISE: enterpriseCount },
      byHealth: healthCounts,
      usage: { posOrders: usagePOS, goodsReceipts: usageReceipts, stockTransfers: usageTransfers, opnames: usageOpnames, alerts: usageAlerts },
      recentOrgs,
      dailySignups: Object.entries(dailySignups).map(([date, count]) => ({ date, count })),
    })
  } catch (e) {
    console.error("[admin/stats]", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
