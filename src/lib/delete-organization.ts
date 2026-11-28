import { Prisma, type PrismaClient } from "@prisma/client"

type DeleteOrganizationOptions = { removeOrphanedUsers?: boolean; adminEmail?: string }

/**
 * Hapus satu organisasi beserta data lintas-modulnya dengan urutan anak → induk.
 *
 * Sebagian relasi historis sengaja tidak memakai ON DELETE CASCADE agar item
 * atau lokasi tidak bisa menghapus jejak transaksi secara tidak sengaja.
 * Karena itu penghapusan organisasi tidak boleh hanya mengandalkan satu
 * `organization.delete()`.
 */
export async function deleteOrganizationData(prisma: PrismaClient, organizationId: string, options: DeleteOrganizationOptions = {}) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } })
    if (!org) return null
    const members = options.removeOrphanedUsers
      ? await tx.organizationUser.findMany({ where: { organizationId }, select: { userId: true } })
      : []
    const userIds = [...new Set(members.map((member) => member.userId))]
    if (userIds.length) {
      // Prevent a concurrent membership/transaction from being attached while
      // deciding whether an otherwise unused user can be removed.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(userIds)}) ORDER BY id FOR UPDATE`)
    }
    // POS
    await tx.pOSOrderItemModifier.deleteMany({ where: { orderItem: { order: { organizationId } } } })
    await tx.pOSPayment.deleteMany({ where: { order: { organizationId } } })
    await tx.pOSOrderItem.deleteMany({ where: { order: { organizationId } } })
    await tx.pOSOrder.deleteMany({ where: { organizationId } })
    await tx.pOSShift.deleteMany({ where: { organizationId } })

    // Opname, penerimaan, dan transfer
    await tx.stockOpnameItem.deleteMany({ where: { opname: { organizationId } } })
    await tx.stockOpname.deleteMany({ where: { organizationId } })
    await tx.goodsReceiptItem.deleteMany({ where: { receipt: { organizationId } } })
    await tx.goodsReceipt.deleteMany({ where: { organizationId } })
    await tx.stockTransferBatchAllocation.deleteMany({ where: { transferItem: { transfer: { organizationId } } } })
    await tx.stockReservation.deleteMany({ where: { organizationId } })
    await tx.stockTransferItem.deleteMany({ where: { transfer: { organizationId } } })
    await tx.stockTransfer.deleteMany({ where: { organizationId } })

    // Pengadaan dan komunikasi supplier
    await tx.supplierMessageStatusEvent.deleteMany({ where: { organizationId } })
    await tx.purchaseOrderDocument.deleteMany({ where: { organizationId } })
    await tx.incomingWhatsAppMessage.deleteMany({ where: { organizationId } })
    await tx.whatsAppOutbox.deleteMany({ where: { organizationId } })
    await tx.purchaseRequest.deleteMany({ where: { organizationId } })
    await tx.purchaseOrder.deleteMany({ where: { organizationId } })

    // Stok dan produksi
    await tx.stockAdjustment.deleteMany({ where: { organizationId } })
    await tx.stockMovement.deleteMany({ where: { organizationId } })
    await tx.stockBatch.deleteMany({ where: { organizationId } })
    await tx.stockBalance.deleteMany({ where: { organizationId } })
    await tx.inventoryLocationSetting.deleteMany({ where: { organizationId } })
    await tx.productionIngredient.deleteMany({ where: { recipe: { organizationId } } })
    await tx.inventoryProduction.deleteMany({ where: { organizationId } })
    await tx.productionRecipe.deleteMany({ where: { organizationId } })

    // Menu, modifier, diskon, dan pemetaan supplier
    await tx.modifierRecipeItem.deleteMany({ where: { option: { group: { organizationId } } } })
    await tx.inventoryItemModifier.deleteMany({ where: { group: { organizationId } } })
    await tx.menuModifierOption.deleteMany({ where: { group: { organizationId } } })
    await tx.menuModifierGroup.deleteMany({ where: { organizationId } })
    await tx.recipeItem.deleteMany({
      where: {
        OR: [
          { parentItem: { organizationId } },
          { childItem: { organizationId } },
        ],
      },
    })
    await tx.discountRuleLocation.deleteMany({ where: { discountRule: { organizationId } } })
    await tx.discountRuleItem.deleteMany({ where: { discountRule: { organizationId } } })
    await tx.discountRule.deleteMany({ where: { organizationId } })
    await tx.itemSupplier.deleteMany({ where: { organizationId } })
    await tx.supplierPhone.deleteMany({ where: { organizationId } })
    await tx.supplier.deleteMany({ where: { organizationId } })

    // Master dan catatan organisasi
    await tx.table.deleteMany({ where: { organizationId } })
    await tx.alert.deleteMany({ where: { organizationId } })
    await tx.auditLog.deleteMany({ where: { organizationId } })
    await tx.inventoryItem.deleteMany({ where: { organizationId } })
    await tx.location.deleteMany({ where: { organizationId } })
    await tx.organizationWhatsApp.deleteMany({ where: { organizationId } })

    const deleted = await tx.organization.delete({ where: { id: organizationId } })
    if (userIds.length) {
      const unused = await tx.user.findMany({ where: {
        id: { in: userIds }, organizations: { none: {} },
        posOrdersAsCashier: { none: {} }, posShiftsAsCashier: { none: {} },
      }, select: { id: true, email: true } })
      if (unused.length) {
        await tx.verificationToken.deleteMany({ where: { OR: [
          { identifier: { in: unused.map((user) => user.email) } },
          ...unused.map((user) => ({ identifier: { startsWith: `registration-retry:${user.id}:` } })),
        ] } })
        await tx.user.deleteMany({ where: { id: { in: unused.map((user) => user.id) } } })
      }
    }
    if (options.adminEmail) {
      await tx.platformAuditLog.create({ data: {
        adminEmail: options.adminEmail, action: "delete_organization", targetType: "organization",
        targetId: organizationId, before: { name: org.name }, after: { deleted: true },
      } })
    }
    return deleted
  }, { maxWait: 10_000, timeout: 30_000 })
}
