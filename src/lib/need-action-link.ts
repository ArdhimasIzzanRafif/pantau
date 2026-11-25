import "server-only"
import type { Prisma } from "@prisma/client"

type Tx = Prisma.TransactionClient
export class NeedLinkExpired extends Error {
  constructor() { super("Kebutuhan ini sudah diproses atau tautannya tidak berlaku. Buka Transfer Barang untuk melihat kebutuhan terbaru.") }
}

export async function requireUnusedNeedLink(tx: Tx, organizationId: string, itemId: string, locationId: string, alertId: unknown) {
  if (typeof alertId !== "string" || !alertId) throw new NeedLinkExpired()
  const alert = await tx.alert.findFirst({ where: { id: alertId, organizationId, itemId, locationId, type: "LOW_STOCK", isResolved: false }, select: { id: true } })
  if (!alert || await tx.auditLog.findFirst({ where: { organizationId, entity: "Alert", entityId: alertId, action: "USE_NEED_LINK" }, select: { id: true } })) throw new NeedLinkExpired()
}

// Called in the same transaction as submitting/rejecting, after locking the
// stock balance. Opening a link alone does not use it; committing an action does.
export async function consumeNeedLinks(tx: Tx, organizationId: string, userId: string, itemId: string, locationId: string, requestId: string) {
  const alerts = await tx.alert.findMany({ where: { organizationId, itemId, locationId, type: "LOW_STOCK", isResolved: false }, select: { id: true } })
  for (const alert of alerts) {
    if (await tx.auditLog.findFirst({ where: { organizationId, entity: "Alert", entityId: alert.id, action: "USE_NEED_LINK" }, select: { id: true } })) continue
    await tx.auditLog.create({ data: { organizationId, userId, action: "USE_NEED_LINK", entity: "Alert", entityId: alert.id, after: { itemId, locationId, requestId } } })
  }
}
