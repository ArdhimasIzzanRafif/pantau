import { NextRequest } from "next/server"
import type { OpnameStatus } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"
import { getOpnameAccess } from "@/lib/opname-access"
import { getHistoryScope } from "@/lib/history-scope"
import { memberJoinedAt } from "@/lib/membership"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const opnameAccess = await getOpnameAccess(user)
  if (!opnameAccess) return err("Tidak memiliki izin melihat opname", 403)

  const { id } = await params
  const historyScope = await getHistoryScope(user, req.nextUrl.searchParams.get("history") === "1", "LOCATION")
  if (!historyScope.allowed) return err("Tidak memiliki akses ke Riwayat", 403)
  const joinedAt = await memberJoinedAt(user)

  const opname = await prisma.stockOpname.findFirst({
    where: {
      id,
      organizationId: user.organizationId,
      ...(historyScope.actorId && { createdById: historyScope.actorId }),
      // Sama seperti daftarnya: yang sudah selesai sebelum dia bergabung
      // tidak bisa dibuka, yang masih berjalan tetap bisa.
      ...(joinedAt ? { OR: [
        { createdAt: { gte: joinedAt } },
        { status: { in: ["DRAFT", "SUBMITTED"] as OpnameStatus[] } },
      ] } : {}),
    },
    include: {
      location: true,
      items: { include: { item: true } },
    },
  })
  if (!opname) return err("Opname tidak ditemukan", 404)
  if (!(await canAccessLocation(user, opname.locationId))) return err("Tidak ada akses ke lokasi ini", 403)
  return ok(opname)
}
