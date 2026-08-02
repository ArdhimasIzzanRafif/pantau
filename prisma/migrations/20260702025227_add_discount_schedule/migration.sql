-- AlterTable
ALTER TABLE "DiscountRule" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "validDays" TEXT;
