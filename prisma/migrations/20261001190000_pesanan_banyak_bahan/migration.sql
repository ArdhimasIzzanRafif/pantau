-- Tahap 1: pesanan ke supplier berisi banyak bahan.
-- PurchaseOrder = kepala pesanan; PurchaseRequest yang ada menjadi baris bahannya.
-- Pemetaan bahan-supplier menyimpan nama & satuan versi supplier.

-- AlterEnum
ALTER TYPE "WhatsAppAggregateType" ADD VALUE 'PURCHASE_ORDER';

-- AlterTable
ALTER TABLE "GoodsReceipt" ADD COLUMN     "purchaseOrderId" TEXT;

-- AlterTable
ALTER TABLE "ItemSupplier" ADD COLUMN     "purchaseUnit" TEXT,
ADD COLUMN     "purchaseUnitSize" DECIMAL(15,4),
ADD COLUMN     "supplierItemName" TEXT;

-- AlterTable
ALTER TABLE "PurchaseRequest" ADD COLUMN     "purchaseOrderId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "urgency" "PurchaseRequestUrgency" NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_createdAt_idx" ON "PurchaseOrder"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_shortCode_key" ON "PurchaseOrder"("organizationId", "shortCode");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_purchaseOrderId_idx" ON "PurchaseRequest"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
