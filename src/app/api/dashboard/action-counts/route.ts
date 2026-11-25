import type { Prisma, TransferStatus } from "@prisma/client"
import { isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { getFeatureAccess } from "@/lib/feature-access"
import { getAccessibleLocationIds } from "@/lib/location-access"
import { prisma } from "@/lib/db"

/**
 * Angka pekerjaan operasional untuk badge sidebar.
 *
 * Transfer menghitung seluruh alur yang belum selesai. Barang Masuk menghitung
 * pesanan supplier aktif dan kiriman gudang yang sudah berangkat ke lokasi
 * pengguna. Pesanan banyak bahan dihitung sekali per PO, bukan per bahan.
 */
export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const [locationIds, transferAccess, receiptAccess] = await Promise.all([
    getAccessibleLocationIds(user),
    getFeatureAccess(user, "TRANSFER"),
    getFeatureAccess(user, "GOODS_RECEIPT"),
  ])

  const transferScope: Prisma.StockTransferWhereInput = {
    organizationId: user.organizationId,
    status: { in: ["PENDING", "APPROVED", "SENT"] as TransferStatus[] },
    ...(locationIds ? {
      OR: [
        { fromLocationId: { in: locationIds } },
        { toLocationId: { in: locationIds } },
      ],
    } : {}),
  }
  const orderScope: Prisma.PurchaseOrderWhereInput = {
    organizationId: user.organizationId,
    ...(locationIds ? { locationId: { in: locationIds } } : {}),
    lines: { some: { status: "ACTIVE" } },
  }
  const legacyOrderScope: Prisma.PurchaseRequestWhereInput = {
    organizationId: user.organizationId,
    purchaseOrderId: null,
    status: "ACTIVE",
    ...(locationIds ? { locationId: { in: locationIds } } : {}),
  }
  const incomingTransferScope: Prisma.StockTransferWhereInput = {
    organizationId: user.organizationId,
    status: "SENT",
    ...(locationIds ? { toLocationId: { in: locationIds } } : {}),
  }

  const [transfer, supplierOrders, legacyOrders, incomingTransfers] = await Promise.all([
    transferAccess ? prisma.stockTransfer.count({ where: transferScope }) : 0,
    receiptAccess ? prisma.purchaseOrder.count({ where: orderScope }) : 0,
    receiptAccess ? prisma.purchaseRequest.count({ where: legacyOrderScope }) : 0,
    receiptAccess && ["OWNER", "SUPERVISOR"].includes(user.role)
      ? prisma.stockTransfer.count({ where: incomingTransferScope })
      : 0,
  ])

  return ok({
    transfer,
    goodsReceipt: supplierOrders + legacyOrders + incomingTransfers,
  })
}
