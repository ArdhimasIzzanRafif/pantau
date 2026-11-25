import "server-only"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { canAccessLocation } from "@/lib/location-access"
import { parseTransferQuantity } from "@/lib/transfer-quantity"
import { convertToBase } from "@/lib/unit-conversion"
import { consumeNeedLinks, requireUnusedNeedLink } from "@/lib/need-action-link"
import { enqueueWarehouseNotification } from "@/lib/replenishment"

// Dipisahkan dari route agar aturan transaksi banyak bahan tetap atomik.
type Pengguna = Parameters<typeof canAccessLocation>[0]
type BarisIsian = { itemId: string; quantity: unknown; inputUnit: unknown }

/**
 * PIC outlet mengisi kebutuhan beberapa bahan dalam satu form. Sistem membuat
 * satu transfer PENDING. Gudang menentukan jumlah yang disetujui kemudian;
 * reservasi stok baru dibuat pada tahap persetujuan gudang.
 */
export async function isiKebutuhanBanyakBahan(user: Pengguna, body: Record<string, unknown>) {
  const locationId = typeof body.locationId === "string" ? body.locationId : ""
  const notes = typeof body.notes === "string" ? body.notes.trim() : ""
  const alertIds = Array.isArray(body.alertIds) ? (body.alertIds as unknown[]).filter((id): id is string => typeof id === "string") : []
  const rawLines = Array.isArray(body.lines) ? body.lines as BarisIsian[] : []
  const baris = rawLines.filter((line) => line && typeof line.itemId === "string")
  if (!locationId || baris.length === 0) throw new Error("Isi kebutuhan minimal untuk satu bahan")
  if (new Set(baris.map((line) => line.itemId)).size !== baris.length) throw new Error("Bahan yang sama tercantum dua kali")
  if (notes.length > 500) throw new Error("Catatan maksimal 500 karakter")

  return prisma.$transaction(async (tx) => {
    const itemIds = baris.map((line) => line.itemId).sort()
    await tx.$queryRaw`SELECT id FROM "StockBalance" WHERE "organizationId" = ${user.organizationId}
      AND "locationId" = ${locationId} AND "itemId" IN (${Prisma.join(itemIds)}) ORDER BY "itemId" FOR UPDATE`
    const outlet = await tx.location.findFirst({
      where: { id: locationId, organizationId: user.organizationId, type: "OUTLET", isActive: true },
      include: { fulfillmentWarehouse: true },
    })
    if (!outlet) throw new Error("Outlet tidak valid")
    if (!(await canAccessLocation(user, locationId))) throw new Error("Tidak ada akses ke outlet ini")
    const warehouse = outlet.fulfillmentWarehouse
    if (!warehouse?.isActive || warehouse.type !== "WAREHOUSE") throw new Error("Pasangkan gudang pemenuhan melalui Manajemen → Outlet terlebih dahulu")

    if (alertIds.length) {
      const alerts = await tx.alert.findMany({ where: { id: { in: alertIds }, organizationId: user.organizationId, locationId }, select: { id: true, itemId: true } })
      for (const alert of alerts) {
        if (alert.itemId && itemIds.includes(alert.itemId)) await requireUnusedNeedLink(tx, user.organizationId, alert.itemId, locationId, alert.id)
      }
    }

    // Pastikan semua saldo gudang ada, lalu kunci dalam urutan tetap. Ini
    // membuat pemeriksaan stok tersedia konsisten dengan reservasi aktif.
    for (const itemId of itemIds) {
      await tx.stockBalance.upsert({ where: { itemId_locationId: { itemId, locationId: warehouse.id } },
        create: { organizationId: user.organizationId, itemId, locationId: warehouse.id, quantity: 0 }, update: {} })
    }
    await tx.$queryRaw`SELECT id FROM "StockBalance" WHERE "organizationId" = ${user.organizationId}
      AND "locationId" = ${warehouse.id} AND "itemId" IN (${Prisma.join(itemIds)}) ORDER BY "itemId" FOR UPDATE`

    const [warehouseBalances, reservations] = await Promise.all([
      tx.stockBalance.findMany({ where: { organizationId: user.organizationId, locationId: warehouse.id, itemId: { in: itemIds } }, select: { itemId: true, quantity: true } }),
      tx.stockReservation.groupBy({ by: ["itemId"], where: { organizationId: user.organizationId, locationId: warehouse.id, itemId: { in: itemIds }, status: "ACTIVE" }, _sum: { quantity: true } }),
    ])
    const availableByItem = new Map(warehouseBalances.map((row) => {
      const reserved = reservations.find((entry) => entry.itemId === row.itemId)
      return [row.itemId, Math.max(0, Number(row.quantity) - Number(reserved?._sum.quantity ?? 0))]
    }))

    const siap: Array<{ itemId: string; nama: string; quantity: number; enteredQuantity: number; inputUnit: string; available: number }> = []
    const legacyIds = new Set<string>()
    for (const line of baris) {
      const balance = await tx.stockBalance.findFirst({
        where: { organizationId: user.organizationId, itemId: line.itemId, locationId },
        include: { item: { include: { locationSettings: { where: { locationId } } } } },
      })
      if (!balance) throw new Error("Ada bahan yang tidak valid. Muat ulang data kebutuhan.")
      const nama = balance.item.name
      const enteredQuantity = parseTransferQuantity(line.quantity)
      const inputUnit = line.inputUnit === "pack" ? "pack" : "base"
      if (enteredQuantity == null) throw new Error(`${nama}: kebutuhan harus lebih dari 0, maksimal 3 angka desimal`)
      const quantity = parseTransferQuantity(convertToBase(balance.item, enteredQuantity, inputUnit).baseQuantity)
      if (quantity == null) throw new Error(`${nama}: jumlah melebihi batas yang dapat disimpan`)
      const minimum = balance.item.locationSettings[0]?.minStock
      if (minimum == null || Number(balance.quantity) > Number(minimum)) throw new Error(`${nama}: stok outlet sudah berada di atas ambang minimum. Muat ulang data kebutuhan.`)

      const aktif = await tx.stockTransfer.findFirst({
        where: { organizationId: user.organizationId, toLocationId: locationId,
          status: { in: ["PENDING", "APPROVED", "SENT"] }, items: { some: { itemId: line.itemId } } },
        select: { id: true, status: true, autoReplenishment: true, outletRequested: true },
      })
      const legacy = aktif?.status === "PENDING" && aktif.autoReplenishment && !aktif.outletRequested
      if (aktif && !legacy) throw new Error(`${nama}: permintaan bahan ini masih aktif. Hapus dari form atau muat ulang.`)
      if (legacy) legacyIds.add(aktif.id)

      const available = availableByItem.get(line.itemId) ?? 0
      if (available <= 0) throw new Error(`${nama}: stok gudang yang tersedia sudah habis. Hapus dari form atau muat ulang.`)
      siap.push({ itemId: line.itemId, nama, quantity, enteredQuantity,
        inputUnit: inputUnit === "pack" ? balance.item.packUnit ?? balance.item.unit : balance.item.unit, available })
    }

    if (legacyIds.size) await tx.stockTransfer.deleteMany({ where: { id: { in: [...legacyIds] }, organizationId: user.organizationId,
      status: "PENDING", outletRequested: false, autoReplenishment: true } })

    const created = await tx.stockTransfer.create({
      data: { organizationId: user.organizationId, fromLocationId: warehouse.id, toLocationId: locationId,
        notes: notes || null, createdById: user.id, outletRequested: true, autoReplenishment: true,
        status: "PENDING", notificationStatus: "PENDING",
        items: { create: siap.map((row) => ({ itemId: row.itemId, quantity: row.quantity, requestedQuantity: row.quantity })) } },
      select: { id: true },
    })
    await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id,
      action: "REQUEST_OUTLET_REPLENISHMENT", entity: "StockTransfer", entityId: created.id,
      after: { locationId, notes, banyakBahan: true, items: siap.map((row) => ({ itemId: row.itemId,
        requestedQuantity: row.quantity, enteredQuantity: row.enteredQuantity, inputUnit: row.inputUnit,
        warehouseAvailableAtRequest: row.available })) } } })

    for (const row of siap) {
      await tx.stockTransferItem.updateMany({
        where: { itemId: row.itemId, outstandingQty: { gt: 0 },
          transfer: { organizationId: user.organizationId, toLocationId: locationId, status: "RECEIVED" } },
        data: { outstandingQty: 0 },
      })
      await consumeNeedLinks(tx, user.organizationId, user.id, row.itemId, locationId, created.id)
    }
    const notificationQueued = await enqueueWarehouseNotification(tx, created.id, user.organizationId)
    return { ids: [created.id], requested: siap.length, notificationQueued }
  })
}
