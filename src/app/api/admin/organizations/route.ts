import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { isResponse, ok } from "@/lib/api-helpers"

export async function GET() {
  const admin = await requireAdmin()
  if (isResponse(admin)) return admin

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          locations: true,
          posOrders: true,
          inventoryItems: true,
        },
      },
      users: {
        select: {
          user: { select: { email: true, name: true } },
          role: true,
        },
        where: { role: "OWNER" },
        take: 1,
      },
      posOrders: {
        where: { status: "PAID" },
        select: { total: true },
      },
    },
  })

  const result = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    createdAt: org.createdAt,
    owner: org.users[0]?.user ?? null,
    userCount: org._count.users,
    locationCount: org._count.locations,
    orderCount: org._count.posOrders,
    itemCount: org._count.inventoryItems,
    totalRevenue: org.posOrders.reduce((sum, o) => sum + Number(o.total), 0),
  }))

  return ok(result)
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin()
  if (isResponse(admin)) return admin

  const { id, plan } = await req.json()
  if (!id || !plan) return ok({ error: "id dan plan wajib" }, 400)

  await prisma.organization.update({ where: { id }, data: { plan } })
  return ok({ ok: true })
}
