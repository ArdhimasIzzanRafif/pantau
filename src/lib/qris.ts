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

function parseTLV(data: string): TLV[] {
  const result: TLV[] = []
  let i = 0
  while (i + 4 <= data.length) {
    const tag = data.slice(i, i + 2)
    const len = parseInt(data.slice(i + 2, i + 4), 10)
    if (isNaN(len)) break
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

export function makeQrisDynamic(payload: string, amount: number): string {
  const tags = parseTLV(payload)

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
