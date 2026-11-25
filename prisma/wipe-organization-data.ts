import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

const TARGET_ORGANIZATION_ID = process.argv[2]
const REQUIRED_CONFIRMATION = `HAPUS:${TARGET_ORGANIZATION_ID}`

if (!TARGET_ORGANIZATION_ID || process.argv[3] !== REQUIRED_CONFIRMATION) {
  console.error("Pemakaian: tsx prisma/wipe-organization-data.ts <organizationId> HAPUS:<organizationId>")
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL belum diatur")

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { id: TARGET_ORGANIZATION_ID },
    select: {
      id: true,
      name: true,
      users: { select: { id: true } },
      locations: { select: { id: true } },
    },
  })
  if (!organization) throw new Error("Organisasi target tidak ditemukan")

  console.log(`Mengosongkan data operasional: ${organization.name} (${organization.id})`)
  console.log(`Dipertahankan: ${organization.users.length} anggota dan ${organization.locations.length} lokasi`)

  const deleted = await prisma.$transaction(async (tx) => {
    const result: Record<string, number> = {}
    const remember = (name: string, count: number) => { result[name] = count }

    remember("POS modifier", (await tx.pOSOrderItemModifier.deleteMany({ where: { orderItem: { order: { organizationId: organization.id } } } })).count)
    remember("POS item", (await tx.pOSOrderItem.deleteMany({ where: { order: { organizationId: organization.id } } })).count)
    remember("Pembayaran POS", (await tx.pOSPayment.deleteMany({ where: { order: { organizationId: organization.id } } })).count)
    remember("Pesanan POS", (await tx.pOSOrder.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Shift POS", (await tx.pOSShift.deleteMany({ where: { organizationId: organization.id } })).count)

    remember("Item barang masuk", (await tx.goodsReceiptItem.deleteMany({ where: { receipt: { organizationId: organization.id } } })).count)
    remember("Barang masuk", (await tx.goodsReceipt.deleteMany({ where: { organizationId: organization.id } })).count)

    remember("Dokumen pembelian", (await tx.purchaseOrderDocument.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Status pesan supplier", (await tx.supplierMessageStatusEvent.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Pesan WhatsApp masuk", (await tx.incomingWhatsAppMessage.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("WhatsApp keluar", (await tx.whatsAppOutbox.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Permintaan pembelian", (await tx.purchaseRequest.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Pesanan pembelian", (await tx.purchaseOrder.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Nomor supplier", (await tx.supplierPhone.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Pemetaan supplier", (await tx.itemSupplier.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Supplier", (await tx.supplier.deleteMany({ where: { organizationId: organization.id } })).count)

    remember("Reservasi stok", (await tx.stockReservation.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Alokasi batch transfer", (await tx.stockTransferBatchAllocation.deleteMany({ where: { transferItem: { transfer: { organizationId: organization.id } } } })).count)
    remember("Item transfer", (await tx.stockTransferItem.deleteMany({ where: { transfer: { organizationId: organization.id } } })).count)
    remember("Transfer", (await tx.stockTransfer.deleteMany({ where: { organizationId: organization.id } })).count)

    remember("Item opname", (await tx.stockOpnameItem.deleteMany({ where: { opname: { organizationId: organization.id } } })).count)
    remember("Opname", (await tx.stockOpname.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Penyesuaian stok", (await tx.stockAdjustment.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Pergerakan stok", (await tx.stockMovement.deleteMany({ where: { organizationId: organization.id } })).count)

    remember("Produksi inventori", (await tx.inventoryProduction.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Bahan resep produksi", (await tx.productionIngredient.deleteMany({ where: { recipe: { organizationId: organization.id } } })).count)
    remember("Resep produksi", (await tx.productionRecipe.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Batch stok", (await tx.stockBatch.deleteMany({ where: { organizationId: organization.id } })).count)

    remember("Modifier pesanan", (await tx.modifierRecipeItem.deleteMany({ where: { option: { group: { organizationId: organization.id } } } })).count)
    remember("Relasi modifier menu", (await tx.inventoryItemModifier.deleteMany({ where: { group: { organizationId: organization.id } } })).count)
    remember("Opsi modifier", (await tx.menuModifierOption.deleteMany({ where: { group: { organizationId: organization.id } } })).count)
    remember("Grup modifier", (await tx.menuModifierGroup.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Resep menu", (await tx.recipeItem.deleteMany({ where: { parentItem: { organizationId: organization.id } } })).count)

    remember("Lokasi diskon", (await tx.discountRuleLocation.deleteMany({ where: { discountRule: { organizationId: organization.id } } })).count)
    remember("Item diskon", (await tx.discountRuleItem.deleteMany({ where: { discountRule: { organizationId: organization.id } } })).count)
    remember("Aturan diskon", (await tx.discountRule.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Meja", (await tx.table.deleteMany({ where: { organizationId: organization.id } })).count)

    remember("Pengaturan minimum stok", (await tx.inventoryLocationSetting.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Saldo stok", (await tx.stockBalance.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Peringatan", (await tx.alert.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Riwayat", (await tx.auditLog.deleteMany({ where: { organizationId: organization.id } })).count)
    remember("Master inventori & menu", (await tx.inventoryItem.deleteMany({ where: { organizationId: organization.id } })).count)

    await tx.organization.update({
      where: { id: organization.id },
      data: { orderCounter: 0 },
    })
    return result
  })

  for (const [label, count] of Object.entries(deleted)) {
    if (count > 0) console.log(`- ${label}: ${count}`)
  }
  console.log("Data operasional berhasil dikosongkan.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
