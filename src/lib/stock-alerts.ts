import { prisma } from "@/lib/db"

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

export async function checkAndCreateLowStockAlert(
  tx: Tx,
  orgId: string,
  itemId: string,
  locationId: string
) {
  const bal = await tx.stockBalance.findUnique({
    where: { itemId_locationId: { itemId, locationId } },
    include: {
      item: {
        include: { locationSettings: { where: { locationId }, select: { minStock: true } } },
      },
      location: { select: { name: true } },
    },
  })
  if (!bal) return

  const perLocationMin = bal.item.locationSettings[0]?.minStock
  const minStock = perLocationMin != null
    ? Number(perLocationMin)
    : bal.item.minStock != null ? Number(bal.item.minStock) : null

  if (!minStock) return

  const qty = Number(bal.quantity)
  if (qty >= minStock) return

  const existing = await tx.alert.findFirst({
    where: { organizationId: orgId, type: "LOW_STOCK", itemId, locationId, isResolved: false },
  })
  if (existing) return

  await tx.alert.create({
    data: {
      organizationId: orgId,
      type: "LOW_STOCK",
      severity: qty <= 0 ? "CRITICAL" : "WARNING",
      title: `Stok ${bal.item.name} Di Bawah Minimum`,
      message: `Stok ${bal.item.name} di ${bal.location.name} saat ini ${qty} unit, di bawah batas minimum ${minStock} unit. Segera lakukan pengisian stok.`,
      locationId,
      itemId,
    },
  })
}
