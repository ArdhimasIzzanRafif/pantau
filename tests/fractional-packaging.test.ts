import "dotenv/config"
import assert from "node:assert/strict"
import test, { after } from "node:test"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { parseInventoryDecimal, parseInventoryQuantity, parseOptionalMinimumStock, multiplyInventoryQuantity, quantityInPackages, costPerBaseUnit, formatInventoryQuantity } from "../src/lib/inventory-quantity"
import { convertToBase, validateInventoryPackaging } from "../src/lib/unit-conversion"
import { addStock, consumeStock } from "../src/lib/stock-ledger"
import { assertPricedStockAvailable, deductOrderStock, priceOrderItems, restoreOrderStock } from "../src/lib/pos-orders"

test("koma dan titik desimal terbaca 0,05; pemisah ribuan Indonesia tetap benar", () => {
  for (const input of ["0,05", "0.05", 0.05]) assert.equal(parseInventoryQuantity(input, "Isi per kemasan"), 0.05)
  assert.equal(parseInventoryDecimal("1.000,05"), 1000.05)
  assert.equal(parseInventoryDecimal("1.000"), 1000)
  assert.equal(formatInventoryQuantity(0.05), "0,05")
})

test("angka tidak valid dan presisi berlebih ditolak, bukan dipotong atau dibulatkan menjadi nol", () => {
  for (const input of [0, -0.05, "0,0005", "0,", "1,2,3", "0,05 kg", Infinity, true]) {
    assert.throws(() => parseInventoryQuantity(input, "Isi per kemasan"))
  }
  assert.equal(parseOptionalMinimumStock(0), 0)
  assert.equal(parseOptionalMinimumStock("0,5"), 0.5)
  assert.equal(parseOptionalMinimumStock(""), null)
  assert.throws(() => multiplyInventoryQuantity(0.001, 0.05), /3 angka desimal/)
})

test("1 pcs = 0,05 kg; 180 pcs = 9 kg; harga per kg dan ambang stok tepat", () => {
  const packaging = validateInventoryPackaging("kg", "0,05", "pcs")
  assert.deepEqual(packaging, { packSize: 0.05, packUnit: "pcs" })
  const item = { unit: "kg", ...packaging }
  assert.equal(convertToBase(item, 1, "pack").baseQuantity, 0.05)
  assert.equal(convertToBase(item, 180, "pack").baseQuantity, 9)
  assert.equal(multiplyInventoryQuantity(3, 0.05), 0.15)
  assert.equal(multiplyInventoryQuantity(10, 0.05), 0.5)
  assert.equal(quantityInPackages(0.5, 0.05), 10)
  assert.equal(costPerBaseUnit(5000, 0.05), 100000)
  assert.equal(costPerBaseUnit(5000, 0.05) * 0.05, 5000)
  assert.throws(() => validateInventoryPackaging("pcs", 0.05, "pack"), /pecahan/)
  assert.throws(() => validateInventoryPackaging("kg", "0,05", ""), /bersamaan/)
})

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const rollback = new Error("ROLLBACK_FRACTIONAL_PACKAGING_TEST")

