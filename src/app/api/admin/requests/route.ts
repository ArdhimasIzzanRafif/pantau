import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { ok } from "@/lib/api-helpers"
import { NextRequest, NextResponse } from "next/server"
import { sendApprovalEmail } from "@/lib/email"
import { reviewRegistration, registrationErrorResponse } from "@/lib/registration"

export async function GET() {
  const admin = await requireAdmin()
  if (!("email" in admin)) return admin as NextResponse

  const orgs = await prisma.organization.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, slug: true, plan: true, status: true, registrationAttempts: true,
      ownerPhone: true, trialEndsAt: true, createdAt: true,
      _count: { select: { locations: { where: { isActive: true } }, users: true } },
      users: {
        where: { role: "OWNER" },
        take: 1,
        select: { user: { select: { name: true, email: true } } },
      },
    },
  })

  return ok(orgs.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    plan: o.plan,
    status: o.status,
    registrationAttempts: o.registrationAttempts,
    trialEndsAt: o.trialEndsAt,
    createdAt: o.createdAt,
    owner: o.users[0]?.user ?? null,
    ownerPhone: o.ownerPhone,
    counts: { locations: o._count.locations, users: o._count.users },
    daysLeft: o.trialEndsAt
      ? Math.ceil((new Date(o.trialEndsAt).getTime() - Date.now()) / 86400000)
      : null,
  })))
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin()
  if (!("email" in admin)) return admin as NextResponse

  const { id, action } = await req.json()
  if (!id || !action) return NextResponse.json({ error: "id dan action wajib" }, { status: 400 })

  try {
    if (action === "approve" || action === "reject") {
      const result = await reviewRegistration(prisma, id, action, admin.email)
      if (action === "approve" && result.owner && result.trialEndsAt) {
        sendApprovalEmail({
          ownerName: result.owner.name ?? "Pemilik", ownerEmail: result.owner.email,
          businessName: result.name, trialEndsAt: result.trialEndsAt,
        }).catch(console.error)
      }
      return ok({ ok: true, status: result.status, registrationAttempts: result.registrationAttempts })
    }
    if (action === "extend") {
      const org = await prisma.organization.findUnique({ where: { id }, select: { trialEndsAt: true } })
      if (!org) return NextResponse.json({ error: "Bisnis tidak ditemukan" }, { status: 404 })
      const base = org.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date()
      await prisma.organization.update({ where: { id }, data: {
        trialEndsAt: new Date(base.getTime() + 30 * 86400000), status: "ACTIVE", suspendedAt: null,
      } })
      return ok({ ok: true })
    }
    return NextResponse.json({ error: "Action tidak valid" }, { status: 400 })
  } catch (error) {
    const failure = registrationErrorResponse(error)
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status })
    console.error("Review registration error:", error)
    return NextResponse.json({ error: "Gagal memproses pengajuan" }, { status: 500 })
  }
}
