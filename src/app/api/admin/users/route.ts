import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { isResponse, ok } from "@/lib/api-helpers"

export async function GET() {
  const admin = await requireAdmin()
  if (isResponse(admin)) return admin

  const orgUsers = await prisma.organizationUser.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, email: true, name: true, createdAt: true } },
      organization: { select: { id: true, name: true, plan: true, status: true } },
    },
  })

  const result = orgUsers.map((ou) => ({
    id: ou.id,
    userId: ou.userId,
    email: ou.user.email,
    name: ou.user.name,
    role: ou.role,
    joinedAt: ou.createdAt,
    userCreatedAt: ou.user.createdAt,
    org: {
      id: ou.organization.id,
      name: ou.organization.name,
      plan: ou.organization.plan,
      status: ou.organization.status,
    },
  }))

  return ok(result)
}
