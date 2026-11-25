import { createHash, timingSafeEqual } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { after } from "next/server"
import { applySupplierReply, bolehTurunKarenaBalasanJanggal, bolehTurunKarenaObrolan, extractSupplierOrderCode, parseSupplierReply, resolveReplyQuantity, sepertiBalasanSupplier } from "@/lib/supplier-replies"
import { normalizeWhatsAppPhone, sendWhatsApp } from "@/lib/whatsapp"
import { cariSupplierDariNomor, prosesPesanSupplier, type EfekWa } from "@/lib/supplier-inbox"
import { decryptWhatsAppToken } from "@/lib/whatsapp-token-crypto"

export const runtime = "nodejs"

type WebhookPayload = Record<string, unknown>

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function payloadDate(value: unknown) {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const numeric = Number(value)
    const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    if (Number.isFinite(date.getTime())) return date
  }
  if (typeof value === "string") {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) return date
  }
  return new Date()
}

async function readPayload(req: Request): Promise<WebhookPayload | null> {
  const raw = await req.text()
  if (!raw || raw.length > 32_000) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as WebhookPayload : null
  } catch {
    const params = new URLSearchParams(raw)
    return Object.fromEntries(params.entries())
  }
}

/**
 * Fonnte mensyaratkan URL webhook menerima GET dan POST, dan memeriksanya
 * sebelum menyimpan alamat. Jawaban ini sengaja kosong: tidak memproses apa
 * pun, tidak memeriksa rahasia, dan tidak membocorkan apakah rahasianya benar.
 */
export async function GET() {
  return Response.json({ status: true })
}

type Tx = Prisma.TransactionClient

