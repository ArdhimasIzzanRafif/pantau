export type DiscountSchedule = {
  isActive: boolean
  scheduleMode?: string
  validDays?: string | null
  startsAt?: string | Date | null
  expiresAt?: string | Date | null
  startMinute?: number | null
  endMinute?: number | null
}

export type DiscountScheduleStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "UPCOMING"
  | "EXPIRED"
  | "OUTSIDE_SCHEDULE"

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function asTimestamp(value: string | Date | null | undefined) {
  if (!value) return null
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function jakartaClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ""
  return {
    day: DAY_INDEX[part("weekday")] ?? date.getDay(),
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  }
}

export function getDiscountScheduleStatus(rule: DiscountSchedule, now = new Date()): DiscountScheduleStatus {
  if (!rule.isActive) return "INACTIVE"

  const nowTimestamp = now.getTime()
  const startsAt = asTimestamp(rule.startsAt)
  const expiresAt = asTimestamp(rule.expiresAt)
  if (startsAt !== null && nowTimestamp < startsAt) return "UPCOMING"
  if (expiresAt !== null && (rule.scheduleMode === "PERIOD" ? nowTimestamp >= expiresAt : nowTimestamp > expiresAt)) return "EXPIRED"

  // Satu periode berjalan terus dari waktu mulai sampai tepat waktu berakhir.
  if (rule.scheduleMode === "PERIOD") {
    return startsAt !== null && expiresAt !== null ? "ACTIVE" : "OUTSIDE_SCHEDULE"
  }

  const { day, minute } = jakartaClock(now)
  const startMinute = rule.startMinute
  const endMinute = rule.endMinute
  let applicableDay = day

  if (startMinute != null || endMinute != null) {
    if (startMinute == null || endMinute == null || startMinute === endMinute) return "OUTSIDE_SCHEDULE"
    if (startMinute < endMinute) {
      if (minute < startMinute || minute >= endMinute) return "OUTSIDE_SCHEDULE"
    } else if (minute >= startMinute) {
      applicableDay = day
    } else if (minute < endMinute) {
      applicableDay = (day + 6) % 7
    } else {
      return "OUTSIDE_SCHEDULE"
    }
  }

  if (rule.validDays) {
    const validDays = rule.validDays.split(",").map(Number)
    if (!validDays.includes(applicableDay)) return "OUTSIDE_SCHEDULE"
  }

  return "ACTIVE"
}

export function isDiscountRuleValidNow(rule: DiscountSchedule, now = new Date()) {
  return getDiscountScheduleStatus(rule, now) === "ACTIVE"
}

export function formatDiscountSchedule(rule: Omit<DiscountSchedule, "isActive">) {
  const date = (value: string | Date, includeTime = false) => new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).format(new Date(value))
  const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}.${String(minute % 60).padStart(2, "0")}`
  if (rule.scheduleMode === "PERIOD") {
    if (!rule.startsAt || !rule.expiresAt) return "Isi tanggal dan jam mulai serta berakhir."
    return `${date(rule.startsAt, true)} sampai ${date(rule.expiresAt, true)} WIB. Otomatis berakhir setelah periode ini.`
  }
  const days = rule.validDays
    ? rule.validDays.split(",").map((day) => ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][Number(day)]).join(", ")
    : "Setiap hari"
  const hours = rule.startMinute != null && rule.endMinute != null
    ? `pukul ${time(rule.startMinute)}–${time(rule.endMinute)} WIB${rule.startMinute > rule.endMinute ? " (selesai keesokan hari)" : ""}`
    : "sepanjang hari"
  const dates = rule.startsAt || rule.expiresAt
    ? ` Berlaku ${rule.startsAt ? `mulai ${date(rule.startsAt)}` : "sejak dibuat"}${rule.expiresAt ? ` sampai ${date(rule.expiresAt)}` : " tanpa batas tanggal"}.`
    : ""
  return `${days}, ${hours}.${dates}`
}
