import assert from "node:assert/strict"
import test from "node:test"
import { dispatchReceiptPrint, printerFeedback } from "../src/lib/receipt-printing"
import { PrinterWriteError } from "../src/lib/thermal-printer"

test("Safari opens the system print dialog without requesting Bluetooth or using a remembered printer", async () => {
  let dialogs = 0
  for (const hasPrinter of [false, true]) {
    await dispatchReceiptPrint({
      supportsDirect: false, hasPrinter,
      printSystem: () => { dialogs += 1 },
      connect: async () => { assert.fail("Unsupported browser must not request Bluetooth") },
      printDirect: async () => { assert.fail("Unsupported browser must not send printer data") },
    })
  }
  assert.equal(dialogs, 2)
})

test("Chrome starts the chooser synchronously and does not print until a printer has been selected", async () => {
  let chooserOpened = false
  let finishSelection!: () => void
  const selected = new Promise<void>(resolve => { finishSelection = resolve })
  const request = dispatchReceiptPrint({
    supportsDirect: true, hasPrinter: false,
    connect: () => { chooserOpened = true; return selected },
    printSystem: () => assert.fail("Must not silently switch printing methods"),
    printDirect: async () => assert.fail("No data may be written during printer selection"),
  })
  assert.equal(chooserOpened, true, "Keep the browser's user activation")
  finishSelection()
  await request
})

test("a selected Chrome printer receives one print job without opening another chooser", async () => {
  let jobs = 0
  await dispatchReceiptPrint({
    supportsDirect: true, hasPrinter: true,
    connect: async () => assert.fail("Already selected"),
    printSystem: () => assert.fail("Must not duplicate the receipt"),
    printDirect: async () => { jobs += 1 },
  })
  assert.equal(jobs, 1)
})

test("cancelling either printer chooser is a neutral notice instead of a technical error", () => {
  for (const message of ["User cancelled the requestDevice() chooser.", "No port selected by the user."]) {
    assert.deepEqual(printerFeedback(new DOMException(message, "NotFoundError"), "connect"), {
      kind: "notice", message: "Pemilihan printer dibatalkan.",
    })
  }
  assert.equal(printerFeedback(new DOMException("No Bluetooth adapter available.", "NotFoundError"), "connect").kind, "error")
})

test("printer errors never expose browser exception text or device UUIDs", () => {
  const feedback = printerFeedback(new Error("GATT operation failed at requestDevice() UUID 00002af1-0000-1000-8000-00805f9b34fb"), "connect")
  assert.equal(feedback.kind, "error")
  assert.equal(feedback.message, "Printer belum bisa dihubungkan. Pastikan printer menyala, lalu coba lagi.")
  assert.equal(printerFeedback(new DOMException("Permission denied", "SecurityError"), "connect").message, "Akses printer belum diizinkan. Izinkan akses lalu coba lagi.")
})

test("interrupted writes tell the user to check paper and never automatically repeat the print", async () => {
  for (const confirmedBytes of [0, 20]) {
    const feedback = printerFeedback(new PrinterWriteError("NetworkError: GATT write failed", confirmedBytes, 100))
    assert.equal(feedback.message, "Cetak terputus. Periksa hasil di kertas sebelum mencetak ulang.")
    assert.equal(feedback.kind, "error")
  }
  let jobs = 0
  await assert.rejects(dispatchReceiptPrint({
    supportsDirect: true, hasPrinter: true,
    connect: async () => assert.fail("No automatic reconnect"),
    printSystem: () => assert.fail("No automatic second copy"),
    printDirect: async () => { jobs += 1; throw new PrinterWriteError("write failed", 20, 100) },
  }))
  assert.equal(jobs, 1)
})