export async function POST(req: Request) {
  const body = await readPayload(req)
  if (!body) return Response.json({ status: false }, { status: 400 })

  const devicePhone = normalizeWhatsAppPhone(String(body.device ?? ""))
  const senderPhone = normalizeWhatsAppPhone(String(body.sender ?? body.member ?? ""))
  const teksAsli = String(body.message ?? body.pesan ?? body.text ?? "").trim().slice(0, 2_000)
  const teksOpsional = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null
  // Lampiran (paket Fonnte tertentu mengirim url/filename); "text" berarti bukan lampiran.
  const jenisPesan = teksOpsional(body.type)
  const attachment = {
    url: teksOpsional(body.url),
    fileName: teksOpsional(body.filename),
    type: jenisPesan && jenisPesan.toLowerCase() !== "text" ? jenisPesan : null,
  }
  const message = teksAsli || (attachment.url ? attachment.fileName ?? "(lampiran)" : "")
  const senderName = typeof body.name === "string" ? body.name.trim().slice(0, 150) || null : null
  const suppliedSecret = String(
    new URL(req.url).searchParams.get("secret")
      ?? req.headers.get("x-fonnte-secret")
      ?? body.secret
      ?? body.secretKey
      ?? body.secret_key
      ?? "",
  )
  if (!devicePhone || !senderPhone || !message || !suppliedSecret) {
    return Response.json({ status: false }, { status: 400 })
  }

  const integration = await prisma.organizationWhatsApp.findFirst({
    where: { senderPhone: devicePhone, encryptedWebhookSecret: { not: null } },
    select: { organizationId: true, encryptedWebhookSecret: true },
  })
  if (!integration?.encryptedWebhookSecret) return Response.json({ status: false }, { status: 401 })

  let expectedSecret: string
  try {
    expectedSecret = decryptWhatsAppToken(integration.encryptedWebhookSecret, `${integration.organizationId}:webhook`)
  } catch {
    return Response.json({ status: false }, { status: 401 })
  }
  if (!safeEqual(suppliedSecret, expectedSecret)) return Response.json({ status: false }, { status: 401 })

  // Pesan yang dikirim DARI nomor bisnis sendiri (diketik owner di HP) bukan
  // balasan supplier. Belum diproses; pembacaannya dirancang di Tahap 3.
  if (senderPhone === devicePhone) return Response.json({ status: true, ignored: "own-device" })

  const receivedAt = payloadDate(body.timestamp)
  const providerInboxId = typeof body.inboxid === "string" || typeof body.inboxid === "number"
    ? String(body.inboxid).trim().slice(0, 250) || null
    : null
  const eventTimeKey = body.timestamp == null
    ? new Date().toISOString().slice(0, 16)
    : String(body.timestamp)
  const eventKey = createHash("sha256")
    .update([integration.organizationId, devicePhone, senderPhone, providerInboxId ?? "", eventTimeKey, message].join("\u001f"))
    .digest("hex")
  const parsed = parseSupplierReply(message)
  const referencedOrderCode = parsed?.orderCode ?? extractSupplierOrderCode(message)

  let efek: EfekWa[] = []
  try {
    await prisma.$transaction(async (tx) => {
      // Nomor utama ATAU nomor tambahan supplier.
      const senderSupplier = await cariSupplierDariNomor(tx, integration.organizationId, senderPhone)
      // Kotak masuk ini khusus komunikasi pengadaan. Nomor yang belum menjadi
      // nomor utama/tambahan supplier di Pantau tidak boleh disimpan, walaupun
      // isi chat kebetulan menyerupai jawaban pesanan.
      if (!senderSupplier) return
      const ctxLama: KonteksLama = {
        organizationId: integration.organizationId, supplierId: senderSupplier.id,
        eventKey, providerInboxId, devicePhone, senderPhone, senderName, message, receivedAt, parsed,
      }
      const referencedRequest = referencedOrderCode
        ? await tx.purchaseRequest.findFirst({ where: { organizationId: integration.organizationId, orderCode: referencedOrderCode } })
        : null

      // Kode PO format lama yang masih aktif → alur lama per bahan.
      if (referencedOrderCode && (!referencedRequest || referencedRequest.status === "ACTIVE")) {
        await prosesFormatLama(tx, ctxLama, referencedRequest)
        return
      }

      const hasil = await prosesPesanSupplier(tx, {
        organizationId: integration.organizationId,
        supplier: senderSupplier,
        senderPhone, devicePhone, senderName, message, receivedAt, eventKey, providerInboxId,
        attachment,
        // Kode PO lama yang sudah selesai: diusulkan ke pesanan yang aktif.
        kodeTertutup: referencedRequest ? { kode: referencedRequest.orderCode, command: parsed?.command ?? null, quantity: parsed?.quantity ?? null } : null,
      })
      efek = hasil.efek
      if (hasil.formatLama) {
        // Supplier hanya punya PO satu bahan (format lama): alur lama, yang
        // memasangkan pesan bebas hanya bila memang terlihat sebagai balasan.
        const request = hasil.formatLama.requestId && sepertiBalasanSupplier(message)
          ? await tx.purchaseRequest.findUnique({ where: { id: hasil.formatLama.requestId } })
          : null
        await prosesFormatLama(tx, ctxLama, request)
      }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ status: true, duplicate: true })
    }
    console.error("Gagal memproses webhook WhatsApp", error)
    return Response.json({ status: false }, { status: 500 })
  }

  if (efek.length) jalankanSetelahRespons(() => kirimEfekWa(efek))
  return Response.json({ status: true })
}

/** WA ke gudang / balasan otomatis dikirim setelah data tersimpan. */
async function kirimEfekWa(efek: EfekWa[]) {
  for (const e of efek) {
    const hasil = await sendWhatsApp(e.organizationId, e.phone, e.message)
    await prisma.auditLog.create({ data: {
      organizationId: e.organizationId, action: e.jenis === "BALAS_OTOMATIS" ? "WA_SUPPLIER_AUTO_REPLY" : "WA_SUPPLIER_REVIEW_NOTICE",
      entity: "IncomingWhatsAppMessage", entityId: e.entityId,
      after: { nomor: e.phone, ok: hasil.ok, error: hasil.ok ? null : hasil.error ?? "Gagal mengirim" },
    } })
  }
}

