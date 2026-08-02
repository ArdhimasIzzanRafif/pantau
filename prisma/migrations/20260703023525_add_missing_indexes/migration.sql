-- CreateIndex
CREATE INDEX "GoodsReceiptItem_receiptId_idx" ON "GoodsReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_itemId_idx" ON "GoodsReceiptItem"("itemId");

-- CreateIndex
CREATE INDEX "POSOrder_shiftId_idx" ON "POSOrder"("shiftId");

-- CreateIndex
CREATE INDEX "POSOrder_cashierId_idx" ON "POSOrder"("cashierId");
