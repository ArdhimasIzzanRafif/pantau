// Web Bluetooth ESC/POS printing for generic thermal receipt printers.
// Only works in Chromium browsers (Chrome/Edge) — Web Bluetooth isn't
// implemented in Safari on macOS or iOS at all.

interface BluetoothCharacteristicProperties {
  write: boolean
  writeWithoutResponse: boolean
  notify?: boolean
}
interface BluetoothRemoteGATTCharacteristic {
  uuid: string
  properties: BluetoothCharacteristicProperties
  writeValue?(value: BufferSource): Promise<void>
  writeValueWithResponse?(value: BufferSource): Promise<void>
  writeValueWithoutResponse(value: BufferSource): Promise<void>
  startNotifications?(): Promise<BluetoothRemoteGATTCharacteristic>
}
interface BluetoothRemoteGATTService {
  uuid: string
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>
}
interface BluetoothRemoteGATTServer {
  connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>
}
interface BluetoothDevice {
  id: string
  name?: string
  gatt?: BluetoothRemoteGATTServer
  addEventListener(type: "gattserverdisconnected", listener: () => void): void
  removeEventListener?(type: "gattserverdisconnected", listener: () => void): void
}
interface Bluetooth {
  requestDevice(options: {
    acceptAllDevices?: boolean
    optionalServices?: string[]
  }): Promise<BluetoothDevice>
  getDevices?(): Promise<BluetoothDevice[]>
}

interface SerialPortInfo {
  bluetoothServiceClassId?: number | string
  usbProductId?: number
  usbVendorId?: number
}
interface SerialPort {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; bufferSize?: number }): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
}
interface Serial {
  requestPort(): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}
declare global {
  interface Navigator {
    bluetooth?: Bluetooth
    serial?: Serial
  }
}

// Supported printer/UART services. A writable configuration channel is not
// interchangeable with the UART data channel.
const KNOWN_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
]

// Characteristic data/RX yang umum dipakai printer BLE. Beberapa printer juga
// mempunyai characteristic writable untuk konfigurasi; memilih characteristic
// pertama bisa membuat write sukses di browser tetapi tidak pernah tercetak.
const PRINT_CHANNELS: Record<string, string> = {
  [KNOWN_SERVICES[0]]: "00002af1-0000-1000-8000-00805f9b34fb",
  [KNOWN_SERVICES[1]]: "49535343-8841-43f4-a8d4-ecbe34729bb3",
  [KNOWN_SERVICES[2]]: "0000ff02-0000-1000-8000-00805f9b34fb",
  [KNOWN_SERVICES[3]]: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
}

type BluetoothThermalPrinter = {
  transport: "ble"
  device: BluetoothDevice
  characteristic: BluetoothRemoteGATTCharacteristic
  serviceUuid?: string
}

type SerialThermalPrinter = {
  transport: "serial"
  port: SerialPort
  name: string
}

export type ThermalPrinter = BluetoothThermalPrinter | SerialThermalPrinter

const connections = new Map<string, Promise<BluetoothThermalPrinter>>()
const activeConnections = new Map<string, BluetoothThermalPrinter>()
const activePrintJobs = new Set<string | SerialPort>()

export const REMEMBERED_PRINTER_KEY = "pantau-thermal-printer-id"

export function isBluetoothPrintingSupported(): boolean {
  return typeof navigator !== "undefined" && (!!navigator.serial || !!navigator.bluetooth)
}

export function thermalPrinterName(printer: ThermalPrinter): string {
  return printer.transport === "serial"
    ? printer.name
    : printer.device.name ?? "Printer Bluetooth"
}

export function thermalPrinterStorageId(printer: ThermalPrinter): string {
  return printer.transport === "serial" ? "serial-rfcomm" : printer.device.id
}

export function isThermalPrinterConnected(printer: ThermalPrinter): boolean {
  return printer.transport === "serial"
    ? printer.port.writable !== null
    : !!printer.device.gatt?.connected
}

export function thermalPrinterDetails(printer: ThermalPrinter): string {
  if (printer.transport === "serial") return `Serial: ${JSON.stringify(printer.port.getInfo())}`
  return [
    `BLE: ${printer.device.name ?? "Printer"}`,
    `Service: ${printer.serviceUuid ?? "unknown"}`,
    `RX: ${printer.characteristic.uuid}`,
    `Write: ${printer.characteristic.properties.writeWithoutResponse ? "without-response" : "with-response"}`,
    "Packet: 20 bytes",
  ].join("\n")
}

export function onThermalPrinterDisconnected(printer: ThermalPrinter, listener: () => void): () => void {
  if (printer.transport !== "ble") return () => {}
  printer.device.addEventListener("gattserverdisconnected", listener)
  return () => printer.device.removeEventListener?.("gattserverdisconnected", listener)
}

