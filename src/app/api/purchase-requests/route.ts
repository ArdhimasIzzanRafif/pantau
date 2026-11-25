import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { denyUnlessCanEdit, getFeatureAccess } from "@/lib/feature-access"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"
import { warehouseNeedFields, warehouseNeedSource, warehousePurchaseRoles } from "@/lib/warehouse-purchase-needs"
import { maybeCreatePurchaseRequest } from "@/lib/purchase-requests"
import { parseTransferQuantity } from "@/lib/transfer-quantity"
import { convertToBase } from "@/lib/unit-conversion"
import { consumeNeedLinks, NeedLinkExpired, requireUnusedNeedLink } from "@/lib/need-action-link"
import { markOverdueSupplierResponses } from "@/lib/supplier-message-tracking"
import { validateWhatsAppRecipient } from "@/lib/whatsapp"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (await getFeatureAccess(user, "SUPPLIERS") === null) return err("Tidak diizinkan", 403)
  const locationIds = await getAccessibleLocationIds(user)
  if (req.nextUrl.searchParams.get("needs") === "true") {
    if (!warehousePurchaseRoles.includes(user.role)) return err("Hanya penanggung jawab gudang yang dapat melihat kebutuhan pembelian", 403)
    const needs = await prisma.$queryRaw(Prisma.sql`SELECT ${warehouseNeedFields()}
      ${warehouseNeedSource(user.organizationId, locationIds, true)}
      ORDER BY COALESCE((SELECT al."createdAt" FROM "Alert" al
        WHERE al."organizationId" = b."organizationId" AND al."itemId" = b."itemId"
          AND al."locationId" = b."locationId" AND al.type = 'LOW_STOCK' AND NOT al."isResolved"
        ORDER BY al."createdAt" DESC, al.id DESC LIMIT 1), b."updatedAt") DESC`)
    return ok(needs)
  }
  if (req.nextUrl.searchParams.get("need") === "true") {
    if (!warehousePurchaseRoles.includes(user.role)) return err("Hanya penanggung jawab gudang yang dapat mengisi pembelian", 403)
    const itemId = req.nextUrl.searchParams.get("itemId")
    const locationId = req.nextUrl.searchParams.get("warehouseId")
    if (!itemId || !locationId) return err("Bahan dan gudang wajib diisi")
    if (req.nextUrl.searchParams.has("alertId") || req.nextUrl.searchParams.get("fromLink") === "true") {
      try { await requireUnusedNeedLink(prisma, user.organizationId, itemId, locationId, req.nextUrl.searchParams.get("alertId")) }
      catch { return err(new NeedLinkExpired().message, 410) }
    }
    const needs = await prisma.$queryRaw(Prisma.sql`SELECT ${warehouseNeedFields()}
      ${warehouseNeedSource(user.organizationId, locationIds, true)}
      AND b."itemId" = ${itemId} AND b."locationId" = ${locationId} LIMIT 1`)
    return ok(needs)
  }

  await markOverdueSupplierResponses(new Date(), user.organizationId)
  const requests = await prisma.purchaseRequest.findMany({
    where: {
      organizationId: user.organizationId,
      ...(locationIds && { locationId: { in: locationIds } }),
    },
    include: {
      item: { select: { id: true, name: true, unit: true } },
      location: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true, phone: true } },
      escalatedFrom: { select: { id: true, orderCode: true, supplier: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  // Pengguna hanya dapat memilih "coba supplier berikutnya" kalau memang ada
  // yang berikutnya. Dihitung di sini supaya tombolnya tidak menjanjikan
  // sesuatu yang ternyata ditolak server.
  const active = requests.filter((request) => request.status === "ACTIVE")
  const candidates = active.length === 0 ? [] : await prisma.itemSupplier.findMany({
    where: {
      organizationId: user.organizationId,
      itemId: { in: [...new Set(active.map((request) => request.itemId))] },
      locationId: { in: [...new Set(active.map((request) => request.locationId))] },
      supplier: { isActive: true, phone: { not: null } },
    },
    orderBy: { priority: "asc" },
    select: { itemId: true, locationId: true, priority: true, supplier: { select: { id: true, name: true } } },
  })

  return ok(requests.map((request) => {
    const next = request.status !== "ACTIVE" ? undefined : candidates.find((candidate) =>
      candidate.itemId === request.itemId
      && candidate.locationId === request.locationId
      && candidate.priority > request.priority)
    return {
      ...request,
      nextSupplier: next ? { id: next.supplier.id, name: next.supplier.name, priority: next.priority } : null,
      outstandingQuantity: Math.max(0, Number(request.quantity) - Number(request.receivedQuantity)),
    }
  }))
}

// Membuat pesanan pemasok selalu merupakan tindakan eksplisit penanggung jawab
// gudang. Pengurangan stok hanya memunculkan kebutuhan; sistem tidak pernah
// menentukan jumlah pembelian atau mengirim pesanan dengan sendirinya.
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (!warehousePurchaseRoles.includes(user.role)) return err("Hanya penanggung jawab gudang yang dapat mengisi pembelian", 403)
  const forbidden = await denyUnlessCanEdit(user, "TRANSFER")
  if (forbidden) return forbidden
  if (await getFeatureAccess(user, "SUPPLIERS") === null) return err("Tidak ada akses pemasok", 403)
  const body = await req.json().catch(() => null)
  const itemId = typeof body?.itemId === "string" ? body.itemId : ""
  const locationId = typeof body?.warehouseId === "string" ? body.warehouseId : ""
  const entered = parseTransferQuantity(body?.quantity)
  const inputUnit = body?.inputUnit ?? "base"
  const notes = typeof body?.notes === "string" ? body.notes.trim() : ""
  const urgency = body?.urgency === "URGENT" ? "URGENT" : body?.urgency === "NORMAL" || body?.urgency == null ? "NORMAL" : null
  if (!itemId || !locationId || entered == null || notes.length > 500 || !["base", "pack"].includes(inputUnit) || !urgency) return err("Periksa bahan, gudang, jumlah, satuan, prioritas, dan catatan (maksimal 500 karakter)")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke gudang ini", 403)
  const candidate = await prisma.itemSupplier.findFirst({
    where: {
      organizationId: user.organizationId, itemId, locationId,
      supplier: { isActive: true, phone: { not: null } },
    },
    orderBy: { priority: "asc" },
    select: { supplierId: true, supplier: { select: { name: true, phone: true } } },
  })
  if (!candidate?.supplier.phone) return err("Atur supplier aktif dan nomor WhatsApp untuk bahan di gudang ini terlebih dahulu", 409)
  if (body.supplierId !== candidate.supplierId) return err("Supplier prioritas berubah. Muat ulang formulir sebelum mengirim.", 409)
  const phoneValidation = await validateWhatsAppRecipient(user.organizationId, candidate.supplier.phone)
  if (!phoneValidation.valid) {
    return err(`${candidate.supplier.name}: ${phoneValidation.reason}. Perbaiki nomor supplier sebelum membuat pesanan.`, phoneValidation.unavailable ? 503 : 409)
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StockBalance" WHERE "organizationId" = ${user.organizationId} AND "itemId" = ${itemId} AND "locationId" = ${locationId} FOR UPDATE`
      if (body?.fromLink || body?.alertId) await requireUnusedNeedLink(tx, user.organizationId, itemId, locationId, body.alertId)
      const balance = await tx.stockBalance.findFirst({ where: { organizationId: user.organizationId, itemId, locationId },
        include: { location: true, item: { include: { locationSettings: { where: { locationId } } } } } })
      if (!balance || balance.location.type !== "WAREHOUSE" || !balance.location.isActive) throw new Error("Gudang atau bahan tidak valid")
      if (await tx.purchaseRequest.findFirst({ where: { organizationId: user.organizationId, itemId, locationId, status: "ACTIVE" }, select: { id: true } })) throw new Error("Pesanan supplier untuk bahan dan gudang ini masih aktif")
      // Syaratnya SAMA dengan daftar kebutuhan (lib/warehouse-purchase-needs.ts):
      // stok tersedia gudang ≤ ambang minimum, ATAU ada kekurangan untuk
      // permintaan outlet — yang terakhir berlaku walau ambang belum diatur.
      // Sebelumnya di sini hanya ambang yang dicek, sehingga kebutuhan yang
      // tampil karena kekurangan outlet selalu ditolak saat dikirim.
      const masihDibutuhkan = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT b.id
        ${warehouseNeedSource(user.organizationId, null, true)}
        AND b."itemId" = ${itemId} AND b."locationId" = ${locationId} LIMIT 1`)
      if (masihDibutuhkan.length === 0) throw new Error("Kebutuhan pembelian ini sudah tidak ada: stok gudang di atas ambang dan tidak ada kekurangan untuk outlet. Muat ulang kebutuhan.")
      // Satu pintu konversi untuk seluruh aplikasi: aturan satuan, pecahan,
      // dan faktor kemasan tidak boleh berbeda antar halaman.
      const konversi = convertToBase(balance.item, entered, inputUnit)
      const quantity = parseTransferQuantity(konversi.baseQuantity)
      if (quantity == null) throw new Error("Jumlah dalam satuan dasar tidak valid")
      const lockedCandidate = await tx.itemSupplier.findFirst({ where: { organizationId: user.organizationId, itemId, locationId,
        supplier: { isActive: true, phone: { not: null } } }, orderBy: { priority: "asc" } })
      if (!lockedCandidate) throw new Error("Atur supplier aktif dan nomor WhatsApp untuk bahan di gudang ini terlebih dahulu")
      if (candidate.supplierId !== lockedCandidate.supplierId) throw new Error("Supplier prioritas berubah. Muat ulang formulir sebelum mengirim.")
      const request = await maybeCreatePurchaseRequest(tx, user.organizationId, itemId, locationId, {
        unitSnapshot: {
          inputQuantity: konversi.inputQuantity,
          inputUnit: konversi.inputUnit,
          conversionFactor: konversi.conversionFactor,
        },
        requestedQuantity: quantity, requestContext: notes || "pengisian stok gudang", urgency,
        // Kelayakan sudah dicek di atas dengan aturan daftar kebutuhan; tanpa
        // force, fungsi ini mengecek ulang ambang saja dan menolak kekurangan outlet.
        force: true,
      })
      if (!request) throw new Error("Permintaan pembelian belum dapat dibuat")
      await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id,
        action: "SUBMIT_WAREHOUSE_PURCHASE", entity: "PurchaseRequest", entityId: request.id,
        after: { itemId, locationId, quantity, enteredQuantity: entered, inputUnit, urgency, notes, supplierId: lockedCandidate.supplierId } } })
      await consumeNeedLinks(tx, user.organizationId, user.id, itemId, locationId, request.id)
      return { id: request.id }
    })
    return ok(result, 201)
  } catch (error) {
    if (error instanceof NeedLinkExpired) return err(error.message, 410)
    if (error instanceof Error && !error.name.startsWith("Prisma")) return err(error.message, 409)
    console.error("Warehouse purchase submission failed", error)
    return err("Gagal menyimpan pembelian gudang", 500)
  }
}
