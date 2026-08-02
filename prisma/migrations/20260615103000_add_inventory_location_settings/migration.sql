-- CreateTable
CREATE TABLE "InventoryLocationSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "minStock" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLocationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocationSetting_organizationId_itemId_locationId_key" ON "InventoryLocationSetting"("organizationId", "itemId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryLocationSetting_organizationId_locationId_idx" ON "InventoryLocationSetting"("organizationId", "locationId");

-- AddForeignKey
ALTER TABLE "InventoryLocationSetting" ADD CONSTRAINT "InventoryLocationSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocationSetting" ADD CONSTRAINT "InventoryLocationSetting_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocationSetting" ADD CONSTRAINT "InventoryLocationSetting_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