export async function disconnectThermalPrinter(printer: ThermalPrinter): Promise<void> {
  if (printer.transport === "ble") {
    activeConnections.delete(printer.device.id)
    printer.device.gatt?.disconnect()
    return
  }
  // A timed-out serial write may still own the stream. Bound cleanup as well
  // so the UI cannot remain stuck on a port.close() that never resolves.
  try {
    if (printer.port.readable && !printer.port.readable.locked) {
      await withTimeout(printer.port.readable.cancel(), 1_000, "Port belum tertutup.")
    }
    if (printer.port.writable && !printer.port.writable.locked) {
      await withTimeout(printer.port.writable.abort(), 1_000, "Port belum tertutup.")
    }
    await withTimeout(printer.port.close(), 1_000, "Port belum tertutup.")
  } catch { /* the operating system may already have removed the port */ }
}

async function findWritableCharacteristic(server: BluetoothRemoteGATTServer) {
  const services = await server.getPrimaryServices()
  const candidates: { characteristic: BluetoothRemoteGATTCharacteristic; serviceUuid: string }[] = []
  for (const service of services) {
    const serviceUuid = service.uuid.toLowerCase()
    if (!KNOWN_SERVICES.includes(serviceUuid)) continue
    const chars = await service.getCharacteristics()
    const writable = chars.filter((c) => c.properties.write || c.properties.writeWithoutResponse)
    const dataChannel = writable.find((c) => c.uuid.toLowerCase() === PRINT_CHANNELS[serviceUuid])
    if (dataChannel) {
      // Microchip Transparent UART RX is client -> peripheral. Some modules
      // require the TX subscription before accepting RX data. Subscribe once
      // when discovering this profile, not on every receipt.
      if (serviceUuid === KNOWN_SERVICES[1]) {
        const tx = chars.find((c) => c.uuid.toLowerCase() === "49535343-1e4d-4bd9-ba61-23c647249616")
        if (tx?.properties.notify && tx.startNotifications) await tx.startNotifications()
      }
      return { characteristic: dataChannel, serviceUuid }
    }
    candidates.push(...writable.map((characteristic) => ({ characteristic, serviceUuid })))
  }
  if (candidates.length > 1) {
    throw new Error(`Ada beberapa kanal Bluetooth yang belum dikenali: ${candidates.map((c) => c.characteristic.uuid).join(", ")}. Kanal cetak perlu diperiksa.`)
  }
  return candidates[0] ?? null
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
    }
    const fail = (error: unknown) => { cleanup(); reject(error) }
    const abort = () => fail(new Error("Pengiriman dibatalkan."))
    const timer = setTimeout(() => fail(new Error(message)), ms)
    signal?.addEventListener("abort", abort, { once: true })
    // Attach handlers even when already aborted, so the in-flight operation
    // cannot produce an unhandled rejection after cancellation.
    promise.then((value) => { cleanup(); resolve(value) }, fail)
    if (signal?.aborted) abort()
  })
}

async function establishBluetoothConnection(device: BluetoothDevice): Promise<BluetoothThermalPrinter> {
  if (!device.gatt) throw new Error("Perangkat ini tidak mendukung koneksi GATT.")
  try {
  const server = device.gatt.connected
    ? device.gatt
    : await withTimeout(
        device.gatt.connect(),
        15_000,
        `Gagal terhubung ke "${device.name ?? "printer"}" (timeout). Coba matikan-nyalakan lagi printernya, lalu coba connect ulang.`
      )
  const channel = await withTimeout(
    findWritableCharacteristic(server),
    10_000,
    `Terhubung ke "${device.name ?? "printer"}" tapi gagal membaca channel cetaknya (timeout). Coba lagi.`
  )

  if (!channel) {
    throw new Error(
      `Printer "${device.name ?? "?"}" berhasil dipasangkan, tapi channel cetaknya tidak ditemukan dari UUID yang umum dipakai. Model printer ini mungkin pakai protokol berbeda.`
    )
  }

  const printer: BluetoothThermalPrinter = { transport: "ble", device, ...channel }
  activeConnections.set(device.id, printer)
  const disconnected = () => {
    if (activeConnections.get(device.id) === printer) activeConnections.delete(device.id)
    device.removeEventListener?.("gattserverdisconnected", disconnected)
  }
  device.addEventListener("gattserverdisconnected", disconnected)
  return printer
  } catch (error) {
    activeConnections.delete(device.id)
    device.gatt.disconnect()
    throw error
  }
}

export async function reconnectThermalPrinter(device: BluetoothDevice): Promise<BluetoothThermalPrinter> {
  const active = activeConnections.get(device.id)
  if (active?.device.gatt?.connected) return active
  const pending = connections.get(device.id)
  if (pending) return pending
  const connection = establishBluetoothConnection(device)
  connections.set(device.id, connection)
  try { return await connection } finally { connections.delete(device.id) }
}

