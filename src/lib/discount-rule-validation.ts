const MAX_MONEY = 9_999_999_999_999

export class DiscountRuleInputError extends Error {}

type ExistingDiscountRule = {
  name: string
  type: string
  value: unknown
  minPurchase: unknown
  isActive: boolean
  scheduleMode?: string
  validDays: string | null
  startsAt: Date | null
  expiresAt: Date | null
  startMinute: number | null
  endMinute: number | null
}

function has(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

function parseDate(value: unknown, endOfDay: boolean) {
  if (value == null || value === "") return null
  if (typeof value !== "string") throw new DiscountRuleInputError("Tanggal diskon tidak valid")
  const date = new Date(
    value.includes("T")
      ? value
      : `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`,
  )
  if (!Number.isFinite(date.getTime())) throw new DiscountRuleInputError("Tanggal diskon tidak valid")
  return date
}

function parseMinute(value: unknown) {
  if (value == null || value === "") return null
  const minute = Number(value)
  if (!Number.isInteger(minute) || minute < 0 || minute > 1439) {
    throw new DiscountRuleInputError("Jam diskon tidak valid")
  }
  return minute
}

function parseMoney(value: unknown, label: string, allowZero: boolean) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0) || number > MAX_MONEY) {
    throw new DiscountRuleInputError(`${label} tidak valid`)
  }
  return number
}

function parseIdList(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new DiscountRuleInputError(label)
  if (value.some((id) => typeof id !== "string" || !id.trim())) {
    throw new DiscountRuleInputError(label)
  }
  return [...new Set(value.map((id) => String(id)))]
}

export function parseDiscountRuleInput(body: Record<string, unknown>, existing?: ExistingDiscountRule) {
  const nameValue = has(body, "name") ? body.name : existing?.name
  const name = typeof nameValue === "string" ? nameValue.trim() : ""
  if (!name) throw new DiscountRuleInputError("Nama diskon wajib diisi")
  if (name.length > 100) throw new DiscountRuleInputError("Nama diskon maksimal 100 karakter")

  const type = has(body, "type") ? body.type : existing?.type
  if (type !== "PERCENT" && type !== "AMOUNT") {
    throw new DiscountRuleInputError("Tipe diskon harus persen atau rupiah")
  }

  const value = parseMoney(has(body, "value") ? body.value : existing?.value, "Nilai diskon", false)
  if (type === "PERCENT" && value > 100) {
    throw new DiscountRuleInputError("Persen diskon harus lebih dari 0 dan maksimal 100")
  }

  const minPurchase = parseMoney(
    has(body, "minPurchase") ? body.minPurchase : existing?.minPurchase ?? 0,
    "Minimal pembelian",
    true,
  )

  const isActiveValue = has(body, "isActive") ? body.isActive : existing?.isActive ?? true
  if (typeof isActiveValue !== "boolean") throw new DiscountRuleInputError("Status diskon tidak valid")

  const scheduleMode = has(body, "scheduleMode") ? body.scheduleMode : existing?.scheduleMode ?? "RECURRING"
  if (scheduleMode !== "PERIOD" && scheduleMode !== "RECURRING") {
    throw new DiscountRuleInputError("Jenis jadwal diskon tidak valid")
  }

  const validDaysValue = has(body, "validDays") ? body.validDays : existing?.validDays ?? null
  const validDays = scheduleMode === "PERIOD" || validDaysValue == null || validDaysValue === "" ? null : validDaysValue
  if (
    validDays !== null &&
    (typeof validDays !== "string" ||
      !/^([0-6])(,[0-6])*$/.test(validDays) ||
      new Set(validDays.split(",")).size !== validDays.split(",").length)
  ) {
    throw new DiscountRuleInputError("Hari berlaku tidak valid")
  }

  const startsAt = has(body, "startsAt") ? parseDate(body.startsAt, false) : existing?.startsAt ?? null
  const expiresAt = has(body, "expiresAt") ? parseDate(body.expiresAt, true) : existing?.expiresAt ?? null
  if (startsAt && expiresAt && startsAt.getTime() > expiresAt.getTime()) {
    throw new DiscountRuleInputError("Tanggal mulai tidak boleh setelah tanggal berakhir")
  }

  if (scheduleMode === "PERIOD") {
    if (!startsAt || !expiresAt) throw new DiscountRuleInputError("Isi tanggal dan jam mulai serta berakhir")
    for (const key of ["startsAt", "expiresAt"]) {
      if (has(body, key) && (typeof body[key] !== "string" || !/T\d{2}:\d{2}/.test(body[key] as string))) {
        throw new DiscountRuleInputError("Jadwal sekali selama periode harus menyertakan jam mulai dan berakhir")
      }
    }
    if (startsAt.getTime() >= expiresAt.getTime()) {
      throw new DiscountRuleInputError("Waktu berakhir harus setelah waktu mulai")
    }
  }

  const startMinute = scheduleMode === "PERIOD" ? null : has(body, "startMinute") ? parseMinute(body.startMinute) : existing?.startMinute ?? null
  const endMinute = scheduleMode === "PERIOD" ? null : has(body, "endMinute") ? parseMinute(body.endMinute) : existing?.endMinute ?? null
  if ((startMinute == null) !== (endMinute == null)) {
    throw new DiscountRuleInputError("Jam mulai dan selesai harus diisi bersamaan")
  }
  if (startMinute != null && startMinute === endMinute) {
    throw new DiscountRuleInputError("Jam mulai dan selesai tidak boleh sama")
  }

  return {
    data: {
      name,
      type,
      value,
      minPurchase,
      isActive: isActiveValue,
      scheduleMode,
      validDays,
      startsAt,
      expiresAt,
      startMinute,
      endMinute,
    },
    locationIds: has(body, "locationIds") ? parseIdList(body.locationIds, "Outlet diskon tidak valid") : undefined,
    itemIds: has(body, "itemIds") ? parseIdList(body.itemIds, "Menu diskon tidak valid") : undefined,
  }
}
