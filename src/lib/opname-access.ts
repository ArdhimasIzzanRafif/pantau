import { prisma } from "@/lib/db"
import type { SessionUser } from "@/lib/api-helpers"
import {
  getEffectivePermissions,
  type AccessLevel,
  type OrgPermissions,
} from "@/lib/permissions"

/**
 * Owner dapat menjalankan opname di seluruh lokasi. Supervisor dan Admin
 * Gudang menjalankan opname sesuai izin fitur serta lokasi penugasannya.
 */
export async function getOpnameAccess(user: SessionUser): Promise<AccessLevel | null> {
  if (user.role === "OWNER") return "EDIT"
  if (user.role !== "SUPERVISOR" && user.role !== "ADMIN_GUDANG") return null

  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { rolePermissions: true },
  })
  const organizationPermissions = organization?.rolePermissions as OrgPermissions | null | undefined

  return getEffectivePermissions(user.role, organizationPermissions).OPNAME ?? null
}