async function openSerialThermalPrinter(port: SerialPort): Promise<SerialThermalPrinter> {
  if (!port.writable) {
    await withTimeout(
      port.open({ baudRate: 9600, bufferSize: 4096 }),
      15_000,
      "Printer serial tidak merespons. Pastikan RPP02N menyala dan sudah dipasangkan di pengaturan Bluetooth.",
    )
  }
  return { transport: "serial", port, name: "Printer Serial" }
}

export async function reconnectThermalPrinterConnection(printer: ThermalPrinter): Promise<ThermalPrinter> {
  if (printer.transport === "serial") return openSerialThermalPrinter(printer.port)

  if (printer.device.gatt?.connected) return printer
  return reconnectThermalPrinter(printer.device)
}

export async function connectThermalPrinter(): Promise<ThermalPrinter> {
  // Keep the BLE path already used by this installation. Selecting a device
  // requires a direct click; reconnecting an existing device does not.
  if (navigator.bluetooth) {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_SERVICES,
    })
    return reconnectThermalPrinter(device)
  }

  if (navigator.serial) {
    const port = await navigator.serial.requestPort()
    return openSerialThermalPrinter(port)
  }

  throw new Error("Browser ini tidak mendukung koneksi printer — pakai Chrome atau Edge desktop.")
}

export async function reconnectRememberedThermalPrinter(deviceId: string): Promise<ThermalPrinter | null> {
  if (deviceId === "serial-rfcomm" && navigator.serial) {
    const ports = await navigator.serial.getPorts()
    if (ports.length === 0) return null
    const sppPorts = ports.filter((port) => {
      const id = port.getInfo().bluetoothServiceClassId
      return id === 0x1101 || id === "00001101-0000-1000-8000-00805f9b34fb"
    })
    // The legacy storage key does not identify a particular serial port.
    // Require selection when ambiguous; never write receipts to the first port.
    return sppPorts.length === 1 ? openSerialThermalPrinter(sppPorts[0]) : null
  }
  if (!navigator.bluetooth?.getDevices) return null
  const devices = await navigator.bluetooth.getDevices()
  const device = devices.find((candidate) => candidate.id === deviceId)
  return device ? reconnectThermalPrinter(device) : null
}

function textToBytes(text: string): number[] {
  // Thermal printers speak single-byte codepages (CP437/CP1252-ish), not UTF-8.
  // Strip anything outside Latin-1 (emoji, etc.) rather than send garbage bytes.
  const cleaned = text.replace(/[^\x00-\xFF]/g, "")
  return Array.from(cleaned).map((c) => c.charCodeAt(0) & 0xff)
}

// Most portable BT thermal printers (58mm roll) print ~32 columns in the
// default font. Right-aligns `value` against `label`, wrapping onto a second
// line instead of overflowing.
export const RECEIPT_WIDTH = 32

export function formatReceiptLine(label: string, value: string, width = RECEIPT_WIDTH): string {
  const gap = width - label.length - value.length
  if (gap >= 1) return label + " ".repeat(gap) + value
  // label too long to share a line with the value — put value on its own
  // right-aligned line right below instead of letting it run off the edge
  const valuePad = Math.max(0, width - value.length)
  return label + "\n" + " ".repeat(valuePad) + value
}

export type ReceiptLine = string | { text: string; align: "center" | "left" }

export type ReceiptPrintOptions = {
  feedLines?: number
  onProgress?: (progress: { sentBytes: number; totalBytes: number }) => void
  signal?: AbortSignal
}

export function buildEscPosReceipt(
  lines: ReceiptLine[],
  logoRaster?: Uint8Array,
  options: ReceiptPrintOptions = {}
): Uint8Array {
  const bytes: number[] = [0x1b, 0x40] // ESC @ — initialize printer
  if (logoRaster) {
    bytes.push(0x1b, 0x61, 0x01, ...logoRaster, 0x0a) // centered, then the raster image bytes
  }
  let currentAlign: "center" | "left" = logoRaster ? "center" : "left"
  for (const entry of lines) {
    const text = typeof entry === "string" ? entry : entry.text
    const align = typeof entry === "string" ? "left" : entry.align
    if (align !== currentAlign) {
      bytes.push(0x1b, 0x61, align === "center" ? 0x01 : 0x00) // ESC a n
      currentAlign = align
    }
    bytes.push(...textToBytes(text), 0x0a)
  }
  const feedLines = Math.max(0, Math.min(5, options.feedLines ?? 1))
  bytes.push(...Array(feedLines).fill(0x0a)) // leave only the space needed to tear/cut
  return new Uint8Array(bytes)
}

