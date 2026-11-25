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
      // Sama seperti halaman Peringatan: yang terbaru di atas.
      orderBy: { createdAt: "desc" },
      take: 50,
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

  const lowStockAlerts = openAlerts.filter((alert) => alert.type === "LOW_STOCK" && alert.itemId && alert.locationId)
  const opnameAlertReferenceIds = openAlerts
    .filter((alert) =>
      (alert.type === "STOCK_SHORTAGE" || alert.type === "STOCK_SURPLUS")
      && alert.referenceId,
    )
    .map((alert) => alert.referenceId!)

  const [configuredMinimums, unapprovedOpnames] = await Promise.all([
    lowStockAlerts.length > 0
      ? prisma.inventoryLocationSetting.findMany({
          where: {
            organizationId: orgId,
            OR: lowStockAlerts.map((alert) => ({ itemId: alert.itemId!, locationId: alert.locationId! })),
            minStock: { not: null },
          },
          select: { itemId: true, locationId: true },
        })
      : [],
    opnameAlertReferenceIds.length > 0
      ? prisma.stockOpname.findMany({
          where: {
            organizationId: orgId,
            id: { in: opnameAlertReferenceIds },
            status: { not: "REVIEWED" },
          },
          select: { id: true },
        })
      : [],
  ])
  const configuredKeys = new Set(configuredMinimums.map((setting) => `${setting.itemId}:${setting.locationId}`))
  const unapprovedOpnameIds = new Set(unapprovedOpnames.map((opname) => opname.id))
  const visibleOpenAlerts = openAlerts.filter((alert) => {
    if (alert.referenceId && unapprovedOpnameIds.has(alert.referenceId)) return false
    return alert.type !== "LOW_STOCK"
      || (!!alert.itemId && !!alert.locationId && configuredKeys.has(`${alert.itemId}:${alert.locationId}`))
  }).slice(0, 10)

  const totalLoss = recentOpnames.reduce((sum, op) => {
    return sum + op.items.reduce((s, i) => {
      if (!i.item.isTrackable) return s
      return s + (i.estimatedLoss ? Number(i.estimatedLoss) : 0)
    }, 0)
  }, 0)

  return ok({
    activeLocations,
    openAlerts: visibleOpenAlerts,
    openAlertsCount: visibleOpenAlerts.length,
    criticalAlertsCount: visibleOpenAlerts.filter((a) => a.severity === "CRITICAL").length,
    recentOpnames,
    pendingTransfers,
    estimatedLoss: totalLoss,
    opnamesCount: recentOpnames.length,
  })
}
