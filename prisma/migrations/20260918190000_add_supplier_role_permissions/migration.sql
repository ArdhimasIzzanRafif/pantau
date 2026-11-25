-- Supplier sebelumnya hanya tersedia untuk Owner dan belum memiliki key izin.
-- Aktifkan akses lihat untuk seluruh role yang dapat diatur. Setelah migrasi,
-- Owner dapat mengubahnya menjadi Edit atau menonaktifkannya dari Manajemen.
UPDATE "Organization"
SET "rolePermissions" =
  COALESCE("rolePermissions", '{}'::jsonb)
  || jsonb_build_object(
    'ADMIN_GUDANG', COALESCE("rolePermissions"->'ADMIN_GUDANG', '{}'::jsonb) || '{"SUPPLIERS":"VIEW"}'::jsonb,
    'SUPERVISOR', COALESCE("rolePermissions"->'SUPERVISOR', '{}'::jsonb) || '{"SUPPLIERS":"VIEW"}'::jsonb,
    'EMPLOYEE', COALESCE("rolePermissions"->'EMPLOYEE', '{}'::jsonb) || '{"SUPPLIERS":"VIEW"}'::jsonb,
    'KASIR', COALESCE("rolePermissions"->'KASIR', '{}'::jsonb) || '{"SUPPLIERS":"VIEW"}'::jsonb
  );
