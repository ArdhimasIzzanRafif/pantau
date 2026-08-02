import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { id } = await params
  const body = await req.json()

  const table = await prisma.table.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!table) return err("Meja tidak ditemukan", 404)

  const updated = await prisma.table.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    },
    include: { location: { select: { id: true, name: true } } },
  })
  return ok(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { id } = await params

  const table = await prisma.table.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!table) return err("Meja tidak ditemukan", 404)

  await prisma.table.delete({ where: { id } })
  return ok({ success: true })
}
