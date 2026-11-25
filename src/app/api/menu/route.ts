import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const search   = searchParams.get("search") ?? ""
  const category = searchParams.get("category") ?? ""
  // Pagination opt-in: tanpa ?page responsnya tetap array penuh, karena aplikasi
  // mobile dan beberapa pemakai lain mengandalkan bentuk itu.
  const pageParam = searchParams.get("page")
  // Mode ringan untuk dropdown/daftar kategori — tanpa resep & modifier bertingkat.
  const minimal = searchParams.get("minimal") === "1"

  const where: Prisma.InventoryItemWhereInput = {
    organizationId: user.organizationId,
    isMenuItem: true,
    ...(search && { name: { contains: search, mode: "insensitive" } }),
    ...(category && { category }),
  }

  if (minimal) {
    const rows = await prisma.inventoryItem.findMany({
      where: { organizationId: user.organizationId, isMenuItem: true },
      select: { id: true, name: true, category: true, isActive: true },
      orderBy: { name: "asc" },
    })
    return ok(rows)
  }

  const include = {
      recipeItems: { include: { childItem: true } },
      modifierGroups: {
        include: {
          group: {
            include: {
              options: {
                orderBy: { sortOrder: "asc" },
                include: {
                  recipeItems: {
                    include: { item: { select: { id: true, name: true, unit: true, isTrackable: true } } },
                  },
                },
              },
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
  } satisfies Prisma.InventoryItemInclude

  if (pageParam === null) {
    const menus = await prisma.inventoryItem.findMany({ where, include, orderBy: [{ name: "asc" }, { id: "asc" }] })
    return ok(menus)
  }

  const page = Math.max(1, Number(pageParam) || 1)
  const take = Math.min(100, Math.max(1, Number(searchParams.get("take") ?? 5)))

  const [total, items, totalAll] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    prisma.inventoryItem.findMany({
      where,
      include,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * take,
      take,
    }),
    prisma.inventoryItem.count({ where: { organizationId: user.organizationId, isMenuItem: true } }),
  ])

  return ok({ items, total, page, pages: Math.ceil(total / take), totalAll })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "MASTER_MENU")
  if (forbidden) return forbidden

  const body = await req.json()
  const { name, sku, category, notes, sellPrice, description, imageUrl } = body

  if (!name) return err("Nama menu wajib diisi")

  if (sku) {
    const existing = await prisma.inventoryItem.findUnique({
      where: { organizationId_sku: { organizationId: user.organizationId, sku } },
    })
    if (existing) return err("SKU sudah digunakan", 409)
  }

  const menu = await prisma.inventoryItem.create({
    data: {
      organizationId: user.organizationId,
      name,
      sku: sku || null,
      category: category || null,
      unit: "pcs",
      isTrackable: false,
      isMenuItem: true,
      notes: notes || null,
      sellPrice: sellPrice != null ? sellPrice : null,
      description: description || null,
      imageUrl: imageUrl || null,
    },
  })

  return ok(menu, 201)
}
