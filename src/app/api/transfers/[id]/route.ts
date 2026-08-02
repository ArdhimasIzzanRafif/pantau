import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const { id } = await params

  const transfer = await prisma.stockTransfer.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      fromLocation: true,
      toLocation: true,
      items: { include: { item: true } },
    },
  })
  if (!transfer) return err("Transfer tidak ditemukan", 404)
  return ok(transfer)
}
