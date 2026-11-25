import "server-only"

import type { Prisma, WhatsAppAggregateType } from "@prisma/client"
import { after } from "next/server"
import { prisma } from "@/lib/db"
import { sendWhatsApp } from "@/lib/whatsapp"

type Tx = Prisma.TransactionClient

/// Jeda sebelum percobaan berikutnya: 1 menit, 5 menit, lalu 15 menit.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000]

/// Pesan yang berstatus PROCESSING lebih lama dari ini dianggap ditinggalkan
/// prosesnya (server mati di tengah jalan) dan boleh diambil ulang.
const STALE_PROCESSING_MS = 2 * 60_000

/// Kegagalan yang tidak akan membaik dengan mencoba ulang; menunggu tindakan
/// pengguna (memperbaiki token, menghubungkan perangkat, mengisi nomor).
function needsHumanAction(error: string | null) {
  if (!error) return false
  const text = error.toLowerCase()
  return text.includes("token")
    || text.includes("atur whatsapp")
    || text.includes("tidak dapat dibaca")
    || text.includes("tidak valid")
    || text.includes("belum diisi")
    || text.includes("disconnect")
    || text.includes("tidak terhubung")
}

/**
 * Menyalin keadaan antrean ke pesanan atau transfer yang bersangkutan.
 *
 * Antrean adalah satu-satunya sumber kebenaran pengiriman; kolom di
 * PurchaseRequest/StockTransfer hanyalah salinan untuk ditampilkan.
 */
async function syncAggregateFromOutbox(id: string) {
  const row = await prisma.whatsAppOutbox.findUnique({ where: { id } })
  if (!row) return

  // Pesanan dan transfer memakai enum status pengiriman yang sama dengan
  // antrean, jadi keadaannya disalin apa adanya.
  const status = row.status
  const error = row.lastError
  const target = { id: row.aggregateId, organizationId: row.organizationId }

  if (row.aggregateType === "PURCHASE_REMINDER") {
    // Pengingat pesanan banyak bahan dikirim sekali atas nama baris pertama;
    // statusnya berlaku untuk semua baris pesanan itu.
    const baris = await prisma.purchaseRequest.findFirst({ where: target, select: { purchaseOrderId: true } })
    await prisma.purchaseRequest.updateMany({
      where: baris?.purchaseOrderId
        ? { purchaseOrderId: baris.purchaseOrderId, organizationId: row.organizationId }
        : target,
      data: {
        lastReminderStatus: status,
        lastReminderError: error,
        ...(["FAILED", "UNCERTAIN", "DEAD"].includes(status) ? { responseOverdueAt: row.updatedAt } : {}),
      },
    })
    return
  }

  if (row.aggregateType === "PURCHASE_REQUEST" || row.aggregateType === "PURCHASE_ORDER") {
    await prisma.purchaseRequest.updateMany({
      // Pesanan banyak bahan: satu WA mewakili semua barisnya.
      where: row.aggregateType === "PURCHASE_ORDER"
        ? { purchaseOrderId: row.aggregateId, organizationId: row.organizationId }
        : target,
      data: {
        messageStatus: status,
        messageAttempts: row.attempts,
        lastMessageError: error,
        lastMessageAt: row.updatedAt,
        messageSentAt: row.sentAt,
        providerMessageId: row.providerMessageId,
        ...(status === "SENT" ? {
          providerDeliveryStatus: "PROVIDER_ACCEPTED",
          deliveryStatusUpdatedAt: row.sentAt ?? row.updatedAt,
        } : {}),
      },
    })
    return
  }

  await prisma.stockTransfer.updateMany({
    where: target,
    data: {
      notificationStatus: status,
      notificationAttempts: row.attempts,
      notificationError: error,
      notificationLastAt: row.updatedAt,
      notificationSentAt: row.sentAt,
      notificationMessageId: row.providerMessageId,
    },
  })
}

/**
 * Menaruh satu pesan ke antrean. WAJIB dipanggil di dalam transaksi yang sama
 * dengan penyimpanan pesanan/transfernya, sehingga tidak mungkin ada kejadian
 * bisnis yang tersimpan tanpa tugas pengiriman.
 *
 * `idempotencyKey` membuat satu kejadian bisnis hanya punya satu baris antrean,
 * walau pemanggilnya berjalan dua kali.
 */
