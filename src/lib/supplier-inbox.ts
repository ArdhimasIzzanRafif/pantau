import "server-only"

import { Prisma } from "@prisma/client"
import { ownerPhone } from "@/lib/whatsapp"
import {
  applySupplierReply, BARIS_JAWABAN_STANDAR, klasifikasiBalasan, resolveReplyQuantity,
  type KlasifikasiBalasan, type SupplierReplyCommand,
} from "@/lib/supplier-replies"

type Tx = Prisma.TransactionClient

/// Satu perintah untuk satu bahan. `quantity` seperti ditulis supplier (satuan beli).
export type PerintahBaris = { lineId: string; command: SupplierReplyCommand; quantity: number | null }

/// Usulan sistem yang ditampilkan di kotak masuk sebagai tombol satu klik.
export type Usulan =
  | { tipe: "PERINTAH"; orderId: string; perintah: PerintahBaris[]; alasan: string }
  | { tipe: "PILIH_PESANAN"; orderIds: string[]; perintahSemua: SupplierReplyCommand | null; alasan: string }
  | { tipe: "BAYAR"; orderId: string; nominal: number | null; alasan: string }
  | { tipe: "TANYA"; orderId: string; alasan: string }
  | { tipe: "LAMPIRAN"; orderId: string | null; alasan: string }
  | { tipe: "TAUTKAN_NOMOR"; supplierId: string | null; alasan: string }

/// Pesan WA yang dikirim SETELAH transaksi tersimpan.
export type EfekWa = { organizationId: string; phone: string; message: string; jenis: "PERLU_DICEK" | "BALAS_OTOMATIS"; entityId: string }

const JEDA_PEMBERITAHUAN_MS = 10 * 60_000

/** Supplier pemilik nomor: nomor utama atau salah satu nomor tambahan. */
export async function cariSupplierDariNomor(tx: Tx, organizationId: string, phone: string) {
  const utama = await tx.supplier.findFirst({ where: { organizationId, normalizedPhone: phone }, select: { id: true, name: true } })
  if (utama) return utama
  const tambahan = await tx.supplierPhone.findFirst({ where: { organizationId, phone }, select: { supplier: { select: { id: true, name: true } } } })
  return tambahan?.supplier ?? null
}

/**
 * Menerapkan perintah per bahan ke pesanan (dari balasan pasti ATAU keputusan
 * manusia di kotak masuk). Aturan per bahan memakai applySupplierReply yang
 * sama dengan format lama, jadi kemajuan tidak pernah mundur diam-diam.
 */
