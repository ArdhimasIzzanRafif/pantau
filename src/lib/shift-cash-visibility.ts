export function canReviewShiftCash(role: string | null | undefined) {
  return role === "OWNER" || role === "SUPERVISOR"
}

export function visibleShiftCash<T extends { status: string; expectedCash: unknown }>(shift: T, role: string) {
  return {
    ...shift,
    expectedCash: shift.status === "CLOSED" && canReviewShiftCash(role) ? shift.expectedCash : null,
  }
}
