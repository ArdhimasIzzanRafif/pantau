import { prisma } from "@/lib/db"

/**
 * Melekatkan pelaku pada baris riwayat. StockMovement dan StockAdjustment
 * hanya menyimpan createdById tanpa relasi ke User, jadi pelakunya dicari
 * sekali untuk seluruh halaman — beserta perannya di organisasi ini.
 */
export async function attachActors<T extends { createdById: string | null }>(
  organizationId: string,
  rows: T[],
) {
  const actorIds = [...new Set(rows.map((row) => row.createdById).filter((id): id is string => !!id))]
  const actors = actorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: {
          id: true,
          name: true,
          email: true,
          organizations: { where: { organizationId }, select: { role: true } },
        },
      })
    : []
  const actorById = new Map(actors.map((actor) => [actor.id, {
    name: actor.name,
    email: actor.email,
    role: actor.organizations[0]?.role ?? null,
  }]))
  return rows.map((row) => ({
    ...row,
    createdBy: row.createdById ? actorById.get(row.createdById) ?? null : null,
  }))
}
