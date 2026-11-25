import assert from "node:assert/strict"
import test from "node:test"
import { randomBytes } from "node:crypto"
import {
  decryptWhatsAppToken,
  encryptWhatsAppToken,
} from "../src/lib/whatsapp-token-crypto"

test("token terenkripsi, ciphertext acak, dan terikat pada bisnis", () => {
  const original = process.env.WHATSAPP_ENCRYPTION_KEY

  try {
    process.env.WHATSAPP_ENCRYPTION_KEY = randomBytes(32).toString("hex")
    const token = "test-device-token-secret"
    const first = encryptWhatsAppToken(token, "business-a")

    assert.ok(!first.includes(token))
    assert.notEqual(first, encryptWhatsAppToken(token, "business-a"))
    assert.equal(decryptWhatsAppToken(first, "business-a"), token)
    assert.throws(() => decryptWhatsAppToken(first, "business-b"))

    const parts = first.split(":")
    parts[3] = Buffer.from("changed ciphertext").toString("base64")
    assert.throws(() => decryptWhatsAppToken(parts.join(":"), "business-a"))

    process.env.WHATSAPP_ENCRYPTION_KEY = randomBytes(32).toString("hex")
    assert.throws(() => decryptWhatsAppToken(first, "business-a"))

    delete process.env.WHATSAPP_ENCRYPTION_KEY
    assert.throws(() => encryptWhatsAppToken(token, "business-a"))
  } finally {
    if (original === undefined) delete process.env.WHATSAPP_ENCRYPTION_KEY
    else process.env.WHATSAPP_ENCRYPTION_KEY = original
  }
})
