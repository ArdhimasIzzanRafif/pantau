import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { DiscountRuleInputError, parseDiscountRuleInput } from "@/lib/discount-rule-validation"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden

  const { id } = await params
  const body = await req.json() as Record<string, unknown>

  const existing = await prisma.discountRule.findFirst({ where: { id, organizationId: user.organizationId } })
  if (!existing) return err("Tidak ditemukan", 404)

  let parsed: ReturnType<typeof parseDiscountRuleInput>
  try {
    parsed = parseDiscountRuleInput(body, existing)
  } catch (error) {
    if (error instanceof DiscountRuleInputError) return err(error.message)
    throw error
  }

  if (parsed.locationIds && parsed.locationIds.length > 0) {
    const validLocationCount = await prisma.location.count({
      where: {
        id: { in: parsed.locationIds },
        organizationId: user.organizationId,
        type: "OUTLET",
        isActive: true,
      },
    })
    if (validLocationCount !== parsed.locationIds.length) return err("Ada outlet diskon yang tidak valid")
  }

  if (parsed.itemIds && parsed.itemIds.length > 0) {
    const validItemCount = await prisma.inventoryItem.count({
      where: { id: { in: parsed.itemIds }, organizationId: user.organizationId, isMenuItem: true },
    })
    if (validItemCount !== parsed.itemIds.length) return err("Ada menu diskon yang tidak valid")
  }

  const rule = await prisma.$transaction(async (tx) => {
    if (parsed.locationIds) {
      await tx.discountRuleLocation.deleteMany({ where: { discountRuleId: id } })
      if (parsed.locationIds.length > 0) {
        await tx.discountRuleLocation.createMany({
          data: parsed.locationIds.map((locationId) => ({ discountRuleId: id, locationId })),
        })
      }
    }
    if (parsed.itemIds) {
      await tx.discountRuleItem.deleteMany({ where: { discountRuleId: id } })
      if (parsed.itemIds.length > 0) {
        await tx.discountRuleItem.createMany({
          data: parsed.itemIds.map((menuItemId) => ({ discountRuleId: id, menuItemId })),
        })
      }
    }
    return tx.discountRule.update({
      where: { id },
      data: parsed.data,
      include: {
        locations: { select: { location: { select: { id: true, name: true } } } },
        items: { select: { menuItem: { select: { id: true, name: true } } } },
      },
    })
  })

  return ok(rule)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden

  const { id } = await params

  const existing = await prisma.discountRule.findFirst({ where: { id, organizationId: user.organizationId } })
  if (!existing) return err("Tidak ditemukan", 404)

  await prisma.discountRule.delete({ where: { id } })
  return ok({ success: true })
}
