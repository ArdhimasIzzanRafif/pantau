import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import sharp from "sharp"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const organizationId = "cmweurtrr00046wxjj2e0fub6"
const marker = "Data uji manual MENU-01; kategori, foto, dan pagination."
const names = ["Beef Burger", "Cheese Burger", "Double Burger", "Classic Burger", "Mini Burger", "Original Burger", "Special Burger", "Smoky Burger", "Twin Burger", "BBQ Burger", "Signature Burger"]
const photos = ["drive-threepatties-beefburger.jpg", "drive-threepatties-cheeseburger.jpg", "drive-threepatties-twincheese.jpg"]

async function main() {
  const owner = await db.organizationUser.findFirstOrThrow({
    where: { organizationId, role: "OWNER", user: { email: "ardhimasrafif@gmail.com" } },
    select: { userId: true, organization: { select: { name: true } } },
  })
  for (const photo of photos) {
    const metadata = await sharp(`public/uploads/menu/${photo}`).metadata()
    if (!metadata.width || !metadata.height) throw new Error(`Foto tidak valid: ${photo}`)
  }
  const result = await db.$transaction(async (tx) => {
    const beef = await tx.inventoryItem.findFirstOrThrow({ where: { organizationId, name: "Beef", isMenuItem: false } })
    const bun = await tx.inventoryItem.findFirstOrThrow({ where: { organizationId, name: "Bun", isMenuItem: false } })
    let created = 0
    for (const [index, name] of names.entries()) {
      const number = String(index + 1).padStart(2, "0")
      const sku = `QA-MENU-${number}`
      const existing = await tx.inventoryItem.findUnique({ where: { organizationId_sku: { organizationId, sku } } })
      if (existing) {
        if (existing.notes !== marker) throw new Error(`SKU ${sku} sudah dipakai data lain`)
        continue
      }
      await tx.inventoryItem.create({ data: {
        organizationId, sku, name: `QA ${number} - ${name}`, category: "QA", unit: "pcs",
        isMenuItem: true, isTrackable: false, isAvailableForQr: false, isActive: true,
        sellPrice: 25000 + index * 1000,
        costPrice: Number(beef.costPrice ?? 0) * 0.05 + Number(bun.costPrice ?? 0),
        notes: marker, description: "Menu khusus pengujian manual. Resep uji: Beef 0,05 kg dan Bun 1 pcs.",
        imageUrl: index < photos.length ? `/api/uploads/menu/${photos[index]}` : null,
        recipeItems: { create: [{ childItemId: beef.id, quantity: 0.05 }, { childItemId: bun.id, quantity: 1 }] },
      } })
      created++
    }
    if (created) await tx.auditLog.create({ data: {
      organizationId, userId: owner.userId, action: "SETUP_MENU_QA", entity: "InventoryItem",
      after: { category: "QA", count: created, purpose: "MENU-01", publicQrEnabled: false },
    } })
    return { created, total: await tx.inventoryItem.count({ where: { organizationId, category: "QA", isMenuItem: true } }) }
  })
  console.log(JSON.stringify({ business: owner.organization.name, ...result, photos: photos.length }))
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
