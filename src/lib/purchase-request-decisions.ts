import "server-only"

import { prisma } from "@/lib/db"
import { maybeCreatePurchaseRequest } from "@/lib/purchase-requests"
import { sendWhatsApp, validateWhatsAppRecipient } from "@/lib/whatsapp"
import { scheduleOutboxDelivery } from "@/lib/whatsapp-outbox"

/// Kegagalan yang punya pesan sendiri untuk pengguna, bukan kesalahan server.
export class KeputusanDitolak extends Error {
  constructor(message: string, readonly status = 409) {
    super(message)
  }
}

const angka = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 3 })

/**
 * Supplier lama harus menerima pembatalan yang jelas sebelum supplier baru
 * dihubungi. Untuk pesanan banyak bahan, hanya bahan yang dialihkan yang
 * dibatalkan; baris lain pada kode yang sama tetap berlaku.
 */
function pesanPembatalanSupplier(input: {
  supplierName: string
  reference: string
  destinationName: string
  itemName: string
  remaining: number
  unit: string
  otherActiveLines: number
  reason: string
}) {
  const sebagian = input.otherActiveLines > 0
  return [
    `Halo ${input.supplierName}, mohon ${sebagian ? "batalkan bahan berikut dari" : "batalkan"} pesanan *${input.reference}* ke *${input.destinationName}*:`,
    "",
    `• ${input.itemName} — sisa ${angka(input.remaining)} ${input.unit}`,
    `Alasan: ${input.reason}`,
    "",
    sebagian
      ? `Bahan lain pada pesanan *${input.reference}* tetap berlaku.`
      : "Pesanan ini tidak jadi dilanjutkan. Mohon jangan diproses atau dikirim.",
    "Terima kasih.",
  ].join("\n")
}

/**
 * Mengalihkan pengadaan ke supplier berikutnya, dalam SATU transaksi.
 *
 * Empat lapis pengaman menjaga agar dua klik atau dua pengguna tidak pernah
 * menghasilkan dua pengalihan atau pesan WhatsApp pengalihan ganda:
 *
 * 1. `FOR UPDATE` mengunci baris pesanan, sehingga pemanggil kedua menunggu.
 * 2. Pemeriksaan `escalatedTo` menolak pesanan yang sudah pernah dieskalasi.
 * 3. Penutupan pesanan lama memakai syarat `status: "ACTIVE"`, jadi hanya satu
 *    pemanggil yang berhasil menutupnya.
 * 4. Di database, `escalatedFromId` unik dan hanya boleh ada satu pengadaan
 *    ACTIVE per bahan+gudang.
 */
