import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🗑️  Wiping demo operational data (keeping master data & locations)...")

  const ownerUser = await prisma.user.findUnique({ where: { email: "owner@demo.com" } })
  if (!ownerUser) { console.log("❌ owner@demo.com not found"); return }

  const orgUser = await prisma.organizationUser.findFirst({ where: { userId: ownerUser.id, role: "OWNER" } })
  if (!orgUser) { console.log("❌ No org found for owner@demo.com"); return }

  const orgId = orgUser.organizationId
  console.log(`   org id: ${orgId}`)

  await prisma.$transaction(async (tx) => {
    // POS orders & shifts
    await tx.pOSOrderItemModifier.deleteMany({ where: { orderItem: { order: { organizationId: orgId } } } })
    await tx.pOSOrderItem.deleteMany({ where: { order: { organizationId: orgId } } })
    await tx.pOSPayment.deleteMany({ where: { order: { organizationId: orgId } } })
    await tx.pOSOrder.deleteMany({ where: { organizationId: orgId } })
    await tx.pOSShift.deleteMany({ where: { organizationId: orgId } })
    // POS uploads
    await tx.pOSSalesData.deleteMany({ where: { upload: { organizationId: orgId } } })
    await tx.pOSUpload.deleteMany({ where: { organizationId: orgId } })
    await tx.mappingTemplate.deleteMany({ where: { organizationId: orgId } })
    // Opname
    await tx.stockOpnameItem.deleteMany({ where: { opname: { organizationId: orgId } } })
    await tx.stockOpname.deleteMany({ where: { organizationId: orgId } })
    // Barang masuk
    await tx.goodsReceiptItem.deleteMany({ where: { receipt: { organizationId: orgId } } })
    await tx.goodsReceipt.deleteMany({ where: { organizationId: orgId } })
    // Transfer
    await tx.stockTransferItem.deleteMany({ where: { transfer: { organizationId: orgId } } })
    await tx.stockTransfer.deleteMany({ where: { organizationId: orgId } })
    // Stok
    await tx.stockMovement.deleteMany({ where: { organizationId: orgId } })
    await tx.inventoryLocationSetting.deleteMany({ where: { organizationId: orgId } })
    await tx.stockBalance.deleteMany({ where: { organizationId: orgId } })
    // Alerts & logs
    await tx.alert.deleteMany({ where: { organizationId: orgId } })
    await tx.auditLog.deleteMany({ where: { organizationId: orgId } })
    // Reset order counter
    await tx.organization.update({ where: { id: orgId }, data: { orderCounter: 0 } })
  })

  // Kept: InventoryItems, Locations, MenuModifierGroups, RecipeItems, DiscountRules, Tables, Users
  console.log("✅ Done. Operational data cleared. Master inventori, master menu, dan lokasi tetap ada.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
