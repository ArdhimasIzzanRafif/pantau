import "server-only"

import { prisma } from "@/lib/db"

/// Satu kejadian pada riwayat pengadaan, sudah siap ditampilkan.
export type KejadianPengadaan = {
  waktu: Date
  /// Dipakai tampilan untuk memilih ikon dan warna.
  jenis:
    | "PESANAN_DIBUAT" | "PESAN_KELUAR" | "BALASAN_SUPPLIER"
    | "KEPUTUSAN" | "BARANG_MASUK" | "ESKALASI"
  judul: string
  keterangan?: string
  /// Kode pesanan yang bersangkutan — penting karena satu rantai dapat memuat
  /// beberapa pesanan ke supplier berbeda.
  orderCode: string
  /// Isi mentah untuk ditampilkan apa adanya, mis. balasan WhatsApp.
  kutipan?: string
}

const angka = (value: unknown) =>
  Number(value).toLocaleString("id-ID", { maximumFractionDigits: 3 })

const LABEL_KEPUTUSAN: Record<string, string> = {
  SUBMIT_WAREHOUSE_PURCHASE: "Penanggung jawab gudang mengajukan pembelian",
  ESCALATE_PURCHASE_REQUEST: "Dialihkan ke supplier berikutnya",
  STOP_PURCHASE_REQUEST: "Pengadaan dihentikan",
  CANCEL_PURCHASE_REQUEST: "Pengadaan dibatalkan",
  PURCHASE_PARTIALLY_RECEIVED: "Barang diterima sebagian",
  PURCHASE_FULFILLED: "Pengadaan terpenuhi",
  FAIL_PURCHASE_REQUEST: "Supplier dinyatakan tidak dapat memenuhi",
  CONTINUE_OUTSTANDING_NEED: "Sisa kebutuhan outlet dilanjutkan",
}

const LABEL_BALASAN: Record<string, string> = {
  READY: "Supplier menyatakan siap",
  PARTIAL: "Supplier hanya sanggup sebagian",
  SHIPPED: "Supplier menyatakan barang dikirim",
  UNAVAILABLE: "Supplier menyatakan stok kosong",
  NEEDS_REVIEW: "Balasan perlu ditinjau",
  WAITING: "Balasan diterima",
}

/**
 * Mengumpulkan seluruh jejak satu pengadaan menjadi satu berkas.
 *
 * Yang dikumpulkan bukan hanya satu baris PurchaseRequest, melainkan SELURUH
 * RANTAINYA: pesanan pertama, pesanan lanjutan setelah supplier menjawab
 * kosong, dan seterusnya. Tanpa itu, riwayatnya terputus tepat di titik yang
 * paling perlu dijelaskan.
 *
 * Seluruh pengambilan data dibatasi organizationId, termasuk yang lewat id
 * rantai — id boleh saja ditebak orang, kepemilikannya tidak.
 */
