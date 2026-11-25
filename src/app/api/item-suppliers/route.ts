import { Prisma } from "@prisma/client"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { bacaIsianSupplier } from "@/lib/purchase-orders"

/** Pemetaan satu supplier di satu gudang (satuan beli per bahan), untuk form pesanan manual. */
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const supplierId = req.nextUrl.searchParams.get("supplierId") ?? ""
  const locationId = req.nextUrl.searchParams.get("locationId") ?? ""
  if (!supplierId || !locationId) return err("Supplier dan gudang wajib dipilih")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)
  const mappings = await prisma.itemSupplier.findMany({
    where: { organizationId: user.organizationId, supplierId, locationId },
    select: { itemId: true, supplierItemName: true, purchaseUnit: true, purchaseUnitSize: true },
  })
  return ok(mappings)
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "SUPPLIERS")
  if (forbidden) return forbidden

  const body = await req.json() as Record<string, unknown>
  const itemId = typeof body.itemId === "string" ? body.itemId : ""
  const locationId = typeof body.locationId === "string" ? body.locationId : ""
  const supplierId = typeof body.supplierId === "string" ? body.supplierId : ""
  if (!itemId || !locationId || !supplierId) return err("Bahan, lokasi, dan supplier wajib dipilih")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)
  const isian = bacaIsianSupplier(body)
  if (typeof isian === "string") return err(isian)

  const [item, location, supplier] = await Promise.all([
    prisma.inventoryItem.findFirst({ where: { id: itemId, organizationId: user.organizationId, isTrackable: true } }),
    prisma.location.findFirst({ where: { id: locationId, organizationId: user.organizationId, isActive: true } }),
    prisma.supplier.findFirst({ where: { id: supplierId, organizationId: user.organizationId, isActive: true } }),
  ])
  if (!item) return err("Bahan tidak valid")
  if (!location) return err("Lokasi tidak valid")
  if (!supplier) return err("Supplier tidak valid")
  if (!supplier.phone) return err("Nomor WhatsApp supplier wajib diisi sebelum pemetaan")

  try {
    const mapping = await prisma.$transaction(async (tx) => {
      const last = await tx.itemSupplier.findFirst({
        where: { organizationId: user.organizationId, itemId, locationId },
        orderBy: { priority: "desc" },
        select: { priority: true },
      })
      const created = await tx.itemSupplier.create({
        data: {
          organizationId: user.organizationId,
          itemId,
          locationId,
          supplierId,
          priority: (last?.priority ?? 0) + 1,
          ...isian,
        },
        include: {
          item: { select: { id: true, name: true, unit: true } },
          location: { select: { id: true, name: true } },
        },
      })
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "MAP_ITEM_SUPPLIER",
          entity: "ItemSupplier",
          entityId: created.id,
          after: { itemId, locationId, supplierId, priority: created.priority },
        },
      })
      return created
    })
    return ok(mapping, 201)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return err("Supplier ini sudah terdaftar untuk bahan dan lokasi tersebut", 409)
    }
    throw error
  }
}
