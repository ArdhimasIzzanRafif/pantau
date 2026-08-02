import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const resolved = searchParams.get("resolved") === "true"
  const type = searchParams.get("type")

  const alerts = await prisma.alert.findMany({
    where: {
      organizationId: user.organizationId,
      isResolved: resolved,
      ...(type && { type: type as never }),
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 50,
  })
  return ok(alerts)
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { id } = await req.json()
  if (!id) return err("ID alert wajib diisi")

  await prisma.alert.update({
    where: { id },
    data: { isResolved: true, resolvedAt: new Date(), resolvedById: user.id },
  })
  return ok({ message: "Alert diselesaikan" })
}
