import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { effectiveOrganizationStatus, hasOrganizationAccess } from "@/lib/organization-subscription"

export type SessionUser = {
  id: string
  email: string
  name?: string | null
  organizationId: string
  role: string
  businessName?: string | null
}

export async function requireAuth(): Promise<SessionUser | NextResponse> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const user = session.user as typeof session.user & Partial<SessionUser>
  if (!user.organizationId || !user.role) {
    return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 403 })
  }
  // Read on every API request: an old JWT must not keep an expired or suspended
  // business operational, or prevent access immediately after an extension.
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { status: true, trialEndsAt: true },
  })
  if (!organization) return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 403 })
  if (!hasOrganizationAccess(organization)) {
    const status = effectiveOrganizationStatus(organization)
    return NextResponse.json({
      error: status === "EXPIRED" ? "Langganan bisnis sudah berakhir. Hubungi admin untuk perpanjangan." : "Akun bisnis belum aktif atau ditangguhkan.",
      code: status === "EXPIRED" ? "SUBSCRIPTION_EXPIRED" : "ORGANIZATION_INACTIVE",
      status,
    }, { status: 403 })
  }
  return {
    id: userId,
    email: user.email ?? "",
    name: user.name,
    organizationId: user.organizationId,
    role: user.role,
    businessName: user.businessName,
  }
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}

function toPlainJson(value: unknown, depth = 0): unknown {
  if (value == null || depth > 12) return value
  if (typeof value === "object") {
    if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber()
    if (value instanceof Date) return value
    if (Array.isArray(value)) return value.map((entry) => toPlainJson(entry, depth + 1))
    if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
      const result: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value)) result[key] = toPlainJson(entry, depth + 1)
      return result
    }
  }
  return value
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(toPlainJson(data), { status })
}

export const normalizeForJson = toPlainJson

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
