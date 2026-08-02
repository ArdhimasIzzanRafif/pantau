import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const receipts = await prisma.goodsReceipt.findMany({
    where: { organizationId: user.organizationId },
    include: { location: true, items: { include: { item: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return ok(receipts)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { locationId, supplier, receiptNumber, notes, items, imageUrl } = await req.json()

  if (!locationId || !items?.length) {
    return err("Lokasi dan item wajib diisi")
  }

  const LOCATION_SCOPED_ROLES = ["SUPERVISOR", "ADMIN_GUDANG"]
  if (LOCATION_SCOPED_ROLES.includes(user.role)) {
    const orgUser = await prisma.organizationUser.findFirst({
      where: { userId: user.id, organizationId: user.organizationId },
      include: { assignedLocations: { select: { locationId: true } } },
    })
    const allowed = orgUser?.assignedLocations.map((l) => l.locationId) ?? []
    if (!allowed.includes(locationId)) return err("Tidak ada akses ke lokasi ini", 403)
  }

  const receipt = await prisma.$transaction(async (tx) => {
    const gr = await tx.goodsReceipt.create({
      data: {
        organizationId: user.organizationId,
        locationId,
        supplier,
        receiptNumber,
        notes,
        imageUrl: imageUrl ?? null,
        status: "CONFIRMED",
        createdById: user.id,
        items: {
          create: items.map((i: { itemId: string; quantity: number; costPrice?: number }) => ({
            itemId: i.itemId,
            quantity: i.quantity,
            costPrice: i.costPrice ?? null,
          })),
        },
      },
      include: { items: true, location: true },
    })

    for (const item of items as Array<{ itemId: string; quantity: number; costPrice?: number }>) {
      // Ambil data item + saldo saat ini untuk WAC
      const [inventoryItem, currentBal] = await Promise.all([
        tx.inventoryItem.findUnique({ where: { id: item.itemId } }),
        tx.stockBalance.findUnique({
          where: { itemId_locationId: { itemId: item.itemId, locationId } },
          include: { item: true },
        }),
      ])

      const currentQty = currentBal ? Number(currentBal.quantity) : 0
      const currentCost = inventoryItem?.costPrice ? Number(inventoryItem.costPrice) : null

      // WAC: hitung harga pokok rata-rata tertimbang baru
      if (item.costPrice && item.costPrice > 0) {
        const incomingCost = item.costPrice
        let newWAC: number

        if (currentCost != null && currentQty > 0) {
          newWAC = (currentQty * currentCost + item.quantity * incomingCost) / (currentQty + item.quantity)
        } else {
          newWAC = incomingCost
        }

        // Simpan WAC baru ke master inventori
        await tx.inventoryItem.update({
          where: { id: item.itemId },
          data: { costPrice: Math.round(newWAC * 100) / 100 },
        })

        // Alert jika harga masuk naik >20% dari HPP saat ini
        if (currentCost != null && currentCost > 0) {
          const pctChange = ((incomingCost - currentCost) / currentCost) * 100
          if (pctChange > 20) {
            const itemName = inventoryItem?.name ?? item.itemId
            await tx.alert.create({
              data: {
                organizationId: user.organizationId,
                type: "PRICE_ANOMALY",
                severity: "WARNING",
                title: `Kenaikan Harga Beli Signifikan: ${itemName}`,
                message: `Harga beli ${itemName} di ${gr.location.name} meningkat dari Rp ${Math.round(currentCost).toLocaleString("id-ID")} menjadi Rp ${Math.round(incomingCost).toLocaleString("id-ID")} (naik ${pctChange.toFixed(1)}%). Supplier: ${supplier ?? "tidak tercatat"}. Harap verifikasi kewajaran harga sebelum melanjutkan.`,
                locationId,
                itemId: item.itemId,
                referenceId: gr.id,
              },
            })
          }
        }
      }

      await tx.stockBalance.upsert({
        where: { itemId_locationId: { itemId: item.itemId, locationId } },
        update: { quantity: { increment: item.quantity } },
        create: {
          organizationId: user.organizationId,
          itemId: item.itemId,
          locationId,
          quantity: item.quantity,
        },
      })

      await tx.stockMovement.create({
        data: {
          organizationId: user.organizationId,
          itemId: item.itemId,
          locationId,
          type: "GOODS_IN",
          quantity: item.quantity,
          referenceId: gr.id,
          createdById: user.id,
        },
      })

      // Resolve low-stock alert jika stok sudah cukup
      if (currentBal?.item.minStock) {
        const newQty = currentQty + item.quantity
        const min = Number(currentBal.item.minStock)
        if (newQty >= min) {
          await tx.alert.updateMany({
            where: {
              organizationId: user.organizationId,
              type: "LOW_STOCK",
              itemId: item.itemId,
              locationId,
              isResolved: false,
            },
            data: { isResolved: true, resolvedAt: new Date() },
          })
        }
      }
    }

    return gr
  })

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "CREATE",
      entity: "GoodsReceipt",
      entityId: receipt.id,
    },
  })

  return ok(receipt, 201)
}
