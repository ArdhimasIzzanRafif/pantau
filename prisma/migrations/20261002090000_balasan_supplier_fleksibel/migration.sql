
-- AlterTable
ALTER TABLE "GoodsReceipt" ADD COLUMN     "withoutConfirmationReason" TEXT;

-- AlterTable
ALTER TABLE "IncomingWhatsAppMessage" ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "reviewAction" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "suggestion" JSONB;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "autoReplySentAt" TIMESTAMP(3),
ADD COLUMN     "isManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualConfirmNote" TEXT,
ADD COLUMN     "manualConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "manualConfirmedById" TEXT,
ADD COLUMN     "reviewNoticeAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SupplierPhone" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPhone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "source" TEXT NOT NULL,
    "incomingMessageId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierPhone_supplierId_idx" ON "SupplierPhone"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPhone_organizationId_phone_key" ON "SupplierPhone"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "PurchaseOrderDocument_purchaseOrderId_idx" ON "PurchaseOrderDocument"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "IncomingWhatsAppMessage_organizationId_processingStatus_idx" ON "IncomingWhatsAppMessage"("organizationId", "processingStatus");

-- CreateIndex
CREATE INDEX "IncomingWhatsAppMessage_purchaseOrderId_receivedAt_idx" ON "IncomingWhatsAppMessage"("purchaseOrderId", "receivedAt");

-- AddForeignKey
ALTER TABLE "IncomingWhatsAppMessage" ADD CONSTRAINT "IncomingWhatsAppMessage_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPhone" ADD CONSTRAINT "SupplierPhone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPhone" ADD CONSTRAINT "SupplierPhone_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderDocument" ADD CONSTRAINT "PurchaseOrderDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderDocument" ADD CONSTRAINT "PurchaseOrderDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
