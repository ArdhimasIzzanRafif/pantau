import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { getFeatureAccess } from "@/lib/feature-access"
import { getAccessibleLocationIds } from "@/lib/location-access"

/**
 * Kotak masuk supplier.
 *   ?filter=review   pesan yang menunggu keputusan (bawaan)
 *   ?filter=all      semua pesan supplier
 */
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (await getFeatureAccess(user, "SUPPLIERS") === null && await getFeatureAccess(user, "GOODS_RECEIPT") === null) {
    return err("Tidak memiliki akses ke kotak masuk supplier", 403)
  }
  const locationIds = await getAccessibleLocationIds(user)
  const params = req.nextUrl.searchParams
  const filter = params.get("filter") ?? "review"
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1)
  const perPage = 15

  // Pesan tanpa pesanan tetap mengikuti akses lokasi melalui relasi pesanan.
  const lokasi: Prisma.IncomingWhatsAppMessageWhereInput = locationIds === null ? {} : {
    OR: [{ purchaseOrder: { locationId: { in: locationIds } } }, { purchaseRequest: { locationId: { in: locationIds } } }],
  }
  const where: Prisma.IncomingWhatsAppMessageWhereInput = {
    organizationId: user.organizationId,
    supplierId: { not: null },
    ...lokasi,
    ...(filter === "all" ? {} : { processingStatus: "NEEDS_REVIEW" }),
  }
  const [items, total, review] = await Promise.all([
    prisma.incomingWhatsAppMessage.findMany({
      where, orderBy: { receivedAt: "desc" }, skip: (page - 1) * perPage, take: perPage,
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseRequest: { select: { id: true, orderCode: true, purchaseOrderId: true, item: { select: { name: true } } } },
      },
    }),
    prisma.incomingWhatsAppMessage.count({ where }),
    prisma.incomingWhatsAppMessage.count({ where: { organizationId: user.organizationId, ...lokasi, supplierId: { not: null }, processingStatus: "NEEDS_REVIEW" } }),
  ])

  // Pesanan yang disebut di pesan atau di usulannya, beserta bahan aktifnya (untuk tombol).
  const orderIds = new Set<string>()
  for (const item of items) {
    if (item.purchaseOrderId) orderIds.add(item.purchaseOrderId)
    if (item.purchaseRequest?.purchaseOrderId) orderIds.add(item.purchaseRequest.purchaseOrderId)
    const usulan = item.suggestion as { orderId?: string; orderIds?: string[] } | null
    if (usulan?.orderId) orderIds.add(usulan.orderId)
    for (const id of usulan?.orderIds ?? []) orderIds.add(id)
  }
  const orders = orderIds.size ? await prisma.purchaseOrder.findMany({
    where: { id: { in: [...orderIds] }, organizationId: user.organizationId },
    select: {
      id: true, shortCode: true, supplierId: true,
      supplier: { select: { name: true } }, location: { select: { name: true } },
      lines: {
        where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" },
        select: { id: true, quantity: true, inputQuantity: true, inputUnit: true, supplierReplyStatus: true, promisedQuantity: true, item: { select: { name: true, unit: true } } },
      },
    },
  }) : []
  const suppliers = await getFeatureAccess(user, "SUPPLIERS") === "EDIT"
    ? await prisma.supplier.findMany({ where: { organizationId: user.organizationId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : []
  return ok({ items, total, page, pages: Math.max(1, Math.ceil(total / perPage)), counts: { review }, orders, suppliers })
}
