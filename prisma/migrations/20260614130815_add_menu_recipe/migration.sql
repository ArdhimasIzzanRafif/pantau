-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "isMenuItem" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_childItemId_fkey" FOREIGN KEY ("childItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