export async function enqueueWhatsApp(
  tx: Tx,
  input: {
    organizationId: string
    aggregateType: WhatsAppAggregateType
    aggregateId: string
    targetPhone: string
    message: string
    idempotencyKey: string
    maxAttempts?: number
  },
) {
  const existing = await tx.whatsAppOutbox.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  })
  if (existing) return existing

  return tx.whatsAppOutbox.create({
    data: {
      organizationId: input.organizationId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      targetPhone: input.targetPhone,
      message: input.message,
      idempotencyKey: input.idempotencyKey,
      maxAttempts: input.maxAttempts ?? 4,
    },
    select: { id: true },
  })
}

/**
 * Mengambil satu pesan siap kirim dan menguncinya untuk pemroses ini saja.
 *
 * `FOR UPDATE SKIP LOCKED` membuat dua pemroses yang berjalan bersamaan tidak
 * pernah mendapat baris yang sama: yang kedua melewati baris terkunci dan
 * mengambil pekerjaan lain, bukan menunggu atau mengirim ganda.
 */
export async function claimPendingMessage(now = new Date()) {
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "WhatsAppOutbox"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
      ORDER BY "nextAttemptAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `
    if (rows.length === 0) return null

    await tx.whatsAppOutbox.update({
      where: { id: rows[0].id },
      data: { status: "PROCESSING", lockedAt: now, sendStartedAt: null, attempts: { increment: 1 } },
    })
    return rows[0].id
  })

  if (!claimed) return null
  await syncAggregateFromOutbox(claimed)
  return prisma.whatsAppOutbox.findUnique({ where: { id: claimed } })
}

export async function markOutboxSent(id: string, providerMessageId: string | null) {
  await prisma.whatsAppOutbox.updateMany({
    where: { id, status: "PROCESSING" },
    data: {
      status: "SENT",
      sentAt: new Date(),
      providerMessageId,
      lockedAt: null,
      lastError: null,
    },
  })
  await syncAggregateFromOutbox(id)
}

/**
 * Menutup percobaan yang gagal. Timeout tidak pernah dicoba ulang otomatis —
 * pesannya mungkin sudah sampai ke pelanggan, jadi keputusannya diserahkan ke
 * pengguna lewat tombol "Periksa dan kirim ulang".
 */
export async function markOutboxFailed(
  id: string,
  error: string | null,
  options: { uncertain?: boolean; permanent?: boolean; retryAfterMs?: number } = {},
) {
  const current = await prisma.whatsAppOutbox.findUnique({
    where: { id },
    select: { attempts: true, maxAttempts: true },
  })
  if (!current) return

  const exhausted = current.attempts >= current.maxAttempts
  const waitsForHuman = options.permanent === true || needsHumanAction(error)
  const status = options.uncertain
    ? "UNCERTAIN"
    : waitsForHuman
      ? "FAILED"
      : exhausted
        ? "DEAD"
        : "PENDING"

  // Permintaan penyedia untuk menunggu lebih diutamakan daripada jadwal
  // bawaan: memaksa lebih cepat hanya akan ditolak lagi.
  const delay = options.retryAfterMs != null && options.retryAfterMs > 0
    ? options.retryAfterMs
    : RETRY_DELAYS_MS[Math.min(current.attempts - 1, RETRY_DELAYS_MS.length - 1)]

  await prisma.whatsAppOutbox.updateMany({
    where: { id, status: "PROCESSING" },
    data: {
      status,
      lastError: error,
      lockedAt: null,
      ...(status === "PENDING" ? { nextAttemptAt: new Date(Date.now() + delay) } : {}),
    },
  })
  await syncAggregateFromOutbox(id)
}

/** Mengirim satu pesan yang sudah diklaim, lalu mencatat hasilnya. */
export async function processOutboxMessage(message: {
  id: string
  organizationId: string
  targetPhone: string
  message: string
}) {
  // Dicatat SEBELUM memanggil penyedia. Kalau proses mati setelah baris ini,
  // pemulihan tahu permintaannya mungkin sudah berangkat.
  const started = await prisma.whatsAppOutbox.updateMany({
    where: { id: message.id, status: "PROCESSING" },
    data: { sendStartedAt: new Date() },
  })
  // Pesanan dapat dibatalkan sesaat setelah baris antrean diklaim. Dalam kasus
  // itu pembatalan mengubah status antrean dari PROCESSING ke DEAD; jangan
  // tetap mengirim pesan yang sudah tidak berlaku.
  if (started.count !== 1) return { ok: false, error: "Pesan dibatalkan sebelum dikirim" }
  const result = await sendWhatsApp(message.organizationId, message.targetPhone, message.message)
  if (result.ok) {
    await markOutboxSent(message.id, result.providerMessageId)
    return { ok: true, providerMessageId: result.providerMessageId }
  }
  await markOutboxFailed(message.id, result.error, {
    uncertain: result.uncertain,
    permanent: result.blocked || result.permanent,
    retryAfterMs: result.retryAfterMs,
  })
  return { ok: false, error: result.error, uncertain: result.uncertain === true }
}

