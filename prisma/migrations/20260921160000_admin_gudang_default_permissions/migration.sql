-- Akses bawaan Admin Gudang dipersempit menjadi pekerjaan gudang saja:
-- Stok per Lokasi (lihat), Transfer, Barang Masuk, Opname, dan Peringatan.
-- Master Inventori, Master Menu, Supplier, Waste & Penyesuaian, serta Riwayat
-- dimatikan. Owner tetap dapat menyalakannya kembali dari halaman Manajemen.
-- Seluruh key ADMIN_GUDANG ditimpa, bukan digabung, supaya fitur lama ikut mati.
UPDATE "Organization"
SET "rolePermissions" =
  "rolePermissions"
  || jsonb_build_object(
    'ADMIN_GUDANG',
    '{"STOCK_LOCATION":"VIEW","TRANSFER":"EDIT","GOODS_RECEIPT":"EDIT","OPNAME":"EDIT","ALERTS":"VIEW"}'::jsonb
  )
WHERE "rolePermissions" IS NOT NULL;
