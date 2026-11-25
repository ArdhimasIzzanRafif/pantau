import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation } from "@/lib/location-access"
import { getHistoryScope } from "@/lib/history-scope"
import { memberJoinedAt } from "@/lib/membership"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params
  const historyScope = await getHistoryScope(user, req.nextUrl.searchParams.get("history") === "1", "LOCATION")
  if (!historyScope.allowed) return err("Tidak memiliki akses ke Riwayat", 403)
  const joinedAt = await memberJoinedAt(user)

  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id,
      organizationId: user.organizationId,
      ...(historyScope.actorId && { createdById: historyScope.actorId }),
      ...(joinedAt ? { createdAt: { gte: joinedAt } } : {}),
    },
    include: {
      location: true,
      items: { include: { item: true, batch: true } },
    },
  })
  if (!receipt) return err("Penerimaan barang tidak ditemukan", 404)
  if (!(await canAccessLocation(user, receipt.locationId))) return err("Tidak ada akses ke lokasi ini", 403)
  return ok(receipt)
}