test("database mempertahankan 0,05 pada item, snapshot penerimaan, stok, dan minimum stok setelah edit", async () => {
  try {
    await db.$transaction(async tx => {
      const org = await tx.organization.create({ data: { name: "Fractional packaging test", slug: `fractional-pack-test-${randomUUID()}` } })
      const location = await tx.location.create({ data: { organizationId: org.id, name: "Test warehouse", type: "WAREHOUSE" } })
      const packaging = validateInventoryPackaging("kg", "0,05", "pcs")
      const item = await tx.inventoryItem.create({ data: {
        organizationId: org.id, name: "Daging 50 gram/pcs", unit: "kg", ...packaging, costPrice: costPerBaseUnit(5000, packaging.packSize!),
      } })
      assert.equal(Number(item.packSize), 0.05)
      // Jalur edit harus mempertahankan pecahan, termasuk kiriman string lokal.
      const edited = await tx.inventoryItem.update({ where: { id: item.id }, data: validateInventoryPackaging(item.unit, "0,05", item.packUnit) })
      assert.equal(Number(edited.packSize), 0.05)
      const setting = await tx.inventoryLocationSetting.create({ data: { organizationId: org.id, locationId: location.id, itemId: item.id, minStock: multiplyInventoryQuantity(10, 0.05) } })
      assert.equal(Number(setting.minStock), 0.5)

      const converted = convertToBase(item, 180, "pack")
      const receipt = await tx.goodsReceipt.create({ data: {
        organizationId: org.id, locationId: location.id, receiptNumber: "TEST-FRACTIONAL", status: "CONFIRMED",
        items: { create: { itemId: item.id, quantity: converted.baseQuantity, purchaseQuantity: 180, purchaseUnit: "pcs", purchaseUnitCost: 5000, costPrice: 100000, lineTotal: 900000, packSizeSnapshot: converted.conversionFactor } },
      }, include: { items: true } })
      assert.equal(Number(receipt.items[0].packSizeSnapshot), 0.05)
      assert.equal(Number(receipt.items[0].quantity), 9)
      await addStock(tx, { organizationId: org.id, locationId: location.id, itemId: item.id, type: "GOODS_IN", quantity: converted.baseQuantity, batchNumber: "FRACTIONAL-TEST", costPrice: 100000 })
      const usage = convertToBase(item, 3, "pack").baseQuantity
      const consumed = await consumeStock(tx, { organizationId: org.id, locationId: location.id, itemId: item.id, type: "GOODS_OUT", quantity: usage })
      assert.equal(Number((await tx.stockBalance.findUniqueOrThrow({ where: { itemId_locationId: { itemId: item.id, locationId: location.id } } })).quantity), 8.85)
      assert.equal(consumed.reduce((sum, row) => sum + row.quantity * (row.costPrice ?? 0), 0), 15000)
      // Ubah konfigurasi sekarang; riwayat tetap memakai faktor 0,05 saat penerimaan.
      await tx.inventoryItem.update({ where: { id: item.id }, data: { packSize: 0.075 } })
      assert.equal(Number((await tx.goodsReceiptItem.findUniqueOrThrow({ where: { id: receipt.items[0].id } })).packSizeSnapshot), 0.05)
      throw rollback
    }, { timeout: 15000 })
  } catch (error) { if (error !== rollback) throw error }
})

test("resep Master Menu 0,05 kg per porsi: 3 porsi tepat 0,15 kg, HPP benar, stok pulih saat void", async () => {
  try {
    await db.$transaction(async tx => {
      const org = await tx.organization.create({ data: { name: "Menu decimal test", slug: `menu-decimal-test-${randomUUID()}` } })
      const location = await tx.location.create({ data: { organizationId: org.id, name: "Test outlet", type: "OUTLET" } })
      const ingredient = await tx.inventoryItem.create({ data: { organizationId: org.id, name: "Daging", unit: "kg", costPrice: 100000 } })
      const menu = await tx.inventoryItem.create({ data: { organizationId: org.id, name: "Burger", unit: "pcs", isMenuItem: true, sellPrice: 25000 } })
      const recipe = await tx.recipeItem.create({ data: { parentItemId: menu.id, childItemId: ingredient.id, quantity: parseInventoryQuantity("0,05", "Jumlah daging") } })
      assert.equal(Number(recipe.quantity), 0.05)
      await addStock(tx, { organizationId: org.id, locationId: location.id, itemId: ingredient.id, type: "GOODS_IN", quantity: 0.15, batchNumber: "MENU-DECIMAL", costPrice: 100000 })
      const priced = await priceOrderItems(tx, org.id, [{ menuItemId: menu.id, qty: 3 }])
      // Stok pas 0,15 harus lolos, bukan ditolak sebagai kurang dari 0,15000000000000002.
      await assertPricedStockAvailable(tx, { organizationId: org.id, locationId: location.id, items: priced.items })
      const order = await tx.pOSOrder.create({ data: { organizationId: org.id, locationId: location.id, orderNumber: "DECIMAL-3", subtotal: 75000, total: 75000, items: { create: { menuItemId: menu.id, name: menu.name, price: 25000, qty: 3, subtotal: 75000 } } } })
      const cogs = await deductOrderStock(tx, { organizationId: org.id, locationId: location.id, orderId: order.id, orderNumber: order.orderNumber })
      assert.equal(cogs.amount, 15000)
      const where = { itemId_locationId: { itemId: ingredient.id, locationId: location.id } }
      assert.equal(Number((await tx.stockBalance.findUniqueOrThrow({ where })).quantity), 0)
      const movement = await tx.stockMovement.findFirstOrThrow({ where: { referenceId: order.id, type: "POS_SALE" } })
      assert.equal(Number(movement.quantity), -0.15)
      assert.equal(movement.note, "Penjualan DECIMAL-3 · Pemakaian bahan sesuai resep")
      await restoreOrderStock(tx, { organizationId: org.id, locationId: location.id, orderId: order.id })
      assert.equal(Number((await tx.stockBalance.findUniqueOrThrow({ where })).quantity), 0.15)
      throw rollback
    }, { timeout: 15000 })
  } catch (error) { if (error !== rollback) throw error }
})

