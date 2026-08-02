import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🌱 Seeding demo data...")

  const hash = await bcrypt.hash("demo123", 12)

  // Buat organisasi demo
  const org = await prisma.organization.upsert({
    where: { slug: "burger-bali-demo" },
    update: {},
    create: {
      name: "Burger Bali",
      slug: "burger-bali-demo",
      plan: "STARTER",
    },
  })

  // Buat users
  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.com" },
    update: { password: hash },
    create: { name: "Budi Santoso (Owner)", email: "owner@demo.com", password: hash },
  })
  const adminGudang = await prisma.user.upsert({
    where: { email: "gudang@demo.com" },
    update: { password: hash },
    create: { name: "Sari (Admin Gudang)", email: "gudang@demo.com", password: hash },
  })
  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@demo.com" },
    update: { password: hash },
    create: { name: "Andi (Supervisor)", email: "supervisor@demo.com", password: hash },
  })
  const kasir = await prisma.user.upsert({
    where: { email: "kasir@demo.com" },
    update: { password: hash },
    create: { name: "Dewi (Kasir Kemang)", email: "kasir@demo.com", password: hash },
  })

  // Link owner, gudang, supervisor ke org (tanpa lokasi)
  for (const [userId, role] of [
    [owner.id, "OWNER"],
    [adminGudang.id, "ADMIN_GUDANG"],
    [supervisor.id, "SUPERVISOR"],
  ] as const) {
    await prisma.organizationUser.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId } },
      update: {},
      create: { organizationId: org.id, userId, role },
    })
  }

  // Lokasi
  const gudang = await prisma.location.upsert({
    where: { id: org.id + "_gudang" },
    update: {},
    create: { id: org.id + "_gudang", organizationId: org.id, name: "Gudang Pusat", type: "WAREHOUSE" },
  })
  const kemang = await prisma.location.upsert({
    where: { id: org.id + "_kemang" },
    update: {},
    create: { id: org.id + "_kemang", organizationId: org.id, name: "Outlet Kemang", type: "OUTLET", address: "Jl. Kemang Raya No. 5" },
  })

  // Link kasir ke org dengan lokasi Kemang
  const kasirOrgUser = await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: kasir.id } },
    update: {},
    create: { organizationId: org.id, userId: kasir.id, role: "KASIR" },
  })
  await prisma.userLocation.upsert({
    where: { orgUserId_locationId: { orgUserId: kasirOrgUser.id, locationId: kemang.id } },
    update: {},
    create: { orgUserId: kasirOrgUser.id, locationId: kemang.id },
  })
  const senopati = await prisma.location.upsert({
    where: { id: org.id + "_senopati" },
    update: {},
    create: { id: org.id + "_senopati", organizationId: org.id, name: "Outlet Senopati", type: "OUTLET", address: "Jl. Senopati No. 12" },
  })
  const bsd = await prisma.location.upsert({
    where: { id: org.id + "_bsd" },
    update: {},
    create: { id: org.id + "_bsd", organizationId: org.id, name: "Outlet BSD", type: "OUTLET", address: "BSD City Sektor 7" },
  })

  // Master Inventory
  const itemDefs = [
    { name: "Beef Patty 80gr", sku: "BP-001", category: "Bahan Baku", unit: "pcs", costPrice: 15000, minStock: 50 },
    { name: "Burger Bun", sku: "BB-001", category: "Bahan Baku", unit: "pcs", costPrice: 3500, minStock: 80 },
    { name: "Cheese Slice", sku: "CS-001", category: "Bahan Baku", unit: "pcs", costPrice: 4000, minStock: 40 },
    { name: "Coca-Cola 330ml", sku: "CC-330", category: "Minuman", unit: "pcs", costPrice: 6500, minStock: 24 },
    { name: "Aqua 600ml", sku: "AQ-600", category: "Minuman", unit: "pcs", costPrice: 3000, minStock: 24 },
    { name: "Cup 16oz", sku: "CUP-16", category: "Kemasan", unit: "pcs", costPrice: 1200, minStock: 100 },
    { name: "Selada Romaine", sku: "SR-001", category: "Bahan Baku", unit: "ikat", costPrice: 8000, minStock: 10 },
    { name: "Tomat Segar", sku: "TM-001", category: "Bahan Baku", unit: "kg", costPrice: 12000, minStock: 5 },
    { name: "Saus BBQ", sku: "SB-001", category: "Bumbu", unit: "botol", costPrice: null, minStock: null, isTrackable: false },
    { name: "Sedotan", sku: "SDT-001", category: "Kemasan", unit: "pcs", costPrice: null, minStock: null, isTrackable: false },
  ]

  const items: Record<string, { id: string }> = {}
  for (const def of itemDefs) {
    const item = await prisma.inventoryItem.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: def.sku } },
      update: {},
      create: {
        organizationId: org.id,
        name: def.name,
        sku: def.sku,
        category: def.category,
        unit: def.unit,
        costPrice: def.costPrice ?? null,
        minStock: def.minStock ?? null,
        isTrackable: def.isTrackable !== false,
      },
    })
    items[def.sku] = item
  }

  // Stock Balances (stok awal per lokasi)
  const stockDefs: Array<{ sku: string; locationId: string; qty: number }> = [
    { sku: "BP-001", locationId: gudang.id, qty: 100 },
    { sku: "BP-001", locationId: kemang.id, qty: 75 },
    { sku: "BP-001", locationId: senopati.id, qty: 60 },
    { sku: "BB-001", locationId: gudang.id, qty: 150 },
    { sku: "BB-001", locationId: kemang.id, qty: 70 },
    { sku: "BB-001", locationId: senopati.id, qty: 55 },
    { sku: "CS-001", locationId: gudang.id, qty: 200 },
    { sku: "CS-001", locationId: kemang.id, qty: 15 },
    { sku: "CS-001", locationId: senopati.id, qty: 30 },
    { sku: "CC-330", locationId: gudang.id, qty: 120 },
    { sku: "CC-330", locationId: kemang.id, qty: 3 },
    { sku: "CC-330", locationId: senopati.id, qty: 24 },
    { sku: "AQ-600", locationId: gudang.id, qty: 200 },
    { sku: "AQ-600", locationId: kemang.id, qty: 48 },
    { sku: "AQ-600", locationId: bsd.id, qty: 50 },
    { sku: "CUP-16", locationId: gudang.id, qty: 500 },
    { sku: "CUP-16", locationId: kemang.id, qty: 200 },
    { sku: "CUP-16", locationId: senopati.id, qty: 150 },
    { sku: "SR-001", locationId: kemang.id, qty: 12 },
    { sku: "SR-001", locationId: senopati.id, qty: 8 },
  ]

  for (const s of stockDefs) {
    if (!items[s.sku]) continue
    await prisma.stockBalance.upsert({
      where: { itemId_locationId: { itemId: items[s.sku].id, locationId: s.locationId } },
      update: { quantity: s.qty },
      create: {
        organizationId: org.id,
        itemId: items[s.sku].id,
        locationId: s.locationId,
        quantity: s.qty,
      },
    })
  }

  // Transfer pending (belum dikonfirmasi supervisor)
  const existingTransfer = await prisma.stockTransfer.findFirst({
    where: { organizationId: org.id, status: "SENT" },
  })
  if (!existingTransfer) {
    await prisma.stockTransfer.create({
      data: {
        organizationId: org.id,
        fromLocationId: gudang.id,
        toLocationId: kemang.id,
        status: "SENT",
        sentAt: new Date(),
        createdById: adminGudang.id,
        notes: "Pengiriman mingguan",
        items: {
          create: [
            { itemId: items["BP-001"].id, quantity: 50 },
            { itemId: items["BB-001"].id, quantity: 50 },
            { itemId: items["CS-001"].id, quantity: 30 },
          ],
        },
      },
    })
  }

  // Opname dengan selisih (untuk demo alert)
  const existingOpname = await prisma.stockOpname.findFirst({
    where: { organizationId: org.id, status: "SUBMITTED" },
  })
  if (!existingOpname) {
    const op = await prisma.stockOpname.create({
      data: {
        organizationId: org.id,
        locationId: kemang.id,
        periodStart: new Date("2025-06-01"),
        periodEnd: new Date("2025-06-07"),
        shift: "Pagi",
        status: "SUBMITTED",
        submittedAt: new Date(),
        createdById: supervisor.id,
        items: {
          create: [
            { itemId: items["BP-001"].id, systemQty: 80, physicalQty: 75, difference: -5, estimatedLoss: 75000 },
            { itemId: items["BB-001"].id, systemQty: 70, physicalQty: 70, difference: 0, estimatedLoss: 0 },
            { itemId: items["CS-001"].id, systemQty: 40, physicalQty: 37, difference: -3, estimatedLoss: 12000 },
            { itemId: items["CC-330"].id, systemQty: 24, physicalQty: 24, difference: 0, estimatedLoss: 0 },
            { itemId: items["AQ-600"].id, systemQty: 48, physicalQty: 50, difference: 2, estimatedLoss: 0 },
          ],
        },
      },
    })

    // Alert dari opname
    await prisma.alert.createMany({
      data: [
        {
          organizationId: org.id,
          type: "STOCK_SHORTAGE",
          severity: "CRITICAL",
          title: "Selisih stok: Beef Patty 80gr",
          message: "Beef Patty 80gr di Outlet Kemang selisih -5 pcs. Estimasi rugi Rp 75.000",
          locationId: kemang.id,
          itemId: items["BP-001"].id,
          referenceId: op.id,
        },
        {
          organizationId: org.id,
          type: "STOCK_SHORTAGE",
          severity: "WARNING",
          title: "Selisih stok: Cheese Slice",
          message: "Cheese Slice di Outlet Kemang selisih -3 pcs. Estimasi rugi Rp 12.000",
          locationId: kemang.id,
          itemId: items["CS-001"].id,
          referenceId: op.id,
        },
        {
          organizationId: org.id,
          type: "LOW_STOCK",
          severity: "WARNING",
          title: "Stok Coca-Cola 330ml menipis",
          message: "Coca-Cola 330ml di Outlet Kemang tinggal 3 pcs (minimum: 24 pcs)",
          locationId: kemang.id,
          itemId: items["CC-330"].id,
        },
      ],
    })
  }

  // Audit log contoh
  await prisma.auditLog.createMany({
    data: [
      { organizationId: org.id, userId: adminGudang.id, action: "CREATE", entity: "GoodsReceipt", entityId: "demo-1" },
      { organizationId: org.id, userId: adminGudang.id, action: "CREATE", entity: "StockTransfer", entityId: "demo-2" },
      { organizationId: org.id, userId: supervisor.id, action: "SUBMIT_OPNAME", entity: "StockOpname", entityId: "demo-3" },
    ],
    skipDuplicates: true,
  })

  console.log("✅ Seed selesai!")
  console.log("")
  console.log("Akun demo:")
  console.log("  Owner       → owner@demo.com / demo123")
  console.log("  Admin Gudang → gudang@demo.com / demo123")
  console.log("  Supervisor  → supervisor@demo.com / demo123")
  console.log("  Kasir       → kasir@demo.com / demo123  (Outlet Kemang)")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
