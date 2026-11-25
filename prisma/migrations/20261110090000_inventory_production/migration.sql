ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_IN';
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_OUT';

CREATE TABLE "ProductionRecipe" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "outputItemId" TEXT NOT NULL REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "yieldQuantity" DECIMAL(15,3) NOT NULL,
  "weightPerPiece" DECIMAL(15,3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_positive_yield" CHECK ("yieldQuantity" > 0),
  CONSTRAINT "production_positive_weight" CHECK ("weightPerPiece" IS NULL OR "weightPerPiece" > 0)
);
CREATE UNIQUE INDEX "ProductionRecipe_outputItemId_key" ON "ProductionRecipe"("outputItemId");
CREATE INDEX "ProductionRecipe_organizationId_idx" ON "ProductionRecipe"("organizationId");

CREATE TABLE "ProductionIngredient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recipeId" TEXT NOT NULL REFERENCES "ProductionRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "itemId" TEXT NOT NULL REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "quantity" DECIMAL(15,3) NOT NULL CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "ProductionIngredient_recipeId_itemId_key" ON "ProductionIngredient"("recipeId", "itemId");

CREATE TABLE "InventoryProduction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "recipeId" TEXT NOT NULL REFERENCES "ProductionRecipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "outputItemId" TEXT NOT NULL REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "locationId" TEXT NOT NULL REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL CHECK ("quantity" > 0),
  "totalCost" DECIMAL(15,6) NOT NULL,
  "unitCost" DECIMAL(15,6) NOT NULL,
  "ingredients" JSONB NOT NULL,
  "outputName" TEXT NOT NULL,
  "outputUnit" TEXT NOT NULL,
  "weightPerPiece" DECIMAL(15,3),
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InventoryProduction_organizationId_requestId_key" ON "InventoryProduction"("organizationId", "requestId");
CREATE INDEX "InventoryProduction_organizationId_createdAt_idx" ON "InventoryProduction"("organizationId", "createdAt");
