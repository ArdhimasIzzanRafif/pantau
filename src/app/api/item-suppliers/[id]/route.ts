import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation } from "@/lib/location-access"
import { bacaIsianSupplier } from "@/lib/purchase-orders"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "SUPPLIERS")
  if (forbidden) return forbidden

  const { id } = await params
  const existing = await prisma.itemSupplier.findFirst({ where: { id, organizationId: user.organizationId } })
  if (!existing) return err("Pemetaan supplier tidak ditemukan", 404)
  if (!(await canAccessLocation(user, existing.locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  const isian = bacaIsianSupplier(await req.json().catch(() => ({})) as Record<string, unknown>)
  if (typeof isian === "string") return err(isian)

  const updated = await prisma.$transaction(async (tx) => {
    const hasil = await tx.itemSupplier.update({ where: { id }, data: isian })
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "UPDATE_ITEM_SUPPLIER",
        entity: "ItemSupplier",
        entityId: id,
        before: {
          supplierItemName: existing.supplierItemName,
          purchaseUnit: existing.purchaseUnit,
          purchaseUnitSize: existing.purchaseUnitSize == null ? null : Number(existing.purchaseUnitSize),
        },
        after: isian,
      },
    })
    return hasil
  })
  return ok(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  const forbidden = await denyUnlessCanEdit(user, "SUPPLIERS")
  if (forbidden) return forbidden

  const { id } = await params
  const existing = await prisma.itemSupplier.findFirst({ where: { id, organizationId: user.organizationId } })
  if (!existing) return err("Pemetaan supplier tidak ditemukan", 404)
  if (!(await canAccessLocation(user, existing.locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  await prisma.$transaction(async (tx) => {
    await tx.itemSupplier.delete({ where: { id } })
    const remaining = await tx.itemSupplier.findMany({
      where: { organizationId: user.organizationId, itemId: existing.itemId, locationId: existing.locationId },
      orderBy: { priority: "asc" },
    })
    for (const [index, row] of remaining.entries()) {
      if (row.priority !== index + 1) {
        await tx.itemSupplier.update({ where: { id: row.id }, data: { priority: index + 1 } })
      }
    }
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: "UNMAP_ITEM_SUPPLIER",
        entity: "ItemSupplier",
        entityId: id,
        before: {
          itemId: existing.itemId,
          locationId: existing.locationId,
          supplierId: existing.supplierId,
          priority: existing.priority,
        },
      },
    })
  })
  return ok({ success: true })
}
