-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "POSOrder" ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "snapToken" TEXT;
