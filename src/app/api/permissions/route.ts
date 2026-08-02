import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse } from "@/lib/api-helpers"

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { rolePermissions: true },
  })

  return NextResponse.json(org?.rolePermissions ?? {})
}

export async function PUT(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { rolePermissions: body },
  })

  return NextResponse.json({ ok: true })
}
