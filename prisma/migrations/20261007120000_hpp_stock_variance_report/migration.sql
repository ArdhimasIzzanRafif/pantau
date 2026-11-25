-- Simpan snapshot HPP transaksi agar laporan historis tidak berubah saat harga bahan diperbarui.
ALTER TABLE "POSOrder"
ADD COLUMN "cogsAmount" DECIMAL(15,2),
ADD COLUMN "cogsComplete" BOOLEAN NOT NULL DEFAULT false;

-- Simpan snapshot nilai selisih opname untuk stok kurang maupun stok lebih.
ALTER TABLE "StockOpnameItem"
ADD COLUMN "unitCostSnapshot" DECIMAL(15,6),
ADD COLUMN "absoluteVarianceValue" DECIMAL(15,2);

-- Data opname lama diestimasi memakai harga bahan yang tersedia saat migrasi.
UPDATE "StockOpnameItem" AS soi
SET
  "unitCostSnapshot" = ii."costPrice",
  "absoluteVarianceValue" = ROUND(ABS(soi."difference") * COALESCE(ii."costPrice", 0), 2)
FROM "InventoryItem" AS ii
WHERE ii."id" = soi."itemId"
  AND soi."difference" IS NOT NULL;

-- Data transaksi lama diestimasi dari movement POS dan harga batch. Status
-- cogsComplete sengaja tetap false agar UI memberi tahu owner bahwa angka lama
-- bukan snapshot resep lengkap pada saat transaksi terjadi.
WITH historical_cogs AS (
  SELECT
    sm."referenceId" AS "orderId",
    ROUND(SUM(ABS(sm."quantity") * COALESCE(sb."costPrice", ii."costPrice", 0)), 2) AS amount
  FROM "StockMovement" AS sm
  JOIN "InventoryItem" AS ii ON ii."id" = sm."itemId"
  LEFT JOIN "StockBatch" AS sb ON sb."id" = sm."batchId"
  WHERE sm."type" = 'POS_SALE'
    AND sm."quantity" < 0
    AND sm."affectsBalance" = true
    AND sm."referenceId" IS NOT NULL
  GROUP BY sm."referenceId"
)
UPDATE "POSOrder" AS po
SET "cogsAmount" = historical_cogs.amount
FROM historical_cogs
WHERE po."id" = historical_cogs."orderId"
  AND po."status" = 'PAID';
