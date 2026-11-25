-- Admin Gudang kini melihat Riwayat dengan aturan yang sama seperti Supervisor:
-- terbatas pada lokasi yang ditugaskan kepadanya, bukan pada siapa pencatatnya.
UPDATE "Organization"
SET "rolePermissions" =
  "rolePermissions"
  || jsonb_build_object(
    'ADMIN_GUDANG',
    COALESCE("rolePermissions"->'ADMIN_GUDANG', '{}'::jsonb) || '{"HISTORY":"VIEW"}'::jsonb
  )
WHERE "rolePermissions" IS NOT NULL;
