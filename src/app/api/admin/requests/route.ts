import { prisma } from "@/lib/db"
import { requireAdmin } from "@/lib/admin-auth"
import { ok } from "@/lib/api-helpers"
import { NextRequest, NextResponse } from "next/server"
import { sendApprovalEmail } from "@/lib/email"

export async function GET() {
  const admin = await requireAdmin()
  if (!("email" in admin)) return admin as NextResponse

  const orgs = await prisma.organization.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, slug: true, plan: true, status: true,
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

  if (action === "approve") {
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const org = await prisma.organization.update({
      where: { id },
      data: { status: "ACTIVE", trialEndsAt },
      select: {
        name: true,
        users: {
          where: { role: "OWNER" },
          take: 1,
          select: { user: { select: { name: true, email: true } } },
        },
      },
    })
    const owner = org.users[0]?.user
    if (owner) {
      sendApprovalEmail({
        ownerName: owner.name ?? "Pemilik",
        ownerEmail: owner.email,
        businessName: org.name,
        trialEndsAt,
      }).catch(console.error)
    }
  } else if (action === "reject") {
    await prisma.organization.update({
      where: { id },
      data: { status: "SUSPENDED" },
    })
  } else if (action === "extend") {
    const org = await prisma.organization.findUnique({ where: { id }, select: { trialEndsAt: true } })
    const base = org?.trialEndsAt && org.trialEndsAt > new Date() ? org.trialEndsAt : new Date()
    await prisma.organization.update({
      where: { id },
      data: { trialEndsAt: new Date(base.getTime() + 30 * 86400000) },
    })
  }

  return ok({ ok: true })
}
