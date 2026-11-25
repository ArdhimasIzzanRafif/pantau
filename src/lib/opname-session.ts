import { prisma } from "@/lib/db"
import type { SessionUser } from "@/lib/api-helpers"

// Heartbeat web dikirim setiap 20 detik. Jika tab ditutup tanpa sempat melepas
// sesi, lokasi otomatis bebas lagi setelah dua menit tanpa heartbeat.
export const OPNAME_SESSION_TTL_MS = 2 * 60 * 1000

export async function releaseOpnameDraft(user: SessionUser, draftId: string) {
  const deleted = await prisma.stockOpname.deleteMany({
    where: {
      id: draftId,
      organizationId: user.organizationId,
      createdById: user.id,
      status: "DRAFT",
      items: { none: {} },
    },
  })

  return deleted.count > 0
}
