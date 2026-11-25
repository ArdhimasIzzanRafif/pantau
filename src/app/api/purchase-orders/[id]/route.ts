import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth, type SessionUser } from "@/lib/api-helpers"
import { getFeatureAccess } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { denganStatus, pesananInclude } from "@/lib/purchase-orders"

/** Pihak yang boleh mengurus pesanan: izin ubah Supplier ATAU Barang Masuk. */
async function bolehUbah(user: SessionUser) {
  return await getFeatureAccess(user, "SUPPLIERS") === "EDIT" || await getFeatureAccess(user, "GOODS_RECEIPT") === "EDIT"
}

async function ambilPesanan(user: SessionUser, id: string) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true, locationId: true, shortCode: true } })
  if (!order || !(await canAccessLocation(user, order.locationId))) return null
  return order
}

/** Rincian satu pesanan: bahan, dokumen, dan percakapan dengan supplier. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params
  if (!(await ambilPesanan(user, id))) return err("Pesanan tidak ditemukan", 404)
  const order = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: pesananInclude })
  const [documents, messages] = await Promise.all([
    prisma.purchaseOrderDocument.findMany({ where: { purchaseOrderId: id }, orderBy: { createdAt: "desc" } }),
    prisma.incomingWhatsAppMessage.findMany({
      where: { organizationId: user.organizationId, OR: [{ purchaseOrderId: id }, { purchaseRequest: { purchaseOrderId: id } }] },
      orderBy: { receivedAt: "asc" }, take: 200,
      select: { id: true, message: true, receivedAt: true, senderName: true, senderPhone: true, processingStatus: true, processingNote: true, kind: true, attachmentUrl: true },
    }),
  ])
  return ok({ ...denganStatus(order), documents, messages })
}

/**
 * CONFIRM_MANUAL  — supplier mengonfirmasi di luar WA bisnis (telepon, WA pribadi).
 * CANCEL_ORDER    — tutup seluruh bahan aktif tanpa menambah stok.
 * ADD_DOCUMENT    — unggah invoice / foto nota ke pesanan.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (!(await bolehUbah(user))) return err("Role Anda tidak memiliki izin mengubah pesanan supplier", 403)
  const { id } = await params
  const order = await ambilPesanan(user, id)
  if (!order) return err("Pesanan tidak ditemukan", 404)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : ""

  if (body.action === "CANCEL_ORDER") {
    if (note.length < 3) return err("Tulis alasan pembatalan pesanan")
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`
      const activeLines = await tx.purchaseRequest.findMany({
        where: { purchaseOrderId: id, organizationId: user.organizationId, status: "ACTIVE" },
        select: { id: true, itemId: true, quantity: true, receivedQuantity: true },
      })
      if (activeLines.length === 0) return null

      const now = new Date()
      await tx.purchaseRequest.updateMany({
        where: { purchaseOrderId: id, organizationId: user.organizationId, status: "ACTIVE" },
        data: { status: "CANCELLED", resolvedAt: now, resolvedById: user.id, resolutionNote: note },
      })

      // Pesan yang belum sempat berangkat tidak boleh terkirim setelah pesanan
      // dibatalkan. Pesan SENT/UNCERTAIN dibiarkan sebagai bukti historis karena
      // mungkin sudah berada di WhatsApp supplier.
      await tx.whatsAppOutbox.updateMany({
        where: {
          organizationId: user.organizationId,
          AND: [
            { OR: [
              { aggregateType: "PURCHASE_ORDER", aggregateId: id },
              { aggregateType: "PURCHASE_REMINDER", aggregateId: { in: activeLines.map((line) => line.id) } },
            ] },
            { OR: [
              { status: { in: ["PENDING", "FAILED", "DEAD"] } },
              { status: "PROCESSING", sendStartedAt: null },
            ] },
          ],
        },
        data: {
          status: "DEAD",
          lastError: "Pesanan dibatalkan sebelum pesan dikirim",
          lockedAt: null,
        },
      })

      await tx.auditLog.create({ data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "CANCEL_PURCHASE_ORDER",
        entity: "PurchaseOrder",
        entityId: id,
        before: { shortCode: order.shortCode, activeLines },
        after: { status: "CANCELLED", note, cancelledLines: activeLines.length },
      } })
      return { cancelledLines: activeLines.length }
    })
    if (!result) return err("Pesanan ini sudah selesai atau dibatalkan. Muat ulang halaman.", 409)
    return ok({ success: true, ...result })
  }

  if (body.action === "CONFIRM_MANUAL") {
    if (note.length < 3) return err("Tulis cara supplier mengonfirmasi, mis. \"lewat telepon\"")
    await prisma.$transaction(async (tx) => {
      const now = new Date()
      await tx.purchaseOrder.update({ where: { id }, data: { manualConfirmedAt: now, manualConfirmedById: user.id, manualConfirmNote: note } })
      // Bahan yang belum dijawab dianggap disanggupi penuh.
      const menunggu = await tx.purchaseRequest.findMany({ where: { purchaseOrderId: id, status: "ACTIVE", supplierReplyStatus: { in: ["WAITING", "NEEDS_REVIEW"] } } })
      for (const line of menunggu) {
        await tx.purchaseRequest.update({ where: { id: line.id }, data: {
          supplierReplyStatus: "READY", promisedQuantity: line.quantity, supplierConfirmedAt: now, responseOverdueAt: null,
        } })
      }
      await tx.auditLog.create({ data: {
        organizationId: user.organizationId, userId: user.id, action: "CONFIRM_PURCHASE_ORDER_MANUAL",
        entity: "PurchaseOrder", entityId: id, after: { shortCode: order.shortCode, note, baris: menunggu.length },
      } })
    })
    return ok({ success: true })
  }

  if (body.action === "ADD_DOCUMENT") {
    const url = typeof body.url === "string" ? body.url : ""
    // Hanya file yang diunggah lewat Pantau sendiri.
    if (!url.startsWith("/api/uploads/purchase-docs/")) return err("File dokumen tidak valid")
    const kind = body.kind === "INVOICE" || body.kind === "FOTO" ? body.kind : "LAINNYA"
    const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 150) : null
    const doc = await prisma.purchaseOrderDocument.create({ data: {
      organizationId: user.organizationId, purchaseOrderId: id, kind, url, fileName, source: "UPLOAD", uploadedById: user.id,
    } })
    await prisma.auditLog.create({ data: {
      organizationId: user.organizationId, userId: user.id, action: "ADD_PURCHASE_ORDER_DOCUMENT",
      entity: "PurchaseOrder", entityId: id, after: { kind, url, fileName },
    } })
    return ok(doc, 201)
  }

  return err("Tindakan tidak dikenal")
}