function jalankanSetelahRespons(tugas: () => Promise<void>) {
  try {
    after(tugas)
  } catch {
    // Di luar request (mis. skrip uji) langsung dijalankan.
    void tugas()
  }
}

type KonteksLama = {
  organizationId: string
  supplierId: string | null
  eventKey: string
  providerInboxId: string | null
  devicePhone: string
  senderPhone: string
  senderName: string | null
  message: string
  receivedAt: Date
  parsed: ReturnType<typeof parseSupplierReply>
}

/**
 * Alur PO SATU bahan dengan kode per bahan ("PO-261001-DBE63D READY 400").
 * Tidak diubah dari sebelum Tahap 2, kecuali pencocokan supplier yang kini
 * memakai id supplier (mendukung nomor tambahan).
 */
async function prosesFormatLama(tx: Tx, ctx: KonteksLama, request: Prisma.PurchaseRequestGetPayload<object> | null) {
  const { parsed, message, receivedAt } = ctx
  const incoming = await tx.incomingWhatsAppMessage.create({
    data: {
      organizationId: ctx.organizationId,
      purchaseRequestId: request?.id ?? null,
      supplierId: ctx.supplierId,
      eventKey: ctx.eventKey,
      providerInboxId: ctx.providerInboxId,
      devicePhone: ctx.devicePhone,
      senderPhone: ctx.senderPhone,
      senderName: ctx.senderName,
      message,
      receivedAt,
      processingStatus: !parsed || !request ? "NEEDS_REVIEW" : "RECEIVED",
      processingNote: !parsed
        ? request
          ? "Format balasan tidak dikenali; pesanan perlu ditinjau"
          : "Format balasan tidak dikenali"
        : !request
          ? "Kode pesanan tidak ditemukan"
          : null,
    },
  })

  if (!request) return
  if (request.supplierId !== ctx.supplierId) {
    await tx.incomingWhatsAppMessage.update({
      where: { id: incoming.id },
      data: { processingStatus: "REJECTED", processingNote: "Nomor pengirim tidak sesuai dengan supplier pesanan" },
    })
    return
  }

  // Setiap pesan sah dari nomor supplier menghentikan status "belum
  // dibalas". Isi yang tidak sesuai format tetap masuk NEEDS_REVIEW, tetapi
  // sistem tidak boleh mengaku supplier diam ketika ia sudah merespons.
  await tx.purchaseRequest.update({
    where: { id: request.id },
    data: { responseOverdueAt: null },
  })

  if (!parsed) {
    if (request.status === "ACTIVE") {
      const turunkan = bolehTurunKarenaObrolan(request.supplierReplyStatus)
      await tx.purchaseRequest.update({
        where: { id: request.id },
        data: {
          // Pesanan yang sudah READY atau SHIPPED mempertahankan
          // statusnya: obrolan biasa tidak menghapus kemajuan.
          ...(turunkan ? { supplierReplyStatus: "NEEDS_REVIEW" as const } : {}),
          // supplierLastMessage SENGAJA tidak diisi di sini. Kolom itu
          // ditampilkan sebagai "Balasan supplier", jadi hanya boleh memuat
          // balasan yang benar-benar mengikuti template. Pesan bebas tetap
          // tersimpan utuh sebagai IncomingWhatsAppMessage dan muncul di
          // riwayat pengadaan — yang dijaga hanyalah kolom ringkasannya.
        },
      })
      await tx.incomingWhatsAppMessage.update({
        where: { id: incoming.id },
        data: {
          processingStatus: "NEEDS_REVIEW",
          processingNote: turunkan
            ? "Format balasan tidak dikenali"
            : `Format balasan tidak dikenali; status pesanan tetap ${request.supplierReplyStatus}`,
        },
      })
    } else {
      await tx.incomingWhatsAppMessage.update({
        where: { id: incoming.id },
        data: { processingStatus: "CLOSED", processingNote: "Pesanan sudah selesai" },
      })
    }
    return
  }
  if (request.status !== "ACTIVE") {
    await tx.incomingWhatsAppMessage.update({
      where: { id: incoming.id },
      data: { processingStatus: "CLOSED", processingNote: "Pesanan sudah selesai" },
    })
    return
  }

  await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${request.id} FOR UPDATE`
  const fresh = await tx.purchaseRequest.findUniqueOrThrow({ where: { id: request.id } })
  if (fresh.status !== "ACTIVE") {
    await tx.incomingWhatsAppMessage.update({ where: { id: incoming.id }, data: { processingStatus: "CLOSED", processingNote: "Pesanan sudah selesai" } })
    return
  }

  // Jumlah pada balasan ditafsirkan dengan snapshot satuan milik pesanan
  // ini, bukan dengan konfigurasi bahan yang berlaku sekarang.
  const terkonversi = resolveReplyQuantity(parsed, {
    inputUnit: fresh.inputUnit,
    conversionFactor: fresh.conversionFactor == null ? null : Number(fresh.conversionFactor),
    baseUnit: fresh.baseUnit,
  })
  if (!terkonversi.ok) {
    await tx.purchaseRequest.update({
      where: { id: fresh.id },
      data: {
        ...(bolehTurunKarenaBalasanJanggal(fresh.supplierReplyStatus)
          ? { supplierReplyStatus: "NEEDS_REVIEW" as const } : {}),
        supplierLastMessage: message,
        supplierLastMessageAt: receivedAt,
      },
    })
    await tx.incomingWhatsAppMessage.update({
      where: { id: incoming.id },
      data: { processingStatus: "NEEDS_REVIEW", processingNote: terkonversi.reason },
    })
    return
  }

  const result = applySupplierReply(
    {
      supplierReplyStatus: fresh.supplierReplyStatus,
      promisedQuantity: fresh.promisedQuantity == null ? null : Number(fresh.promisedQuantity),
      shippedQuantity: fresh.shippedQuantity == null ? null : Number(fresh.shippedQuantity),
    },
    { ...parsed, quantity: terkonversi.baseQuantity },
    Number(fresh.quantity),
  )

  // Pesan selalu disimpan, apa pun hasilnya — ini yang dibaca manusia saat
  // memeriksa pesanan yang bermasalah.
  await tx.purchaseRequest.update({
    where: { id: fresh.id },
    data: {
      supplierReplyStatus: result.supplierReplyStatus,
      promisedQuantity: result.promisedQuantity,
      shippedQuantity: result.shippedQuantity,
      supplierLastMessage: message,
      supplierLastMessageAt: receivedAt,
      ...(result.confirmed ? { supplierConfirmedAt: receivedAt } : {}),
      ...(result.shipped ? { supplierShippedAt: receivedAt } : {}),
    },
  })
  await tx.incomingWhatsAppMessage.update({
    where: { id: incoming.id },
    data: {
      processingStatus: result.outcome === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "MATCHED",
      processingNote: `${result.note} (${fresh.orderCode})`,
    },
  })
  await tx.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      // Dibedakan supaya riwayat terbaca: siap ≠ sudah dikirim ≠ kosong.
      action: result.supplierReplyStatus === "SHIPPED" ? "SUPPLIER_SHIPPED"
        : result.supplierReplyStatus === "READY" || result.supplierReplyStatus === "PARTIAL" ? "SUPPLIER_READY"
        : result.supplierReplyStatus === "UNAVAILABLE" ? "SUPPLIER_UNAVAILABLE"
        : "PROCESS_SUPPLIER_WHATSAPP_REPLY",
      entity: "PurchaseRequest",
      entityId: fresh.id,
      before: {
        supplierReplyStatus: fresh.supplierReplyStatus,
        promisedQuantity: fresh.promisedQuantity,
        shippedQuantity: fresh.shippedQuantity,
      },
      after: {
        supplierReplyStatus: result.supplierReplyStatus,
        promisedQuantity: result.promisedQuantity,
        shippedQuantity: result.shippedQuantity,
        incomingMessageId: incoming.id,
      },
    },
  })
}
