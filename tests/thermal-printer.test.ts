import assert from "node:assert/strict"
import test from "node:test"
import {
  buildEscPosReceipt,
  PrinterWriteError,
  printViaBluetooth,
  reconnectThermalPrinter,
  reconnectThermalPrinterConnection,
  type ReceiptLine,
} from "../src/lib/thermal-printer"

const PRINTER_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb"
const PRINTER_RX = "00002af1-0000-1000-8000-00805f9b34fb"
const MICROCHIP_SERVICE = "49535343-fe7d-4ae5-8fa9-9fafd205e455"
const MICROCHIP_RX = "49535343-8841-43f4-a8d4-ecbe34729bb3"
const MICROCHIP_TX = "49535343-1e4d-4bd9-ba61-23c647249616"
const MICROCHIP_CONTROL = "49535343-4c8a-39b3-2f49-511cff073b7e"
let deviceCounter = 0

type WriteMode = "without-response" | "with-response" | "legacy"

function makeCharacteristic(uuid = PRINTER_RX, withoutResponse = true) {
  const writes: Array<{ mode: WriteMode; bytes: Uint8Array }> = []
  let notificationCalls = 0
  let onWrite: (() => Promise<void>) | undefined
  const write = async (mode: WriteMode, value: BufferSource) => {
    const bytes = ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice()
      : new Uint8Array(value).slice()
    writes.push({ mode, bytes })
    await onWrite?.()
  }
  const characteristic = {
    uuid,
    properties: { write: true, writeWithoutResponse: withoutResponse, notify: uuid === MICROCHIP_TX },
    writeValue: (value: BufferSource) => write("legacy", value),
    writeValueWithResponse: (value: BufferSource) => write("with-response", value),
    writeValueWithoutResponse: (value: BufferSource) => write("without-response", value),
    startNotifications: async () => { notificationCalls += 1; return characteristic },
    stopNotifications: async () => characteristic,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  return {
    characteristic,
    writes,
    get notificationCalls() { return notificationCalls },
    setWrite: (handler: () => Promise<void>) => { onWrite = handler },
  }
}

function makeDevice(
  characteristics = [makeCharacteristic()],
  serviceUuid = PRINTER_SERVICE,
) {
  let connectCalls = 0
  let disconnectCalls = 0
  let discoveryCalls = 0
  let beforeConnect: (() => Promise<void>) | undefined
  let availableCharacteristics = characteristics
  const listeners = new Set<() => void>()
  const server = {
    connected: true,
    async connect() {
      connectCalls += 1
      await beforeConnect?.()
      server.connected = true
      return server
    },
    disconnect() {
      disconnectCalls += 1
      server.connected = false
      for (const listener of listeners) listener()
    },
    async getPrimaryServices() {
      discoveryCalls += 1
      return [{
        uuid: serviceUuid,
        getCharacteristics: async () => availableCharacteristics.map(({ characteristic }) => characteristic),
      }]
    },
  }
  const device = {
    id: `test-printer-${++deviceCounter}`,
    name: "Test receipt printer",
    gatt: server,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  } as unknown as Parameters<typeof reconnectThermalPrinter>[0]
  return {
    device,
    server,
    get connectCalls() { return connectCalls },
    get disconnectCalls() { return disconnectCalls },
    get discoveryCalls() { return discoveryCalls },
    replaceCharacteristics: (next: typeof characteristics) => { availableCharacteristics = next },
    delayConnect: (handler: () => Promise<void>) => { beforeConnect = handler },
  }
}

test("repeated receipts reuse the live connection and do not interrupt it", async () => {
  const channel = makeCharacteristic()
  const fixture = makeDevice([channel])
  const printer = await reconnectThermalPrinter(fixture.device)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ready = await reconnectThermalPrinterConnection(printer)
    assert.equal(ready, printer)
    await printViaBluetooth(ready, ["Test"], undefined, { feedLines: 4 })
  }

  assert.equal(fixture.connectCalls, 0)
  assert.equal(fixture.disconnectCalls, 0)
  assert.equal(fixture.discoveryCalls, 1)
  assert.equal(channel.writes.length, 2)
  assert.ok(channel.writes.every(({ mode }) => mode === "without-response"))
})

