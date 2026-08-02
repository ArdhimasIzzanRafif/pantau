import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET(_req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const rules = await prisma.discountRule.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })

  return ok(rules)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const body = await req.json()
  const { name, type, value, minPurchase = 0, isActive = true, validDays, expiresAt } = body

  if (!name || !type || value == null) return err("name, type, value wajib diisi")
  if (!["PERCENT", "AMOUNT"].includes(type)) return err("type harus PERCENT atau AMOUNT")
  if (type === "PERCENT" && (Number(value) < 0 || Number(value) > 100)) return err("Persen harus 0–100")

  const count = await prisma.discountRule.count({ where: { organizationId: user.organizationId } })

  const rule = await prisma.discountRule.create({
    data: {
      organizationId: user.organizationId,
      name,
      type,
      value,
      minPurchase,
      isActive,
      sortOrder: count,
      validDays: validDays || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  })

  return ok(rule)
}
