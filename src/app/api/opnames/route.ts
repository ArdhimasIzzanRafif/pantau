import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { sendWhatsApp, ownerPhone } from "@/lib/whatsapp"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const from       = searchParams.get("from")
  const to         = searchParams.get("to")

  const opnames = await prisma.stockOpname.findMany({
    where: {
      organizationId: user.organizationId,
      ...(locationId && { locationId }),
      ...(from || to ? {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to + "T23:59:59.999Z") }),
        },
      } : {}),
    },
    include: {
      location: true,
      items: { include: { item: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return ok(opnames)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { locationId, periodStart, periodEnd, shift, items, submit } = await req.json()

  if (!locationId || !periodStart || !periodEnd || !items?.length) {
    return err("Lokasi, periode, dan item wajib diisi")
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

  const opname = await prisma.$transaction(async (tx) => {
    // Hitung systemQty point-in-time: sum semua movement s/d periodEnd.
    // Ini penting agar opname tanggal 14 tidak ikut ngitung transfer/barang masuk
    // yang baru terjadi tanggal 17, misalnya.
    const itemIds = items.map((i: { itemId: string }) => i.itemId)
    const periodEndDate = new Date(periodEnd)

    const movements = await tx.stockMovement.groupBy({
      by: ["itemId"],
      where: {
        organizationId: user.organizationId,
        locationId,
        itemId: { in: itemIds },
        createdAt: { lte: periodEndDate },
      },
      _sum: { quantity: true },
    })
    const systemQtyMap: Record<string, number> = {}
    for (const m of movements) {
      systemQtyMap[m.itemId] = Number(m._sum.quantity ?? 0)
    }

    // Fetch all costPrices in one query instead of N individual findUnique calls
    const itemCosts = await tx.inventoryItem.findMany({
      where: { id: { in: itemIds }, organizationId: user.organizationId },
      select: { id: true, costPrice: true },
    })
    const costMap: Record<string, number> = {}
    for (const it of itemCosts) {
      costMap[it.id] = it.costPrice ? Number(it.costPrice) : 0
    }

    const opnameItems = items.map((item: { itemId: string; physicalQty: number | null; notes?: string }) => {
      const sysQty = systemQtyMap[item.itemId] ?? 0
      const diff = item.physicalQty != null ? item.physicalQty - sysQty : null
      const estimatedLoss = diff != null && diff < 0 ? Math.abs(diff) * (costMap[item.itemId] ?? 0) : 0
      return {
        itemId: item.itemId,
        systemQty: sysQty,
        physicalQty: item.physicalQty,
        difference: diff,
        estimatedLoss,
        notes: item.notes ?? null,
      }
    })

    const newOpname = await tx.stockOpname.create({
      data: {
        organizationId: user.organizationId,
        locationId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        shift: shift ?? null,
        status: submit ? "SUBMITTED" : "DRAFT",
        submittedAt: submit ? new Date() : null,
        createdById: user.id,
        items: { create: opnameItems },
      },
      include: { items: { include: { item: true } }, location: true },
    })

    if (submit) {
      for (const opItem of newOpname.items) {
        const diff = opItem.difference ? Number(opItem.difference) : null
        if (diff === null || diff === 0) continue

        // Reconcile StockBalance to physical count
        const physical = opItem.physicalQty ? Number(opItem.physicalQty) : 0
        await tx.stockBalance.upsert({
          where: { itemId_locationId: { itemId: opItem.itemId, locationId } },
          update: { quantity: physical },
          create: {
            organizationId: user.organizationId,
            itemId: opItem.itemId,
            locationId,
            quantity: physical,
          },
        })

        // Record as ADJUSTMENT movement
        await tx.stockMovement.create({
          data: {
            organizationId: user.organizationId,
            itemId: opItem.itemId,
            locationId,
            type: "OPNAME_CORRECTION",
            quantity: diff,
            referenceId: newOpname.id,
            createdById: user.id,
          },
        })

        // Create alert for negative difference
        if (diff < 0) {
          const estimatedLoss = Number(opItem.estimatedLoss ?? 0)
          await tx.alert.create({
            data: {
              organizationId: user.organizationId,
              type: "STOCK_SHORTAGE",
              severity: "CRITICAL",
              title: `Selisih Stok Terdeteksi: ${opItem.item.name}`,
              message: `Hasil opname fisik menunjukkan selisih ${Math.abs(diff)} unit (kurang) untuk ${opItem.item.name} di ${newOpname.location.name}. Estimasi kerugian: Rp ${estimatedLoss.toLocaleString("id-ID")}.`,
              locationId,
              itemId: opItem.itemId,
              referenceId: newOpname.id,
            },
          })
        }
      }

      // Check for low stock after reconciliation
      const updatedBalances = await tx.stockBalance.findMany({
        where: { organizationId: user.organizationId, locationId },
        include: { item: true },
      })
      const lowStockItemIds = updatedBalances
        .filter((b) => b.item.minStock && Number(b.quantity) < Number(b.item.minStock))
        .map((b) => b.itemId)

      // Fetch existing unresolved low-stock alerts in one query
      const existingAlerts = lowStockItemIds.length
        ? await tx.alert.findMany({
            where: {
              organizationId: user.organizationId,
              type: "LOW_STOCK",
              locationId,
              itemId: { in: lowStockItemIds },
              isResolved: false,
            },
            select: { itemId: true },
          })
        : []
      const alertedItemIds = new Set(existingAlerts.map((a) => a.itemId))

      for (const bal of updatedBalances) {
        const minStock = bal.item.minStock ? Number(bal.item.minStock) : null
        if (!minStock) continue
        const qty = Number(bal.quantity)
        if (qty < minStock && !alertedItemIds.has(bal.itemId)) {
          await tx.alert.create({
            data: {
              organizationId: user.organizationId,
              type: "LOW_STOCK",
              severity: qty === 0 ? "CRITICAL" : "WARNING",
              title: `Stok ${bal.item.name} Di Bawah Minimum`,
              message: `Stok ${bal.item.name} di ${newOpname.location.name} saat ini ${qty} unit, di bawah batas minimum ${minStock} unit. Segera lakukan pengisian stok.`,
              locationId,
              itemId: bal.itemId,
            },
          })
        }
      }
    }

    return newOpname
  })

  // Kirim notifikasi WA setelah transaksi commit (non-blocking)
  if (submit) {
    const phone = ownerPhone()
    if (phone) {
      const shortageItems = opname.items.filter((i) => {
        const diff = i.difference ? Number(i.difference) : null
        return diff !== null && diff < 0
      })

      for (const item of shortageItems) {
        const diff = Number(item.difference)
        const loss = Number(item.estimatedLoss ?? 0)
        const locationName = (opname as { location?: { name: string } }).location?.name ?? "—"
        sendWhatsApp(
          phone,
          `🔴 *Pantau Alert — Selisih Stok*\n\n` +
          `Item: *${item.item.name}*\n` +
          `Lokasi: ${locationName}\n` +
          `Selisih: ${diff} ${item.item.unit}\n` +
          (loss > 0 ? `Est. rugi: Rp ${loss.toLocaleString("id-ID")}\n` : "") +
          `\nCek dashboard Pantau untuk detail.`
        )
      }

      // Cek low-stock dari opname yang baru
      const lowStockBalances = await prisma.stockBalance.findMany({
        where: {
          organizationId: user.organizationId,
          locationId,
          item: { minStock: { not: null } },
        },
        include: { item: true, location: true },
      })
      for (const bal of lowStockBalances) {
        const qty = Number(bal.quantity)
        const min = Number(bal.item.minStock)
        if (qty < min) {
          sendWhatsApp(
            phone,
            `⚠️ *Pantau Alert — Stok Menipis*\n\n` +
            `Item: *${bal.item.name}*\n` +
            `Lokasi: ${bal.location.name}\n` +
            `Sisa stok: ${qty} ${bal.item.unit} (minimum: ${min})\n` +
            `\nSegera lakukan restok.`
          )
        }
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: submit ? "SUBMIT_OPNAME" : "CREATE_OPNAME",
      entity: "StockOpname",
      entityId: opname.id,
    },
  })

  return ok(opname, 201)
}
