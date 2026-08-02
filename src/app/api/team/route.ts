import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import bcrypt from "bcryptjs"

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const members = await prisma.organizationUser.findMany({
    where: { organizationId: user.organizationId },
    include: { user: { select: { id: true, name: true, email: true, image: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  })
  return ok(members)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  if (user.role !== "OWNER") return err("Hanya Owner yang bisa invite anggota", 403)

  const { name, email, password, role, locationIds = [] } = await req.json()
  if (!name || !email || !password || !role) return err("Semua field wajib diisi")
  if (role === "KASIR" && locationIds.length === 0) return err("Kasir wajib ditetapkan ke minimal 1 outlet")

  const locData = (locationIds as string[]).map((lid: string) => ({ locationId: lid }))

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    const alreadyMember = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: user.organizationId, userId: existing.id } },
    })
    if (alreadyMember) return err("User sudah terdaftar di organisasi ini", 409)

    await prisma.organizationUser.create({
      data: {
        organizationId: user.organizationId,
        userId: existing.id,
        role,
        assignedLocations: locData.length > 0 ? { create: locData } : undefined,
      },
    })
    return ok({ message: "Anggota ditambahkan" }, 201)
  }

  const hashed = await bcrypt.hash(password, 12)
  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      organizations: {
        create: {
          organizationId: user.organizationId,
          role,
          assignedLocations: locData.length > 0 ? { create: locData } : undefined,
        },
      },
    },
  })

  return ok({ message: "Anggota berhasil ditambahkan", userId: newUser.id }, 201)
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang bisa mengedit anggota", 403)

  const { userId, name, role, password, locationIds } = await req.json()
  if (!userId) return err("userId wajib diisi")
  if (userId === user.id) return err("Tidak bisa mengedit diri sendiri")

  const orgUser = await prisma.organizationUser.findUnique({
    where: { organizationId_userId: { organizationId: user.organizationId, userId } },
  })
  if (!orgUser) return err("Anggota tidak ditemukan", 404)
  if (orgUser.role === "OWNER") return err("Tidak bisa mengedit Owner", 403)
  if (role === "KASIR" && Array.isArray(locationIds) && locationIds.length === 0) {
    return err("Kasir wajib ditetapkan ke minimal 1 outlet")
  }

  await prisma.$transaction(async (tx) => {
    const userUpdate: { name?: string; password?: string } = {}
    if (name?.trim()) userUpdate.name = name.trim()
    if (password?.length >= 6) userUpdate.password = await bcrypt.hash(password, 12)
    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({ where: { id: userId }, data: userUpdate })
    }

    if (role) {
      await tx.organizationUser.update({
        where: { organizationId_userId: { organizationId: user.organizationId, userId } },
        data: { role },
      })
    }

    if (Array.isArray(locationIds)) {
      await tx.userLocation.deleteMany({ where: { orgUserId: orgUser.id } })
      if (locationIds.length > 0) {
        await tx.userLocation.createMany({
          data: locationIds.map((lid: string) => ({ orgUserId: orgUser.id, locationId: lid })),
        })
      }
    }
  })

  return ok({ message: "Anggota berhasil diperbarui" })
}

export async function DELETE(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  if (user.role !== "OWNER") return err("Hanya Owner yang bisa hapus anggota", 403)

  const { userId } = await req.json()
  if (!userId) return err("userId wajib diisi")
  if (userId === user.id) return err("Tidak bisa menghapus diri sendiri")

  await prisma.organizationUser.delete({
    where: { organizationId_userId: { organizationId: user.organizationId, userId } },
  })
  return ok({ message: "Anggota dihapus" })
}
