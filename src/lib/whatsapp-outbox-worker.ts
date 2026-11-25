import "server-only"

import { drainOutbox } from "@/lib/whatsapp-outbox"
import { markOverdueSupplierResponses } from "@/lib/supplier-message-tracking"

/// Seberapa sering antrean diperiksa. Cukup rapat untuk menjemput pesan yang
/// jadwal ulangnya (nextAttemptAt) sudah lewat, cukup jarang untuk tidak
/// membebani database saat tidak ada pekerjaan.
const INTERVAL_MS = 60_000

/// Sekali jalan memproses paling banyak sekian pesan, supaya satu putaran tidak
/// berjalan terlalu lama.
const BATCH = 25

/**
 * Disimpan di globalThis, bukan di variabel modul.
 *
 * Saat hot reload, Next memuat ulang modul ini dengan keadaan kosong. Kalau
 * penandanya ikut hilang, setiap simpan berkas akan menambah satu timer baru
 * sampai pemroses berjalan berkali-kali lipat dan pesannya berebut.
 */
const state = globalThis as typeof globalThis & {
  __pantauOutbox?: { timer: NodeJS.Timeout | null; running: boolean }
}
state.__pantauOutbox ??= { timer: null, running: false }

/** Satu putaran; tidak pernah menumpuk karena putaran sebelumnya dijaga. */
export async function runOutboxOnce(limit = BATCH) {
  const shared = state.__pantauOutbox!
  if (shared.running) return 0
  shared.running = true
  try {
    const sent = await drainOutbox(limit)
    await markOverdueSupplierResponses()
    return sent
  } finally {
    shared.running = false
  }
}

/**
 * Menyalakan pemroses berkala di dalam proses server.
 *
 * Ini yang membuat pesan yang dijadwalkan ulang tetap terkirim walau tidak ada
 * satu pun pengguna membuka aplikasi. `after()` hanya mempercepat pesan yang
 * baru dibuat; jadwal ulang setelah kegagalan butuh pemicu berkala seperti ini.
 *
 * Untuk hosting serverless yang prosesnya mati di antara request, pakai
 * penjadwal luar yang memanggil /api/cron/whatsapp-outbox.
 */
export function startOutboxWorker() {
  const shared = state.__pantauOutbox!
  if (shared.timer || process.env.OUTBOX_WORKER === "off") return

  shared.timer = setInterval(() => {
    void runOutboxOnce().catch((error) => {
      console.error("Pemroses antrean WhatsApp gagal pada satu putaran", error)
    })
  }, INTERVAL_MS)

  // Jangan menahan proses tetap hidup hanya demi timer ini.
  shared.timer.unref?.()
}

/** Dipakai tes untuk memastikan hot reload tidak menumpuk timer. */
export function outboxWorkerRunning() {
  return state.__pantauOutbox?.timer != null
}
