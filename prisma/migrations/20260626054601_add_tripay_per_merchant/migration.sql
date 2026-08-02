-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "tripayApiKey" TEXT,
ADD COLUMN     "tripayMerchantCode" TEXT,
ADD COLUMN     "tripayPrivateKey" TEXT,
ADD COLUMN     "tripayProduction" BOOLEAN NOT NULL DEFAULT false;
