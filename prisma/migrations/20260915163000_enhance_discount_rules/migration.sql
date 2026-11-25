-- Enhance discount rules: happy-hour scheduling (start date + time window) and per-outlet scoping

-- AlterTable
ALTER TABLE "DiscountRule" ADD COLUMN     "endMinute" INTEGER,
ADD COLUMN     "startMinute" INTEGER,
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DiscountRuleLocation" (
    "id" TEXT NOT NULL,
    "discountRuleId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "DiscountRuleLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountRuleLocation_locationId_idx" ON "DiscountRuleLocation"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRuleLocation_discountRuleId_locationId_key" ON "DiscountRuleLocation"("discountRuleId", "locationId");

-- AddForeignKey
ALTER TABLE "DiscountRuleLocation" ADD CONSTRAINT "DiscountRuleLocation_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleLocation" ADD CONSTRAINT "DiscountRuleLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
