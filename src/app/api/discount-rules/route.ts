import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { DiscountRuleInputError, parseDiscountRuleInput } from "@/lib/discount-rule-validation"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const locationId = req.nextUrl.searchParams.get("locationId")

  if (locationId && !(await canAccessLocation(user, locationId))) {
    return err("Tidak ada akses ke outlet ini", 403)
  }

  const rules = await prisma.discountRule.findMany({
    where: {
      organizationId: user.organizationId,
      ...(locationId
        ? {
            OR: [
              { locations: { none: {} } },
              { locations: { some: { locationId } } },
            ],
          }
        : {}),
    },
    include: {
      locations: {
        select: { location: { select: { id: true, name: true } } },
        orderBy: { location: { createdAt: "asc" } },
      },
      items: {
        select: { menuItem: { select: { id: true, name: true } } },
        orderBy: { menuItem: { name: "asc" } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  })

  return ok(rules)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden

  const body = await req.json() as Record<string, unknown>
  let parsed: ReturnType<typeof parseDiscountRuleInput>
  try {
    parsed = parseDiscountRuleInput(body)
  } catch (error) {
    if (error instanceof DiscountRuleInputError) return err(error.message)
    throw error
  }

  const locationIds = parsed.locationIds ?? []
  if (locationIds.length > 0) {
    const validLocationCount = await prisma.location.count({
      where: {
        id: { in: locationIds },
        organizationId: user.organizationId,
        type: "OUTLET",
        isActive: true,
      },
    })
    if (validLocationCount !== locationIds.length) return err("Ada outlet diskon yang tidak valid")
  }

  const itemIds = parsed.itemIds ?? []
  if (itemIds.length > 0) {
    const validItemCount = await prisma.inventoryItem.count({
      where: { id: { in: itemIds }, organizationId: user.organizationId, isMenuItem: true },
    })
    if (validItemCount !== itemIds.length) return err("Ada menu diskon yang tidak valid")
  }

  const count = await prisma.discountRule.count({ where: { organizationId: user.organizationId } })

  const rule = await prisma.discountRule.create({
    data: {
      organizationId: user.organizationId,
      ...parsed.data,
      sortOrder: count,
      locations: locationIds.length > 0
        ? { create: locationIds.map((locationId) => ({ locationId })) }
        : undefined,
      items: itemIds.length > 0
        ? { create: itemIds.map((menuItemId) => ({ menuItemId })) }
        : undefined,
    },
    include: {
      locations: { select: { location: { select: { id: true, name: true } } } },
      items: { select: { menuItem: { select: { id: true, name: true } } } },
    },
  })

  return ok(rule, 201)
}
