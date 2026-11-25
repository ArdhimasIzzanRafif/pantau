import { formatDiscountSchedule } from "./discount-schedule"

export type DiscountScheduleForm = {
  scheduleMode: "PERIOD" | "RECURRING"
  startsAt: string
  expiresAt: string
  startTime: string
  endTime: string
  validDays: number[]
}

export function timeToMinute(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hour, minute] = value.split(":").map(Number)
  return hour * 60 + minute
}

export function minuteToTime(value: number | null | undefined) {
  if (value == null) return ""
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
}

export function jakartaTimeInput(value: string | null) {
  if (!value) return ""
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(new Date(value))
}

export function discountScheduleInput(form: DiscountScheduleForm) {
  if (form.scheduleMode === "PERIOD") {
    if (!form.startsAt || !form.expiresAt || timeToMinute(form.startTime) == null || timeToMinute(form.endTime) == null) {
      throw new Error("Isi tanggal dan jam mulai serta berakhir.")
    }
    const startsAt = `${form.startsAt}T${form.startTime}:00+07:00`
    const expiresAt = `${form.expiresAt}T${form.endTime}:00+07:00`
    if (new Date(expiresAt).getTime() <= new Date(startsAt).getTime()) {
      throw new Error("Waktu berakhir harus setelah waktu mulai.")
    }
    return { scheduleMode: form.scheduleMode, startsAt, expiresAt, startMinute: null, endMinute: null, validDays: null }
  }
  if (form.startsAt && form.expiresAt && form.startsAt > form.expiresAt) throw new Error("Tanggal berakhir harus sama dengan atau setelah tanggal mulai.")
  if ((form.startTime !== "" && timeToMinute(form.startTime) == null) || (form.endTime !== "" && timeToMinute(form.endTime) == null)) {
    throw new Error("Jam tidak valid. Isi jam mulai dan selesai dengan lengkap.")
  }
  if (Boolean(form.startTime) !== Boolean(form.endTime)) throw new Error("Isi jam mulai dan selesai, atau kosongkan keduanya untuk sepanjang hari.")
  if (form.startTime && form.startTime === form.endTime) throw new Error("Jam mulai dan selesai tidak boleh sama.")
  return {
    scheduleMode: form.scheduleMode,
    startsAt: form.startsAt || null, expiresAt: form.expiresAt || null,
    startMinute: timeToMinute(form.startTime), endMinute: timeToMinute(form.endTime),
    validDays: form.validDays.length ? [...form.validDays].sort((a, b) => a - b).join(",") : null,
  }
}

export function discountSchedulePreview(form: DiscountScheduleForm) {
  try {
    return formatDiscountSchedule(discountScheduleInput(form))
  } catch (error) {
    return error instanceof Error ? error.message : "Lengkapi jadwal diskon."
  }
}
