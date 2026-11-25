import "server-only"
import { Prisma } from "@prisma/client"

export const warehousePurchaseRoles = ["OWNER", "SUPERVISOR", "ADMIN_GUDANG"]

// Reused by the mixed feed and the form endpoint so eligibility cannot drift.
/// Stok yang sudah dijanjikan ke transfer yang disetujui tetapi belum
/// berangkat. Dipisah jadi potongan SQL sendiri karena dipakai di dua tempat:
/// menyaring kebutuhan, dan menampilkan angkanya.
export function reservedQuantitySql() {
  return Prisma.sql`COALESCE((SELECT SUM(r.quantity) FROM "StockReservation" r
    WHERE r."organizationId" = b."organizationId" AND r."itemId" = b."itemId"
      AND r."locationId" = b."locationId" AND r.status = 'ACTIVE'), 0)`
}

/// Kebutuhan outlet yang BELUM diterima: transfer yang masih berjalan sebesar
/// yang diminta dikurangi yang sudah diterima, ditambah sisa dari transfer yang
/// sudah selesai tetapi belum memenuhi permintaan penuh.
export function outletOutstandingSql() {
  return Prisma.sql`(COALESCE((SELECT SUM(COALESCE(ti."requestedQuantity", ti.quantity) - COALESCE(ti."receivedQty", 0))
    FROM "StockTransferItem" ti JOIN "StockTransfer" t ON t.id = ti."transferId"
    WHERE t."organizationId" = b."organizationId" AND t."fromLocationId" = b."locationId"
      AND ti."itemId" = b."itemId" AND t.status IN ('PENDING', 'APPROVED', 'SENT')), 0)
  + COALESCE((SELECT SUM(ti."outstandingQty")
    FROM "StockTransferItem" ti JOIN "StockTransfer" t ON t.id = ti."transferId"
    WHERE t."organizationId" = b."organizationId" AND t."fromLocationId" = b."locationId"
      AND ti."itemId" = b."itemId" AND t.status = 'RECEIVED' AND ti."outstandingQty" > 0), 0))`
}

/// Bagian kebutuhan yang sudah punya alokasi: direservasi (APPROVED) atau
/// sudah berangkat tetapi belum diterima (SENT). PENDING belum tercakup apa
/// pun, dan transfer yang sudah diterima tidak lagi membawa barang di jalan.
export function coveredSql() {
  return Prisma.sql`COALESCE((SELECT SUM(ti.quantity - COALESCE(ti."receivedQty", 0))
    FROM "StockTransferItem" ti JOIN "StockTransfer" t ON t.id = ti."transferId"
    WHERE t."organizationId" = b."organizationId" AND t."fromLocationId" = b."locationId"
      AND ti."itemId" = b."itemId" AND t.status IN ('APPROVED', 'SENT')), 0)`
}

/**
 * Kekurangan yang benar-benar perlu DIBELI.
 *
 * Kebutuhan outlet yang belum dialokasikan belum tentu perlu dibeli: gudang
 * mungkin masih punya stoknya. Yang perlu dibeli hanyalah sisa setelah stok
 * tersedia ikut diperhitungkan.
 *
 *   kekurangan = kebutuhan outlet − sudah dialokasikan − stok tersedia
 */
export function shortfallSql() {
  return Prisma.sql`GREATEST(
    ${outletOutstandingSql()} - ${coveredSql()} - (b.quantity - ${reservedQuantitySql()}), 0)`
}

