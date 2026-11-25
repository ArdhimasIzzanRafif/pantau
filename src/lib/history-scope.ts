import type { SessionUser } from "@/lib/api-helpers"
import { getFeatureAccess } from "@/lib/feature-access"

export type HistoryScopeMode = "ACTOR" | "LOCATION"

export function historyActorId(
  user: Pick<SessionUser, "id" | "role">,
  requested: boolean,
  mode: HistoryScopeMode = "ACTOR",
) {
  return requested && mode === "ACTOR" && user.role !== "OWNER" ? user.id : undefined
}

export async function getHistoryScope(
  user: SessionUser,
  requested: boolean,
  mode: HistoryScopeMode = "ACTOR",
) {
  if (!requested) return { allowed: true, actorId: undefined }
  const access = await getFeatureAccess(user, "HISTORY")
  return {
    allowed: access !== null,
    actorId: historyActorId(user, true, mode),
  }
}
