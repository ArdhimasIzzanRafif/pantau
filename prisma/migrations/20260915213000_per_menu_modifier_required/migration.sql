-- Wajib/tidaknya modifier jadi per-menu (bukan per grup)

-- AlterTable
ALTER TABLE "InventoryItemModifier" ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT false;

-- Backfill dari setelan grup supaya perilaku yang berjalan sekarang tidak berubah
UPDATE "InventoryItemModifier" AS iim
SET "isRequired" = g."isRequired"
FROM "MenuModifierGroup" AS g
WHERE g."id" = iim."groupId";
