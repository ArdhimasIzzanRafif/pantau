import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  if (user.role !== "OWNER") return err("Hanya Owner yang bisa mengubah lokasi", 403)

  const { id } = await params
  const { name, address } = await req.json()

  const location = await prisma.location.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)

  const updated = await prisma.location.update({
    where: { id },
    data: {
      name: name ?? location.name,
      address: address !== undefined ? address : location.address,
    },
  })

  return ok(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  if (user.role !== "OWNER") return err("Hanya Owner yang bisa menghapus lokasi", 403)

  const { id } = await params

  const location = await prisma.location.findFirst({
    where: { id, organizationId: user.organizationId },
  })
  if (!location) return err("Lokasi tidak ditemukan", 404)

  await prisma.location.update({
    where: { id },
    data: { isActive: false },
  })

  return ok({ message: "Lokasi dinonaktifkan" })
}
