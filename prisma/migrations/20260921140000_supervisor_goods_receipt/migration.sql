-- Supervisor bertanggung jawab atas lokasi yang ditugaskan padanya, termasuk
-- barang yang masuk ke sana. Sebelumnya Barang Masuk tidak pernah muncul di
-- halaman Akses Fitur per Role untuk Supervisor sehingga tidak bisa diberikan.
-- Organisasi yang belum pernah menyimpan pengaturan akses memakai nilai bawaan
-- dari ROLE_DEFAULTS, jadi hanya yang sudah tersimpan yang perlu ditambal.
UPDATE "Organization"
SET "rolePermissions" =
  "rolePermissions"
  || jsonb_build_object(
    'SUPERVISOR',
    COALESCE("rolePermissions"->'SUPERVISOR', '{}'::jsonb) || '{"GOODS_RECEIPT":"EDIT"}'::jsonb
  )
WHERE "rolePermissions" IS NOT NULL;
