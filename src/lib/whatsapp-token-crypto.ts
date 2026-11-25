import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function key() {
  const value = process.env.WHATSAPP_ENCRYPTION_KEY ?? ""
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error("Kunci enkripsi WhatsApp server belum dikonfigurasi")
  return Buffer.from(value, "hex")
}

export function encryptWhatsAppToken(token: string, organizationId: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  cipher.setAAD(Buffer.from(organizationId))
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":")
}

export function decryptWhatsAppToken(value: string, organizationId: string) {
  const [version, iv, tag, encrypted, extra] = value.split(":")
  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) throw new Error("Token tersimpan tidak valid")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
  decipher.setAAD(Buffer.from(organizationId))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8")
}
