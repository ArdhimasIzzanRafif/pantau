import type { MovementType, Prisma } from "@prisma/client"
import { checkAndCreateLowStockAlert } from "@/lib/stock-alerts"

type Tx = Prisma.TransactionClient

export class StockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "StockError"
  }
}

export type ConsumedBatch = {
  batchId: string | null
  batchNumber: string | null
  expiryDate: Date | null
  costPrice: number | null
  quantity: number
}

type MovementBase = {
  organizationId: string
  itemId: string
  locationId: string
  type: MovementType
  quantity: number
  note?: string | null
  referenceId?: string | null
  createdById?: string | null
  effectiveAt?: Date
}

export async function consumeStock(
  tx: Tx,
  input: MovementBase & { batchId?: string | null; allowNegative?: boolean; ignoreReservation?: boolean },
): Promise<ConsumedBatch[]> {
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new StockError("Jumlah stok keluar harus lebih dari 0")
  }

  const balance = await tx.stockBalance.findUnique({
    where: { itemId_locationId: { itemId: input.itemId, locationId: input.locationId } },
    include: { item: { select: { name: true } } },
  })
  const available = Number(balance?.quantity ?? 0)
  if (available < quantity && !input.allowNegative) {
    throw new StockError(`Stok ${balance?.item.name ?? "item"} tidak cukup. Tersedia ${available}, dibutuhkan ${quantity}.`)
  }

  // Stok yang sudah dijanjikan ke transfer lain tidak boleh ikut terpakai.
  // Opname, waste, kerusakan, dan penyesuaian semuanya lewat sini, jadi satu
  // pemeriksaan di titik ini menjaga seluruh jalur pengurangan stok.
  //
  // Pengiriman transfer menandai reservasinya CONSUMED lebih dahulu, sehingga
  // saat sampai ke sini reservasi itu sudah tidak terhitung lagi.
  if (!input.ignoreReservation) {
    const reserved = await tx.stockReservation.aggregate({
      where: {
        organizationId: input.organizationId,
        itemId: input.itemId,
        locationId: input.locationId,
        status: "ACTIVE",
      },
      _sum: { quantity: true },
    })
    const reservedQty = Number(reserved._sum.quantity ?? 0)
    if (reservedQty > 0 && available - quantity < reservedQty) {
      const sisa = Math.round((available - reservedQty) * 1000) / 1000
      throw new StockError(
        `${balance?.item.name ?? "Bahan"} ini sudah direservasi ${reservedQty} untuk transfer yang disetujui. `
        + `Yang dapat dikurangi maksimal ${sisa}. Tinjau atau batalkan transfernya terlebih dahulu.`,
      )
    }
  }

  const batches = input.batchId
    ? await tx.stockBatch.findMany({
        where: {
          id: input.batchId,
          organizationId: input.organizationId,
          itemId: input.itemId,
          locationId: input.locationId,
          quantity: { gt: 0 },
        },
      })
    : await tx.stockBatch.findMany({
        where: {
          organizationId: input.organizationId,
          itemId: input.itemId,
          locationId: input.locationId,
          quantity: { gt: 0 },
        },
        orderBy: [
          { expiryDate: { sort: "asc", nulls: "last" } },
          { receivedAt: "asc" },
        ],
      })

  if (input.batchId && batches.length === 0) {
    throw new StockError("Batch tidak ditemukan atau stok batch sudah habis")
  }

  let remaining = quantity
  const consumed: ConsumedBatch[] = []

  for (const batch of batches) {
    if (remaining <= 0) break
    const availableInBatch = Number(batch.quantity)
    const take = Math.min(availableInBatch, remaining)
    if (take <= 0) continue

    await tx.stockBatch.update({
      where: { id: batch.id },
      data: { quantity: { decrement: take } },
    })
    await tx.stockMovement.create({
      data: {
        organizationId: input.organizationId,
        itemId: input.itemId,
        locationId: input.locationId,
        type: input.type,
        quantity: -take,
        note: input.note ?? null,
        referenceId: input.referenceId ?? null,
        createdById: input.createdById ?? null,
        effectiveAt: input.effectiveAt ?? new Date(),
        batchId: batch.id,
      },
    })
    consumed.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      costPrice: batch.costPrice == null ? null : Number(batch.costPrice),
      quantity: take,
    })
    remaining -= take
  }

  if (input.batchId && remaining > 0) {
    throw new StockError("Jumlah yang diminta melebihi stok pada batch terpilih")
  }

  if (remaining > 0) {
    await tx.stockMovement.create({
      data: {
        organizationId: input.organizationId,
        itemId: input.itemId,
        locationId: input.locationId,
        type: input.type,
        quantity: -remaining,
        note: input.note ?? null,
        referenceId: input.referenceId ?? null,
        createdById: input.createdById ?? null,
        effectiveAt: input.effectiveAt ?? new Date(),
      },
    })
    consumed.push({
      batchId: null,
      batchNumber: null,
      expiryDate: null,
      costPrice: null,
      quantity: remaining,
    })
  }

  await tx.stockBalance.upsert({
    where: { itemId_locationId: { itemId: input.itemId, locationId: input.locationId } },
    update: { quantity: { decrement: quantity } },
    create: {
      organizationId: input.organizationId,
      itemId: input.itemId,
      locationId: input.locationId,
      quantity: -quantity,
    },
  })
  await checkAndCreateLowStockAlert(tx, input.organizationId, input.itemId, input.locationId)
  // Low stock creates an alert/need. Purchasing waits for a user-entered amount.

  return consumed
}

