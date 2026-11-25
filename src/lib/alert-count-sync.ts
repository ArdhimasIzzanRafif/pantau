export const ALERT_COUNT_UPDATED = "alert-count-updated"
export const ALERT_REFRESH_INTERVAL = 3_000

export type AlertCountUpdate = { organizationId: string; count: number }

// Daftar dan badge memakai hasil yang sama tanpa menunggu polling berikutnya.
export function publishAlertCount(organizationId: string, count: number) {
  window.dispatchEvent(new CustomEvent<AlertCountUpdate>(ALERT_COUNT_UPDATED, {
    detail: { organizationId, count },
  }))
}

export function readAlertCountUpdate(event: Event, organizationId?: string): number | null {
  const detail = (event as CustomEvent<AlertCountUpdate>).detail
  if (!organizationId || !detail) return null
  return detail.organizationId === organizationId && Number.isSafeInteger(detail.count) && detail.count >= 0
    ? detail.count : null
}
