type Subscription<T> = {
  status: T
  trialEndsAt?: Date | string | null
}

/** Compute access from the server clock, without waiting for a cron/status update. */
export function effectiveOrganizationStatus<T extends string | null | undefined>(
  organization: Subscription<T>,
  now = Date.now(),
): T | "EXPIRED" {
  const { status, trialEndsAt } = organization
  if (status !== "ACTIVE" && status !== "TRIAL") return status
  if (trialEndsAt == null) return status
  const deadline = new Date(trialEndsAt).getTime()
  return !Number.isFinite(deadline) || deadline <= now ? "EXPIRED" : status
}

export function hasOrganizationAccess(organization: Subscription<string | null | undefined>, now = Date.now()) {
  const status = effectiveOrganizationStatus(organization, now)
  return status === "ACTIVE" || status === "TRIAL"
}