export async function addStock(
  tx: Tx,
  input: MovementBase & {
    existingBatchId?: string | null
    batchNumber?: string | null
    expiryDate?: Date | null
    costPrice?: number | null
  },
) {
  const quantity = Number(input.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new StockError("Jumlah stok masuk harus lebih dari 0")
  }

  let batchId: string | null = null
  if (input.existingBatchId) {
    const batch = await tx.stockBatch.findFirst({
      where: {
        id: input.existingBatchId,
        organizationId: input.organizationId,
        itemId: input.itemId,
        locationId: input.locationId,
      },
      select: { id: true },
    })
    if (batch) {
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { quantity: { increment: quantity } },
      })
      batchId = batch.id
    }
  } else if (input.batchNumber) {
    const batch = await tx.stockBatch.upsert({
      where: {
        organizationId_itemId_locationId_batchNumber: {
          organizationId: input.organizationId,
          itemId: input.itemId,
          locationId: input.locationId,
          batchNumber: input.batchNumber,
        },
      },
      update: {
        quantity: { increment: quantity },
        initialQuantity: { increment: quantity },
        expiryDate: input.expiryDate ?? undefined,
        costPrice: input.costPrice ?? undefined,
      },
      create: {
        organizationId: input.organizationId,
        itemId: input.itemId,
        locationId: input.locationId,
        batchNumber: input.batchNumber,
        expiryDate: input.expiryDate ?? null,
        initialQuantity: quantity,
        quantity,
        costPrice: input.costPrice ?? null,
      },
      select: { id: true },
    })
    batchId = batch.id
  }

  await tx.stockBalance.upsert({
    where: { itemId_locationId: { itemId: input.itemId, locationId: input.locationId } },
    update: { quantity: { increment: quantity } },
    create: {
      organizationId: input.organizationId,
      itemId: input.itemId,
      locationId: input.locationId,
      quantity,
    },
  })
  await tx.stockMovement.create({
    data: {
      organizationId: input.organizationId,
      itemId: input.itemId,
      locationId: input.locationId,
      type: input.type,
      quantity,
      note: input.note ?? null,
      referenceId: input.referenceId ?? null,
      createdById: input.createdById ?? null,
      effectiveAt: input.effectiveAt ?? new Date(),
      batchId,
    },
  })

  const current = await tx.stockBalance.findUnique({ where: { itemId_locationId: { itemId: input.itemId, locationId: input.locationId } } })
  const setting = await tx.inventoryLocationSetting.findFirst({ where: { organizationId: input.organizationId, itemId: input.itemId, locationId: input.locationId }, select: { minStock: true } })
  // Peringatan stok menipis selesai sendiri saat stok pulih: di atas ambang,
  // atau — untuk bahan tanpa ambang yang sempat "habis" — stok tersedia > 0.
  let pulih = false
  if (current && setting?.minStock != null) {
    pulih = Number(current.quantity) > Number(setting.minStock)
  } else if (current) {
    const reservasi = await tx.stockReservation.aggregate({
      where: { organizationId: input.organizationId, itemId: input.itemId, locationId: input.locationId, status: "ACTIVE" },
      _sum: { quantity: true },
    })
    pulih = Number(current.quantity) - Number(reservasi._sum.quantity ?? 0) > 0
  }
  if (pulih) {
    await tx.alert.updateMany({ where: { organizationId: input.organizationId, itemId: input.itemId, locationId: input.locationId, type: "LOW_STOCK", isResolved: false }, data: { isResolved: true, resolvedAt: new Date() } })
  }
  return batchId
}

export async function recordVariance(
  tx: Tx,
  input: Omit<MovementBase, "quantity"> & { quantity: number },
) {
  await tx.stockMovement.create({
    data: {
      organizationId: input.organizationId,
      itemId: input.itemId,
      locationId: input.locationId,
      type: input.type,
      quantity: input.quantity,
      note: input.note ?? null,
      referenceId: input.referenceId ?? null,
      createdById: input.createdById ?? null,
      effectiveAt: input.effectiveAt ?? new Date(),
      affectsBalance: false,
    },
  })
}
