ALTER TABLE "StockTransferItem"
  ADD COLUMN "damagedQty" DECIMAL(15,3);

-- Existing completed transfers predate condition tracking and are treated as
-- having no damaged items.
UPDATE "StockTransferItem"
SET "damagedQty" = 0
WHERE "receivedQty" IS NOT NULL;
