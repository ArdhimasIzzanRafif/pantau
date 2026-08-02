import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok } from "@/lib/api-helpers"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const entity = searchParams.get("entity")
  const page = parseInt(searchParams.get("page") ?? "1")
  const limit = 30

  const logs = await prisma.auditLog.findMany({
    where: {
      organizationId: user.organizationId,
      ...(entity && { entity }),
    },
    include: { organization: false },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  })

  const total = await prisma.auditLog.count({
    where: { organizationId: user.organizationId },
  })

  return ok({ logs, total, page, pages: Math.ceil(total / limit) })
}
