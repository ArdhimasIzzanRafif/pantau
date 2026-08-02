-- DropForeignKey
ALTER TABLE "POSOrderItem" DROP CONSTRAINT "POSOrderItem_menuItemId_fkey";

-- AlterTable
ALTER TABLE "POSOrderItem" ALTER COLUMN "menuItemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "POSOrderItem" ADD CONSTRAINT "POSOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
