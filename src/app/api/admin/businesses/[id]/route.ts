import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { isResponse, ok } from "@/lib/api-helpers"
import { NextResponse } from "next/server"
import { deleteOrganizationData } from "@/lib/delete-organization"
import { effectiveOrganizationStatus } from "@/lib/organization-subscription"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin()
    if (isResponse(admin)) return admin

    const { id } = await params

    const org = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, plan: true, status: true,
        ownerPhone: true, trialEndsAt: true, createdAt: true,
        users: {
          include: {
            user: { select: { id: true, name: true, email: true, createdAt: true } },
            assignedLocations: { include: { location: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
        locations: { where: { isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
        _count: { select: { posOrders: true, goodsReceipts: true, stockTransfers: true } },
      },
    })

    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return ok({ ...org, status: effectiveOrganizationStatus(org) })
  } catch (e) {
    console.error("[admin/businesses/id]", e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (isResponse(admin)) return admin

  const { id } = await params

  // Simpan daftar user lebih dulu; user dapat menjadi anggota organisasi lain.
  const orgUsers = await prisma.organizationUser.findMany({
    where: { organizationId: id },
    select: { userId: true },
  })

  await deleteOrganizationData(prisma, id)

  // Hapus user yang tidak punya org lain
  for (const { userId } of orgUsers) {
    const stillHasOrg = await prisma.organizationUser.count({ where: { userId } })
    if (stillHasOrg === 0) {
      await prisma.user.delete({ where: { id: userId } })
    }
  }

  return ok({ ok: true })
}