export async function escalateToNextSupplier(
  id: string,
  organizationId: string,
  userId: string,
  note: string,
) {
  // Validasi kedua nomor sebelum transaksi mengubah status apa pun. Supplier
  // lama harus bisa menerima pembatalan dan supplier baru harus bisa menerima
  // pesanan lanjutan.
  const currentCheck = await prisma.purchaseRequest.findFirst({
    where: { id, organizationId, status: "ACTIVE" },
    select: {
      itemId: true, locationId: true, priority: true,
      supplier: { select: { name: true, phone: true } },
    },
  })
  if (!currentCheck) throw new KeputusanDitolak("Pengadaan ini sudah ditutup. Muat ulang halaman.")
  const nextCheck = await prisma.itemSupplier.findFirst({
    where: {
      organizationId, itemId: currentCheck.itemId, locationId: currentCheck.locationId,
      priority: { gt: currentCheck.priority }, supplier: { isActive: true, phone: { not: null } },
    },
    orderBy: { priority: "asc" },
    select: { supplier: { select: { name: true, phone: true } } },
  })
  if (!nextCheck?.supplier.phone) throw new KeputusanDitolak("Semua supplier untuk bahan ini sudah dicoba.")
  if (!currentCheck.supplier.phone) throw new KeputusanDitolak(`Nomor WhatsApp ${currentCheck.supplier.name} belum diisi.`)
  const [currentPhone, nextPhone] = await Promise.all([
    validateWhatsAppRecipient(organizationId, currentCheck.supplier.phone),
    validateWhatsAppRecipient(organizationId, nextCheck.supplier.phone),
  ])
  if (!currentPhone.valid) throw new KeputusanDitolak(`${currentCheck.supplier.name}: ${currentPhone.reason}. Pembatalan belum dapat dikirim.`)
  if (!nextPhone.valid) throw new KeputusanDitolak(`${nextCheck.supplier.name}: ${nextPhone.reason}. Pesanan lanjutan belum dibuat.`)

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${id} FOR UPDATE`
    const current = await tx.purchaseRequest.findFirstOrThrow({
      where: { id, organizationId },
      include: {
        escalatedTo: { select: { id: true, orderCode: true } },
        supplier: { select: { name: true, phone: true } },
        item: { select: { name: true, unit: true } },
        location: { select: { name: true } },
        purchaseOrder: {
          select: {
            shortCode: true,
            lines: { where: { status: "ACTIVE" }, select: { id: true } },
          },
        },
      },
    })

    if (current.status !== "ACTIVE") {
      throw new KeputusanDitolak("Pengadaan ini sudah ditutup. Muat ulang halaman.")
    }
    if (current.escalatedTo) {
      throw new KeputusanDitolak(`Pengadaan ini sudah dialihkan ke ${current.escalatedTo.orderCode}.`)
    }

    // Tidak ada perpindahan supplier selama waktu tunggu masih berjalan.
    // UNAVAILABLE adalah jawaban pasti sehingga boleh langsung dialihkan.
    const now = new Date()
    const tenggatLewat = current.responseOverdueAt != null
      || current.responseDueAt != null && current.responseDueAt.getTime() <= now.getTime()
    const janjiSebagianSudahDiterima = current.supplierReplyStatus === "PARTIAL"
      && current.promisedQuantity != null
      && Number(current.receivedQuantity) >= Number(current.promisedQuantity)
    if (current.supplierReplyStatus === "WAITING" && !tenggatLewat) {
      const keterangan = current.responseDueAt
        ? ` sampai ${current.responseDueAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`
        : " sampai pesan WhatsApp benar-benar terkirim dan batas waktunya dimulai"
      throw new KeputusanDitolak(`Masih menunggu jawaban ${current.supplier.name}${keterangan}.`)
    }
    if (current.supplierReplyStatus === "PARTIAL" && !janjiSebagianSudahDiterima) {
      throw new KeputusanDitolak(
        `Tunggu ${angka(Number(current.promisedQuantity ?? 0))} ${current.baseUnit ?? current.item.unit} yang disanggupi ${current.supplier.name} diterima lebih dahulu.`,
      )
    }
    if (current.supplierReplyStatus !== "WAITING" && current.supplierReplyStatus !== "UNAVAILABLE" && !janjiSebagianSudahDiterima) {
      throw new KeputusanDitolak(
        current.supplierReplyStatus === "NEEDS_REVIEW"
          ? "Balasan supplier masih perlu ditinjau. Putuskan balasannya sebelum mengganti supplier."
          : "Supplier sudah menyanggupi atau mengirim barang. Periksa status pesanan sebelum mengganti supplier.",
      )
    }

    // Supplier berikutnya hanya perlu memenuhi sisa yang belum sampai gudang.
    const remaining = Number(current.quantity) - Number(current.receivedQuantity)
    if (remaining <= 0) {
      throw new KeputusanDitolak("Seluruh jumlah sudah diterima. Selesaikan pengadaan ini, bukan mengalihkannya.")
    }

    const next = await tx.itemSupplier.findFirst({
      where: {
        organizationId,
        itemId: current.itemId,
        locationId: current.locationId,
        priority: { gt: current.priority },
        supplier: { isActive: true, phone: { not: null } },
      },
      orderBy: { priority: "asc" },
      select: {
        purchaseUnit: true,
        purchaseUnitSize: true,
        supplier: { select: { name: true } },
      },
    })
    // Tanpa supplier berikutnya, pengadaan DIBIARKAN aktif. Menutupnya di sini
    // akan menghilangkan kebutuhan yang sebenarnya belum terpenuhi.
    if (!next) {
      throw new KeputusanDitolak(
        "Semua supplier untuk bahan ini sudah dicoba. Selesaikan secara manual atau batalkan pengadaannya.",
      )
    }


    const supplierPhone = current.supplier.phone?.trim()
    if (!supplierPhone) {
      throw new KeputusanDitolak(
        `Nomor WhatsApp ${current.supplier.name} belum diisi. Pembatalan harus dikirim sebelum beralih ke ${next.supplier.name}.`,
      )
    }

    const reference = current.purchaseOrder ? `#${current.purchaseOrder.shortCode}` : current.orderCode
    const cancellationMessage = pesanPembatalanSupplier({
      supplierName: current.supplier.name,
      reference,
      destinationName: current.location.name,
      itemName: current.item.name,
      remaining,
      unit: current.baseUnit ?? current.item.unit,
      otherActiveLines: Math.max(0, (current.purchaseOrder?.lines.length ?? 1) - 1),
      reason: note,
    })
    const closed = await tx.purchaseRequest.updateMany({
      where: { id, organizationId, status: "ACTIVE" },
      data: {
        status: "FAILED",
        resolvedAt: new Date(),
        resolvedById: userId,
        resolutionNote: note,
      },
    })
    if (closed.count !== 1) throw new KeputusanDitolak("Pengadaan ini baru saja diubah. Muat ulang halaman.")

    const created = await maybeCreatePurchaseRequest(tx, organizationId, current.itemId, current.locationId, {
      afterFailedPriority: current.priority,
      force: true,
      requestedQuantity: remaining,
      requestContext: `Lanjutan dari ${current.orderCode} (${note})`,
      urgency: current.urgency,
      escalatedFrom: { id: current.id, procurementChainId: current.procurementChainId },
      ...(next.purchaseUnit && Number(next.purchaseUnitSize) > 0 && remaining % Number(next.purchaseUnitSize) === 0
        ? {
            unitSnapshot: {
              inputQuantity: remaining / Number(next.purchaseUnitSize),
              inputUnit: next.purchaseUnit,
              conversionFactor: Number(next.purchaseUnitSize),
            },
          }
        : {}),
    })
    if (!created) throw new KeputusanDitolak("Supplier berikutnya tidak dapat dihubungi. Periksa nomor WhatsApp-nya.")

    // Seluruh perubahan database sudah lolos validasi, tetapi belum commit.
    // Baru sekarang kirim pembatalan. Jika gagal, transaksi di-rollback dan
    // pesanan lama tetap aktif; antrean supplier baru juga ikut hilang.
    const cancellation = await sendWhatsApp(organizationId, supplierPhone, cancellationMessage)
    if (!cancellation.ok) {
      const tidakPasti = cancellation.uncertain
        ? "Status pengiriman pembatalan tidak diketahui. Periksa chat supplier pertama sebelum mencoba lagi."
        : cancellation.error ?? "WA pembatalan gagal dikirim"
      throw new KeputusanDitolak(
        `Belum dialihkan ke ${next.supplier.name}. ${tidakPasti}`,
        cancellation.uncertain ? 409 : 502,
      )
    }

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: "ESCALATE_PURCHASE_REQUEST",
        entity: "PurchaseRequest",
        entityId: id,
        before: { status: current.status, supplierReplyStatus: current.supplierReplyStatus, priority: current.priority },
        after: {
          status: "FAILED",
          note,
          lanjutanKe: created.id,
          orderCodeLanjutan: created.orderCode,
          supplierBerikutnya: next.supplier.name,
          sisaKebutuhan: remaining,
          pembatalanSupplierPertama: {
            supplier: current.supplier.name,
            reference,
            providerMessageId: cancellation.providerMessageId,
          },
        },
      },
    })

    return {
      id: created.id,
      orderCode: created.orderCode,
      supplier: next.supplier.name,
      previousSupplier: current.supplier.name,
      quantity: remaining,
      cancellationProviderMessageId: cancellation.providerMessageId,
    }
  }, { maxWait: 5_000, timeout: 30_000 })
  // maybeCreatePurchaseRequest membuat antrean saat transaksi belum commit.
  // Jadwalkan lagi setelah commit agar WA supplier baru tidak terlewat.
  scheduleOutboxDelivery()
  return result
}