export async function terapkanPerintahBaris(tx: Tx, ctx: {
  organizationId: string
  orderId: string
  perintah: PerintahBaris[]
  message: string
  receivedAt: Date
  incomingId: string | null
  userId?: string | null
}) {
  const { organizationId, orderId } = ctx
  await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE "purchaseOrderId" = ${orderId} FOR UPDATE`
  const order = await tx.purchaseOrder.findFirstOrThrow({
    where: { id: orderId, organizationId },
    select: { shortCode: true, lines: { where: { status: "ACTIVE" }, include: { item: { select: { name: true } } } } },
  })
  const catatan: string[] = []
  let adaTinjau = false
  for (const p of ctx.perintah) {
    const line = order.lines.find((row) => row.id === p.lineId)
    if (!line) continue
    let quantity: number | null
    if (p.command === "UNAVAILABLE") quantity = null
    else if (p.quantity == null) {
      quantity = p.command === "SHIPPED" && line.promisedQuantity != null ? Number(line.promisedQuantity) : Number(line.quantity)
    } else {
      const terkonversi = resolveReplyQuantity(
        { orderCode: line.orderCode, command: p.command, quantity: p.quantity, unit: null },
        { inputUnit: line.inputUnit, conversionFactor: line.conversionFactor == null ? null : Number(line.conversionFactor), baseUnit: line.baseUnit },
      )
      if (!terkonversi.ok) { adaTinjau = true; catatan.push(`${line.item.name}: ${terkonversi.reason}`); continue }
      quantity = terkonversi.baseQuantity
    }
    const hasil = applySupplierReply(
      {
        supplierReplyStatus: line.supplierReplyStatus,
        promisedQuantity: line.promisedQuantity == null ? null : Number(line.promisedQuantity),
        shippedQuantity: line.shippedQuantity == null ? null : Number(line.shippedQuantity),
      },
      { orderCode: line.orderCode, command: p.command, quantity, unit: null },
      Number(line.quantity),
    )
    if (hasil.outcome === "NEEDS_REVIEW") adaTinjau = true
    await tx.purchaseRequest.update({
      where: { id: line.id },
      data: {
        supplierReplyStatus: hasil.supplierReplyStatus,
        promisedQuantity: hasil.promisedQuantity,
        shippedQuantity: hasil.shippedQuantity,
        supplierLastMessage: ctx.message,
        supplierLastMessageAt: ctx.receivedAt,
        responseOverdueAt: null,
        ...(hasil.confirmed ? { supplierConfirmedAt: ctx.receivedAt } : {}),
        ...(hasil.shipped ? { supplierShippedAt: ctx.receivedAt } : {}),
      },
    })
    catatan.push(`${line.item.name}: ${hasil.note}`)
  }
  await tx.auditLog.create({ data: {
    organizationId, userId: ctx.userId ?? null,
    action: ctx.userId ? "REVIEW_SUPPLIER_REPLY" : "APPLY_SUPPLIER_REPLY",
    entity: "PurchaseOrder", entityId: orderId,
    after: { shortCode: order.shortCode, perintah: ctx.perintah, incomingMessageId: ctx.incomingId, catatan } as Prisma.InputJsonValue,
  } })
  return { catatan, adaTinjau, shortCode: order.shortCode }
}

type PesananAktif = Prisma.PurchaseOrderGetPayload<{
  include: {
    location: { select: { name: true; whatsappPhone: true } }
    lines: { include: { item: { select: { name: true; unit: true } } } }
  }
}>

async function pesananAktifSupplier(tx: Tx, organizationId: string, supplierId: string): Promise<PesananAktif[]> {
  return tx.purchaseOrder.findMany({
    where: { organizationId, supplierId, lines: { some: { status: "ACTIVE" } } },
    include: {
      location: { select: { name: true, whatsappPhone: true } },
      lines: { where: { status: "ACTIVE" }, include: { item: { select: { name: true, unit: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  })
}

const ringkasPesanan = (order: PesananAktif) =>
  order.lines.slice(0, 3).map((line) => `${line.item.name} ${Number(line.inputQuantity ?? line.quantity).toLocaleString("id-ID")} ${line.inputUnit ?? line.item.unit}`).join(", ")
  + (order.lines.length > 3 ? `, +${order.lines.length - 3} lainnya` : "")

/**
 * Memproses satu pesan WA masuk. Prinsip: "fleksibel di depan, tegas di
 * belakang" — semua pesan dari supplier disimpan, tetapi pesanan hanya
 * berubah otomatis bila jawabannya pasti. Selebihnya masuk kotak masuk
 * ("Perlu ditinjau") dengan usulan satu klik, dan penanggung jawab gudang
 * diberi tahu lewat WA.
 *
 * Mengembalikan `formatLama` bila pesan sebaiknya diproses dengan alur PO
 * satu bahan (format lama).
 */
export async function prosesPesanSupplier(tx: Tx, ctx: {
  organizationId: string
  supplier: { id: string; name: string } | null
  senderPhone: string
  devicePhone: string
  senderName: string | null
  message: string
  receivedAt: Date
  eventKey: string
  providerInboxId: string | null
  attachment: { url: string | null; fileName: string | null; type: string | null }
  /// Balasan menyebut kode PO lama yang sudah selesai/dibatalkan.
  kodeTertutup?: { kode: string; command: SupplierReplyCommand | null; quantity: number | null } | null
}): Promise<{ efek: EfekWa[]; formatLama?: { requestId: string | null } }> {
  const { organizationId, supplier } = ctx
  const efek: EfekWa[] = []
  const baseUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")
  const masukan = { message: ctx.message, type: ctx.attachment.type, url: ctx.attachment.url, fileName: ctx.attachment.fileName }
  const awal = klasifikasiBalasan(masukan)

  // Pertahanan kedua untuk pemanggil selain route webhook. Pesan dari nomor
  // yang belum terdaftar sebagai supplier tidak masuk tabel pesan sama sekali.
  if (!supplier) return { efek }
  const supplierId = supplier.id

  const simpan = (data: {
    status: "MATCHED" | "NEEDS_REVIEW" | "REJECTED" | "CLOSED"; note: string; kind: string
    orderId?: string | null; usulan?: Usulan | null
  }) => tx.incomingWhatsAppMessage.create({ data: {
    organizationId, supplierId: supplier?.id ?? null, purchaseOrderId: data.orderId ?? null,
    eventKey: ctx.eventKey, providerInboxId: ctx.providerInboxId, devicePhone: ctx.devicePhone,
    senderPhone: ctx.senderPhone, senderName: ctx.senderName, message: ctx.message, receivedAt: ctx.receivedAt,
    attachmentUrl: ctx.attachment.url, attachmentName: ctx.attachment.fileName,
    processingStatus: data.status, processingNote: data.note, kind: data.kind,
    suggestion: data.usulan ? data.usulan as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
  } })

  /** WA "perlu dicek" ke penanggung jawab gudang, paling sering sekali per 10 menit per pesanan. */
  async function beriTahuGudang(order: PesananAktif | null, alasan: string, incomingId: string) {
    if (order) {
      if (order.reviewNoticeAt && ctx.receivedAt.getTime() - order.reviewNoticeAt.getTime() < JEDA_PEMBERITAHUAN_MS) return
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { reviewNoticeAt: ctx.receivedAt } })
    }
    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { ownerPhone: true } })
    const phone = order?.location.whatsappPhone?.trim() || org?.ownerPhone?.trim() || ownerPhone()
    if (!phone) return
    const isi = ctx.message.length > 200 ? `${ctx.message.slice(0, 200)}…` : ctx.message
    efek.push({ organizationId, phone, jenis: "PERLU_DICEK", entityId: incomingId, message:
      `[Pantau] Balasan supplier perlu dicek\n\n${supplier?.name ?? `Nomor ${ctx.senderPhone}`}${order ? ` · pesanan #${order.shortCode}` : ""}\n“${isi}”\n${alasan}`
      + `\n\nBuka kotak masuk:\n${baseUrl}/dashboard/suppliers?view=inbox` })
  }

  /** Balasan otomatis ke supplier: SEKALI per pesanan, tidak untuk basa-basi. */
  async function balasOtomatis(order: PesananAktif, isi: string, incomingId: string) {
    if (order.autoReplySentAt) return
    await tx.purchaseOrder.update({ where: { id: order.id }, data: { autoReplySentAt: ctx.receivedAt } })
    efek.push({ organizationId, phone: ctx.senderPhone, jenis: "BALAS_OTOMATIS", entityId: incomingId, message: isi })
  }

  /**
   * Supplier kadang mengirim jumlah dahulu ("25"), lalu penjelasan lengkap
   * beberapa detik kemudian ("selada cuma ready 25"). Angka sendiri tidak
   * boleh ditebak, tetapi setelah pesan lengkap tervalidasi entri angka tadi
   * tidak perlu tetap memenuhi Kotak Masuk.
   */
  async function tutupPotonganAngka(orderId: string, incomingId: string) {
    const sejak = new Date(ctx.receivedAt.getTime() - 10 * 60_000)
    const kandidat = await tx.incomingWhatsAppMessage.findMany({
      where: {
        organizationId,
        supplierId,
        purchaseOrderId: orderId,
        processingStatus: "NEEDS_REVIEW",
        kind: "TAK_DIKENAL",
        receivedAt: { gte: sejak, lte: ctx.receivedAt },
        id: { not: incomingId },
      },
      select: { id: true, message: true },
      take: 10,
    })
    const ids = kandidat.filter((row) => /^\s*\d+(?:[.,]\d{1,3})?\s*$/.test(row.message)).map((row) => row.id)
    if (ids.length) {
      await tx.incomingWhatsAppMessage.updateMany({
        where: { id: { in: ids } },
        data: {
          processingStatus: "CLOSED",
          processingNote: "Potongan angka dilengkapi oleh balasan supplier berikutnya yang berhasil divalidasi",
          suggestion: Prisma.JsonNull,
        },
      })
    }
  }

  const kodePendek = awal.kind === "STANDAR" ? awal.reply.shortCode : awal.shortCode
  const aktif = await pesananAktifSupplier(tx, organizationId, supplier.id)

  // ── Kode pesanan lama/tertutup → usulkan pesanan yang aktif ─────────────
  const kodeTertutup = ctx.kodeTertutup ?? null
  let kodeTertutupLabel: string | null = kodeTertutup?.kode ?? null
  let target: PesananAktif | null = null
  if (kodePendek && !kodeTertutup) {
    const dikodekan = await tx.purchaseOrder.findFirst({ where: { organizationId, shortCode: kodePendek }, select: { id: true, supplierId: true } })
    if (!dikodekan) {
      const incoming = await simpan({ status: "NEEDS_REVIEW", kind: awal.kind, note: `Kode #${kodePendek} tidak ditemukan`,
        usulan: aktif.length ? { tipe: "PILIH_PESANAN", orderIds: aktif.map((o) => o.id), perintahSemua: awal.kind === "STANDAR" ? awal.reply.command : null, alasan: `Kode #${kodePendek} tidak dikenal. Pilih pesanan yang dimaksud.` } : null })
      await beriTahuGudang(aktif[0] ?? null, `Kode #${kodePendek} tidak dikenal.`, incoming.id)
      return { efek }
    }
    if (dikodekan.supplierId !== supplier.id) {
      await simpan({ status: "REJECTED", kind: awal.kind, note: `Kode #${kodePendek} milik supplier lain` })
      return { efek }
    }
    target = aktif.find((o) => o.id === dikodekan.id) ?? null
    if (!target) kodeTertutupLabel = `#${kodePendek}`
  }

  if (kodeTertutupLabel) {
    if (awal.kind === "BASA_BASI") { await simpan({ status: "CLOSED", kind: awal.kind, note: "Tidak perlu tindakan" }); return { efek } }
    const command = kodeTertutup?.command ?? (awal.kind === "STANDAR" ? awal.reply.command : null)
    const quantity = kodeTertutup?.quantity ?? (awal.kind === "STANDAR" ? awal.reply.quantity : null)
    if (aktif.length === 0) { await simpan({ status: "CLOSED", kind: awal.kind, note: `Pesanan ${kodeTertutupLabel} sudah selesai` }); return { efek } }
    if (aktif.length === 1 && command) {
      const order = aktif[0]
      // Jumlah berbeda dari pesanan → diusulkan "sebagian", bukan "siap semua".
      const perintah: PerintahBaris[] = order.lines.map((line) => {
        if (order.lines.length === 1 && quantity != null && command === "READY"
          && quantity !== Number(line.inputQuantity ?? line.quantity) && quantity !== Number(line.quantity)) {
          return { lineId: line.id, command: "PARTIAL", quantity }
        }
        return { lineId: line.id, command, quantity: order.lines.length === 1 ? quantity : null }
      })
      const incoming = await simpan({ status: "NEEDS_REVIEW", kind: awal.kind, orderId: order.id,
        note: `Membalas ${kodeTertutupLabel} yang sudah selesai`,
        usulan: { tipe: "PERINTAH", orderId: order.id, perintah, alasan: `${supplier.name} membalas kode ${kodeTertutupLabel} yang sudah selesai/dibatalkan. Mungkin maksudnya #${order.shortCode} (${ringkasPesanan(order)})?` } })
      await balasOtomatis(order, `Terima kasih, ${supplier.name}. Kode ${kodeTertutupLabel} sudah selesai/dibatalkan.\nPesanan yang masih aktif: *#${order.shortCode}* (${ringkasPesanan(order)}).\nBalas *1* kalau siap semua.`, incoming.id)
      await beriTahuGudang(order, `Membalas kode lama ${kodeTertutupLabel}. Usulan: terapkan ke #${order.shortCode}.`, incoming.id)
      return { efek }
    }
    const incoming = await simpan({ status: "NEEDS_REVIEW", kind: awal.kind,
      note: `Membalas ${kodeTertutupLabel} yang sudah selesai`,
      usulan: { tipe: "PILIH_PESANAN", orderIds: aktif.map((o) => o.id), perintahSemua: command, alasan: `Membalas kode ${kodeTertutupLabel} yang sudah selesai. Pilih pesanan aktif yang dimaksud.` } })
    await beriTahuGudang(aktif[0], `Membalas kode lama ${kodeTertutupLabel}.`, incoming.id)
    return { efek }
  }

  // ── Menentukan pesanan yang dituju ───────────────────────────────────────
  if (!target) {
    const legacy = await tx.purchaseRequest.findMany({
      where: { organizationId, supplierId: supplier.id, status: "ACTIVE", purchaseOrderId: null }, select: { id: true }, take: 2,
    })
    if (aktif.length === 0 && legacy.length > 0) return { efek, formatLama: { requestId: legacy.length === 1 ? legacy[0].id : null } }
    if (aktif.length === 0) {
      // Invoice sering datang SETELAH barang diterima: simpan ke pesanan terakhir.
      if (awal.kind === "LAMPIRAN") {
        const terakhir = await tx.purchaseOrder.findFirst({
          where: { organizationId, supplierId: supplier.id, createdAt: { gte: new Date(ctx.receivedAt.getTime() - 30 * 86_400_000) } },
          orderBy: { createdAt: "desc" }, select: { id: true, shortCode: true },
        })
        if (terakhir) return simpanLampiran(terakhir.id, terakhir.shortCode, null)
      }
      await simpan({ status: "CLOSED", kind: awal.kind, note: "Tidak ada pesanan aktif dari supplier ini" })
      return { efek }
    }
    if (aktif.length + legacy.length > 1) {
      if (awal.kind === "BASA_BASI") { await simpan({ status: "CLOSED", kind: awal.kind, note: "Tidak perlu tindakan" }); return { efek } }
      const incoming = await simpan({ status: "NEEDS_REVIEW", kind: awal.kind, note: "Supplier punya beberapa pesanan aktif",
        usulan: { tipe: "PILIH_PESANAN", orderIds: aktif.map((o) => o.id), perintahSemua: awal.kind === "STANDAR" ? awal.reply.command : null,
          alasan: `${supplier.name} punya ${aktif.length + legacy.length} pesanan aktif dan tidak menyebut kode. Pilih pesanan yang dimaksud.` } })
      await beriTahuGudang(aktif[0], "Supplier punya beberapa pesanan aktif; pilih pesanan yang dimaksud.", incoming.id)
      return { efek }
    }
    target = aktif[0]
  }

  const order = target
  // Respons apa pun dari supplier menghentikan status "belum dibalas".
  await tx.purchaseRequest.updateMany({ where: { purchaseOrderId: order.id, status: "ACTIVE" }, data: { responseOverdueAt: null } })

  const namaPemetaan = await tx.itemSupplier.findMany({
    where: { organizationId, supplierId: supplier.id, locationId: order.locationId, itemId: { in: order.lines.map((l) => l.itemId) } },
    select: { itemId: true, supplierItemName: true },
  })
  const k: KlasifikasiBalasan = klasifikasiBalasan(masukan, order.lines.map((line) => ({
    id: line.id,
    names: [line.item.name, namaPemetaan.find((m) => m.itemId === line.itemId)?.supplierItemName ?? ""].filter(Boolean),
  })))

  switch (k.kind) {
    case "STANDAR": {
      const r = k.reply
      const satuBahan = order.lines.length === 1
      // Pasti bila: jawaban angka, pesanan satu bahan, atau "siap/dikirim" tanpa angka.
      const pasti = r.viaAngka ? (r.quantity == null || satuBahan)
        : satuBahan || ((r.command === "READY" || r.command === "SHIPPED") && r.quantity == null)
      const perintah: PerintahBaris[] = order.lines.map((line) => ({ lineId: line.id, command: r.command, quantity: satuBahan ? r.quantity : null }))
      if (pasti) {
        const incoming = await simpan({ status: "MATCHED", kind: k.kind, orderId: order.id, note: `Diproses: ${r.command}` })
        const hasil = await terapkanPerintahBaris(tx, { organizationId, orderId: order.id, perintah, message: ctx.message, receivedAt: ctx.receivedAt, incomingId: incoming.id })
        await tx.incomingWhatsAppMessage.update({ where: { id: incoming.id }, data: {
          processingStatus: hasil.adaTinjau ? "NEEDS_REVIEW" : "MATCHED",
          processingNote: `Balasan ${r.command} untuk pesanan #${order.shortCode}: ${hasil.catatan.join("; ")}`,
          ...(hasil.adaTinjau ? { suggestion: { tipe: "PERINTAH", orderId: order.id, perintah, alasan: hasil.catatan.join("; ") } as unknown as Prisma.InputJsonValue } : {}),
        } })
        if (hasil.adaTinjau) await beriTahuGudang(order, hasil.catatan.join("; "), incoming.id)
        else await tutupPotonganAngka(order.id, incoming.id)
        return { efek }
      }
      const alasan = r.quantity != null
        ? `Jumlah "${r.quantity}" belum jelas untuk bahan yang mana (pesanan berisi ${order.lines.length} bahan).`
        : `"${ctx.message}" berlaku untuk semua ${order.lines.length} bahan? Periksa sebelum diterapkan.`
      const incoming = await simpan({ status: "NEEDS_REVIEW", kind: k.kind, orderId: order.id, note: alasan,
        usulan: { tipe: "PERINTAH", orderId: order.id, perintah, alasan } })
      await beriTahuGudang(order, alasan, incoming.id)
      return { efek }
    }
    case "SEBUT_BAHAN": {
      const perintah: PerintahBaris[] = order.lines.flatMap((line): PerintahBaris[] => {
        const disebut = k.bahan.find((b) => b.lineId === line.id)
        if (disebut) return [{ lineId: line.id, command: disebut.command, quantity: disebut.quantity }]
        return k.sisanya ? [{ lineId: line.id, command: k.sisanya, quantity: null }] : []
      })
      const alasan = k.bahan.map((b) => {
        const line = order.lines.find((l) => l.id === b.lineId)!
        return b.command === "UNAVAILABLE" ? `${line.item.name} kosong` : `${line.item.name} hanya ${b.quantity} ${line.inputUnit ?? line.item.unit}`
      }).join(", ") + (k.sisanya && order.lines.length > k.bahan.length ? "; bahan lain siap" : "")
      // Untuk pesanan satu bahan, nama bahan + jumlah sebagian adalah fakta
      // yang lengkap: "Selada segar cuman ready 25" berarti sanggup 25.
      // Jawaban kosong hanya otomatis bila tidak sekaligus mengandung kata
      // siap; "ok tapi coklat kosong" tetap perlu ditinjau manusia.
      const disebut = k.bahan[0]
      const pastiSatuBahan = order.lines.length === 1 && k.bahan.length === 1
        && (disebut.command === "PARTIAL" && disebut.quantity != null && disebut.quantity > 0
          || disebut.command === "UNAVAILABLE" && k.sisanya == null)
      if (pastiSatuBahan) {
        const incoming = await simpan({
          status: "MATCHED",
          kind: k.kind,
          orderId: order.id,
          note: `Diproses otomatis: ${alasan}`,
        })
        const hasil = await terapkanPerintahBaris(tx, {
          organizationId,
          orderId: order.id,
          perintah,
          message: ctx.message,
          receivedAt: ctx.receivedAt,
          incomingId: incoming.id,
        })
        await tx.incomingWhatsAppMessage.update({
          where: { id: incoming.id },
          data: {
            processingStatus: hasil.adaTinjau ? "NEEDS_REVIEW" : "MATCHED",
            processingNote: hasil.adaTinjau ? hasil.catatan.join("; ") : `Balasan sebagian tervalidasi: ${alasan}`,
            ...(hasil.adaTinjau ? {
              suggestion: { tipe: "PERINTAH", orderId: order.id, perintah, alasan } as unknown as Prisma.InputJsonValue,
            } : {}),
          },
        })
        if (hasil.adaTinjau) await beriTahuGudang(order, hasil.catatan.join("; "), incoming.id)
        else await tutupPotonganAngka(order.id, incoming.id)
        return { efek }
      }
      const incoming = await simpan({ status: "NEEDS_REVIEW", kind: k.kind, orderId: order.id, note: `Usulan: ${alasan}`,
        usulan: { tipe: "PERINTAH", orderId: order.id, perintah, alasan: `Usulan dari chat: ${alasan}.` } })
      await beriTahuGudang(order, `Usulan: ${alasan}.`, incoming.id)
      return { efek }
    }
    case "BAYAR": {
      const alasan = `Supplier membahas pembayaran${k.nominal ? ` (Rp${k.nominal.toLocaleString("id-ID")})` : ""}.`
      const incoming = await simpan({ status: "NEEDS_REVIEW", kind: k.kind, orderId: order.id, note: alasan,
        usulan: { tipe: "BAYAR", orderId: order.id, nominal: k.nominal, alasan } })
      await beriTahuGudang(order, alasan, incoming.id)
      return { efek }
    }
    case "TANYA": {
      const incoming = await simpan({ status: "NEEDS_REVIEW", kind: k.kind, orderId: order.id, note: "Supplier bertanya",
        usulan: { tipe: "TANYA", orderId: order.id, alasan: "Supplier bertanya; jawab lewat WhatsApp, lalu tandai selesai." } })
      await beriTahuGudang(order, "Supplier bertanya dan perlu dijawab.", incoming.id)
      return { efek }
    }
    case "LAMPIRAN":
      return simpanLampiran(order.id, order.shortCode, order)
    case "BASA_BASI":
      await simpan({ status: "CLOSED", kind: k.kind, orderId: order.id, note: "Tidak perlu tindakan" })
      return { efek }
    default: {
      const incoming = await simpan({ status: "NEEDS_REVIEW", kind: k.kind, orderId: order.id, note: "Isi balasan belum terbaca otomatis",
        usulan: { tipe: "PERINTAH", orderId: order.id, perintah: order.lines.map((line) => ({ lineId: line.id, command: "READY" as const, quantity: null })),
          alasan: "Isi balasan belum terbaca otomatis. Baca pesannya, lalu pilih tindakan." } })
      await balasOtomatis(order, `Terima kasih, ${supplier.name}. Pesan Anda sudah kami terima dan akan dicek tim gudang.\nUntuk pesanan *#${order.shortCode}*, balas cukup dengan angka:\n${BARIS_JAWABAN_STANDAR.replace(/^Balas: /, "")}`, incoming.id)
      await beriTahuGudang(order, "Isi balasan belum terbaca otomatis.", incoming.id)
      return { efek }
    }
  }

  /** File dari supplier: disimpan sebagai dokumen pesanan bila Fonnte mengirim URL-nya. */
  async function simpanLampiran(orderId: string, shortCode: string, orderAktif: PesananAktif | null) {
    const jenis = awal.kind === "LAMPIRAN" ? awal.jenis : "LAIN"
    if (ctx.attachment.url && jenis !== "SUARA") {
      const incoming = await simpan({ status: "MATCHED", kind: "LAMPIRAN", orderId, note: `Dokumen disimpan ke pesanan #${shortCode}` })
      await tx.purchaseOrderDocument.create({ data: {
        organizationId, purchaseOrderId: orderId, kind: jenis === "DOKUMEN" ? "INVOICE" : jenis === "FOTO" ? "FOTO" : "LAINNYA",
        url: ctx.attachment.url, fileName: ctx.attachment.fileName, source: "WA", incomingMessageId: incoming.id,
      } })
      return { efek }
    }
    const alasan = jenis === "SUARA"
      ? "Supplier mengirim voice note; dengarkan di WhatsApp, lalu tandai selesai."
      : "Supplier mengirim file/foto, tetapi paket Fonnte tidak meneruskan filenya. Unggah manual di pesanan bila ini invoice/nota."
    const incoming = await simpan({ status: "NEEDS_REVIEW", kind: "LAMPIRAN", orderId, note: alasan,
      usulan: { tipe: "LAMPIRAN", orderId, alasan } })
    await beriTahuGudang(orderAktif, alasan, incoming.id)
    return { efek }
  }
}
