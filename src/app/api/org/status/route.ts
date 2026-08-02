import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ status: null }, { status: 401 })

  const orgId = (session.user as Record<string, unknown>).organizationId as string | null
  if (!orgId) return NextResponse.json({ status: null })

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { status: true },
  })

  return NextResponse.json({ status: org?.status ?? null })
}
