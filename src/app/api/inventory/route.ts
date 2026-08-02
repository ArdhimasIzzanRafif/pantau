import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function parseOptionalMinStock(value: unknown) {
  if (value === undefined || value === null || value === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.trunc(parsed)
}

function parseLocationMinStocks(value: unknown) {
  if (!Array.isArray(value)) return []

  const byLocation = new Map<string, number>()
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const locationId = (row as { locationId?: unknown }).locationId
    if (typeof locationId !== "string" || !locationId) continue

    const minStock = parseOptionalMinStock((row as { minStock?: unknown }).minStock)
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

  const items = await prisma.inventoryItem.findMany({
    where: {
      organizationId: user.organizationId,
      isMenuItem: false,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(category && { category }),
      ...(active !== null && { isActive: active === "true" }),
    },
    include: {
      stockBalances: {
        include: { location: true },
      },
      locationSettings: {
        include: { location: true },
      },
    },
    orderBy: { name: "asc" },
  })
  return ok(items)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Tidak diizinkan", 403)

  const body = await req.json()
  const { name, sku, category, unit, costPrice, minStock, isTrackable, notes, packSize, packUnit } = body
  const locationMinStocks = parseLocationMinStocks(body.locationMinStocks)

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
        packSize: packSize ? parseInt(packSize) : null,
        packUnit: packUnit || null,
        costPrice: costPrice ? parseFloat(costPrice) : null,
        minStock: parseOptionalMinStock(minStock),
        isTrackable: isTrackable !== false,
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
