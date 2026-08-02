-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'QRIS', 'TRANSFER', 'CARD', 'OTHER');

-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'POS_SALE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'KASIR';

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "sellPrice" DECIMAL(15,2);

-- CreateTable
CREATE TABLE "POSShift" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "shiftNumber" TEXT NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(15,2),
    "expectedCash" DECIMAL(15,2),
    "totalSales" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "POSShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POSOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "shiftId" TEXT,
    "cashierId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL DEFAULT 'DINE_IN',
    "tableNumber" TEXT,
    "customerName" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "subtotal" DECIMAL(15,2) NOT NULL,
    "discountType" TEXT,
    "discountValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "voidReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POSOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POSOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "qty" INTEGER NOT NULL,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "POSOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POSPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "change" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "POSPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "POSShift_organizationId_locationId_status_idx" ON "POSShift"("organizationId", "locationId", "status");

-- CreateIndex
CREATE INDEX "POSOrder_organizationId_locationId_createdAt_idx" ON "POSOrder"("organizationId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "POSOrder_organizationId_status_idx" ON "POSOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "POSOrderItem_orderId_idx" ON "POSOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "POSPayment_orderId_idx" ON "POSPayment"("orderId");

-- AddForeignKey
ALTER TABLE "POSShift" ADD CONSTRAINT "POSShift_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSShift" ADD CONSTRAINT "POSShift_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSShift" ADD CONSTRAINT "POSShift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSOrder" ADD CONSTRAINT "POSOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSOrder" ADD CONSTRAINT "POSOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSOrder" ADD CONSTRAINT "POSOrder_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "POSShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSOrder" ADD CONSTRAINT "POSOrder_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSOrderItem" ADD CONSTRAINT "POSOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "POSOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSOrderItem" ADD CONSTRAINT "POSOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POSPayment" ADD CONSTRAINT "POSPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "POSOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
