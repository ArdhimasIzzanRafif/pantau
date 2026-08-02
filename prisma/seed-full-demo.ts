import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

function genPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"
  let p = ""
  for (let i = 0; i < 14; i++) p += alphabet[crypto.randomInt(alphabet.length)]
  return p
}

async function main() {
  console.log("🌱 Seeding 1 user lengkap dengan semua fitur...")

  const EMAIL = "lengkap@demo.com"
  const password = genPassword()
  const hash = await bcrypt.hash(password, 12)

  // ── Organisasi ──────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: "demo-lengkap" },
    update: { plan: "PRO", status: "ACTIVE" },
    create: { name: "Demo Lengkap", slug: "demo-lengkap", plan: "PRO", status: "ACTIVE" },
  })

  // ── User tunggal, OWNER (akses semua dashboard) ─────────────────────────
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password: hash },
    create: { name: "Demo Lengkap", email: EMAIL, password: hash },
  })
  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { organizationId: org.id, userId: user.id, role: "OWNER" },
  })

  // ── Lokasi ───────────────────────────────────────────────────────────────
  const gudang = await prisma.location.upsert({
    where: { id: org.id + "_gudang" },
    update: {},
    create: { id: org.id + "_gudang", organizationId: org.id, name: "Gudang Pusat", type: "WAREHOUSE" },
  })
  const outlet1 = await prisma.location.upsert({
    where: { id: org.id + "_outlet1" },
    update: {},
    create: { id: org.id + "_outlet1", organizationId: org.id, name: "Outlet Pusat", type: "OUTLET", address: "Jl. Contoh No. 1" },
  })
  const outlet2 = await prisma.location.upsert({
    where: { id: org.id + "_outlet2" },
    update: {},
    create: { id: org.id + "_outlet2", organizationId: org.id, name: "Outlet Kedua", type: "OUTLET", address: "Jl. Contoh No. 2" },
  })

  // ── Meja (fitur QR meja terkunci) ───────────────────────────────────────
  const tableDefs = ["Meja 1", "Meja 2", "Meja 3"]
  const tables: Record<string, { id: string; tableToken: string }> = {}
  for (const [i, name] of tableDefs.entries()) {
    const t = await prisma.table.upsert({
      where: { id: org.id + "_table" + i },
      update: {},
      create: { id: org.id + "_table" + i, organizationId: org.id, locationId: outlet1.id, name, sortOrder: i },
    })
    tables[name] = t
  }

  // ── Master Inventory: bahan baku + menu ─────────────────────────────────
  const rawDefs = [
    { name: "Beef Patty 80gr", sku: "BP-001", category: "Bahan Baku", unit: "pcs", costPrice: 15000, minStock: 50 },
    { name: "Burger Bun", sku: "BB-001", category: "Bahan Baku", unit: "pcs", costPrice: 3500, minStock: 80 },
    { name: "Cheese Slice", sku: "CS-001", category: "Bahan Baku", unit: "pcs", costPrice: 4000, minStock: 40 },
    { name: "Selada Romaine", sku: "SR-001", category: "Bahan Baku", unit: "ikat", costPrice: 8000, minStock: 10 },
    { name: "Kentang Beku", sku: "KTG-001", category: "Bahan Baku", unit: "kg", costPrice: 22000, minStock: 15 },
    { name: "Cup 16oz", sku: "CUP-16", category: "Kemasan", unit: "pcs", costPrice: 1200, minStock: 100 },
  ]
  const menuDefs = [
    { name: "Cheeseburger", sku: "MENU-BURGER", category: "Burger", sellPrice: 35000, imageUrl: null },
    { name: "Kentang Goreng", sku: "MENU-FRIES", category: "Snack", sellPrice: 18000, imageUrl: null },
    { name: "Es Teh Manis", sku: "MENU-ICETEA", category: "Minuman", sellPrice: 8000, imageUrl: null, isTrackable: false },
    { name: "Kopi Susu", sku: "MENU-COFFEE", category: "Minuman", sellPrice: 20000, imageUrl: null, isTrackable: false },
  ]

  const items: Record<string, { id: string }> = {}
  for (const def of rawDefs) {
    const item = await prisma.inventoryItem.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: def.sku } },
      update: {},
      create: {
        organizationId: org.id, name: def.name, sku: def.sku, category: def.category,
        unit: def.unit, costPrice: def.costPrice, minStock: def.minStock,
      },
    })
    items[def.sku] = item
  }
  for (const def of menuDefs) {
    const item = await prisma.inventoryItem.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: def.sku } },
      update: {},
      create: {
        organizationId: org.id, name: def.name, sku: def.sku, category: def.category,
        sellPrice: def.sellPrice, isMenuItem: true, isAvailableForQr: true,
        isTrackable: def.isTrackable !== false,
      },
    })
    items[def.sku] = item
  }

  // ── Resep (BOM): Cheeseburger dipotong dari bahan baku saat laku ────────
  await prisma.recipeItem.upsert({
    where: { parentItemId_childItemId: { parentItemId: items["MENU-BURGER"].id, childItemId: items["BP-001"].id } },
    update: {}, create: { parentItemId: items["MENU-BURGER"].id, childItemId: items["BP-001"].id, quantity: 1 },
  })
  await prisma.recipeItem.upsert({
    where: { parentItemId_childItemId: { parentItemId: items["MENU-BURGER"].id, childItemId: items["BB-001"].id } },
    update: {}, create: { parentItemId: items["MENU-BURGER"].id, childItemId: items["BB-001"].id, quantity: 1 },
  })
  await prisma.recipeItem.upsert({
    where: { parentItemId_childItemId: { parentItemId: items["MENU-BURGER"].id, childItemId: items["CS-001"].id } },
    update: {}, create: { parentItemId: items["MENU-BURGER"].id, childItemId: items["CS-001"].id, quantity: 1 },
  })

  // ── Modifier menu ────────────────────────────────────────────────────────
  const pedasGroup = await prisma.menuModifierGroup.upsert({
    where: { id: org.id + "_mg_pedas" }, update: {},
    create: { id: org.id + "_mg_pedas", organizationId: org.id, name: "Level Pedas", isRequired: false, maxSelect: 1 },
  })
  await prisma.menuModifierOption.createMany({
    data: [
      { id: org.id + "_mo_p1", groupId: pedasGroup.id, name: "Tidak Pedas", price: 0, sortOrder: 0 },
      { id: org.id + "_mo_p2", groupId: pedasGroup.id, name: "Pedas", price: 0, sortOrder: 1 },
      { id: org.id + "_mo_p3", groupId: pedasGroup.id, name: "Extra Pedas", price: 2000, sortOrder: 2 },
    ],
    skipDuplicates: true,
  })
  const ukuranGroup = await prisma.menuModifierGroup.upsert({
    where: { id: org.id + "_mg_ukuran" }, update: {},
    create: { id: org.id + "_mg_ukuran", organizationId: org.id, name: "Ukuran", isRequired: true, maxSelect: 1 },
  })
  await prisma.menuModifierOption.createMany({
    data: [
      { id: org.id + "_mo_u1", groupId: ukuranGroup.id, name: "Reguler", price: 0, sortOrder: 0 },
      { id: org.id + "_mo_u2", groupId: ukuranGroup.id, name: "Large", price: 5000, sortOrder: 1 },
    ],
    skipDuplicates: true,
  })
  await prisma.inventoryItemModifier.upsert({
    where: { itemId_groupId: { itemId: items["MENU-BURGER"].id, groupId: pedasGroup.id } },
    update: {}, create: { itemId: items["MENU-BURGER"].id, groupId: pedasGroup.id, sortOrder: 0 },
  })
  await prisma.inventoryItemModifier.upsert({
    where: { itemId_groupId: { itemId: items["MENU-FRIES"].id, groupId: ukuranGroup.id } },
    update: {}, create: { itemId: items["MENU-FRIES"].id, groupId: ukuranGroup.id, sortOrder: 0 },
  })

  // ── Diskon ───────────────────────────────────────────────────────────────
  await prisma.discountRule.createMany({
    data: [
      { id: org.id + "_disc1", organizationId: org.id, name: "Diskon Member 10%", type: "PERCENT", value: 10, minPurchase: 50000 },
      { id: org.id + "_disc2", organizationId: org.id, name: "Potongan Rp 5.000", type: "AMOUNT", value: 5000, minPurchase: 30000 },
    ],
    skipDuplicates: true,
  })

  // ── Stok per lokasi ──────────────────────────────────────────────────────
  const stockDefs: Array<{ sku: string; locationId: string; qty: number }> = [
    { sku: "BP-001", locationId: gudang.id, qty: 100 }, { sku: "BP-001", locationId: outlet1.id, qty: 40 }, { sku: "BP-001", locationId: outlet2.id, qty: 20 },
    { sku: "BB-001", locationId: gudang.id, qty: 150 }, { sku: "BB-001", locationId: outlet1.id, qty: 60 }, { sku: "BB-001", locationId: outlet2.id, qty: 30 },
    { sku: "CS-001", locationId: gudang.id, qty: 200 }, { sku: "CS-001", locationId: outlet1.id, qty: 8 }, { sku: "CS-001", locationId: outlet2.id, qty: 25 },
    { sku: "SR-001", locationId: gudang.id, qty: 30 }, { sku: "SR-001", locationId: outlet1.id, qty: 12 },
    { sku: "KTG-001", locationId: gudang.id, qty: 50 }, { sku: "KTG-001", locationId: outlet1.id, qty: 18 },
    { sku: "CUP-16", locationId: gudang.id, qty: 500 }, { sku: "CUP-16", locationId: outlet1.id, qty: 120 },
  ]
  for (const s of stockDefs) {
    await prisma.stockBalance.upsert({
      where: { itemId_locationId: { itemId: items[s.sku].id, locationId: s.locationId } },
      update: { quantity: s.qty },
      create: { organizationId: org.id, itemId: items[s.sku].id, locationId: s.locationId, quantity: s.qty },
    })
  }

  // ── Goods Receipt (barang masuk) ────────────────────────────────────────
  const existingReceipt = await prisma.goodsReceipt.findFirst({ where: { organizationId: org.id } })
  if (!existingReceipt) {
    await prisma.goodsReceipt.create({
      data: {
        organizationId: org.id, locationId: gudang.id, receiptNumber: "GR-0001",
        supplier: "CV Sumber Pangan", status: "CONFIRMED", createdById: user.id,
        items: {
          create: [
            { itemId: items["BP-001"].id, quantity: 100, costPrice: 15000 },
            { itemId: items["BB-001"].id, quantity: 150, costPrice: 3500 },
          ],
        },
      },
    })
  }

  // ── Transfer pending (Gudang → Outlet Kedua) ────────────────────────────
  const existingTransfer = await prisma.stockTransfer.findFirst({ where: { organizationId: org.id, status: "SENT" } })
  if (!existingTransfer) {
    await prisma.stockTransfer.create({
      data: {
        organizationId: org.id, fromLocationId: gudang.id, toLocationId: outlet2.id,
        status: "SENT", sentAt: new Date(), createdById: user.id, notes: "Pengiriman mingguan",
        items: { create: [{ itemId: items["BP-001"].id, quantity: 20 }, { itemId: items["BB-001"].id, quantity: 20 }] },
      },
    })
  }

  // ── Opname dengan selisih ────────────────────────────────────────────────
  const existingOpname = await prisma.stockOpname.findFirst({ where: { organizationId: org.id, status: "SUBMITTED" } })
  let opnameId: string
  if (!existingOpname) {
    const op = await prisma.stockOpname.create({
      data: {
        organizationId: org.id, locationId: outlet1.id,
        periodStart: new Date(new Date().setDate(new Date().getDate() - 7)),
        periodEnd: new Date(), shift: "Pagi", status: "SUBMITTED", submittedAt: new Date(), createdById: user.id,
        items: {
          create: [
            { itemId: items["BP-001"].id, systemQty: 45, physicalQty: 40, difference: -5, estimatedLoss: 75000 },
            { itemId: items["CS-001"].id, systemQty: 12, physicalQty: 8, difference: -4, estimatedLoss: 16000 },
          ],
        },
      },
    })
    opnameId = op.id
  } else {
    opnameId = existingOpname.id
  }

  // ── Alert ────────────────────────────────────────────────────────────────
  await prisma.alert.createMany({
    data: [
      { organizationId: org.id, type: "STOCK_SHORTAGE", severity: "CRITICAL", title: "Selisih stok: Beef Patty 80gr", message: "Beef Patty 80gr di Outlet Pusat selisih -5 pcs. Estimasi rugi Rp 75.000", locationId: outlet1.id, itemId: items["BP-001"].id, referenceId: opnameId },
      { organizationId: org.id, type: "LOW_STOCK", severity: "WARNING", title: "Stok Cheese Slice menipis", message: "Cheese Slice di Outlet Pusat tinggal 8 pcs (minimum: 40 pcs)", locationId: outlet1.id, itemId: items["CS-001"].id },
    ],
    skipDuplicates: true,
  })

  // ── Audit log ────────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { organizationId: org.id, userId: user.id, action: "CREATE", entity: "GoodsReceipt", entityId: "demo-gr-1" },
      { organizationId: org.id, userId: user.id, action: "CREATE", entity: "StockTransfer", entityId: "demo-tf-1" },
      { organizationId: org.id, userId: user.id, action: "SUBMIT_OPNAME", entity: "StockOpname", entityId: opnameId },
    ],
    skipDuplicates: true,
  })

  // ── Shift POS aktif (owner sekaligus jadi kasir) ────────────────────────
  let shift = await prisma.pOSShift.findFirst({ where: { organizationId: org.id, locationId: outlet1.id, status: "OPEN" } })
  if (!shift) {
    shift = await prisma.pOSShift.create({
      data: {
        organizationId: org.id, locationId: outlet1.id, cashierId: user.id,
        shiftNumber: "SHF-0001", openingBalance: 300000, status: "OPEN",
      },
    })
  }

  // ── Order sudah dibayar (lunas, riwayat) ────────────────────────────────
  const existingPaidOrder = await prisma.pOSOrder.findFirst({ where: { organizationId: org.id, orderNumber: "ORD-DEMO-0001" } })
  if (!existingPaidOrder) {
    const burgerPrice = 35000
    const friesPrice = 18000 + 5000 // + Large
    const subtotal = burgerPrice + friesPrice
    const order = await prisma.pOSOrder.create({
      data: {
        organizationId: org.id, locationId: outlet1.id, shiftId: shift.id, cashierId: user.id,
        orderNumber: "ORD-DEMO-0001", orderType: "DINE_IN", tableNumber: tables["Meja 1"].name,
        customerName: "Andi", status: "PAID", subtotal, total: subtotal, paidAt: new Date(),
        items: {
          create: [
            {
              menuItemId: items["MENU-BURGER"].id, name: "Cheeseburger", price: burgerPrice, qty: 1, subtotal: burgerPrice,
              modifiers: { create: [{ groupName: "Level Pedas", optionName: "Pedas", price: 0 }] },
            },
            {
              menuItemId: items["MENU-FRIES"].id, name: "Kentang Goreng", price: friesPrice, qty: 1, subtotal: friesPrice,
              modifiers: { create: [{ groupName: "Ukuran", optionName: "Large", price: 5000 }] },
            },
          ],
        },
        payments: { create: [{ method: "CASH", amount: subtotal, change: 0 }] },
      },
    })
    await prisma.pOSShift.update({
      where: { id: shift.id },
      data: { totalSales: { increment: order.total }, totalOrders: { increment: 1 } },
    })
  }

  // ── Order masih terbuka (belum dibayar, di meja) ────────────────────────
  const existingOpenOrder = await prisma.pOSOrder.findFirst({ where: { organizationId: org.id, orderNumber: "ORD-DEMO-0002" } })
  if (!existingOpenOrder) {
    const coffeePrice = 20000
    await prisma.pOSOrder.create({
      data: {
        organizationId: org.id, locationId: outlet1.id, shiftId: shift.id, cashierId: user.id,
        orderNumber: "ORD-DEMO-0002", orderType: "DINE_IN", tableNumber: tables["Meja 2"].name,
        customerName: "Budi", status: "OPEN", subtotal: coffeePrice, total: coffeePrice,
        items: { create: [{ menuItemId: items["MENU-COFFEE"].id, name: "Kopi Susu", price: coffeePrice, qty: 1, subtotal: coffeePrice }] },
      },
    })
  }

  console.log("✅ Seed selesai!\n")
  console.log("Login (akses penuh — OWNER):")
  console.log(`  Email    → ${EMAIL}`)
  console.log(`  Password → ${password}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