/**
 * Menutup pengadaan atas keputusan pengguna, tanpa mencari supplier lain.
 *
 * `FULFILLED` TIDAK PERNAH diberikan hanya karena pengguna menekan tombol.
 * Status itu berarti barangnya benar-benar sudah sampai, dan satu-satunya yang
 * boleh menyatakannya adalah jumlah barang baik yang tercatat lewat Barang
 * Masuk. Menghentikan pengadaan yang barangnya belum lengkap berakhir
 * `FAILED` — jujur bahwa kebutuhannya tidak terpenuhi lewat jalur ini.
 */
export async function closePurchaseRequest(
  id: string,
  organizationId: string,
  userId: string,
  intent: "STOP" | "CANCEL",
  note: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${id} FOR UPDATE`
    const current = await tx.purchaseRequest.findFirstOrThrow({ where: { id, organizationId } })
    if (current.status !== "ACTIVE") {
      throw new KeputusanDitolak("Pengadaan ini sudah ditutup. Muat ulang halaman.")
    }

    const received = Number(current.receivedQuantity)
    const ordered = Number(current.quantity)
    const status = intent === "CANCEL"
      ? "CANCELLED" as const
      : received >= ordered ? "FULFILLED" as const : "FAILED" as const

    const closed = await tx.purchaseRequest.updateMany({
      where: { id, organizationId, status: "ACTIVE" },
      data: { status, resolvedAt: new Date(), resolvedById: userId, resolutionNote: note },
    })
    if (closed.count !== 1) throw new KeputusanDitolak("Pengadaan ini baru saja diubah. Muat ulang halaman.")

    // Tutup antrean yang belum sempat berangkat agar pesanan yang dihentikan
    // atau dibatalkan tidak tiba-tiba terkirim dari proses latar belakang.
    await tx.whatsAppOutbox.updateMany({
      where: {
        organizationId,
        aggregateType: { in: ["PURCHASE_REQUEST", "PURCHASE_REMINDER"] },
        aggregateId: id,
        OR: [
          { status: { in: ["PENDING", "FAILED", "DEAD"] } },
          { status: "PROCESSING", sendStartedAt: null },
        ],
      },
      data: { status: "DEAD", lastError: "Pengadaan ditutup sebelum pesan dikirim", lockedAt: null },
    })

    await tx.auditLog.create({
      data: {
        organizationId,
        userId,
        action: intent === "CANCEL" ? "CANCEL_PURCHASE_REQUEST" : "STOP_PURCHASE_REQUEST",
        entity: "PurchaseRequest",
        entityId: id,
        before: { status: current.status, supplierReplyStatus: current.supplierReplyStatus },
        after: { status, note, diterima: received, dipesan: ordered },
      },
    })
    return { status }
  })
}
