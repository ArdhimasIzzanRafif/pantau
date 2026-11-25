// QRIS Dynamic QR generation based on EMV QR Code Specification
// Format: TLV (Tag 2 chars + Length 2 chars decimal + Value)

function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

type TLV = { tag: string; value: string }

function parseTLV(data: string): TLV[] | null {
  const result: TLV[] = []
  let i = 0
  while (i < data.length) {
    if (i + 4 > data.length) return null
    const tag = data.slice(i, i + 2)
    const lengthText = data.slice(i + 2, i + 4)
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) return null
    const len = Number(lengthText)
    if (i + 4 + len > data.length) return null
    const value = data.slice(i + 4, i + 4 + len)
    result.push({ tag, value })
    i += 4 + len
  }
  return result
}

function buildTLV(tags: TLV[]): string {
  return tags
    .map(({ tag, value }) => `${tag}${String(value.length).padStart(2, "0")}${value}`)
    .join("")
}

export type QrisValidationResult =
  | { valid: true; payload: string }
  | { valid: false; error: string }

export function validateQrisPayload(rawPayload: string): QrisValidationResult {
  const payload = rawPayload.trim()
  if (!payload.startsWith("000201")) {
    return { valid: false, error: "QR yang dipilih bukan QRIS pembayaran" }
  }

  const tags = parseTLV(payload)
  if (!tags?.length) {
    return { valid: false, error: "Struktur data QRIS tidak valid" }
  }

  const crcTag = tags.at(-1)
  if (!crcTag || crcTag.tag !== "63" || crcTag.value.length !== 4 || !/^[0-9A-Fa-f]{4}$/.test(crcTag.value)) {
    return { valid: false, error: "Checksum QRIS tidak ditemukan" }
  }

  const expectedCrc = crc16(payload.slice(0, -4))
  if (expectedCrc !== crcTag.value.toUpperCase()) {
    return { valid: false, error: "Checksum QRIS tidak valid" }
  }

  const country = tags.find((tag) => tag.tag === "58")?.value
  const currency = tags.find((tag) => tag.tag === "53")?.value
  const hasQrisIdentifier = tags.some((tag) => {
    const nested = parseTLV(tag.value)
    return nested?.some((entry) => entry.value.toUpperCase() === "ID.CO.QRIS.WWW") ?? false
  })

  if (country !== "ID" || currency !== "360" || !hasQrisIdentifier) {
    return { valid: false, error: "QR terdeteksi, tetapi bukan QRIS Indonesia yang valid" }
  }

  return { valid: true, payload }
}

export function makeQrisDynamic(payload: string, amount: number): string {
  const tags = parseTLV(payload)
  if (!tags) throw new Error("Payload QRIS tidak valid")

  // Change initiation method to dynamic (12)
  const initTag = tags.find((t) => t.tag === "01")
  if (initTag) initTag.value = "12"

  // Remove existing amount tag if any
  const filtered = tags.filter((t) => t.tag !== "54" && t.tag !== "63")

  // Format amount as integer string (IDR has no decimal cents in practice)
  const amountStr = String(Math.round(amount))

  // Insert before tag 58 (country code), or at end if not found
  const idx58 = filtered.findIndex((t) => t.tag === "58")
  const insertAt = idx58 >= 0 ? idx58 : filtered.length
  filtered.splice(insertAt, 0, { tag: "54", value: amountStr })

  // Build body and append CRC
  const body = buildTLV(filtered) + "6304"
  return body + crc16(body)
}
