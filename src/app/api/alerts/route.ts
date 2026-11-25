import { NextRequest } from "next/server"
import { AlertType, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { getFeatureAccess } from "@/lib/feature-access"
import { getAccessibleLocationIds } from "@/lib/location-access"
import { memberJoinedAt } from "@/lib/membership"
import { isAlertLocationVisible, isSupervisorAlertVisible, SUPERVISOR_ALERT_TYPES } from "@/lib/alert-visibility"
import { kirimNotifikasiStokMenipis, type HasilKirimWa } from "@/lib/stock-alerts"
import { compactAlertFeed, TRANSFER_NOTIFICATION_TYPES } from "@/lib/alert-feed"

/**
 * Outlet yang dipasok gudang yang ditugaskan ke pengguna. Pihak gudang
 * pemasoklah yang mengisi pengiriman saat stok outlet menipis, jadi peringatan
 * LOW_STOCK outlet tersebut ikut terlihat olehnya. `null` = Owner (semua).
 */
async function outletDipasokGudangSaya(organizationId: string, accessibleLocationIds: string[] | null) {
  if (accessibleLocationIds === null || accessibleLocationIds.length === 0) return []
  const outlets = await prisma.location.findMany({
    where: { organizationId, type: "OUTLET", fulfillmentWarehouseId: { in: accessibleLocationIds } },
    select: { id: true },
  })
  return outlets.map((outlet) => outlet.id)
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (await getFeatureAccess(user, "ALERTS") === null) return err("Tidak memiliki akses ke Peringatan", 403)

  const { searchParams } = new URL(req.url)
  const resolved = searchParams.get("resolved") === "true"
  const type = searchParams.get("type")
  const requestedType = type && Object.values(AlertType).includes(type as AlertType)
    ? type as AlertType : null
  if (type && !requestedType) return ok([])
  if (user.role === "SUPERVISOR" && requestedType && !SUPERVISOR_ALERT_TYPES.includes(requestedType)) {
    return ok([])
  }

  const accessibleLocationIds = await getAccessibleLocationIds(user)
  // Anggota baru tidak mewarisi notifikasi yang terbit sebelum dia ada,
  // sama seperti aturan Riwayat.
  const joinedAt = await memberJoinedAt(user)
  const outletDipasok = await outletDipasokGudangSaya(user.organizationId, accessibleLocationIds)

  const where: Prisma.AlertWhereInput = {
      organizationId: user.organizationId,
      isResolved: resolved,
      ...(joinedAt && { createdAt: { gte: joinedAt } }),
      // Notifikasi berlokasi langsung disaring di database supaya lokasi yang
      // sudah dicabut tidak memenuhi batas 100 baris. Transfer belum selalu
      // memiliki locationId dan disaring lewat dokumen referensinya di bawah.
      ...(accessibleLocationIds && {
        OR: [
          { locationId: null },
          { locationId: { in: accessibleLocationIds } },
          { type: "LOW_STOCK" as const, locationId: { in: outletDipasok } },
        ],
      }),
      ...(requestedType
        ? { type: requestedType }
        : user.role === "SUPERVISOR" ? { type: { in: SUPERVISOR_ALERT_TYPES } } : {}),
  }
  // Ambang stok mendapat jatah sendiri: aktivitas transfer yang banyak tidak
  // boleh menghabiskan batas query sebelum peringatan stok sempat terbaca.
  const prioritized = !requestedType && !resolved
  const [thresholdAlerts, importantAlerts, otherAlerts] = await Promise.all([
    prioritized ? prisma.alert.findMany({
      where: { AND: [where, { type: "LOW_STOCK" }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
    }) : [],
    prioritized ? prisma.alert.findMany({
      where: { AND: [where, { type: { not: "LOW_STOCK" }, severity: { not: "INFO" } }] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
    }) : [],
    prisma.alert.findMany({
      where: prioritized ? { AND: [where, { type: { not: "LOW_STOCK" }, severity: "INFO" }] } : where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
    }),
  ])
  const alerts = [...thresholdAlerts, ...importantAlerts, ...otherAlerts]
  const lowStockAlerts = alerts.filter((alert) => alert.type === "LOW_STOCK" && alert.itemId && alert.locationId)
  // referenceId bisa menunjuk ke opname, transfer, atau penerimaan barang. Jenisnya
  // dicari di sini supaya UI tahu halaman rincian mana yang harus dibuka — tipe alert
  // saja tidak cukup, karena STOCK_SHORTAGE dipakai oleh opname maupun transfer.
  const referenceIds = [...new Set(
    alerts.map((alert) => alert.referenceId).filter((id): id is string => !!id),
  )]
  const byReference = { where: { organizationId: user.organizationId, id: { in: referenceIds } } }

  const [configuredMinimums, opnames, transfers, receipts] = await Promise.all([
    lowStockAlerts.length > 0
      ? prisma.inventoryLocationSetting.findMany({
          where: {
            organizationId: user.organizationId,
            OR: lowStockAlerts.map((alert) => ({ itemId: alert.itemId!, locationId: alert.locationId! })),
            minStock: { not: null },
          },
          select: {
            itemId: true,
            locationId: true,
            location: { select: { type: true, fulfillmentWarehouseId: true } },
          },
        })
      : [],
    referenceIds.length > 0 ? prisma.stockOpname.findMany({
      ...byReference,
      select: { id: true, status: true, createdById: true, locationId: true },
    }) : [],
    referenceIds.length > 0 ? prisma.stockTransfer.findMany({
      ...byReference,
      select: { id: true, status: true, fromLocationId: true, toLocationId: true },
    }) : [],
    referenceIds.length > 0 ? prisma.goodsReceipt.findMany({
      ...byReference,
      select: { id: true, locationId: true },
    }) : [],
  ])
  const configuredKeys = new Set(configuredMinimums.map((setting) => `${setting.itemId}:${setting.locationId}`))
  const opnamesById = new Map(opnames.map((opname) => [opname.id, {
    status: opname.status,
    createdById: opname.createdById,
  }]))
  const transferIds = new Set(transfers.map((transfer) => transfer.id))
  const receiptIds = new Set(receipts.map((receipt) => receipt.id))
  const referenceLocationIds = new Map<string, readonly string[]>([
    ...opnames.map((opname) => [opname.id, [opname.locationId]] as const),
    ...transfers.map((transfer) => [transfer.id, [transfer.fromLocationId, transfer.toLocationId]] as const),
    ...receipts.map((receipt) => [receipt.id, [receipt.locationId]] as const),
  ])
  const accessibleLocationSet = accessibleLocationIds === null
    ? null
    : new Set(accessibleLocationIds)
  // Khusus stok menipis: ditambah outlet yang dipasok gudang pengguna.
  const lowStockLocationSet = accessibleLocationIds === null
    ? null
    : new Set([...accessibleLocationIds, ...outletDipasok])

  const visibleAlerts = alerts.filter((alert) => {
    const lokasiBoleh = alert.type === "LOW_STOCK" ? lowStockLocationSet : accessibleLocationSet
    if (!isAlertLocationVisible(alert, lokasiBoleh, referenceLocationIds)) return false
    const selisihOpname = alert.type === "STOCK_SHORTAGE" || alert.type === "STOCK_SURPLUS"
    if (selisihOpname && alert.referenceId) {
      const opname = opnamesById.get(alert.referenceId)
      if (opname && opname.status !== "REVIEWED") return false
    }
    // "Menipis" diukur dari ambang, jadi hanya tampil bila ambangnya diatur.
    // "Habis" (KRITIS) selalu tampil — misalnya stok gudang habis terpakai
    // untuk pengiriman outlet walau ambang gudang belum diatur.
    if (alert.type === "LOW_STOCK" && (!alert.itemId || !alert.locationId
      || (alert.severity !== "CRITICAL" && !configuredKeys.has(`${alert.itemId}:${alert.locationId}`)))) {
      return false
    }
    return user.role !== "SUPERVISOR" || isSupervisorAlertVisible(alert)
  })

  const halaman = compactAlertFeed(visibleAlerts, new Map(transfers.map(transfer => [transfer.id, transfer])), !resolved).slice(0, 50)
  // Status WA stok menipis terakhir per alert (penerima tautan, bukan kabar
  // untuk outlet), supaya pengguna tahu pesannya masuk atau perlu dikirim ulang.
  const lowStockIds = halaman.filter((alert) => alert.type === "LOW_STOCK").map((alert) => alert.id)
  const catatanWa = lowStockIds.length ? await prisma.auditLog.findMany({
    where: { organizationId: user.organizationId, entity: "Alert", action: "WA_LOW_STOCK", entityId: { in: lowStockIds } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, createdAt: true, after: true },
  }) : []
  function statusWa(alertId: string) {
    const terakhir = catatanWa.find((row) => row.entityId === alertId && (row.after as HasilKirimWa | null)?.tujuan !== "OUTLET")
    if (!terakhir) return null
    const isi = terakhir.after as HasilKirimWa
    return { ok: isi.ok, error: isi.error, tujuan: isi.tujuan, nomor: isi.nomor, at: terakhir.createdAt }
  }

  return ok(halaman.map((alert) => ({
    ...alert,
    waStatus: alert.type === "LOW_STOCK" ? statusWa(alert.id) : null,
    // Stok menipis di outlet bisa langsung diajukan sebagai kebutuhan ke gudang.
    canRequestOutlet: alert.type === "LOW_STOCK" && configuredMinimums.some((setting) =>
      setting.itemId === alert.itemId && setting.locationId === alert.locationId && setting.location.type === "OUTLET"),
    fulfillmentWarehouseId: alert.type === "LOW_STOCK"
      ? configuredMinimums.find((setting) => setting.itemId === alert.itemId && setting.locationId === alert.locationId)
        ?.location.fulfillmentWarehouseId ?? null
      : null,
    referenceType: !alert.referenceId ? null
      : opnamesById.has(alert.referenceId) ? "opname"
      : transferIds.has(alert.referenceId) ? "transfer"
      : receiptIds.has(alert.referenceId) ? "receipt"
      : null,
  })))
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (await getFeatureAccess(user, "ALERTS") === null) return err("Tidak memiliki akses ke Peringatan", 403)

  const { id, action } = await req.json()
  if (!id) return err("ID alert wajib diisi")

  const alert = await prisma.alert.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, locationId: true, referenceId: true, type: true, isResolved: true },
  })
  if (!alert) return err("Notifikasi tidak ditemukan", 404)

  const accessibleLocationIds = await getAccessibleLocationIds(user)
  const referenceLocationIds = new Map<string, readonly string[]>()
  if (accessibleLocationIds !== null && !alert.locationId && alert.referenceId) {
    const [opname, transfer, receipt] = await Promise.all([
      prisma.stockOpname.findFirst({
        where: { id: alert.referenceId, organizationId: user.organizationId },
        select: { locationId: true },
      }),
      prisma.stockTransfer.findFirst({
        where: { id: alert.referenceId, organizationId: user.organizationId },
        select: { fromLocationId: true, toLocationId: true },
      }),
      prisma.goodsReceipt.findFirst({
        where: { id: alert.referenceId, organizationId: user.organizationId },
        select: { locationId: true },
      }),
    ])
    const locations = opname ? [opname.locationId]
      : transfer ? [transfer.fromLocationId, transfer.toLocationId]
        : receipt ? [receipt.locationId]
          : null
    if (locations) referenceLocationIds.set(alert.referenceId, locations)
  }
  const outletDipasok = alert.type === "LOW_STOCK" ? await outletDipasokGudangSaya(user.organizationId, accessibleLocationIds) : []
  const accessibleLocationSet = accessibleLocationIds === null ? null : new Set([...accessibleLocationIds, ...outletDipasok])
  if (!isAlertLocationVisible(alert, accessibleLocationSet, referenceLocationIds)) {
    return err("Tidak memiliki akses ke lokasi notifikasi ini", 403)
  }

  // Kirim ulang WA stok menipis bila pesan sebelumnya tidak masuk.
  if (action === "RESEND_WA") {
    if (alert.type !== "LOW_STOCK" || alert.isResolved) return err("Hanya peringatan stok menipis yang masih aktif yang bisa dikirim ulang", 409)
    const baruSaja = await prisma.auditLog.findFirst({
      where: { organizationId: user.organizationId, entity: "Alert", entityId: alert.id, action: "WA_LOW_STOCK",
        createdAt: { gte: new Date(Date.now() - 30_000) } },
      select: { id: true },
    })
    if (baruSaja) return err("Pesan baru saja dikirim. Tunggu 30 detik sebelum mengirim ulang.", 429)
    const hasil = await kirimNotifikasiStokMenipis(user.organizationId, alert.id, { kirimKePenanggungJawab: true, userId: user.id })
    if (hasil.length === 0) return err("Pesan belum dapat dikirim. Pastikan outlet memiliki gudang pemenuhan dan nomor WA penanggung jawab gudang atau owner sudah diisi.", 409)
    const gagal = hasil.find((row) => !row.ok)
    if (gagal) return err(`WA gagal dikirim: ${gagal.error}`, 502)
    return ok({ message: "WA berhasil dikirim ulang", hasil })
  }

  const transfer = alert.referenceId && (TRANSFER_NOTIFICATION_TYPES as readonly string[]).includes(alert.type)
    ? await prisma.stockTransfer.findFirst({ where: { id: alert.referenceId, organizationId: user.organizationId }, select: { id: true } })
    : null
  // Menutup satu kartu transfer sekaligus menutup duplikat versi lama.
  await prisma.alert.updateMany({
    where: transfer
      ? { organizationId: user.organizationId, referenceId: transfer.id, type: { in: [...TRANSFER_NOTIFICATION_TYPES] } }
      : { id: alert.id, organizationId: user.organizationId },
    data: { isResolved: true, resolvedAt: new Date(), resolvedById: user.id },
  })
  return ok({ message: "Alert diselesaikan" })
}
