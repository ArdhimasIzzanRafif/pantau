import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { isResponse, ok } from "@/lib/api-helpers"
import { NextResponse } from "next/server"
import { deleteOrganizationData } from "@/lib/delete-organization"
import { effectiveOrganizationStatus } from "@/lib/organization-subscription"
import { Prisma } from "@prisma/client"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin()
    if (isResponse(admin)) return admin

    const { id } = await params

    const org = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, plan: true, status: true, registrationAttempts: true,
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

  try {
    await deleteOrganizationData(prisma, id, { removeOrphanedUsers: true, adminEmail: admin.email })
    return ok({ ok: true })
  } catch (error) {
    console.error("[admin/businesses/delete]", error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2028") return NextResponse.json({ error: "Penghapusan terlalu lama. Silakan coba lagi." }, { status: 503 })
      if (error.code === "P2003") return NextResponse.json({ error: "Bisnis masih terhubung dengan data lain. Penghapusan dibatalkan." }, { status: 409 })
    }
    return NextResponse.json({ error: "Bisnis gagal dihapus. Silakan coba lagi." }, { status: 500 })
  }
}
