import { prisma } from "@/lib/db"
import type { SessionUser } from "@/lib/api-helpers"

export async function canAccessLocation(user: SessionUser, locationId: string) {
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId: user.organizationId, isActive: true },
    select: { id: true },
  })
  if (!location) return false

  if (user.role === "OWNER") return true

  const membership = await prisma.organizationUser.findFirst({
    where: {
      organizationId: user.organizationId,
      userId: user.id,
      assignedLocations: { some: { locationId } },
    },
    select: { id: true },
  })

  return !!membership
}

/**
 * Berbeda dari canAccessLocation, pemeriksaan ini tidak memberi akses global
 * kepada Owner. Dipakai untuk tautan tindakan yang memang dikirim khusus ke
 * penanggung jawab suatu lokasi, misalnya tautan WA stok outlet ke gudang.
 */
export async function isAssignedToLocation(user: SessionUser, locationId: string) {
  const membership = await prisma.organizationUser.findFirst({
    where: {
      organizationId: user.organizationId,
      userId: user.id,
      assignedLocations: {
        some: { locationId, location: { organizationId: user.organizationId, isActive: true } },
      },
    },
    select: { id: true },
  })

  return !!membership
}

export async function getAccessibleLocationIds(user: SessionUser) {
  if (user.role === "OWNER") return null

  const membership = await prisma.organizationUser.findFirst({
    where: { organizationId: user.organizationId, userId: user.id },
    select: { assignedLocations: { select: { locationId: true } } },
  })
  return membership?.assignedLocations.map((location) => location.locationId) ?? []
}