test("an actual disconnect reacquires the characteristic before the next receipt", async () => {
  const oldChannel = makeCharacteristic()
  const nextChannel = makeCharacteristic()
  const fixture = makeDevice([oldChannel])
  const printer = await reconnectThermalPrinter(fixture.device)

  fixture.server.disconnect()
  fixture.replaceCharacteristics([nextChannel])
  const ready = await reconnectThermalPrinterConnection(printer)
  await printViaBluetooth(ready, ["New session"])

  assert.equal(fixture.connectCalls, 1)
  assert.equal(fixture.discoveryCalls, 2)
  assert.equal(oldChannel.writes.length, 0)
  assert.ok(nextChannel.writes.length > 0)
})

test("concurrent reconnect requests open and discover one connection", async () => {
  const fixture = makeDevice()
  fixture.server.connected = false
  let allowConnection: () => void = () => undefined
  const connecting = new Promise<void>((resolve) => { allowConnection = resolve })
  fixture.delayConnect(() => connecting)

  const first = reconnectThermalPrinter(fixture.device)
  const second = reconnectThermalPrinter(fixture.device)
  allowConnection()
  const [firstPrinter, secondPrinter] = await Promise.all([first, second])

  assert.equal(fixture.connectCalls, 1)
  assert.equal(fixture.discoveryCalls, 1)
  assert.equal(firstPrinter.characteristic, secondPrinter.characteristic)
})

test("chunked receipt preserves every logo/text byte and four trailing paper feeds", async () => {
  const channel = makeCharacteristic()
  const fixture = makeDevice([channel])
  const printer = await reconnectThermalPrinter(fixture.device)
  const raster = Uint8Array.from([0x1d, 0x76, 0x30, 0, 1, 0, 2, 0, 0xaa, 0x55])
  const lines: ReceiptLine[] = [
    { text: "TOKO", align: "center" },
    "1x Telur                 10.000",
    { text: "Terima kasih!", align: "center" },
  ]
  const progress: Array<{ sentBytes: number; totalBytes: number }> = []
  const options = { feedLines: 4, onProgress: (value: typeof progress[number]) => progress.push(value) }

  await printViaBluetooth(printer, lines, raster, options)

  const actual = Buffer.concat(channel.writes.map(({ bytes }) => Buffer.from(bytes)))
  assert.deepEqual(actual, Buffer.from(buildEscPosReceipt(lines, raster, options)))
  assert.ok(actual.subarray(-5).equals(Buffer.from([10, 10, 10, 10, 10])), "newline ending the footer plus four paper-feed lines")
  assert.ok(channel.writes.every(({ bytes }) => bytes.length <= 20))
  assert.ok(actual.includes(Buffer.from(raster)))
  assert.equal(progress.at(-1)?.sentBytes, actual.length)
  assert.equal(progress.at(-1)?.totalBytes, actual.length)
  assert.ok(progress.every((value, index) => index === 0 || value.sentBytes >= progress[index - 1].sentBytes))
})

test("a failed write disconnects and stops later chunks without replaying the receipt", async () => {
  const channel = makeCharacteristic()
  let attempts = 0
  channel.setWrite(async () => {
    attempts += 1
    if (attempts === 2) throw new Error("Radio write failed")
  })
  const fixture = makeDevice([channel])
  const printer = await reconnectThermalPrinter(fixture.device)

  await assert.rejects(printViaBluetooth(printer, ["Receipt ".repeat(30)]))

  assert.equal(attempts, 2)
  assert.equal(channel.writes.length, 2)
  assert.equal(fixture.disconnectCalls, 1)
  assert.equal(fixture.server.connected, false)
})

test("cancelling a hung write finishes promptly and releases the connection", { timeout: 1200 }, async () => {
  const channel = makeCharacteristic()
  const controller = new AbortController()
  channel.setWrite(() => {
    setTimeout(() => controller.abort(), 15)
    return new Promise<void>(() => undefined)
  })
  const fixture = makeDevice([channel])
  const printer = await reconnectThermalPrinter(fixture.device)
  const options = { signal: controller.signal }

  await assert.rejects(printViaBluetooth(printer, ["Receipt ".repeat(30)], undefined, options))

  assert.equal(channel.writes.length, 1)
  assert.equal(fixture.disconnectCalls, 1)
  assert.equal(fixture.server.connected, false)
})

