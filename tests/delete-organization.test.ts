import "dotenv/config"
import assert from "node:assert/strict"
import test, { after } from "node:test"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { deleteOrganizationData } from "../src/lib/delete-organization"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

test("hapus bisnis tetap berhasil setelah memiliki transaksi barang masuk", async () => {
  const org = await db.organization.create({
    data: { name: "Delete organization test", slug: `delete-org-test-${randomUUID()}` },
  })

  try {
    const location = await db.location.create({
      data: { organizationId: org.id, name: "Gudang test", type: "WAREHOUSE" },
    })
    const item = await db.inventoryItem.create({
      data: { organizationId: org.id, name: "Bahan test", unit: "kg" },
    })
    const receipt = await db.goodsReceipt.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        status: "CONFIRMED",
        items: {
          create: {
            itemId: item.id,
            quantity: 1,
            purchaseQuantity: 1,
            purchaseUnit: "kg",
          },
        },
      },
    })
    assert.ok(receipt.id)

    await deleteOrganizationData(db, org.id)
    assert.equal(await db.organization.findUnique({ where: { id: org.id } }), null)
    assert.equal(await db.inventoryItem.count({ where: { organizationId: org.id } }), 0)
    assert.equal(await db.goodsReceipt.count({ where: { organizationId: org.id } }), 0)
  } finally {
    // Bila assertion sebelum helper gagal, bersihkan record yang sempat dibuat.
    if (await db.organization.findUnique({ where: { id: org.id } })) {
      await deleteOrganizationData(db, org.id)
    }
  }
})

after(async () => db.$disconnect())
