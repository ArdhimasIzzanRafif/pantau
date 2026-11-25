import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse } from "@/lib/api-helpers"
import { normalizeOrgPermissions } from "@/lib/permissions"
import type { Prisma } from "@prisma/client"

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { rolePermissions: true },
  })

  const permissions = normalizeOrgPermissions(org?.rolePermissions)
  const visiblePermissions = user.role === "OWNER"
    ? permissions
    : ["ADMIN_GUDANG", "SUPERVISOR", "KASIR"].includes(user.role)
      ? { [user.role]: permissions[user.role as keyof typeof permissions] ?? {} }
      : {}

  return NextResponse.json(visiblePermissions, {
    headers: { "Cache-Control": "no-store" },
  })
}

export async function PUT(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const permissions = normalizeOrgPermissions(body)
  // Kasir khusus memakai POS dan tidak memiliki fitur backoffice yang perlu
  // dipilih di halaman ini.
  if (["ADMIN_GUDANG", "SUPERVISOR"].some((role) =>
    Object.keys(permissions[role as keyof typeof permissions] ?? {}).length === 0
  )) {
    return NextResponse.json({ error: "Pilih minimal satu fitur untuk setiap role" }, { status: 400 })
  }

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { rolePermissions: permissions as Prisma.InputJsonValue },
  })

  return NextResponse.json({ ok: true, permissions })
}
