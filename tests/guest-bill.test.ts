import assert from "node:assert/strict"
import test from "node:test"
import { guestBillKey, isGuestSessionId } from "../src/lib/guest-bill"

test("tagihan dibedakan per sesi, bukan meja atau nama yang sama", () => {
  const order = { id: "1", locationId: "outlet", guestSessionId: "budi", tableNumber: "1" }
  assert.equal(guestBillKey(order), guestBillKey({ ...order, id: "2" }))
  assert.notEqual(guestBillKey(order), guestBillKey({ ...order, guestSessionId: "arman" }))
  assert.notEqual(guestBillKey(order), guestBillKey({ ...order, locationId: "outlet-lain" }))
  assert.notEqual(guestBillKey({ ...order, guestSessionId: null }), guestBillKey({ ...order, id: "2", guestSessionId: null }))
})

test("identitas sesi harus UUID acak, bukan nama atau nomor meja", () => {
  assert.equal(isGuestSessionId("e4cc5875-8413-47d1-8498-53b41d56ad4f"), true)
  for (const invalid of [null, "", "Budi", "Meja 1", "session-1"]) assert.equal(isGuestSessionId(invalid), false)
})
