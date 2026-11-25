type FeedAlert = {
  id: string
  type: string
  severity: string
  title: string
  message: string
  referenceId: string | null
  createdAt: Date | string
}

export const TRANSFER_NOTIFICATION_TYPES = [
  "TRANSFER_SENT", "TRANSFER_COMPLETED", "TRANSFER_REJECTED", "STOCK_SHORTAGE", "STOCK_SURPLUS",
] as const

export function isTransferNotification(alert: Pick<FeedAlert, "type">) {
  return (TRANSFER_NOTIFICATION_TYPES as readonly string[]).includes(alert.type)
}

function priority(alert: FeedAlert) {
  if (alert.type === "LOW_STOCK") return 0
  return alert.severity === "INFO" ? 2 : 1
}

function transferPriority(alert: FeedAlert) {
  if (alert.severity !== "INFO") return 0
  if (alert.type === "TRANSFER_SENT") return 3
  return /orang yang sama/i.test(alert.title) ? 2 : 1
}

/** One entry per transfer; stock thresholds stay ahead of routine activity. */
export function compactAlertFeed<T extends FeedAlert>(
  alerts: readonly T[],
  transfers: ReadonlyMap<string, { status: string }>,
  active = true,
): T[] {
  const result: T[] = []
  const groups = new Map<string, T[]>()
  for (const alert of alerts) {
    const transfer = alert.referenceId ? transfers.get(alert.referenceId) : null
    if (transfer && isTransferNotification(alert)) {
      // A completed/dismissed delivery must never reappear as "in transit".
      if (active && alert.type === "TRANSFER_SENT" && transfer.status !== "SENT") continue
      const group = groups.get(alert.referenceId!) ?? []
      group.push(alert)
      groups.set(alert.referenceId!, group)
    } else result.push(alert)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => transferPriority(a) - transferPriority(b)
      || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      || b.id.localeCompare(a.id))
    const chosen = group[0]
    const samePerson = group.some(alert => /orang yang sama/i.test(alert.title))
    result.push(samePerson && !/orang yang sama/i.test(chosen.message)
      ? { ...chosen, message: `${chosen.message} Pengirim dan penerima orang yang sama.` }
      : chosen)
  }
  return result.sort((a, b) => (active ? priority(a) - priority(b) : 0)
    || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    || b.id.localeCompare(a.id))
}
