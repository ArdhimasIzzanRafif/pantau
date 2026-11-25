import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { isValidEmail, normalizeEmail } from "@/lib/email-validation"
import bcrypt from "bcryptjs"

const ASSIGNABLE_ROLES = new Set(["ADMIN_GUDANG", "SUPERVISOR", "KASIR"])

async function validateLocationAssignments(
  organizationId: string,
  role: string,
  rawLocationIds: unknown,
) {
  const locationIds = Array.isArray(rawLocationIds)
    ? [...new Set(rawLocationIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : []

  if (ASSIGNABLE_ROLES.has(role) && locationIds.length === 0) {
    return { error: "Pilih minimal 1 lokasi penugasan", locationIds: [] as string[] }
  }

  const locations = await prisma.location.findMany({
    where: {
      organizationId,
      isActive: true,
      id: { in: locationIds },
    },
    select: { id: true, type: true },
  })
  if (locations.length !== locationIds.length) {
    return { error: "Ada lokasi penugasan yang tidak valid", locationIds: [] as string[] }
  }
  if (role === "ADMIN_GUDANG" && locations.some((location) => location.type !== "WAREHOUSE")) {
    return { error: "Admin Gudang hanya dapat ditugaskan ke gudang", locationIds: [] as string[] }
  }
  if (role === "KASIR" && locations.some((location) => location.type !== "OUTLET")) {
    return { error: "Kasir hanya dapat ditugaskan ke outlet", locationIds: [] as string[] }
  }

  return { error: null, locationIds }
}

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang bisa melihat manajemen tim", 403)

  const members = await prisma.organizationUser.findMany({
    where: { organizationId: user.organizationId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true, createdAt: true } },
      assignedLocations: {
        include: { location: { select: { id: true, name: true, type: true } } },
        orderBy: { location: { createdAt: "asc" } },
      },
    },
    orderBy: { createdAt: "asc" },
  })
  return ok(members)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  if (user.role !== "OWNER") return err("Hanya Owner yang bisa invite anggota", 403)

  const { name, email, password, role, locationIds = [] } = await req.json()
  const normalizedName = typeof name === "string" ? name.trim() : ""
  const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : ""
  if (!normalizedName || !normalizedEmail || !password || !role) return err("Semua field wajib diisi")
  if (!isValidEmail(normalizedEmail)) return err("Format email tidak valid. Contoh: nama@toko.com")
  if (typeof password !== "string" || password.length < 6) return err("Password minimal 6 karakter")
  if (!ASSIGNABLE_ROLES.has(role)) return err("Peran anggota tidak valid")

  const assignmentValidation = await validateLocationAssignments(user.organizationId, role, locationIds)
  if (assignmentValidation.error) return err(assignmentValidation.error)

  const locData = assignmentValidation.locationIds.map((locationId) => ({ locationId }))

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })

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
      name: normalizedName,
      email: normalizedEmail,
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
    include: { assignedLocations: { select: { locationId: true } } },
  })
  if (!orgUser) return err("Anggota tidak ditemukan", 404)
  if (orgUser.role === "OWNER") return err("Tidak bisa mengedit Owner", 403)
  const nextRole = role ?? orgUser.role
  if (!ASSIGNABLE_ROLES.has(nextRole)) return err("Peran anggota tidak valid")
  const nextLocationIds = Array.isArray(locationIds)
    ? locationIds
    : orgUser.assignedLocations.map((assignment) => assignment.locationId)
  const assignmentValidation = await validateLocationAssignments(user.organizationId, nextRole, nextLocationIds)
  if (assignmentValidation.error) return err(assignmentValidation.error)

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
      if (assignmentValidation.locationIds.length > 0) {
        await tx.userLocation.createMany({
          data: assignmentValidation.locationIds.map((locationId) => ({ orgUserId: orgUser.id, locationId })),
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
