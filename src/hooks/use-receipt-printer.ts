"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { printerFeedback } from "@/lib/receipt-printing"
import {
  connectThermalPrinter, disconnectThermalPrinter, imageUrlToEscPosRaster,
  isThermalPrinterConnected, onThermalPrinterDisconnected, printViaBluetooth,
  reconnectRememberedThermalPrinter, reconnectThermalPrinterConnection,
  REMEMBERED_PRINTER_KEY, thermalPrinterDetails, thermalPrinterStorageId,
  type ReceiptLine, type ThermalPrinter,
} from "@/lib/thermal-printer"

// One owner for selection, reconnect, image preparation and writes. Merely
// opening POS must not connect to a printer being used by another tab.
export function useReceiptPrinter() {
  const [printer, setPrinter] = useState<ThermalPrinter | null>(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [details, setDetails] = useState("")
  const active = useRef<ThermalPrinter | null>(null)
  const busyRef = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const unsubscribe = useRef<() => void>(() => {})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
      unsubscribe.current()
    }
  }, [])

  const adopt = useCallback((next: ThermalPrinter) => {
    active.current = next
    unsubscribe.current()
    unsubscribe.current = onThermalPrinterDisconnected(next, () => {
      if (active.current === next && mounted.current) setPrinter(null)
    })
    window.localStorage.setItem(REMEMBERED_PRINTER_KEY, thermalPrinterStorageId(next))
    if (mounted.current) {
      setPrinter(next)
      setDetails(thermalPrinterDetails(next))
    }
  }, [])

  async function ensureConnected(): Promise<ThermalPrinter> {
    setStage("Menghubungkan printer...")
    const id = window.localStorage.getItem(REMEMBERED_PRINTER_KEY)
    // The former serial key did not identify a selected printer. Ask for an
    // explicit selection instead of reopening an arbitrary OS serial port.
    const connected = active.current
      ? await reconnectThermalPrinterConnection(active.current)
      : id && id !== "serial-rfcomm"
        ? await reconnectRememberedThermalPrinter(id)
        : null
    if (!connected) throw new Error("Pilih printer melalui tombol Hubungkan / Pilih ulang printer.")
    adopt(connected)
    return connected
  }

  function begin() {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    return true
  }

  function finish() {
    busyRef.current = false
    controller.current = null
    if (mounted.current) { setBusy(false); setStage("") }
  }

  function failed(cause: unknown, action: "connect" | "send" = "send") {
    if (!mounted.current) return
    const feedback = printerFeedback(cause, action)
    if (feedback.kind === "notice") setNotice(feedback.message)
    else {
      console.error(`Receipt printer ${action} failed:`, cause)
      setError(feedback.message)
    }
    if (active.current && !isThermalPrinterConnected(active.current)) setPrinter(null)
  }

  async function connect(replace = false) {
    if (!begin()) return
    setStage("Menghubungkan printer...")
    try {
      // A tap on "Hubungkan" must always lead somewhere: reuse a live
      // connection, otherwise open the chooser. A merely *remembered* printer
      // id is not a live connection — silently reconnecting it (and failing
      // when the device is gone) would leave the user with no way to pick one.
      if (!replace && active.current && isThermalPrinterConnected(active.current)) {
        await ensureConnected()
      } else {
        // Start chooser during the click, before awaiting any port cleanup.
        const selection = connectThermalPrinter()
        const previous = active.current
        const selected = await selection
        if (previous && thermalPrinterStorageId(previous) !== thermalPrinterStorageId(selected)) {
          await disconnectThermalPrinter(previous)
        }
        adopt(selected)
      }
    } catch (cause) { failed(cause, "connect") } finally { finish() }
  }

  async function send(lines: ReceiptLine[], options: { logoUrl?: string | null; feedLines?: number } = {}) {
    if (!begin()) return false
    const abort = new AbortController()
    controller.current = abort
    try {
      const connected = await ensureConnected()
      if (abort.signal.aborted) throw new Error("Pengiriman dibatalkan.")
      let logo: Uint8Array | undefined
      let logoWarning = ""
      if (options.logoUrl) {
        setStage("Menyiapkan logo...")
        try { logo = await imageUrlToEscPosRaster(options.logoUrl, 240, 120) }
        catch { logoWarning = " Logo gagal dimuat; struk dikirim tanpa logo." }
      }
      await printViaBluetooth(connected, lines, logo, {
        feedLines: options.feedLines ?? 4,
        signal: abort.signal,
        onProgress: ({ sentBytes, totalBytes }) => {
          if (!mounted.current) return
          setStage(`Mengirim ${Math.round(sentBytes / totalBytes * 100)}%...`)
          setDetails(`${thermalPrinterDetails(connected)}\nData: ${sentBytes}/${totalBytes} bytes`)
        },
      })
      if (mounted.current) setNotice(`Data selesai dikirim. Periksa hasil pada kertas printer.${logoWarning}`)
      return true
    } catch (cause) { failed(cause); return false } finally { finish() }
  }

  function cancel() { controller.current?.abort() }

  async function resetConnection() {
    if (!begin()) return
    setStage("Melepas koneksi printer...")
    try {
      if (active.current) await disconnectThermalPrinter(active.current)
      if (mounted.current) setPrinter(null)
      await ensureConnected()
    } catch (cause) { failed(cause) } finally { finish() }
  }

  return { printer, busy, stage, error, notice, details, connect, send, cancel, resetConnection }
}