test("Microchip UART selects RX even when TX and control are writable", async () => {
  const tx = makeCharacteristic(MICROCHIP_TX)
  const control = makeCharacteristic(MICROCHIP_CONTROL)
  const rx = makeCharacteristic(MICROCHIP_RX)
  const fixture = makeDevice([tx, control, rx], MICROCHIP_SERVICE)

  const printer = await reconnectThermalPrinter(fixture.device)
  await printViaBluetooth(printer, ["RX test"])

  assert.equal(printer.characteristic.uuid, MICROCHIP_RX)
  assert.equal(tx.writes.length, 0)
  assert.equal(control.writes.length, 0)
  assert.ok(rx.writes.length > 0)
  assert.equal(tx.notificationCalls, 1)
})

test("multiple unknown writable characteristics are not silently treated as a print channel", async () => {
  const fixture = makeDevice([
    makeCharacteristic("aaaaaaaa-0000-1000-8000-00805f9b34fb"),
    makeCharacteristic("bbbbbbbb-0000-1000-8000-00805f9b34fb"),
  ])

  await assert.rejects(reconnectThermalPrinter(fixture.device))
  assert.equal(fixture.server.connected, false)
})

test("a response-only characteristic uses the explicit acknowledged write API", async () => {
  const channel = makeCharacteristic(PRINTER_RX, false)
  const fixture = makeDevice([channel])
  const printer = await reconnectThermalPrinter(fixture.device)

  await printViaBluetooth(printer, ["Response test"])

  assert.ok(channel.writes.length > 0)
  assert.ok(channel.writes.every(({ mode }) => mode === "with-response"))
})

test("concurrent print requests cannot interleave bytes or disconnect the active receipt", async () => {
  const channel = makeCharacteristic()
  let releaseWrite: () => void = () => undefined
  let notifyWriting: () => void = () => undefined
  const blockedWrite = new Promise<void>((resolve) => { releaseWrite = resolve })
  const writing = new Promise<void>((resolve) => { notifyWriting = resolve })
  channel.setWrite(async () => {
    notifyWriting()
    await blockedWrite
  })
  const fixture = makeDevice([channel])
  const printer = await reconnectThermalPrinter(fixture.device)
  const firstLines = ["First receipt ".repeat(4)]
  const firstJob = printViaBluetooth(printer, firstLines)
  await writing

  await assert.rejects(printViaBluetooth(printer, ["Second receipt"]))
  assert.equal(fixture.disconnectCalls, 0)
  releaseWrite()
  await firstJob

  assert.deepEqual(
    Buffer.concat(channel.writes.map(({ bytes }) => Buffer.from(bytes))),
    Buffer.from(buildEscPosReceipt(firstLines)),
  )
  // The rejected attempt must not leave the per-device lock stuck.
  await printViaBluetooth(printer, ["Next receipt"])
  assert.equal(fixture.disconnectCalls, 0)
})

test("a write timeout reports confirmed bytes and permits a fresh manual print", { timeout: 5000 }, async () => {
  const stalledChannel = makeCharacteristic()
  let attempts = 0
  stalledChannel.setWrite(async () => {
    attempts += 1
    if (attempts === 2) await new Promise<void>(() => undefined)
  })
  const fixture = makeDevice([stalledChannel])
  const printer = await reconnectThermalPrinter(fixture.device)
  const lines = ["Stalled receipt ".repeat(10)]

  await assert.rejects(printViaBluetooth(printer, lines), (error: unknown) => {
    assert.ok(error instanceof PrinterWriteError)
    assert.equal(error.sentBytes, 20)
    assert.equal(error.totalBytes, buildEscPosReceipt(lines).length)
    return true
  })
  assert.equal(attempts, 2)
  assert.equal(fixture.disconnectCalls, 1)

  const freshChannel = makeCharacteristic()
  fixture.replaceCharacteristics([freshChannel])
  const recovered = await reconnectThermalPrinterConnection(printer)
  await printViaBluetooth(recovered, ["Manual retry"])

  assert.equal(fixture.connectCalls, 1)
  assert.equal(stalledChannel.writes.length, 2)
  assert.ok(freshChannel.writes.length > 0)
})
