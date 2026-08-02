import { requireAuth, isResponse, ok } from "@/lib/api-helpers"
import { prisma } from "@/lib/db"

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const orgId = user.organizationId

  const [activeLocations, openAlerts, recentOpnames, pendingTransfers] = await Promise.all([
    prisma.location.count({ where: { organizationId: orgId, isActive: true } }),
    prisma.alert.findMany({
      where: { organizationId: orgId, isResolved: false },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 10,
    }),
    prisma.stockOpname.findMany({
      where: { organizationId: orgId, status: "SUBMITTED" },
      include: {
        location: true,
        items: { include: { item: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),
    prisma.stockTransfer.count({
      where: { organizationId: orgId, status: "SENT" },
    }),
  ])

  const totalLoss = recentOpnames.reduce((sum, op) => {
    return sum + op.items.reduce((s, i) => s + (i.estimatedLoss ? Number(i.estimatedLoss) : 0), 0)
  }, 0)

  return ok({
    activeLocations,
    openAlerts,
    openAlertsCount: openAlerts.length,
    criticalAlertsCount: openAlerts.filter((a) => a.severity === "CRITICAL").length,
    recentOpnames,
    pendingTransfers,
    estimatedLoss: totalLoss,
    opnamesCount: recentOpnames.length,
  })
}