// Converts an image (any same-origin URL) into an ESC/POS raster bit-image
// command (GS v 0), dithered to 1-bit black/white. 384px matches the de
// facto standard printable width for 58mm/203dpi thermal printers — if this
// specific printer is narrower/wider, the logo may need a size tweak.
export async function imageUrlToEscPosRaster(url: string, maxWidthPx = 384, maxHeightPx = 200): Promise<Uint8Array> {
  const img = await withTimeout(new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error("Gagal memuat logo"))
    el.src = url
  }), 5_000, "Logo tidak selesai dimuat.")

  const scale = Math.min(maxWidthPx / img.width, maxHeightPx / img.height, 1)
  const rawWidth = Math.round(img.width * scale)
  const height = Math.max(1, Math.round(img.height * scale))
  const width = rawWidth - (rawWidth % 8) || 8 // ESC/POS raster width must be a multiple of 8 px

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas tidak didukung di browser ini")
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)

  const bytesPerRow = width / 8
  const raster = new Uint8Array(bytesPerRow * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11
      const isBlack = data[i + 3] > 128 && gray < 160
      if (isBlack) raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x % 8)
    }
  }

  const header = [
    0x1d, 0x76, 0x30, 0x00, // GS v 0, mode 0 (normal)
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ]
  return new Uint8Array([...header, ...raster])
}

export class PrinterWriteError extends Error {
  constructor(message: string, readonly sentBytes: number, readonly totalBytes: number) {
    super(`${message} Pengiriman berhenti di ${sentBytes}/${totalBytes} byte. Periksa kertas sebelum mencetak ulang.`)
    this.name = "PrinterWriteError"
  }
}

async function writeReceiptData(
  printer: ThermalPrinter,
  data: Uint8Array,
  options: ReceiptPrintOptions,
): Promise<void> {
  let sentBytes = 0
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined
  try {
    if (options.signal?.aborted) throw new Error("Pengiriman dibatalkan.")
    if (!isThermalPrinterConnected(printer)) throw new Error("Koneksi printer terputus.")
    if (printer.transport === "serial") writer = printer.port.writable!.getWriter()
    options.onProgress?.({ sentBytes, totalBytes: data.length })
    const chunkSize = printer.transport === "ble" ? 20 : 512
    for (let i = 0; i < data.length; i += chunkSize) {
      if (options.signal?.aborted) throw new Error("Pengiriman dibatalkan.")
      const chunk = data.slice(i, i + chunkSize)
      let write: Promise<void>
      if (printer.transport === "serial") {
        write = writer!.write(chunk)
      } else {
        if (!printer.device.gatt?.connected) throw new Error("Koneksi Bluetooth terputus.")
        const c = printer.characteristic
        if (c.properties.writeWithoutResponse) write = c.writeValueWithoutResponse(chunk)
        else if (c.properties.write && c.writeValueWithResponse) write = c.writeValueWithResponse(chunk)
        else if (c.properties.write && c.writeValue) write = c.writeValue(chunk)
        else throw new Error("Kanal ini tidak mendukung pengiriman data.")
      }
      await withTimeout(write, 3_000, "Printer tidak merespons.", options.signal)
      sentBytes += chunk.length
      options.onProgress?.({ sentBytes, totalBytes: data.length })
      if (printer.transport === "ble") await new Promise((resolve) => setTimeout(resolve, 10))
    }
    if (options.signal?.aborted) throw new Error("Pengiriman dibatalkan.")
  } catch (error) {
    if (writer) {
      try { await withTimeout(writer.abort(error), 1_000, "Pengiriman tidak dapat dihentikan.") } catch { /* bounded cleanup */ }
      writer.releaseLock()
      writer = undefined
    }
    // A rejected/timed-out write may have partially reached the device. Stop
    // the connection; never automatically replay a receipt or a raster image.
    await disconnectThermalPrinter(printer)
    throw new PrinterWriteError(error instanceof Error ? error.message : "Pengiriman gagal.", sentBytes, data.length)
  } finally {
    writer?.releaseLock()
  }
}

export async function printViaBluetooth(
  printer: ThermalPrinter,
  lines: ReceiptLine[],
  logoRaster?: Uint8Array,
  options: ReceiptPrintOptions = {}
): Promise<void> {
  const data = buildEscPosReceipt(lines, logoRaster, options)
  const key = printer.transport === "ble" ? printer.device.id : printer.port
  if (activePrintJobs.has(key)) throw new Error("Printer sedang mengirim struk. Tunggu sampai selesai.")
  activePrintJobs.add(key)
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request("pantau-receipt-printer", { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error("Printer sedang digunakan tab POS lain. Tunggu cetak di tab tersebut selesai.")
        await writeReceiptData(printer, data, options)
      })
    } else {
      await writeReceiptData(printer, data, options)
    }
  } finally {
    activePrintJobs.delete(key)
  }
}
