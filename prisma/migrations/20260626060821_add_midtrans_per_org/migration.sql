-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "midtransClientKey" TEXT,
ADD COLUMN     "midtransProduction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "midtransServerKey" TEXT;
