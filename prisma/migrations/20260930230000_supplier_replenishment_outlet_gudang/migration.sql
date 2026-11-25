-- Melengkapi modul pengadaan pemasok dengan alur replenishment dari startup 4:
-- outlet meminta stok -> gudang (notifikasi WhatsApp ke nomor gudang) ->
-- persetujuan dengan reservasi stok -> kirim -> terima, termasuk sisa kebutuhan
-- outlet dan konversi satuan (packSize desimal).

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

-- AlterEnum
ALTER TYPE "TransferStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "InventoryItem" ALTER COLUMN "packSize" SET DATA TYPE DECIMAL(15,4);

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "fulfillmentWarehouseId" TEXT,
ADD COLUMN     "whatsappPhone" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "reservationHoldHours" INTEGER NOT NULL DEFAULT 48;

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "autoReplenishment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needRejectionSnapshot" JSONB,
ADD COLUMN     "notificationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notificationError" TEXT,
ADD COLUMN     "notificationLastAt" TIMESTAMP(3),
ADD COLUMN     "notificationMessageId" TEXT,
ADD COLUMN     "notificationSentAt" TIMESTAMP(3),
ADD COLUMN     "notificationStatus" "WhatsAppDeliveryStatus",
ADD COLUMN     "outletRequested" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StockTransferItem" ADD COLUMN     "conversionFactor" DECIMAL(15,4),
ADD COLUMN     "inputQuantity" DECIMAL(15,3),
ADD COLUMN     "inputUnit" TEXT,
ADD COLUMN     "outstandingQty" DECIMAL(15,3),
ADD COLUMN     "requestedQuantity" DECIMAL(15,3),
ADD COLUMN     "sourceOutstandingItemId" TEXT;

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stockTransferId" TEXT NOT NULL,
    "stockTransferItemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_stockTransferItemId_key" ON "StockReservation"("stockTransferItemId");

-- CreateIndex
CREATE INDEX "StockReservation_organizationId_locationId_itemId_status_idx" ON "StockReservation"("organizationId", "locationId", "itemId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_stockTransferId_idx" ON "StockReservation"("stockTransferId");

-- CreateIndex
CREATE INDEX "Location_fulfillmentWarehouseId_idx" ON "Location"("fulfillmentWarehouseId");

-- CreateIndex
CREATE INDEX "StockTransfer_organizationId_notificationStatus_createdAt_idx" ON "StockTransfer"("organizationId", "notificationStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransferItem_sourceOutstandingItemId_key" ON "StockTransferItem"("sourceOutstandingItemId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_fulfillmentWarehouseId_fkey" FOREIGN KEY ("fulfillmentWarehouseId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_stockTransferItemId_fkey" FOREIGN KEY ("stockTransferItemId") REFERENCES "StockTransferItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_sourceOutstandingItemId_fkey" FOREIGN KEY ("sourceOutstandingItemId") REFERENCES "StockTransferItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
