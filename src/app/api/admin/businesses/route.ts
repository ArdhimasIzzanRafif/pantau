import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { isResponse, ok, err } from "@/lib/api-helpers"

export async function GET() {
  const admin = await requireAdmin()
  if (isResponse(admin)) return admin

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, locations: { where: { isActive: true } }, posOrders: true, goodsReceipts: true, stockOpnames: true } },
      users: {
        where: { role: "OWNER" },
        take: 1,
        include: { user: { select: { email: true, name: true } } },
      },
      posOrders: {
        where: { status: "PAID", paidAt: { gte: startOfMonth } },
        select: { total: true },
      },
    },
  })

  // Count active users (who logged in recently — proxy: orders created recently)
  const recentOrderOrgs = await prisma.pOSOrder.groupBy({
    by: ["organizationId"],
    where: { createdAt: { gte: sevenDaysAgo } },
    _count: true,
  })
  const activeOrgIds = new Set(recentOrderOrgs.map((o) => o.organizationId))

  const result = orgs.map((org) => {
    const monthlyRevenue = org.posOrders.reduce((s, o) => s + Number(o.total), 0)
    const isRecentlyActive = activeOrgIds.has(org.id)
    const trialExpired = org.trialEndsAt && org.trialEndsAt < now
    const daysOld = Math.floor((now.getTime() - org.createdAt.getTime()) / 86400000)

    // Health score
    let health: "healthy" | "at_risk" | "inactive" | "churn_risk" = "healthy"
    if (org.status === "SUSPENDED" || org.status === "CANCELLED") {
      health = "inactive"
    } else if (trialExpired && org.status === "TRIAL") {
      health = "churn_risk"
    } else if (!isRecentlyActive && daysOld > 7) {
      health = org._count.posOrders === 0 ? "churn_risk" : "at_risk"
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      status: org.status,
      trialEndsAt: org.trialEndsAt,
      lastActiveAt: org.lastActiveAt,
      suspendedAt: org.suspendedAt,
      createdAt: org.createdAt,
      owner: org.users[0]?.user ?? null,
      counts: {
        users: org._count.users,
        locations: org._count.locations,
        orders: org._count.posOrders,
        receipts: org._count.goodsReceipts,
        opnames: org._count.stockOpnames,
      },
      monthlyRevenue,
      isRecentlyActive,
      health,
      daysOld,
    }
  })

  return ok(result)
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin()
  if (isResponse(admin)) return admin

  const body = await req.json()
  const { id, action, plan, status, trialDays, note } = body
  if (!id) return err("id wajib")

  const org = await prisma.organization.findUnique({ where: { id } })
  if (!org) return err("Bisnis tidak ditemukan", 404)

  const before: Record<string, unknown> = { plan: org.plan, status: org.status }
  const data: Record<string, unknown> = {}

  if (action === "change_plan" && plan) {
    data.plan = plan
  } else if (action === "change_status" && status) {
    data.status = status
    if (status === "SUSPENDED") data.suspendedAt = new Date()
    if (status === "ACTIVE") data.suspendedAt = null
  } else if (action === "extend_trial" && trialDays) {
    const base = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date()
    data.trialEndsAt = new Date(base.getTime() + trialDays * 86400000)
    data.status = "ACTIVE"
  } else {
    return err("Action tidak valid")
  }

  await prisma.organization.update({ where: { id }, data })

  await prisma.platformAuditLog.create({
    data: {
      adminEmail: admin.email,
      action,
      targetType: "organization",
      targetId: id,
      note: note ?? null,
      before,
      after: data,
    },
  })

  return ok({ ok: true })
}
