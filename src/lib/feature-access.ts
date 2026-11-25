import { prisma } from "@/lib/db"
import { err, type SessionUser } from "@/lib/api-helpers"
import {
  getEffectivePermissions,
  type AccessLevel,
  type FeatureKey,
  type OrgPermissions,
} from "@/lib/permissions"

/**
 * Izin sebuah fitur untuk pengguna yang sedang login, menurut pengaturan
 * Manajemen. Owner selalu penuh; role di luar yang dikenal tidak dapat apa-apa.
 */
export async function getFeatureAccess(
  user: SessionUser,
  feature: FeatureKey,
): Promise<AccessLevel | null> {
  if (user.role === "OWNER") return getEffectivePermissions("OWNER", null)[feature] ?? null

  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { rolePermissions: true },
  })
  const organizationPermissions = organization?.rolePermissions as OrgPermissions | null | undefined

  return getEffectivePermissions(user.role, organizationPermissions)[feature] ?? null
}

/**
 * Penjaga untuk route yang mengubah data: kembalikan respons 403 bila fitur
 * tidak diberi izin EDIT, atau `null` bila boleh lanjut.
 *
 * Tombol yang dinonaktifkan di layar hanya mencegah salah klik — pemeriksaan
 * di sinilah yang benar-benar menahan permintaan yang tidak berhak.
 */
export async function denyUnlessCanEdit(user: SessionUser, feature: FeatureKey) {
  const access = await getFeatureAccess(user, feature)
  if (access === "EDIT") return null
  return err("Role Anda tidak memiliki izin mengubah data pada fitur ini", 403)
}
