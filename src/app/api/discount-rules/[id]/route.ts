import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { id } = await params
  const body = await req.json()
  const { name, type, value, minPurchase, isActive, validDays, expiresAt } = body

  const existing = await prisma.discountRule.findFirst({ where: { id, organizationId: user.organizationId } })
  if (!existing) return err("Tidak ditemukan", 404)

  if (type && !["PERCENT", "AMOUNT"].includes(type)) return err("type harus PERCENT atau AMOUNT")
  if (type === "PERCENT" && value != null && (Number(value) < 0 || Number(value) > 100)) return err("Persen harus 0–100")

  const rule = await prisma.discountRule.update({
    where: { id },
    data: {
      ...(name != null && { name }),
      ...(type != null && { type }),
      ...(value != null && { value }),
      ...(minPurchase != null && { minPurchase }),
      ...(isActive != null && { isActive }),
      ...("validDays" in body && { validDays: validDays || null }),
      ...("expiresAt" in body && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
    },
  })

  return ok(rule)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const { id } = await params

  const existing = await prisma.discountRule.findFirst({ where: { id, organizationId: user.organizationId } })
  if (!existing) return err("Tidak ditemukan", 404)

  await prisma.discountRule.delete({ where: { id } })
  return ok({ success: true })
}
