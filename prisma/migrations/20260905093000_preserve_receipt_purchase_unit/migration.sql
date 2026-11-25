-- Keep sufficient precision for base-unit HPP when one package does not divide evenly.
ALTER TABLE "InventoryItem"
  ALTER COLUMN "costPrice" TYPE DECIMAL(15,6);

ALTER TABLE "StockBatch"
  ALTER COLUMN "costPrice" TYPE DECIMAL(15,6);

ALTER TABLE "StockTransferBatchAllocation"
  ALTER COLUMN "costPrice" TYPE DECIMAL(15,6);

ALTER TABLE "GoodsReceiptItem"
  ALTER COLUMN "costPrice" TYPE DECIMAL(15,6),
  ADD COLUMN "purchaseQuantity" DECIMAL(15,3),
  ADD COLUMN "purchaseUnit" TEXT,
  ADD COLUMN "purchaseUnitCost" DECIMAL(15,2),
  ADD COLUMN "lineTotal" DECIMAL(15,2),
  ADD COLUMN "packSizeSnapshot" INTEGER;

-- Older receipts only stored base quantity and base-unit HPP. Reconstruct package
-- purchases when the quantity is an exact package multiple. Purchase prices in
-- the UI were whole rupiah, so rounding the reconstructed package price removes
-- historical one-rupiah drift such as 700,001 instead of 700,000.
UPDATE "GoodsReceiptItem" AS receipt_item
SET
  "purchaseQuantity" = CASE
    WHEN inventory_item."packSize" IS NOT NULL
      AND inventory_item."packSize" > 0
      AND inventory_item."packUnit" IS NOT NULL
      AND MOD(receipt_item."quantity", inventory_item."packSize") = 0
    THEN receipt_item."quantity" / inventory_item."packSize"
    ELSE receipt_item."quantity"
  END,
  "purchaseUnit" = CASE
    WHEN inventory_item."packSize" IS NOT NULL
      AND inventory_item."packSize" > 0
      AND inventory_item."packUnit" IS NOT NULL
      AND MOD(receipt_item."quantity", inventory_item."packSize") = 0
    THEN inventory_item."packUnit"
    ELSE inventory_item."unit"
  END,
  "purchaseUnitCost" = CASE
    WHEN receipt_item."costPrice" IS NULL THEN NULL
    WHEN inventory_item."packSize" IS NOT NULL
      AND inventory_item."packSize" > 0
      AND inventory_item."packUnit" IS NOT NULL
      AND MOD(receipt_item."quantity", inventory_item."packSize") = 0
    THEN ROUND(receipt_item."costPrice" * inventory_item."packSize", 0)
    ELSE ROUND(receipt_item."costPrice", 2)
  END,
  "lineTotal" = CASE
    WHEN receipt_item."costPrice" IS NULL THEN NULL
    WHEN inventory_item."packSize" IS NOT NULL
      AND inventory_item."packSize" > 0
      AND inventory_item."packUnit" IS NOT NULL
      AND MOD(receipt_item."quantity", inventory_item."packSize") = 0
    THEN ROUND(
      (receipt_item."quantity" / inventory_item."packSize")
      * ROUND(receipt_item."costPrice" * inventory_item."packSize", 0),
      2
    )
    ELSE ROUND(receipt_item."quantity" * receipt_item."costPrice", 2)
  END,
  "packSizeSnapshot" = CASE
    WHEN inventory_item."packSize" IS NOT NULL
      AND inventory_item."packSize" > 0
      AND inventory_item."packUnit" IS NOT NULL
      AND MOD(receipt_item."quantity", inventory_item."packSize") = 0
    THEN inventory_item."packSize"
    ELSE NULL
  END
FROM "InventoryItem" AS inventory_item
WHERE inventory_item."id" = receipt_item."itemId";

ALTER TABLE "GoodsReceiptItem"
  ALTER COLUMN "purchaseQuantity" SET NOT NULL,
  ALTER COLUMN "purchaseUnit" SET NOT NULL;
