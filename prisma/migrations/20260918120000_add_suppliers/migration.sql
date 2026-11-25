-- Master supplier ditambahkan tanpa mengubah data supplier lama pada barang masuk.
-- IF NOT EXISTS menjaga migrasi aman untuk database yang sudah memiliki versi
-- awal tabel Supplier.
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Supplier" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "GoodsReceipt" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_organizationId_name_key" ON "Supplier"("organizationId", "name");
CREATE INDEX IF NOT EXISTS "Supplier_organizationId_isActive_idx" ON "Supplier"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_organizationId_supplierId_idx" ON "GoodsReceipt"("organizationId", "supplierId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Supplier_organizationId_fkey') THEN
    ALTER TABLE "Supplier"
    ADD CONSTRAINT "Supplier_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GoodsReceipt_supplierId_fkey') THEN
    ALTER TABLE "GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
