-- Extend immutable stock ledger classifications.
ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_RETURN';
ALTER TYPE "MovementType" ADD VALUE 'TRANSFER_VARIANCE';
ALTER TYPE "MovementType" ADD VALUE 'LOSS';
ALTER TYPE "MovementType" ADD VALUE 'COMPLIMENTARY';
ALTER TYPE "MovementType" ADD VALUE 'EXPIRED';

ALTER TYPE "OpnameStatus" ADD VALUE 'REJECTED';

-- Movement posting metadata: effectiveAt supports back-dated reconciliations,
-- while affectsBalance allows a transfer variance memo without double-posting.
ALTER TABLE "StockMovement"
ADD COLUMN "batchId" TEXT,
ADD COLUMN "affectsBalance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "effectiveAt" TIMESTAMP(3);

UPDATE "StockMovement" SET "effectiveAt" = "createdAt" WHERE "effectiveAt" IS NULL;

ALTER TABLE "StockMovement"
ALTER COLUMN "effectiveAt" SET NOT NULL,
ALTER COLUMN "effectiveAt" SET DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "StockMovement_organizationId_itemId_createdAt_idx";
DROP INDEX IF EXISTS "StockMovement_organizationId_locationId_createdAt_idx";

CREATE INDEX "StockMovement_organizationId_itemId_effectiveAt_idx"
ON "StockMovement"("organizationId", "itemId", "effectiveAt");

CREATE INDEX "StockMovement_organizationId_locationId_effectiveAt_idx"
ON "StockMovement"("organizationId", "locationId", "effectiveAt");

CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Batch / lot and expiry tracking.
ALTER TABLE "GoodsReceiptItem"
ADD COLUMN "batchNumber" TEXT,
ADD COLUMN "expiryDate" TIMESTAMP(3);

CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initialQuantity" DECIMAL(15,3) NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "costPrice" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockBatch_organizationId_itemId_locationId_batchNumber_key"
ON "StockBatch"("organizationId", "itemId", "locationId", "batchNumber");
CREATE INDEX "StockBatch_organizationId_locationId_expiryDate_idx"
ON "StockBatch"("organizationId", "locationId", "expiryDate");
CREATE INDEX "StockBatch_organizationId_itemId_quantity_idx"
ON "StockBatch"("organizationId", "itemId", "quantity");

ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GoodsReceiptItem" ADD COLUMN "batchId" TEXT;
CREATE INDEX "GoodsReceiptItem_batchId_idx" ON "GoodsReceiptItem"("batchId");
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Explicit operational losses and complimentary usage.
CREATE TYPE "AdjustmentType" AS ENUM ('WASTE', 'DAMAGE', 'LOSS', 'COMPLIMENTARY', 'EXPIRED');

CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unitCost" DECIMAL(15,2),
    "totalCost" DECIMAL(15,2),
    "note" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "batchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockAdjustment_organizationId_locationId_createdAt_idx"
ON "StockAdjustment"("organizationId", "locationId", "createdAt");
CREATE INDEX "StockAdjustment_organizationId_itemId_createdAt_idx"
ON "StockAdjustment"("organizationId", "itemId", "createdAt");

ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "StockAdjustment_batchId_idx" ON "StockAdjustment"("batchId");

-- Maker-checker fields for transfers and opnames.
ALTER TABLE "StockTransfer"
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvalNotes" TEXT,
ADD COLUMN "receiptNotes" TEXT,
ADD COLUMN "varianceResolution" TEXT;

ALTER TABLE "StockOpname"
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewNotes" TEXT;

-- Preserve source lots while goods are in transit.
CREATE TABLE "StockTransferBatchAllocation" (
    "id" TEXT NOT NULL,
    "transferItemId" TEXT NOT NULL,
    "sourceBatchId" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "costPrice" DECIMAL(15,2),
    "quantity" DECIMAL(15,3) NOT NULL,

    CONSTRAINT "StockTransferBatchAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockTransferBatchAllocation_transferItemId_idx"
ON "StockTransferBatchAllocation"("transferItemId");
CREATE INDEX "StockTransferBatchAllocation_sourceBatchId_idx"
ON "StockTransferBatchAllocation"("sourceBatchId");

ALTER TABLE "StockTransferBatchAllocation" ADD CONSTRAINT "StockTransferBatchAllocation_transferItemId_fkey"
FOREIGN KEY ("transferItemId") REFERENCES "StockTransferItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransferBatchAllocation" ADD CONSTRAINT "StockTransferBatchAllocation_sourceBatchId_fkey"
FOREIGN KEY ("sourceBatchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Modifier recipes and immutable option references on order snapshots.
CREATE TABLE "ModifierRecipeItem" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,

    CONSTRAINT "ModifierRecipeItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModifierRecipeItem_optionId_itemId_key"
ON "ModifierRecipeItem"("optionId", "itemId");
CREATE INDEX "ModifierRecipeItem_itemId_idx" ON "ModifierRecipeItem"("itemId");

ALTER TABLE "ModifierRecipeItem" ADD CONSTRAINT "ModifierRecipeItem_optionId_fkey"
FOREIGN KEY ("optionId") REFERENCES "MenuModifierOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModifierRecipeItem" ADD CONSTRAINT "ModifierRecipeItem_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "POSOrderItemModifier" ADD COLUMN "optionId" TEXT;
CREATE INDEX "POSOrderItemModifier_optionId_idx" ON "POSOrderItemModifier"("optionId");
ALTER TABLE "POSOrderItemModifier" ADD CONSTRAINT "POSOrderItemModifier_optionId_fkey"
FOREIGN KEY ("optionId") REFERENCES "MenuModifierOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Persist which configured rule produced an order discount.
ALTER TABLE "POSOrder" ADD COLUMN "discountRuleId" TEXT;
ALTER TABLE "POSOrder" ADD CONSTRAINT "POSOrder_discountRuleId_fkey"
FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