/**
 * Mengembalikan pesan yang tertinggal berstatus PROCESSING karena prosesnya
 * mati sebelum sempat mencatat hasil. Tanpa ini pesan tersebut akan menggantung
 * selamanya dan tidak pernah terkirim.
 */
export async function recoverStaleMessages(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MS)
  const stale = await prisma.whatsAppOutbox.findMany({
    where: { status: "PROCESSING", lockedAt: { lt: cutoff } },
    select: { id: true, attempts: true, maxAttempts: true, sendStartedAt: true },
  })

  for (const row of stale) {
    // Inilah pembedaan yang menjaga supplier tidak menerima pesan dua kali:
    //
    //   sendStartedAt kosong → permintaan belum pernah berangkat. Aman
    //     dikembalikan ke antrean dan dikirim ulang.
    //   sendStartedAt terisi → permintaan sudah berangkat, hasilnya tidak
    //     pernah tercatat. Mungkin sudah sampai, jadi hanya boleh UNCERTAIN.
    const sudahBerangkat = row.sendStartedAt != null
    const exhausted = row.attempts >= row.maxAttempts
    await prisma.whatsAppOutbox.updateMany({
      where: { id: row.id, status: "PROCESSING" },
      data: sudahBerangkat
        ? {
            status: "UNCERTAIN",
            lockedAt: null,
            lastError: "Proses berhenti setelah pesan dikirim ke penyedia; hasilnya tidak diketahui",
          }
        : exhausted
          ? {
              status: "UNCERTAIN",
              lockedAt: null,
              lastError: "Jatah percobaan habis sebelum hasil pengiriman tercatat",
            }
          : { status: "PENDING", lockedAt: null, nextAttemptAt: now },
    })
    await syncAggregateFromOutbox(row.id)
  }
  return stale.length
}

/**
 * Mengantre ulang pesan atas permintaan pengguna. Dipakai tombol "Coba lagi"
 * (FAILED/DEAD) dan "Periksa dan kirim ulang" (UNCERTAIN).
 */
export async function retryOutboxMessage(id: string, organizationId: string) {
  const reset = await prisma.whatsAppOutbox.updateMany({
    where: { id, organizationId, status: { in: ["FAILED", "UNCERTAIN", "DEAD"] } },
    data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null, attempts: 0, sendStartedAt: null },
  })
  if (reset.count !== 1) return false
  await syncAggregateFromOutbox(id)
  return true
}

/** Mengantre ulang pesan milik satu pesanan atau transfer tertentu. */
export async function retryAggregateDelivery(
  organizationId: string,
  aggregateType: WhatsAppAggregateType,
  aggregateId: string,
) {
  const row = await prisma.whatsAppOutbox.findFirst({
    where: {
      organizationId,
      aggregateType,
      aggregateId,
      status: { in: ["FAILED", "UNCERTAIN", "DEAD"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (!row) return false
  return retryOutboxMessage(row.id, organizationId)
}

/**
 * Menjalankan antrean sampai habis atau sampai batas aman tercapai. Dipanggil
 * setelah transaksi selesai (lewat after()) dan boleh dipanggil beberapa kali
 * bersamaan — penguncian barislah yang menjaga agar tidak terjadi kirim ganda.
 */
export async function drainOutbox(limit = 10) {
  await recoverStaleMessages()
  let sent = 0
  for (let index = 0; index < limit; index += 1) {
    const message = await claimPendingMessage()
    if (!message) break
    await processOutboxMessage(message)
    sent += 1
  }
  return sent
}

/**
 * Membangunkan pemroses setelah permintaan HTTP selesai. Ini hanya pemicu
 * cepat: bila prosesnya mati sebelum sempat jalan, barisnya tetap tersimpan
 * dan akan diambil pada pemicu berikutnya.
 */
export function scheduleOutboxDelivery() {
  try {
    after(async () => {
      try {
        await drainOutbox()
      } catch (error) {
        console.error("Gagal memproses antrean pengiriman WhatsApp", error)
      }
    })
  } catch {
    // after() menolak dipanggil di luar request (skrip, seed, pekerjaan latar).
    // Pemicunya boleh hilang; barisnya sudah tersimpan dan akan diambil nanti.
    // Yang penting transaksi bisnisnya tidak ikut batal karena ini.
  }
}
