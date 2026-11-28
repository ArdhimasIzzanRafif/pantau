import { PrinterWriteError } from "./thermal-printer"

// Call the chooser or system print dialog during the original user click.
// Unsupported browsers must never enter the direct printer connection flow.
export async function dispatchReceiptPrint(actions: {
  supportsDirect: boolean
  hasPrinter: boolean
  connect: () => Promise<unknown>
  printDirect: () => Promise<unknown>
  printSystem: () => void
}) {
  if (!actions.supportsDirect) return actions.printSystem()
  if (!actions.hasPrinter) return actions.connect()
  return actions.printDirect()
}

export function printerFeedback(cause: unknown, action: "connect" | "send" = "send"): { kind: "notice" | "error"; message: string } {
  const name = cause instanceof Error ? cause.name : ""
  const message = cause instanceof Error ? cause.message : ""
  if (action === "connect" && /user cancel|no port selected|user did not select|cancelled.*chooser/i.test(message)) {
    return { kind: "notice", message: "Pemilihan printer dibatalkan." }
  }
  if (cause instanceof PrinterWriteError) {
    return { kind: "error", message: "Cetak terputus. Periksa hasil di kertas sebelum mencetak ulang." }
  }
  if (message === "Pengiriman dibatalkan.") {
    return { kind: "notice", message }
  }
  if (name === "SecurityError" || name === "NotAllowedError") {
    return { kind: "error", message: "Akses printer belum diizinkan. Izinkan akses lalu coba lagi." }
  }
  if (name === "NetworkError") {
    return { kind: "error", message: "Printer tidak tersambung. Pastikan menyala dan tidak digunakan perangkat lain." }
  }
  if (/sedang digunakan|sedang mengirim/i.test(message)) {
    return { kind: "error", message: "Printer sedang digunakan. Tunggu proses cetak selesai." }
  }
  if (/Pilih printer melalui tombol/.test(message)) {
    return { kind: "error", message: "Hubungkan printer terlebih dahulu." }
  }
  return { kind: "error", message: action === "connect"
    ? "Printer belum bisa dihubungkan. Pastikan printer menyala, lalu coba lagi."
    : "Struk belum terkirim. Periksa koneksi printer lalu coba lagi." }
}