test("catatan modifier hanya muncul pada bahan yang benar-benar dipakai modifier", async () => {
  try {
    await db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: "Modifier note test", slug: `modifier-note-test-${randomUUID()}` } })
      const location = await tx.location.create({ data: { organizationId: org.id, name: "Test outlet", type: "OUTLET" } })
      const beef = await tx.inventoryItem.create({ data: { organizationId: org.id, name: "Beef", unit: "kg", costPrice: 100000 } })
      const bun = await tx.inventoryItem.create({ data: { organizationId: org.id, name: "Bun", unit: "pcs", costPrice: 1000 } })
      const cheese = await tx.inventoryItem.create({ data: { organizationId: org.id, name: "Cheese", unit: "pcs", costPrice: 2000 } })
      const menu = await tx.inventoryItem.create({ data: { organizationId: org.id, name: "Burger", unit: "pcs", isMenuItem: true, sellPrice: 30000 } })
      await tx.recipeItem.createMany({ data: [
        { parentItemId: menu.id, childItemId: beef.id, quantity: 0.05 },
        { parentItemId: menu.id, childItemId: bun.id, quantity: 1 },
      ] })
      const group = await tx.menuModifierGroup.create({ data: { organizationId: org.id, name: "Tambahan" } })
      const option = await tx.menuModifierOption.create({ data: { groupId: group.id, name: "Extra beef & cheese", price: 5000 } })
      await tx.modifierRecipeItem.createMany({ data: [
        { optionId: option.id, itemId: beef.id, quantity: 0.025 },
        { optionId: option.id, itemId: cheese.id, quantity: 1 },
      ] })
      const order = await tx.pOSOrder.create({ data: {
        organizationId: org.id, locationId: location.id, orderNumber: "MODIFIER-NOTE", subtotal: 35000, total: 35000,
        items: { create: { menuItemId: menu.id, name: menu.name, price: 35000, qty: 1, subtotal: 35000,
          modifiers: { create: { optionId: option.id, groupName: group.name, optionName: option.name, price: 5000 } },
        } },
      } })
      await deductOrderStock(tx, { organizationId: org.id, locationId: location.id, orderId: order.id, orderNumber: order.orderNumber })
      const movements = await tx.stockMovement.findMany({ where: { referenceId: order.id, type: "POS_SALE" } })
      const byItem = new Map(movements.map((movement) => [movement.itemId, movement]))
      assert.equal(movements.length, 3)
      assert.equal(Number(byItem.get(beef.id)!.quantity), -0.075)
      assert.equal(Number(byItem.get(bun.id)!.quantity), -1)
      assert.equal(Number(byItem.get(cheese.id)!.quantity), -1)
      assert.equal(byItem.get(bun.id)!.note, "Penjualan MODIFIER-NOTE · Pemakaian bahan sesuai resep")
      assert.equal(byItem.get(beef.id)!.note, "Penjualan MODIFIER-NOTE · Pemakaian bahan sesuai resep dan modifier")
      assert.equal(byItem.get(cheese.id)!.note, "Penjualan MODIFIER-NOTE · Pemakaian bahan sesuai resep dan modifier")
      throw rollback
    }, { timeout: 15000 })
  } catch (error) { if (error !== rollback) throw error }
})

after(async () => { await db.$disconnect() })
