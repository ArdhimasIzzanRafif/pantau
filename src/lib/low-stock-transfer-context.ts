import "server-only"
import { prisma } from "@/lib/db"

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000
}

/**
 * Membangun isi form transfer dari alert sebagai sumber kebenaran.
 * ID alert di URL hanya dipakai untuk menemukan outlet; lokasi, gudang,
 * barang, stok terkini, dan saran jumlah selalu dibaca ulang dari database.
 */
export async function getLowStockTransferContext(organizationId: string, rawAlertIds: string[]) {
  const requestedIds = [...new Set(rawAlertIds.map((id) => id.trim()).filter(Boolean))].slice(0, 50)
  if (requestedIds.length === 0) return null

  const anchors = await prisma.alert.findMany({
    where: {
      id: { in: requestedIds },
      organizationId,
      type: "LOW_STOCK",
      isResolved: false,
      locationId: { not: null },
    },
    select: { id: true, locationId: true },
  })
  const outletIds = [...new Set(anchors.map((alert) => alert.locationId).filter((id): id is string => !!id))]
  if (outletIds.length !== 1) return null
  const outletId = outletIds[0]

  const outlet = await prisma.location.findFirst({
    where: { id: outletId, organizationId, type: "OUTLET", isActive: true },
    select: {
      id: true,
      name: true,
      fulfillmentWarehouse: {
        select: { id: true, name: true, type: true, isActive: true, organizationId: true },
      },
    },
  })
  const warehouse = outlet?.fulfillmentWarehouse
  if (!outlet || !warehouse || !warehouse.isActive || warehouse.type !== "WAREHOUSE" || warehouse.organizationId !== organizationId) {
    return null
  }

  // Satu tautan memuat seluruh alert stok rendah yang masih aktif di outlet
  // tersebut. Jadi beberapa bahan menjadi beberapa baris dalam SATU request.
  const activeAlerts = await prisma.alert.findMany({
    where: { organizationId, type: "LOW_STOCK", isResolved: false, locationId: outlet.id, itemId: { not: null } },
    select: { id: true, itemId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  const itemIds = [...new Set(activeAlerts.map((alert) => alert.itemId).filter((id): id is string => !!id))]
  if (itemIds.length === 0) return null

  const [items, settings, outletBalances, warehouseBalances, reservations, activeTransfers] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { organizationId, id: { in: itemIds }, isActive: true },
      select: { id: true, name: true, unit: true },
    }),
    prisma.inventoryLocationSetting.findMany({
      where: { organizationId, locationId: outlet.id, itemId: { in: itemIds }, minStock: { not: null } },
      select: { itemId: true, minStock: true },
    }),
    prisma.stockBalance.findMany({
      where: { organizationId, locationId: outlet.id, itemId: { in: itemIds } },
      select: { itemId: true, quantity: true },
    }),
    prisma.stockBalance.findMany({
      where: { organizationId, locationId: warehouse.id, itemId: { in: itemIds } },
      select: { itemId: true, quantity: true },
    }),
    prisma.stockReservation.groupBy({
      by: ["itemId"],
      where: { organizationId, locationId: warehouse.id, itemId: { in: itemIds }, status: "ACTIVE" },
      _sum: { quantity: true },
    }),
    prisma.stockTransfer.findMany({
      where: {
        organizationId,
        toLocationId: outlet.id,
        status: { in: ["PENDING", "APPROVED", "SENT"] },
        items: { some: { itemId: { in: itemIds } } },
      },
      select: { items: { select: { itemId: true } } },
    }),
  ])
  const itemWithActiveTransfer = new Set(activeTransfers.flatMap((transfer) => transfer.items.map((item) => item.itemId)))

  const lines = itemIds.flatMap((itemId) => {
    const item = items.find((row) => row.id === itemId)
    const minimum = settings.find((row) => row.itemId === itemId)?.minStock
    if (!item || minimum == null || itemWithActiveTransfer.has(itemId)) return []

    const outletQuantity = Number(outletBalances.find((row) => row.itemId === itemId)?.quantity ?? 0)
    const minimumQuantity = Number(minimum)
    // Barang yang sudah pulih tidak boleh ikut terbawa oleh tautan WA lama.
    if (outletQuantity > minimumQuantity) return []

    const physicalWarehouse = Number(warehouseBalances.find((row) => row.itemId === itemId)?.quantity ?? 0)
    const reservedWarehouse = Number(reservations.find((row) => row.itemId === itemId)?._sum.quantity ?? 0)
    const warehouseAvailable = Math.max(0, roundQuantity(physicalWarehouse - reservedWarehouse))
    const shortageToMinimum = Math.max(0, roundQuantity(minimumQuantity - outletQuantity))
    const suggestedQuantity = Math.min(shortageToMinimum, warehouseAvailable)

    return [{
      alertIds: activeAlerts.filter((alert) => alert.itemId === itemId).map((alert) => alert.id),
      itemId,
      itemName: item.name,
      unit: item.unit,
      outletQuantity,
      minimumQuantity,
      warehouseAvailable,
      suggestedQuantity,
    }]
  }).sort((a, b) => Number(a.outletQuantity > 0) - Number(b.outletQuantity > 0) || a.itemName.localeCompare(b.itemName))

  return {
    outlet: { id: outlet.id, name: outlet.name },
    warehouse: { id: warehouse.id, name: warehouse.name },
    alertIds: [...new Set(lines.flatMap((line) => line.alertIds))],
    lines,
  }
}
