import { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"
import { continueOutstandingNeeds } from "@/lib/transfer-flow"
import { parseTransferQuantity } from "@/lib/transfer-quantity"
import { convertToBase } from "@/lib/unit-conversion"
import { consumeNeedLinks, NeedLinkExpired, requireUnusedNeedLink } from "@/lib/need-action-link"
import { isiKebutuhanBanyakBahan } from "@/lib/outlet-replenishment"
import { enqueueWarehouseNotification } from "@/lib/replenishment"
import { scheduleOutboxDelivery } from "@/lib/whatsapp-outbox"

// PIC outlet mengisi jumlah kebutuhan. Gudang baru menentukan jumlah kirim
// ketika meninjau transfer PENDING yang dibuat dari formulir ini.
const outletNeedRoles = ["OWNER", "SUPERVISOR"]
const warehouseRoles = ["OWNER", "SUPERVISOR", "ADMIN_GUDANG"]

/**
 * Kebutuhan outlet BARU hanya tampil setelah tautan WA-nya dibuka. Membuka
 * tautan dicatat sebagai audit OPEN_NEED_LINK pada alert stok menipisnya.
 */
function linkSudahDibukaSql() {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "Alert" al
    JOIN "AuditLog" au ON au."organizationId" = al."organizationId"
      AND au.entity = 'Alert' AND au."entityId" = al.id AND au.action = 'OPEN_NEED_LINK'
    WHERE al."organizationId" = b."organizationId" AND al."itemId" = b."itemId"
      AND al."locationId" = b."locationId" AND al.type = 'LOW_STOCK' AND NOT al."isResolved")`
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const feed = req.nextUrl.searchParams.get("feed") === "true"
  if (!warehouseRoles.includes(user.role)) return err("Tidak memiliki akses ke alur pengisian outlet", 403)
  const locations = await getAccessibleLocationIds(user)
  const params = req.nextUrl.searchParams
  const requestedPage = Number(params.get("page") ?? 1)
  const itemId = params.get("itemId")
  const outletId = params.get("outletId")
  // Form banyak bahan memuat SEMUA kebutuhan satu outlet sekaligus.
  const perPage = outletId && params.get("semua") === "true" ? 50 : 5
  // Tautan WA ringkasan: satu tautan untuk beberapa bahan di satu outlet.
  let itemIdsTautan: string[] | null = null
  if (params.has("alertIds")) {
    const alertIds = (params.get("alertIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 50)
    const outlet = await prisma.location.findFirst({
      where: { id: outletId ?? "", organizationId: user.organizationId, type: "OUTLET" },
      select: { fulfillmentWarehouseId: true },
    })
    const bolehBuka = !!outlet && await canAccessLocation(user, outletId ?? "")
    if (!outlet || !bolehBuka) return err("Tautan ini untuk penanggung jawab outlet tersebut", 403)
    const alerts = await prisma.alert.findMany({
      where: { id: { in: alertIds }, organizationId: user.organizationId, type: "LOW_STOCK", locationId: outletId! },
      select: { id: true, itemId: true },
    })
    itemIdsTautan = []
    for (const alert of alerts) {
      if (!alert.itemId) continue
      // Bahan yang tautannya sudah dipakai (sudah diisi orang lain) dilewati.
      try { await requireUnusedNeedLink(prisma, user.organizationId, alert.itemId, outletId!, alert.id) } catch { continue }
      itemIdsTautan.push(alert.itemId)
      const sudahDicatat = await prisma.auditLog.findFirst({
        where: { organizationId: user.organizationId, entity: "Alert", entityId: alert.id, action: "OPEN_NEED_LINK" },
        select: { id: true },
      })
      if (!sudahDicatat) {
        await prisma.auditLog.create({ data: {
          organizationId: user.organizationId, userId: user.id,
          action: "OPEN_NEED_LINK", entity: "Alert", entityId: alert.id,
          after: { itemId: alert.itemId, outletId },
        } })
      }
    }
    if (itemIdsTautan.length === 0) return err(new NeedLinkExpired().message, 410)
  } else if (params.has("alertId") || params.get("fromLink") === "true") {
    try { await requireUnusedNeedLink(prisma, user.organizationId, itemId ?? "", outletId ?? "", params.get("alertId")) }
    catch { return err(new NeedLinkExpired().message, 410) }
    // Tautan valid dibuka oleh PIC outlet: catat sekali agar formulir tampil.
    const alertId = params.get("alertId")!
    const outlet = await prisma.location.findFirst({
      where: { id: outletId ?? "", organizationId: user.organizationId, type: "OUTLET" },
      select: { fulfillmentWarehouseId: true },
    })
    const bolehBuka = !!outlet && await canAccessLocation(user, outletId ?? "")
    if (!bolehBuka) return err("Tautan ini untuk penanggung jawab outlet tersebut", 403)
    const sudahDicatat = await prisma.auditLog.findFirst({
      where: { organizationId: user.organizationId, entity: "Alert", entityId: alertId, action: "OPEN_NEED_LINK" },
      select: { id: true },
    })
    if (!sudahDicatat) {
      await prisma.auditLog.create({ data: {
        organizationId: user.organizationId, userId: user.id,
        action: "OPEN_NEED_LINK", entity: "Alert", entityId: alertId,
        after: { itemId, outletId },
      } })
    }
  }
  const unsubmittedOnly = feed || params.get("unsubmitted") === "true"
  // Sisa kebutuhan dari transfer sebagian yang sudah diterima: diminta 18,
  // diterima baik 15, sisa 3. Belum digantikan permintaan baru selama
  // outstandingQty-nya masih di atas 0.
  const sisaKebutuhan = Prisma.sql`COALESCE((SELECT SUM(ti."outstandingQty")
    FROM "StockTransferItem" ti JOIN "StockTransfer" tr ON tr.id = ti."transferId"
    WHERE tr."organizationId" = b."organizationId" AND tr."toLocationId" = b."locationId"
      AND ti."itemId" = b."itemId" AND tr.status = 'RECEIVED' AND ti."outstandingQty" > 0), 0)`
  // Compare the balance against its own location's threshold in SQL, before
  // pagination. Only the current page and its active-transfer links are loaded.
  const source = Prisma.sql`
    FROM "StockBalance" b
    JOIN "Location" l ON l.id = b."locationId" AND l."organizationId" = b."organizationId"
    JOIN "InventoryItem" i ON i.id = b."itemId" AND i."organizationId" = b."organizationId"
    JOIN "InventoryLocationSetting" s ON s."organizationId" = b."organizationId"
      AND s."itemId" = b."itemId" AND s."locationId" = b."locationId"
    WHERE b."organizationId" = ${user.organizationId} AND l.type = 'OUTLET' AND l."isActive"
      -- Menyentuh ambang sudah berstatus Menipis, sehingga tautan WA harus
      -- langsung dapat membuka formulir pengiriman.
      AND s."minStock" IS NOT NULL AND (b.quantity <= s."minStock" OR ${sisaKebutuhan} > 0)
      -- Sisa kebutuhan yang sudah berjalan selalu tampil; kebutuhan baru hanya
      -- setelah tautan WA-nya dibuka.
      AND (${sisaKebutuhan} > 0 OR ${linkSudahDibukaSql()})
      AND NOT EXISTS (
        SELECT 1 FROM "StockTransfer" rejected
        WHERE rejected."organizationId" = b."organizationId" AND rejected."toLocationId" = b."locationId"
          AND rejected."fromLocationId" = l."fulfillmentWarehouseId" AND rejected.status = 'REJECTED'
          AND rejected."needRejectionSnapshot"->>'itemId' = b."itemId"
          AND (rejected."needRejectionSnapshot"->>'stockUpdatedAt')::timestamptz = date_trunc('milliseconds', b."updatedAt") AT TIME ZONE 'UTC'
          AND (rejected."needRejectionSnapshot"->>'minStock')::int = s."minStock"
      )
      ${unsubmittedOnly ? Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM "StockTransfer" tr
        JOIN "StockTransferItem" ti ON ti."transferId" = tr.id
        WHERE tr."organizationId" = b."organizationId" AND tr."toLocationId" = b."locationId"
          AND ti."itemId" = b."itemId" AND tr.status IN ('PENDING', 'APPROVED', 'SENT')
          AND NOT (tr."autoReplenishment" AND NOT tr."outletRequested" AND tr.status = 'PENDING')
      )` : Prisma.empty}
      -- Daftar kebutuhan hanya dilihat oleh PIC outlet terkait.
      ${!outletNeedRoles.includes(user.role) ? Prisma.sql`AND FALSE`
        : locations === null ? Prisma.empty
        : locations.length ? Prisma.sql`AND b."locationId" IN (${Prisma.join(locations)})`
        : Prisma.sql`AND FALSE`}
      ${itemId ? Prisma.sql`AND b."itemId" = ${itemId}` : Prisma.empty}
      ${itemIdsTautan ? Prisma.sql`AND b."itemId" IN (${Prisma.join(itemIdsTautan)})` : Prisma.empty}
      ${outletId ? Prisma.sql`AND b."locationId" = ${outletId}` : Prisma.empty}`
  const result = await prisma.$transaction(async (tx) => {
    // Sort both kinds together BEFORE applying the page limit. Never fetch all
    // rows or sort two independently paginated lists in the browser.
    const feedSource = Prisma.sql`
      SELECT 'need' AS kind, 1 AS prioritas, b.id AS id, b."itemId", b."locationId",
        COALESCE((SELECT al."createdAt" FROM "Alert" al
          WHERE al."organizationId" = b."organizationId" AND al."itemId" = b."itemId"
            AND al."locationId" = b."locationId" AND al.type = 'LOW_STOCK' AND NOT al."isResolved"
          ORDER BY al."createdAt" DESC, al.id DESC LIMIT 1), b."updatedAt") AS "sortAt"
      ${source}
      UNION ALL
      SELECT 'transfer' AS kind, 3 AS prioritas, tr.id, NULL AS "itemId", NULL AS "locationId", tr."createdAt" AS "sortAt"
      FROM "StockTransfer" tr
      WHERE tr."organizationId" = ${user.organizationId} AND tr.status IN ('PENDING', 'APPROVED', 'SENT')
        ${locations === null ? Prisma.empty : locations.length ? Prisma.sql`AND (tr."fromLocationId" IN (${Prisma.join(locations)}) OR tr."toLocationId" IN (${Prisma.join(locations)}))` : Prisma.sql`AND FALSE`}`
    const [count] = await tx.$queryRaw<{ total: number }[]>(feed
      ? Prisma.sql`SELECT COUNT(*)::int AS total FROM (${feedSource}) combined`
      : Prisma.sql`SELECT COUNT(*)::int AS total ${source}`)
    const total = count.total
    const pages = Math.max(1, Math.ceil(total / perPage))
    const page = Math.min(pages, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1)
    const order = feed ? await tx.$queryRaw<{ kind: "need" | "transfer"; prioritas: number; id: string; itemId: string | null; locationId: string | null; sortAt: Date }[]>(Prisma.sql`
      -- Diurutkan dari kejadian TERBARU (permintaan/peringatan/transfer paling
      -- akhir di atas), apa pun jenis kartunya.
      SELECT * FROM (${feedSource}) combined ORDER BY "sortAt" DESC, id DESC, kind ASC
      LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`) : []
    const needPairs = order.filter((row) => row.kind === "need")
    const items = await tx.$queryRaw(Prisma.sql`
      WITH needs AS (
        SELECT b."itemId", b."locationId", i.name AS "itemName", i.unit, i."packSize", i."packUnit", l.name AS "outletName",
          b.quantity::double precision AS quantity, s."minStock", l."fulfillmentWarehouseId",
          ${sisaKebutuhan}::double precision AS "outstandingQuantity",
          CASE WHEN ${sisaKebutuhan} > 0 THEN 'OUTSTANDING_NEED' ELSE 'NEW_NEED' END AS kind,
          b."updatedAt" AS "stockUpdatedAt"
        ${source}
        ${feed ? needPairs.length ? Prisma.sql`AND (${Prisma.join(needPairs.map((row) => Prisma.sql`(b."itemId" = ${row.itemId} AND b."locationId" = ${row.locationId})`), " OR ")})` : Prisma.sql`AND FALSE`
          : Prisma.sql`ORDER BY i.name, l.name, b.id LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`}
      )
      SELECT n."itemId", n."locationId", n."itemName", n.unit, n."packSize", n."packUnit", n."outletName", n.quantity, n."minStock",
        n."outstandingQuantity", n.kind, n."stockUpdatedAt", a."createdAt" AS "alertCreatedAt",
        w.id AS "warehouseId", w.name AS "warehouseName",
        CASE WHEN w.id IS NULL THEN NULL ELSE COALESCE(wb.quantity, 0)::double precision END AS "warehouseQuantity",
        -- Yang BOLEH dikirim: stok gudang dikurangi yang sudah direservasi transfer lain.
        CASE WHEN w.id IS NULL THEN NULL ELSE GREATEST(COALESCE(wb.quantity, 0) - COALESCE((
          SELECT SUM(r.quantity) FROM "StockReservation" r
          WHERE r."organizationId" = ${user.organizationId} AND r."locationId" = w.id
            AND r."itemId" = n."itemId" AND r.status = 'ACTIVE'), 0), 0)::double precision END AS "warehouseAvailable",
        COALESCE((SELECT SUM(pr.quantity - pr."receivedQuantity") FROM "PurchaseRequest" pr
          WHERE pr."organizationId" = ${user.organizationId} AND pr."locationId" = w.id
            AND pr."itemId" = n."itemId" AND pr.status = 'ACTIVE'), 0)::double precision AS "onOrderQuantity",
        CASE WHEN t.legacy THEN NULL ELSE t.id END AS "activeTransferId",
        COALESCE(t.legacy, false) AS "needsConfirmation"
      FROM needs n
      LEFT JOIN "Location" w ON w.id = n."fulfillmentWarehouseId" AND w."isActive"
        AND w."organizationId" = ${user.organizationId} AND w.type = 'WAREHOUSE'
      LEFT JOIN "StockBalance" wb ON wb."organizationId" = ${user.organizationId}
        AND wb."locationId" = w.id AND wb."itemId" = n."itemId"
      LEFT JOIN LATERAL (
        SELECT al."createdAt" FROM "Alert" al
        WHERE al."organizationId" = ${user.organizationId} AND al."itemId" = n."itemId"
          AND al."locationId" = n."locationId" AND al.type = 'LOW_STOCK' AND NOT al."isResolved"
        ORDER BY al."createdAt" DESC, al.id DESC LIMIT 1
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT tr.id, (tr."autoReplenishment" AND NOT tr."outletRequested" AND tr.status = 'PENDING') AS legacy
        FROM "StockTransfer" tr
        WHERE tr."organizationId" = ${user.organizationId} AND tr."toLocationId" = n."locationId"
          AND tr.status IN ('PENDING', 'APPROVED', 'SENT')
          AND EXISTS (SELECT 1 FROM "StockTransferItem" ti WHERE ti."transferId" = tr.id AND ti."itemId" = n."itemId")
        ORDER BY tr."createdAt", tr.id LIMIT 1
      ) t ON true
      ORDER BY n."itemName", n."outletName", n."itemId", n."locationId"`)
    if (!feed) return { items, total, page, pages, perPage }
    const transfers = await tx.stockTransfer.findMany({
      where: { organizationId: user.organizationId, id: { in: order.filter((row) => row.kind === "transfer").map((row) => row.id) } },
      include: { fromLocation: true, toLocation: true, items: { include: { item: true } } },
    })
    const pending = transfers.filter((transfer) => transfer.status === "PENDING")
    const balances = pending.length ? await tx.stockBalance.findMany({
      where: { organizationId: user.organizationId, OR: pending.map((transfer) => ({ locationId: transfer.fromLocationId, itemId: { in: transfer.items.map((item) => item.itemId) } })) },
      select: { locationId: true, itemId: true, quantity: true },
    }) : []
    const grouped = await tx.stockTransfer.groupBy({ by: ["status"],
      where: { organizationId: user.organizationId, ...(locations !== null ? { OR: [{ fromLocationId: { in: locations } }, { toLocationId: { in: locations } }] } : {}) },
      _count: { _all: true },
    })
    return { items, total, page, pages, perPage, order,
      statusCounts: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
      transfers: transfers.map((transfer) => ({ ...transfer, items: transfer.items.map((item) => ({ ...item,
        sourceQuantity: transfer.status === "PENDING" ? Number(balances.find((balance) => balance.locationId === transfer.fromLocationId && balance.itemId === item.itemId)?.quantity ?? 0) : null,
      })) })),
    }
  }, { isolationLevel: "RepeatableRead" })
  return ok(result)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const body = await req.json().catch(() => null)

  if (body?.action === "continue_outstanding") {
    if (!warehouseRoles.includes(user.role)) return err("Hanya penanggung jawab gudang yang dapat membuat pengiriman lanjutan", 403)
    const forbidden = await denyUnlessCanEdit(user, "TRANSFER")
    if (forbidden) return forbidden
    const locationId = typeof body?.locationId === "string" ? body.locationId : ""
    const itemId = typeof body?.itemId === "string" ? body.itemId : ""
    if (!locationId || !itemId) return err("Outlet dan bahan wajib diisi")
    const outlet = await prisma.location.findFirst({
      where: { id: locationId, organizationId: user.organizationId, type: "OUTLET", isActive: true },
      select: { fulfillmentWarehouseId: true },
    })
    if (!outlet?.fulfillmentWarehouseId) return err("Outlet belum memiliki gudang pemenuhan")
    if (!(await canAccessLocation(user, outlet.fulfillmentWarehouseId))) return err("Tidak ada akses ke gudang pemasok outlet ini", 403)
    const dibuat = await prisma.$transaction((tx) => continueOutstandingNeeds(tx, {
      organizationId: user.organizationId,
      warehouseId: outlet.fulfillmentWarehouseId!,
      outletId: locationId,
      itemId,
      userId: user.id,
    }))
    if (dibuat.length === 0) return err("Stok gudang belum tersedia atau pengiriman lanjutan sudah aktif. Muat ulang daftar.", 409)
    return ok({
      transferIds: dibuat.map((row) => row.transferId),
      quantity: dibuat.reduce((total, row) => total + row.quantity, 0),
      message: "Pengiriman lanjutan dibuat. Tinjau jumlahnya, lalu setujui dan kirim dari kartu transfer.",
    })
  }

  if (!outletNeedRoles.includes(user.role)) return err("Hanya penanggung jawab outlet yang dapat mengisi kebutuhan outlet", 403)
  const forbidden = await denyUnlessCanEdit(user, "TRANSFER")
  if (forbidden) return forbidden
  if (Array.isArray(body?.lines) && body?.action !== "reject") return simpanBanyakBahan(user, body)

  const rejecting = body?.action === "reject"
  const locationId = typeof body?.locationId === "string" ? body.locationId : ""
  const itemId = typeof body?.itemId === "string" ? body.itemId : ""
  const enteredQuantity = parseTransferQuantity(body?.quantity)
  const inputUnit = body?.inputUnit ?? "base"
  const notes = typeof body?.notes === "string" ? body.notes.trim() : ""
  if (!locationId || !itemId || (!rejecting && enteredQuantity == null)) return err("Jumlah kebutuhan harus lebih dari 0, maksimal 3 angka desimal")
  if (inputUnit !== "base" && inputUnit !== "pack") return err("Satuan kebutuhan tidak valid")
  if (notes.length > 500 || (rejecting && !notes)) return err(rejecting ? "Isi alasan penolakan, maksimal 500 karakter" : "Catatan maksimal 500 karakter")

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Menahan pengajuan ganda untuk bahan dan outlet yang sama.
      await tx.$queryRaw`SELECT id FROM "StockBalance" WHERE "organizationId" = ${user.organizationId} AND "itemId" = ${itemId} AND "locationId" = ${locationId} FOR UPDATE`
      if (body?.fromLink || body?.alertId) await requireUnusedNeedLink(tx, user.organizationId, itemId, locationId, body.alertId)
      const balance = await tx.stockBalance.findFirst({
        where: { organizationId: user.organizationId, itemId, locationId },
        include: { item: { include: { locationSettings: { where: { locationId } } } },
          location: { include: { fulfillmentWarehouse: true } } },
      })
      if (!balance || balance.location.type !== "OUTLET" || !balance.location.isActive) throw new Error("Outlet atau bahan tidak valid")
      if (!(await canAccessLocation(user, locationId))) throw new Error("Tidak ada akses ke outlet ini")

      const minimum = balance.item.locationSettings[0]?.minStock
      if (minimum == null || Number(balance.quantity) > Number(minimum)) throw new Error("Stok outlet sudah berada di atas ambang minimum. Muat ulang data kebutuhan.")
      const warehouse = balance.location.fulfillmentWarehouse
      if (!warehouse?.isActive || warehouse.organizationId !== user.organizationId || warehouse.type !== "WAREHOUSE") throw new Error("Pasangkan gudang pemenuhan melalui Manajemen → Outlet terlebih dahulu")

      const existing = await tx.stockTransfer.findFirst({
        where: { organizationId: user.organizationId, toLocationId: locationId,
          status: { in: ["PENDING", "APPROVED", "SENT"] }, items: { some: { itemId } } },
        include: { items: true },
      })
      const legacy = existing?.autoReplenishment && !existing.outletRequested && existing.status === "PENDING"
      if (existing && !legacy) throw new Error("Permintaan bahan ini masih aktif. Tunggu penerimaan atau penolakan sebelum membuat permintaan baru.")
      if (legacy && existing.items.length !== 1) throw new Error("Permintaan lama memiliki beberapa bahan. Tinjau permintaan tersebut terlebih dahulu.")

      const snapshot = { itemId, stockUpdatedAt: balance.updatedAt.toISOString(), minStock: Number(minimum) }
      if (rejecting) {
        const rejectionData = { status: "REJECTED" as const, approvedById: user.id, approvedAt: new Date(),
          approvalNotes: notes, needRejectionSnapshot: snapshot, notificationStatus: null }
        const rejected = legacy
          ? (await tx.stockTransfer.update({ where: { id: existing.id }, data: rejectionData, select: { id: true } }))
          : await tx.stockTransfer.create({ data: { ...rejectionData, organizationId: user.organizationId,
              fromLocationId: warehouse.id, toLocationId: locationId, autoReplenishment: true, outletRequested: false,
              createdById: user.id, notes, items: { create: { itemId, quantity: 0, requestedQuantity: null } } },
            select: { id: true } })
        await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id,
          action: "REJECT_OUTLET_NEED", entity: "StockTransfer", entityId: rejected.id,
          after: { ...snapshot, notes, requestedQuantity: null } } })
        await consumeNeedLinks(tx, user.organizationId, user.id, itemId, locationId, rejected.id)
        return { id: rejected.id, rejected: true, notificationQueued: false }
      }

      const quantity = parseTransferQuantity(convertToBase(balance.item, enteredQuantity, inputUnit).baseQuantity)
      if (quantity == null) throw new Error("Jumlah dalam satuan dasar melebihi batas yang dapat disimpan")

      // Keputusan mengirim formulir dibuat dari stok yang benar-benar tersedia.
      // Server memeriksanya lagi saat PIC outlet mengirim formulir karena stok
      // bisa berubah setelah pesan WhatsApp diterima.
      await tx.stockBalance.upsert({ where: { itemId_locationId: { itemId, locationId: warehouse.id } },
        create: { organizationId: user.organizationId, itemId, locationId: warehouse.id, quantity: 0 }, update: {} })
      await tx.$queryRaw`SELECT id FROM "StockBalance" WHERE "organizationId" = ${user.organizationId} AND "itemId" = ${itemId} AND "locationId" = ${warehouse.id} FOR UPDATE`
      const warehouseBalance = await tx.stockBalance.findUnique({
        where: { itemId_locationId: { itemId, locationId: warehouse.id } }, select: { quantity: true },
      })
      const reserved = await tx.stockReservation.aggregate({
        where: { organizationId: user.organizationId, locationId: warehouse.id, itemId, status: "ACTIVE" },
        _sum: { quantity: true },
      })
      const available = Math.max(0, Number(warehouseBalance?.quantity ?? 0) - Number(reserved._sum.quantity ?? 0))
      if (available <= 0) throw new Error("Stok gudang yang tersedia sudah habis. Permintaan tidak dibuat; muat ulang halaman.")

      const data = { fromLocationId: warehouse.id, notes: notes || null, createdById: user.id,
        outletRequested: true, autoReplenishment: true, status: "PENDING" as const,
        notificationStatus: "PENDING" as const, notificationError: null, notificationSentAt: null, notificationMessageId: null }
      let transfer: { id: string }
      if (legacy) {
        transfer = await tx.stockTransfer.update({ where: { id: existing.id }, data, select: { id: true } })
        await tx.stockTransferItem.update({ where: { id: existing.items[0].id }, data: { quantity, requestedQuantity: quantity } })
      } else {
        transfer = await tx.stockTransfer.create({ data: { ...data, organizationId: user.organizationId,
          toLocationId: locationId, items: { create: { itemId, quantity, requestedQuantity: quantity } } }, select: { id: true } })
      }
      await tx.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id,
        action: "REQUEST_OUTLET_REPLENISHMENT", entity: "StockTransfer", entityId: transfer.id,
        before: legacy ? { previousEstimatedQuantity: Number(existing.items[0].quantity) } : undefined,
        after: { itemId, locationId, requestedQuantity: quantity, enteredQuantity,
          inputUnit: inputUnit === "pack" ? balance.item.packUnit : balance.item.unit, notes, warehouseAvailableAtRequest: available } } })
      await tx.stockTransferItem.updateMany({
        where: { itemId, outstandingQty: { gt: 0 }, transfer: { organizationId: user.organizationId, toLocationId: locationId, status: "RECEIVED" } },
        data: { outstandingQty: 0 },
      })
      await consumeNeedLinks(tx, user.organizationId, user.id, itemId, locationId, transfer.id)
      const notificationQueued = await enqueueWarehouseNotification(tx, transfer.id, user.organizationId)
      return { id: transfer.id, requested: true, notificationQueued }
    })
    if (result.notificationQueued) scheduleOutboxDelivery()
    return ok(result, 201)
  } catch (error) {
    if (error instanceof NeedLinkExpired) return err(error.message, 410)
    if (error instanceof Prisma.PrismaClientValidationError) {
      console.error("Outlet replenishment client schema mismatch", error)
      return err("Layanan kebutuhan belum siap. Silakan coba lagi setelah server diperbarui.", 500)
    }
    if (error instanceof Error && !("code" in error)) return err(error.message, 409)
    console.error("Outlet replenishment request failed", error)
    return err("Gagal menyimpan permintaan outlet", 500)
  }
}

type Pengguna = Exclude<Awaited<ReturnType<typeof requireAuth>>, Response>

async function simpanBanyakBahan(user: Pengguna, body: Record<string, unknown>) {
  try {
    const result = await isiKebutuhanBanyakBahan(user, body)
    if (result.notificationQueued) scheduleOutboxDelivery()
    return ok(result, 201)
  } catch (error) {
    if (error instanceof NeedLinkExpired) return err(error.message, 410)
    if (error instanceof Error && !("code" in error)) return err(error.message, 409)
    console.error("Outlet replenishment (banyak bahan) failed", error)
    return err("Gagal menyimpan permintaan outlet", 500)
  }
}
