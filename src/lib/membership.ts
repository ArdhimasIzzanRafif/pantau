import { prisma } from "@/lib/db"
import type { SessionUser } from "@/lib/api-helpers"

/**
 * Saat anggota ditambahkan ke organisasi. Dipakai untuk memotong riwayat dan
 * notifikasi: anggota baru hanya melihat kejadian sejak dia ada, bukan arsip
 * lama lokasinya. Owner tidak dibatasi sehingga mengembalikan undefined.
 */
export async function memberJoinedAt(user: SessionUser) {
  if (user.role === "OWNER") return undefined
  const membership = await prisma.organizationUser.findFirst({
    where: { organizationId: user.organizationId, userId: user.id },
    select: { createdAt: true },
  })
  return membership?.createdAt
}
