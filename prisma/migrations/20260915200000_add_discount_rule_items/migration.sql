-- Per-item discount scoping: a rule with rows here applies only to those menu items

-- CreateTable
CREATE TABLE "DiscountRuleItem" (
    "id" TEXT NOT NULL,
    "discountRuleId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,

    CONSTRAINT "DiscountRuleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountRuleItem_menuItemId_idx" ON "DiscountRuleItem"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRuleItem_discountRuleId_menuItemId_key" ON "DiscountRuleItem"("discountRuleId", "menuItemId");

-- AddForeignKey
ALTER TABLE "DiscountRuleItem" ADD CONSTRAINT "DiscountRuleItem_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleItem" ADD CONSTRAINT "DiscountRuleItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
