-- AlterTable
ALTER TABLE "POSOrder" ADD COLUMN     "guestSessionId" TEXT;

-- CreateIndex
CREATE INDEX "POSOrder_guestSessionId_idx" ON "POSOrder"("guestSessionId");
