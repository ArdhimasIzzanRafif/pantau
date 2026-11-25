import type { AlertType, Prisma, Severity } from "@prisma/client"
import { TRANSFER_NOTIFICATION_TYPES } from "@/lib/alert-feed"

/** Update the delivery's notification instead of adding one at every stage. */
export async function saveTransferNotification(tx: Prisma.TransactionClient, data: {
  organizationId: string
  referenceId: string
  type: AlertType
  severity: Severity
  title: string
  message: string
}) {
  const where = {
    organizationId: data.organizationId,
    referenceId: data.referenceId,
    type: { in: [...TRANSFER_NOTIFICATION_TYPES] },
  }
  const previous = await tx.alert.findFirst({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
  if (!previous) return tx.alert.create({ data })
  // Older duplicates from previous versions remain in the resolved archive.
  await tx.alert.updateMany({
    where: { ...where, id: { not: previous.id }, isResolved: false },
    data: { isResolved: true, resolvedAt: new Date() },
  })
  return tx.alert.update({
    where: { id: previous.id },
    data: { ...data, isResolved: false, resolvedAt: null, resolvedById: null, createdAt: new Date() },
  })
}
