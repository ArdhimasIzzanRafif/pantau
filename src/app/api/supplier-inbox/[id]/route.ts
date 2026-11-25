import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { getFeatureAccess } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { terapkanPerintahBaris, type PerintahBaris } from "@/lib/supplier-inbox"
import { StockError } from "@/lib/stock-ledger"

const PERINTAH = ["READY", "PARTIAL", "UNAVAILABLE", "SHIPPED"] as const

/**
 * Keputusan manusia atas pesan supplier di kotak masuk.
 *   TERAPKAN       { orderId, perintah: [{ lineId, command, quantity }] }
 *   TAUTKAN_NOMOR  { supplierId } — nomor ini milik supplier tsb (mis. admin)
 *   SELESAI        { note? } — abaikan / sudah dijawab / sudah diunggah manual
 * Setiap keputusan tercatat: siapa, kapan, dan berdasarkan pesan apa.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const bolehSupplier = await getFeatureAccess(user, "SUPPLIERS") === "EDIT"
  if (!bolehSupplier && await getFeatureAccess(user, "GOODS_RECEIPT") !== "EDIT") return err("Role Anda tidak memiliki izin memproses balasan supplier", 403)

  const { id } = await params
  const pesan = await prisma.incomingWhatsAppMessage.findFirst({ where: { id, organizationId: user.organizationId } })
  if (!pesan) return err("Pesan tidak ditemukan", 404)
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tandaiDitinjau = (reviewAction: string, extra: Record<string, unknown> = {}) => ({
    reviewedById: user.id, reviewedAt: new Date(), reviewAction, ...extra,
  })

  try {
    if (body.action === "TERAPKAN") {
      const orderId = typeof body.orderId === "string" ? body.orderId : ""
      const order = await prisma.purchaseOrder.findFirst({ where: { id: orderId, organizationId: user.organizationId }, select: { id: true, supplierId: true, locationId: true, shortCode: true } })
      if (!order || !(await canAccessLocation(user, order.locationId))) return err("Pesanan tidak ditemukan", 404)
      if (pesan.supplierId && pesan.supplierId !== order.supplierId) return err("Pesan ini dari supplier lain, bukan supplier pesanan tersebut")
      const perintah: PerintahBaris[] = (Array.isArray(body.perintah) ? body.perintah as Array<Record<string, unknown>> : [])
        .filter((p) => typeof p.lineId === "string" && PERINTAH.includes(p.command as typeof PERINTAH[number]))
        .map((p) => ({ lineId: p.lineId as string, command: p.command as PerintahBaris["command"],
          quantity: p.quantity === null || p.quantity === undefined || p.quantity === "" ? null : Number(p.quantity) }))
      if (perintah.length === 0) return err("Pilih minimal satu bahan dan tindakannya")
      if (perintah.some((p) => p.quantity != null && !(Number.isFinite(p.quantity) && p.quantity > 0))) return err("Jumlah harus lebih dari 0")
      if (perintah.some((p) => p.command === "PARTIAL" && p.quantity == null)) return err("Isi jumlah untuk bahan yang hanya tersedia sebagian")
      const hasil = await prisma.$transaction(async (tx) => {
        const r = await terapkanPerintahBaris(tx, {
          organizationId: user.organizationId, orderId: order.id, perintah, message: pesan.message,
          receivedAt: pesan.receivedAt, incomingId: pesan.id, userId: user.id,
        })
        await tx.incomingWhatsAppMessage.update({ where: { id: pesan.id }, data: tandaiDitinjau("TERAPKAN", {
          processingStatus: "MATCHED", purchaseOrderId: order.id,
          processingNote: `Diterapkan ke #${order.shortCode}: ${r.catatan.join("; ")}`,
        }) })
        return r
      })
      return ok(hasil)
    }

    if (body.action === "TAUTKAN_NOMOR") {
      if (!bolehSupplier) return err("Menautkan nomor memerlukan izin ubah Supplier", 403)
      const supplierId = typeof body.supplierId === "string" ? body.supplierId : ""
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId: user.organizationId }, select: { id: true, name: true, normalizedPhone: true } })
      if (!supplier) return err("Supplier tidak ditemukan", 404)
      await prisma.$transaction(async (tx) => {
        if (supplier.normalizedPhone !== pesan.senderPhone) {
          const dipakai = await tx.supplierPhone.findFirst({ where: { organizationId: user.organizationId, phone: pesan.senderPhone } })
          if (dipakai && dipakai.supplierId !== supplier.id) throw new StockError("Nomor ini sudah tertaut ke supplier lain")
          if (!dipakai) await tx.supplierPhone.create({ data: { organizationId: user.organizationId, supplierId: supplier.id, phone: pesan.senderPhone, label: pesan.senderName } })
        }
        // Semua pesan dari nomor ini ikut tertaut; tetap menunggu keputusan isinya.
        await tx.incomingWhatsAppMessage.updateMany({
          where: { organizationId: user.organizationId, senderPhone: pesan.senderPhone, supplierId: null },
          data: { supplierId: supplier.id, processingNote: `Nomor ditautkan ke ${supplier.name}` },
        })
        await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: "LINK_SUPPLIER_PHONE",
          entity: "Supplier", entityId: supplier.id, after: { phone: pesan.senderPhone, incomingMessageId: pesan.id } } })
      })
      return ok({ success: true })
    }

    if (body.action === "SELESAI") {
      const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : "Ditandai selesai"
      await prisma.incomingWhatsAppMessage.update({ where: { id: pesan.id }, data: tandaiDitinjau("SELESAI", {
        processingStatus: "CLOSED", processingNote: note,
      }) })
      await prisma.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: "CLOSE_SUPPLIER_MESSAGE",
        entity: "IncomingWhatsAppMessage", entityId: pesan.id, after: { note } } })
      return ok({ success: true })
    }
    return err("Tindakan tidak dikenal")
  } catch (error) {
    if (error instanceof StockError) return err(error.message, 409)
    throw error
  }
}
