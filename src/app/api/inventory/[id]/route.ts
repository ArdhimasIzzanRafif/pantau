import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { checkAndCreateLowStockAlert } from "@/lib/stock-alerts"
import { parseOptionalMinimumStock, QuantityInputError } from "@/lib/inventory-quantity"
import { validateInventoryPackaging, UnitError } from "@/lib/unit-conversion"
import { InventoryCostError, parseOptionalInventoryCost } from "@/lib/inventory-cost"

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function parseLocationMinStocks(value: unknown): { toUpsert: { locationId: string; minStock: number }[]; toDelete: string[] } | null {
  if (!Array.isArray(value)) return null

  const toUpsert: { locationId: string; minStock: number }[] = []
  const toDelete: string[] = []

  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const locationId = (row as { locationId?: unknown }).locationId
    if (typeof locationId !== "string" || !locationId) continue

    const minStock = parseOptionalMinimumStock((row as { minStock?: unknown }).minStock)
    if (minStock !== null) {
      toUpsert.push({ locationId, minStock })
    } else {
      toDelete.push(locationId)
    }
  }

  return { toUpsert, toDelete }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_INVENTORY")
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json()

  const item = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!item) return err("Item tidak ditemukan", 404)


  let locationMinStocks: ReturnType<typeof parseLocationMinStocks>
  let packaging: ReturnType<typeof validateInventoryPackaging>
  let parsedCostPrice = item.costPrice == null ? null : Number(item.costPrice)
  try {
    locationMinStocks = parseLocationMinStocks(body.locationMinStocks)
    packaging = validateInventoryPackaging(body.unit ?? item.unit,
      body.packSize !== undefined ? body.packSize : item.packSize?.toNumber(),
      body.packUnit !== undefined ? body.packUnit : item.packUnit)
    if (body.costPrice !== undefined) parsedCostPrice = parseOptionalInventoryCost(body.costPrice)
  } catch (error) {
    if (error instanceof UnitError || error instanceof QuantityInputError || error instanceof InventoryCostError) return err(error.message)
    throw error
  }
  if (locationMinStocks) {
    const allIds = [...locationMinStocks.toUpsert.map((r) => r.locationId), ...locationMinStocks.toDelete]
    if (allIds.length > 0) {
      const validLocationCount = await prisma.location.count({
        where: { organizationId: user.organizationId, id: { in: allIds } },
      })
      if (validLocationCount !== allIds.length) return err("Ada lokasi yang tidak valid")
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedItem = await tx.inventoryItem.update({
      where: { id },
      data: {
        name: body.name ?? item.name,
        sku: body.sku !== undefined ? body.sku : item.sku,
        category: body.category !== undefined ? body.category : item.category,
        unit: body.unit ?? item.unit,
        ...packaging,
        costPrice: parsedCostPrice,
        minStock: null,
        isTrackable: body.isTrackable !== undefined ? body.isTrackable : item.isTrackable,
        isActive: body.isActive !== undefined ? body.isActive : item.isActive,
        notes: body.notes !== undefined ? body.notes : item.notes,
      },
    })

    if (locationMinStocks) {
      // Delete settings for locations explicitly cleared (sent as null/empty)
      if (locationMinStocks.toDelete.length > 0) {
        await tx.inventoryLocationSetting.deleteMany({
          where: { organizationId: user.organizationId, itemId: id, locationId: { in: locationMinStocks.toDelete } },
        })
      }
      // Upsert settings for locations with a value — never touches other locations
      for (const { locationId, minStock } of locationMinStocks.toUpsert) {
        await tx.inventoryLocationSetting.upsert({
          where: { organizationId_itemId_locationId: { organizationId: user.organizationId, itemId: id, locationId } },
          create: { organizationId: user.organizationId, itemId: id, locationId, minStock },
          update: { minStock },
        })
        // Ambang baru bisa langsung terlampaui oleh stok yang sudah ada:
        // buat peringatan (dan WA) sekarang, jangan menunggu transaksi berikutnya.
        await checkAndCreateLowStockAlert(tx, user.organizationId, id, locationId)
      }
    }

    return updatedItem
  })

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "UPDATE",
      entity: "InventoryItem",
      entityId: id,
      before: toAuditJson(item),
      after: toAuditJson(updated),
    },
  })

  return ok(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_INVENTORY")
  if (forbidden) return forbidden

  const { id } = await params

  const item = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      usedInRecipes: {
        include: { parentItem: { select: { name: true } } },
      },
    },
  })
  if (!item) return err("Item tidak ditemukan", 404)


  if (item.usedInRecipes.length > 0) {
    const menuNames = [...new Set(item.usedInRecipes.map((r) => r.parentItem.name))].join(", ")
    return err(`Item ini dipakai sebagai bahan di menu: ${menuNames}. Hapus dari resep menu tersebut terlebih dahulu.`, 409)
  }

  await prisma.$transaction([
    prisma.stockMovement.deleteMany({ where: { itemId: id } }),
    prisma.goodsReceiptItem.deleteMany({ where: { itemId: id } }),
    prisma.stockTransferItem.deleteMany({ where: { itemId: id } }),
    prisma.stockOpnameItem.deleteMany({ where: { itemId: id } }),
    prisma.inventoryItem.delete({ where: { id } }),
  ])

  return ok({ message: "Item dihapus" })
}
