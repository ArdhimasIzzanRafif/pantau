import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { parseOptionalMinimumStock, QuantityInputError } from "@/lib/inventory-quantity"
import { validateInventoryPackaging, UnitError } from "@/lib/unit-conversion"
import { InventoryCostError, parseOptionalInventoryCost } from "@/lib/inventory-cost"

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function parseLocationMinStocks(value: unknown) {
  if (!Array.isArray(value)) return []

  const byLocation = new Map<string, number>()
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const locationId = (row as { locationId?: unknown }).locationId
    if (typeof locationId !== "string" || !locationId) continue

    const minStock = parseOptionalMinimumStock((row as { minStock?: unknown }).minStock)
    if (minStock !== null) byLocation.set(locationId, minStock)
  }

  return Array.from(byLocation, ([locationId, minStock]) => ({ locationId, minStock }))
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") ?? ""
  const category = searchParams.get("category") ?? ""
  const active = searchParams.get("active")
  // Pagination bersifat opt-in: banyak halaman lain memakai endpoint ini sebagai
  // daftar penuh untuk dropdown/lookup, jadi tanpa ?page responsnya tetap array.
  const pageParam = searchParams.get("page")
  // Waste & Penyesuaian perlu seluruh item — bahan baku maupun menu jadi —
  // karena keduanya bisa rusak. Halaman lain tetap dapat daftar tanpa menu.
  const includeMenuItems = searchParams.get("includeMenuItems") === "1"

  const where: Prisma.InventoryItemWhereInput = {
    organizationId: user.organizationId,
    ...(includeMenuItems ? {} : { isMenuItem: false }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(category && { category }),
    ...(active !== null && { isActive: active === "true" }),
  }

  const include = {
    stockBalances: { include: { location: true } },
    locationSettings: { include: { location: true } },
  }

  if (pageParam === null) {
    const items = await prisma.inventoryItem.findMany({ where, include, orderBy: { name: "asc" } })
    return ok(items)
  }

  const page = Math.max(1, Number(pageParam) || 1)
  const take = 30
  // Ringkasan di header dan daftar kategori dihitung lintas organisasi, bukan per
  // halaman, supaya angkanya tidak ikut mengecil saat daftar dipaginasi.
  const scope: Prisma.InventoryItemWhereInput = {
    organizationId: user.organizationId,
    isMenuItem: false,
    ...(active !== null && { isActive: active === "true" }),
  }

  const [total, items, totalAll, missingCost, categoryRows] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      include,
      orderBy: { name: "asc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.inventoryItem.count({ where: scope }),
    prisma.inventoryItem.count({
      // Null = belum ditentukan. Rp0 adalah nilai sah untuk bahan gratis.
      where: { ...scope, isTrackable: true, costPrice: null },
    }),
    prisma.inventoryItem.findMany({
      where: scope,
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ])

  return ok({
    items,
    total,
    page,
    pages: Math.ceil(total / take),
    totalAll,
    missingCost,
    categories: categoryRows.map((row) => row.category).filter(Boolean),
  })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_INVENTORY")
  if (forbidden) return forbidden

  const body = await req.json()
  const { name, sku, category, unit, costPrice, isTrackable, isActive, notes, packSize, packUnit } = body
  let locationMinStocks: ReturnType<typeof parseLocationMinStocks>
  let packaging: ReturnType<typeof validateInventoryPackaging>
  let parsedCostPrice: number | null
  try {
    locationMinStocks = parseLocationMinStocks(body.locationMinStocks)
    packaging = validateInventoryPackaging(unit || "pcs", packSize, packUnit)
    parsedCostPrice = parseOptionalInventoryCost(costPrice)
  } catch (error) {
    if (error instanceof UnitError || error instanceof QuantityInputError || error instanceof InventoryCostError) return err(error.message)
    throw error
  }

  if (!name) return err("Nama item wajib diisi")

  if (sku) {
    const existing = await prisma.inventoryItem.findUnique({
      where: { organizationId_sku: { organizationId: user.organizationId, sku } },
    })
    if (existing) return err("SKU sudah digunakan", 409)
  }

  if (locationMinStocks.length > 0) {
    const validLocationCount = await prisma.location.count({
      where: {
        organizationId: user.organizationId,
        id: { in: locationMinStocks.map((row) => row.locationId) },
      },
    })
    if (validLocationCount !== locationMinStocks.length) {
      return err("Ada lokasi yang tidak valid")
    }
  }

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: {
        organizationId: user.organizationId,
        name,
        sku: sku || null,
        category: category || null,
        unit: unit || "pcs",
        ...packaging,
        costPrice: parsedCostPrice,
        minStock: null,
        isTrackable: isTrackable !== false,
        isActive: isActive !== false,
        notes: notes || null,
      },
    })

    if (locationMinStocks.length > 0) {
      await tx.inventoryLocationSetting.createMany({
        data: locationMinStocks.map((row) => ({
          organizationId: user.organizationId,
          itemId: created.id,
          locationId: row.locationId,
          minStock: row.minStock,
        })),
      })
    }

    return created
  })

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "CREATE",
      entity: "InventoryItem",
      entityId: item.id,
      after: toAuditJson(item),
    },
  })

  return ok(item, 201)
}