export function warehouseNeedSource(organizationId: string, locationIds: string[] | null, allowed: boolean) {
  return Prisma.sql`
    FROM "StockBalance" b
    JOIN "Location" l ON l.id = b."locationId" AND l."organizationId" = b."organizationId"
    JOIN "InventoryItem" i ON i.id = b."itemId" AND i."organizationId" = b."organizationId"
    LEFT JOIN "InventoryLocationSetting" s ON s."organizationId" = b."organizationId"
      AND s."itemId" = b."itemId" AND s."locationId" = b."locationId"
    WHERE b."organizationId" = ${organizationId} AND l.type = 'WAREHOUSE' AND l."isActive"
      -- Dua sebab kebutuhan pembelian muncul:
      --
      -- (1) stok TERSEDIA menyentuh ambang gudang. Tersedia, bukan fisik:
      --     stok 30 yang seluruhnya sudah direservasi berarti tersedia 0.
      -- (2) ada kebutuhan outlet yang belum tercakup stok mana pun. Sebab ini
      --     berlaku walau ambang gudangnya belum pernah diatur — kebutuhan
      --     yang sudah nyata tidak boleh hilang hanya karena pengaturan lupa
      --     diisi.
      -- (3) stok FISIK habis (≤ 0) untuk bahan yang sudah dipetakan ke
      --     supplier di gudang ini, walau ambang belum diatur.
      --
      -- (1) dan (3) memakai stok FISIK: stok yang baru dikunci (disetujui,
      -- belum "Kirim") belum memicu pembelian. Pembelian baru perlu setelah
      -- barang benar-benar keluar dari gudang.
      AND (
        (s."minStock" IS NOT NULL AND b.quantity <= s."minStock")
        OR ${shortfallSql()} > 0
        OR (b.quantity <= 0 AND EXISTS (
          SELECT 1 FROM "ItemSupplier" m WHERE m."organizationId" = b."organizationId"
            AND m."itemId" = b."itemId" AND m."locationId" = b."locationId"))
      )
      ${allowed ? Prisma.empty : Prisma.sql`AND FALSE`}
      ${locationIds === null ? Prisma.empty : locationIds.length ? Prisma.sql`AND b."locationId" IN (${Prisma.join(locationIds)})` : Prisma.sql`AND FALSE`}
      AND NOT EXISTS (SELECT 1 FROM "PurchaseRequest" pr WHERE pr."organizationId" = b."organizationId"
        AND pr."itemId" = b."itemId" AND pr."locationId" = b."locationId" AND pr.status = 'ACTIVE')`
}

export function warehouseNeedFields() {
  return Prisma.sql`b.id, b."itemId", b."locationId", i.name AS "itemName", i.unit,
    i."packSize", i."packUnit", l.name AS "warehouseName", b.quantity::double precision AS quantity,
    ${reservedQuantitySql()}::double precision AS "reservedQuantity",
    (b.quantity - ${reservedQuantitySql()})::double precision AS "availableQuantity",
    -- Kebutuhan outlet dipecah tiga, karena yang layak jadi pertimbangan
    -- pembelian hanya yang BELUM punya alokasi. Kalau yang sudah direservasi
    -- ikut dihitung, sistem menyarankan membeli barang yang sebenarnya sudah
    -- tersedia di gudang ini juga.
    ${outletOutstandingSql()}::double precision AS "outletOutstandingQuantity",
    ${coveredSql()}::double precision AS "coveredQuantity",
    GREATEST(${outletOutstandingSql()} - ${coveredSql()}, 0)::double precision
      AS "uncoveredDemandQuantity",
    ${shortfallSql()}::double precision AS "shortfallQuantity",
    COALESCE((SELECT SUM(pr.quantity - pr."receivedQuantity") FROM "PurchaseRequest" pr
      WHERE pr."organizationId" = b."organizationId" AND pr."itemId" = b."itemId"
        AND pr."locationId" = b."locationId" AND pr.status = 'ACTIVE'), 0)::double precision
      AS "onOrderQuantity",
    s."minStock", (s."minStock" IS NOT NULL) AS "thresholdConfigured",
    b."updatedAt" AS "stockUpdatedAt",
    (SELECT al."createdAt" FROM "Alert" al WHERE al."organizationId" = b."organizationId"
      AND al."itemId" = b."itemId" AND al."locationId" = b."locationId" AND al.type = 'LOW_STOCK'
      AND NOT al."isResolved" ORDER BY al."createdAt" DESC, al.id DESC LIMIT 1) AS "alertCreatedAt",
    -- Supplier prioritas #1 beserta nama & satuan beli versi supplier (pemetaan).
    (SELECT json_build_object('id', sup.id, 'name', sup.name, 'phone', sup.phone,
        'supplierItemName', mapping."supplierItemName", 'purchaseUnit', mapping."purchaseUnit",
        'purchaseUnitSize', mapping."purchaseUnitSize") FROM "ItemSupplier" mapping
      JOIN "Supplier" sup ON sup.id = mapping."supplierId" AND sup."organizationId" = b."organizationId"
      WHERE mapping."organizationId" = b."organizationId" AND mapping."itemId" = b."itemId"
        AND mapping."locationId" = b."locationId" AND sup."isActive" AND sup.phone IS NOT NULL
      ORDER BY mapping.priority ASC, mapping.id ASC LIMIT 1) AS supplier`
}
