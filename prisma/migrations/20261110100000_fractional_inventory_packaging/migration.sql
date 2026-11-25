-- Faktor kemasan dan ambang stok harus mempertahankan pecahan kg/liter.
ALTER TABLE "GoodsReceiptItem" ALTER COLUMN "packSizeSnapshot" TYPE DECIMAL(15,4);
ALTER TABLE "InventoryItem" ALTER COLUMN "minStock" TYPE DECIMAL(15,3);
ALTER TABLE "InventoryLocationSetting" ALTER COLUMN "minStock" TYPE DECIMAL(15,3);
