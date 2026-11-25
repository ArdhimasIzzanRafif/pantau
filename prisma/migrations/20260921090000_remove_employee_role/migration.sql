-- Role Karyawan (EMPLOYEE) dihapus. Sejak halaman Tim hanya menawarkan
-- Admin Gudang, Supervisor, dan Kasir, role ini tidak pernah bisa dipilih lagi
-- dan hanya menyisakan kolom kosong di halaman Akses Fitur per Role.

-- Anggota lama yang masih berperan Karyawan dipindahkan ke Kasir: keduanya
-- sama-sama dibatasi ke outlet, sehingga penugasan lokasinya tetap valid.
UPDATE "OrganizationUser" SET "role" = 'KASIR' WHERE "role" = 'EMPLOYEE';

-- Buang key izin EMPLOYEE dari pengaturan organisasi.
UPDATE "Organization"
SET "rolePermissions" = "rolePermissions" - 'EMPLOYEE'
WHERE "rolePermissions" IS NOT NULL;

ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN_GUDANG', 'SUPERVISOR', 'KASIR');
ALTER TABLE "OrganizationUser" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";