export async function ambilBerkasPengadaan(organizationId: string, purchaseRequestId: string) {
  const awal = await prisma.purchaseRequest.findFirst({
    where: { id: purchaseRequestId, organizationId },
    select: { id: true, procurementChainId: true },
  })
  if (!awal) return null

  const chainId = awal.procurementChainId ?? awal.id
  const rantai = await prisma.purchaseRequest.findMany({
    where: { organizationId, OR: [{ procurementChainId: chainId }, { id: chainId }] },
    orderBy: { createdAt: "asc" },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      item: { select: { id: true, name: true, unit: true } },
      location: { select: { id: true, name: true } },
    },
  })
  if (rantai.length === 0) return null

  const ids = rantai.map((baris) => baris.id)
  const kodeDari = new Map(rantai.map((baris) => [baris.id, baris.orderCode]))

  const [pesanMasuk, antrean, penerimaan, jejakAudit] = await Promise.all([
    prisma.incomingWhatsAppMessage.findMany({
      where: { organizationId, purchaseRequestId: { in: ids } },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.whatsAppOutbox.findMany({
      where: { organizationId, aggregateType: "PURCHASE_REQUEST", aggregateId: { in: ids } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.goodsReceipt.findMany({
      where: { organizationId, purchaseRequestId: { in: ids } },
      orderBy: { receivedAt: "asc" },
      include: { items: { include: { item: { select: { name: true, unit: true } } } }, location: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { organizationId, entity: "PurchaseRequest", entityId: { in: ids } },
      orderBy: { createdAt: "asc" },
    }),
  ])

  // AuditLog hanya menyimpan userId, jadi namanya diambil sekali untuk semua.
  const idPengguna = [...new Set(jejakAudit.map((jejak) => jejak.userId).filter((id): id is string => !!id))]
  const pengguna = idPengguna.length === 0 ? [] : await prisma.user.findMany({
    where: { id: { in: idPengguna } },
    select: { id: true, name: true, email: true },
  })
  const namaPengguna = new Map(pengguna.map((baris) => [baris.id, baris.name ?? baris.email]))

  const kejadian: KejadianPengadaan[] = []

  for (const pesanan of rantai) {
    kejadian.push({
      waktu: pesanan.createdAt,
      jenis: pesanan.escalatedFromId ? "ESKALASI" : "PESANAN_DIBUAT",
      orderCode: pesanan.orderCode,
      judul: pesanan.escalatedFromId
        ? `Pesanan lanjutan dibuat ke ${pesanan.supplier.name}`
        : `Pesanan dibuat ke ${pesanan.supplier.name}`,
      keterangan: `${pesanan.item.name} ${angka(pesanan.inputQuantity ?? pesanan.quantity)} `
        + `${pesanan.inputUnit ?? pesanan.item.unit}`
        + (pesanan.inputUnit && pesanan.inputUnit !== pesanan.item.unit
          ? ` (= ${angka(pesanan.quantity)} ${pesanan.item.unit})` : "")
        + ` · tujuan ${pesanan.location.name}`,
    })
  }

  for (const baris of antrean) {
    const kode = kodeDari.get(baris.aggregateId) ?? "-"
    if (baris.sentAt) {
      kejadian.push({
        waktu: baris.sentAt, jenis: "PESAN_KELUAR", orderCode: kode,
        judul: "Pesan WhatsApp terkirim ke supplier",
        keterangan: baris.providerMessageId ? `ID penyedia: ${baris.providerMessageId}` : undefined,
      })
    } else if (baris.status !== "PENDING") {
      kejadian.push({
        waktu: baris.updatedAt, jenis: "PESAN_KELUAR", orderCode: kode,
        judul: `Pengiriman pesan WhatsApp: ${baris.status}`,
        keterangan: baris.lastError ?? undefined,
      })
    }
  }

  for (const pesan of pesanMasuk) {
    const kode = pesan.purchaseRequestId ? kodeDari.get(pesan.purchaseRequestId) ?? "-" : "-"
    kejadian.push({
      waktu: pesan.receivedAt, jenis: "BALASAN_SUPPLIER", orderCode: kode,
      judul: pesan.processingStatus === "MATCHED"
        ? "Balasan supplier diterapkan"
        : `Balasan supplier: ${pesan.processingStatus}`,
      keterangan: pesan.processingNote ?? undefined,
      kutipan: pesan.message,
    })
  }

  for (const jejak of jejakAudit) {
    const label = LABEL_KEPUTUSAN[jejak.action]
    // Balasan supplier sudah muncul dari pesan masuknya sendiri; audit untuk
    // kejadian yang sama tidak perlu diulang di lini masa.
    if (!label) continue
    const oleh = jejak.userId ? namaPengguna.get(jejak.userId) : null
    const setelah = (jejak.after ?? {}) as Record<string, unknown>
    kejadian.push({
      waktu: jejak.createdAt, jenis: "KEPUTUSAN",
      orderCode: kodeDari.get(jejak.entityId ?? "") ?? "-",
      judul: label,
      keterangan: [oleh ? `oleh ${oleh}` : null, typeof setelah.note === "string" ? setelah.note : null]
        .filter(Boolean).join(" · ") || undefined,
    })
  }

  for (const terima of penerimaan) {
    const kode = terima.purchaseRequestId ? kodeDari.get(terima.purchaseRequestId) ?? "-" : "-"
    for (const baris of terima.items) {
      const rusak = Number(baris.damagedQuantity)
      const hilang = Number(baris.missingQuantity)
      kejadian.push({
        waktu: terima.receivedAt, jenis: "BARANG_MASUK", orderCode: kode,
        judul: `Barang masuk dicatat di ${terima.location.name}`,
        keterangan: `${baris.item.name}: baik ${angka(baris.quantity)} ${baris.item.unit}`
          + (rusak > 0 ? `, rusak ${angka(rusak)}` : "")
          + (hilang > 0 ? `, tidak tiba ${angka(hilang)}` : "")
          + (terima.receiptNumber ? ` · surat jalan ${terima.receiptNumber}` : ""),
      })
    }
  }

  kejadian.sort((a, b) => a.waktu.getTime() - b.waktu.getTime())

  const terakhir = rantai[rantai.length - 1]
  const totalDipesan = rantai.reduce((jumlah, baris) => jumlah + Number(baris.quantity), 0)
  const totalDiterima = rantai.reduce((jumlah, baris) => jumlah + Number(baris.receivedQuantity), 0)
  const totalDikirim = rantai.reduce((jumlah, baris) => jumlah + Number(baris.shippedQuantity ?? 0), 0)

  // Dibaca dari FAKTA kiriman, sama seperti antrean penerimaan. Obrolan biasa
  // dari supplier dapat mengubah status balasan menjadi perlu ditinjau, tetapi
  // tidak mengubah kenyataan bahwa barangnya sudah dinyatakan berangkat —
  // ringkasan yang bilang "perlu ditinjau" di situ akan menyesatkan.
  const sudahDikirim = terakhir.supplierShippedAt != null || terakhir.shippedQuantity != null
  const labelBalasan = sudahDikirim && terakhir.status === "ACTIVE" && totalDiterima < totalDipesan
    ? "Barang dinyatakan dikirim, menunggu penerimaan"
    : LABEL_BALASAN[terakhir.supplierReplyStatus] ?? terakhir.supplierReplyStatus

  return {
    chainId,
    /// Ringkasan seluruh rantai, bukan hanya pesanan terakhir.
    ringkasan: {
      item: terakhir.item,
      lokasi: terakhir.location,
      percobaan: rantai.length,
      totalDipesan,
      totalDikirim,
      totalDiterima,
      sisa: Math.max(0, totalDipesan - totalDiterima),
      statusTerakhir: terakhir.status,
      balasanTerakhir: terakhir.supplierReplyStatus,
      labelBalasanTerakhir: labelBalasan,
      sudahDikirim,
    },
    pesanan: rantai.map((baris) => ({
      id: baris.id,
      orderCode: baris.orderCode,
      status: baris.status,
      supplier: baris.supplier,
      prioritas: baris.priority,
      dipesan: Number(baris.quantity),
      dijanjikan: baris.promisedQuantity == null ? null : Number(baris.promisedQuantity),
      dikirim: baris.shippedQuantity == null ? null : Number(baris.shippedQuantity),
      diterima: Number(baris.receivedQuantity),
      satuanMasukan: baris.inputUnit,
      faktorKonversi: baris.conversionFactor == null ? null : Number(baris.conversionFactor),
      balasanTerakhir: baris.supplierLastMessage,
      balasanTerakhirPada: baris.supplierLastMessageAt,
      statusPesan: baris.messageStatus,
      galatPesan: baris.lastMessageError,
      dilanjutkanDari: baris.escalatedFromId,
      alasanPenutupan: baris.resolutionNote,
      dibuatPada: baris.createdAt,
    })),
    kejadian,
    jumlahPesanMasuk: pesanMasuk.length,
    jumlahPenerimaan: penerimaan.length,
  }
}
