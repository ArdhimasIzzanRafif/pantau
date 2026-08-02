/**
 * Reset semua data transaksional + isi ulang master menu & inventori.
 * Menjaga: Organization, Users, OrganizationUser, UserLocation, Locations.
 * Membersihkan: semua riwayat (shift, order, transfer, opname, barang masuk, alert, dll).
 * Stok: di-reset ke 0 (StockBalance dihapus).
 */

import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🧹  Membersihkan data transaksional...")

  const org = await prisma.organization.findFirst({ where: { slug: "burger-bali-demo" } })
  if (!org) throw new Error("Organisasi demo tidak ditemukan. Jalankan seed terlebih dahulu.")
  const orgId = org.id

  // Hapus semua data transaksional dalam urutan yang aman (foreign key order)
  await prisma.pOSPayment.deleteMany({ where: { order: { organizationId: orgId } } })
  await prisma.pOSOrderItem.deleteMany({ where: { order: { organizationId: orgId } } })
  await prisma.pOSOrder.deleteMany({ where: { organizationId: orgId } })
  await prisma.pOSShift.deleteMany({ where: { organizationId: orgId } })
  await prisma.stockTransferItem.deleteMany({ where: { transfer: { organizationId: orgId } } })
  await prisma.stockTransfer.deleteMany({ where: { organizationId: orgId } })
  await prisma.stockOpnameItem.deleteMany({ where: { opname: { organizationId: orgId } } })
  await prisma.stockOpname.deleteMany({ where: { organizationId: orgId } })
  await prisma.goodsReceiptItem.deleteMany({ where: { receipt: { organizationId: orgId } } })
  await prisma.goodsReceipt.deleteMany({ where: { organizationId: orgId } })
  await prisma.stockMovement.deleteMany({ where: { organizationId: orgId } })
  await prisma.stockBalance.deleteMany({ where: { organizationId: orgId } })
  await prisma.alert.deleteMany({ where: { organizationId: orgId } })
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } })

  // Hapus menu & resep lama
  const allItems = await prisma.inventoryItem.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  })
  const allItemIds = allItems.map((i) => i.id)
  if (allItemIds.length > 0) {
    await prisma.recipeItem.deleteMany({
      where: { parentItemId: { in: allItemIds } },
    })
  }
  await prisma.inventoryItem.deleteMany({ where: { organizationId: orgId } })

  console.log("✅  Data lama bersih.")
  console.log("🌱  Mengisi master inventori...")

  // ─── MASTER INVENTORI (Bahan Baku & Kemasan) ───────────────────────────────
  const bahanDefs = [
    // Daging & Protein
    { name: "Beef Patty 100gr",      sku: "BP-100",  cat: "Daging & Protein",  unit: "pcs",  cost: 18000, min: 100 },
    { name: "Beef Patty 150gr",      sku: "BP-150",  cat: "Daging & Protein",  unit: "pcs",  cost: 25000, min: 60  },
    { name: "Chicken Fillet",        sku: "CF-001",  cat: "Daging & Protein",  unit: "pcs",  cost: 14000, min: 80  },
    // Bun & Roti
    { name: "Burger Bun",            sku: "BUN-001", cat: "Roti & Bun",        unit: "pcs",  cost: 3500,  min: 150 },
    { name: "Brioche Bun",           sku: "BUN-002", cat: "Roti & Bun",        unit: "pcs",  cost: 5000,  min: 80  },
    // Keju
    { name: "Cheddar Cheese Slice",  sku: "CH-001",  cat: "Dairy",             unit: "pcs",  cost: 4500,  min: 100 },
    { name: "Mozzarella Shredded",   sku: "MZ-001",  cat: "Dairy",             unit: "gram", cost: 80,    min: 500 },
    // Sayuran
    { name: "Selada Romaine",        sku: "SLD-001", cat: "Sayuran",           unit: "gram", cost: 15,    min: 500 },
    { name: "Tomat Segar",           sku: "TOM-001", cat: "Sayuran",           unit: "gram", cost: 12,    min: 500 },
    { name: "Timun",                 sku: "TIM-001", cat: "Sayuran",           unit: "gram", cost: 8,     min: 300 },
    { name: "Bawang Bombay",         sku: "BB-001",  cat: "Sayuran",           unit: "gram", cost: 14,    min: 300 },
    // Saus & Bumbu
    { name: "Saus Spesial Pantau",   sku: "SS-001",  cat: "Saus & Bumbu",      unit: "ml",   cost: 5,     min: 500 },
    { name: "Saus BBQ",              sku: "SS-002",  cat: "Saus & Bumbu",      unit: "ml",   cost: 6,     min: 300 },
    { name: "Saus Pedas",            sku: "SS-003",  cat: "Saus & Bumbu",      unit: "ml",   cost: 5,     min: 300 },
    { name: "Mayonaise",             sku: "SS-004",  cat: "Saus & Bumbu",      unit: "ml",   cost: 8,     min: 200 },
    // Kentang
    { name: "Kentang Beku (frozen)", sku: "KNT-001", cat: "Bahan Goreng",      unit: "gram", cost: 18,    min: 2000 },
    // Minuman Kemasan
    { name: "Coca-Cola 330ml",       sku: "CKL-330", cat: "Minuman Kemasan",   unit: "pcs",  cost: 7000,  min: 48  },
    { name: "Sprite 330ml",          sku: "SPR-330", cat: "Minuman Kemasan",   unit: "pcs",  cost: 7000,  min: 24  },
    { name: "Air Mineral 600ml",     sku: "AQ-600",  cat: "Minuman Kemasan",   unit: "pcs",  cost: 3000,  min: 48  },
    // Kemasan
    { name: "Kertas Pembungkus",     sku: "KM-001",  cat: "Kemasan",           unit: "lembar", cost: 300,  min: 500 },
    { name: "Box Burger",            sku: "KM-002",  cat: "Kemasan",           unit: "pcs",  cost: 800,   min: 200 },
    { name: "Box Kentang",           sku: "KM-003",  cat: "Kemasan",           unit: "pcs",  cost: 500,   min: 200 },
    { name: "Cup 16oz",              sku: "KM-004",  cat: "Kemasan",           unit: "pcs",  cost: 1200,  min: 150 },
    { name: "Kantong Plastik",       sku: "KM-005",  cat: "Kemasan",           unit: "pcs",  cost: 200,   min: 300 },
  ]

  const bahan: Record<string, string> = {}
  for (const d of bahanDefs) {
    const item = await prisma.inventoryItem.create({
      data: {
        organizationId: orgId,
        name: d.name, sku: d.sku, category: d.cat,
        unit: d.unit, costPrice: d.cost, minStock: d.min,
        isTrackable: true, isMenuItem: false, isActive: true,
      },
    })
    bahan[d.sku] = item.id
  }
  console.log(`✅  ${bahanDefs.length} bahan baku / kemasan dibuat.`)

  // ─── MASTER MENU (MenuItem) ─────────────────────────────────────────────────
  console.log("🍔  Mengisi master menu...")

  type MenuDef = {
    name: string; sku: string; cat: string; price: number; desc: string
    recipe?: Array<{ sku: string; qty: number }>
  }

  const menuDefs: MenuDef[] = [
    // ── BURGER ──
    {
      name: "Burger Klasik", sku: "MN-B01", cat: "Burger", price: 35000,
      desc: "Beef patty 100gr, selada, tomat, saus spesial",
      recipe: [
        { sku: "BP-100",  qty: 1   },
        { sku: "BUN-001", qty: 1   },
        { sku: "SLD-001", qty: 20  },
        { sku: "TOM-001", qty: 20  },
        { sku: "SS-001",  qty: 15  },
        { sku: "KM-001",  qty: 1   },
        { sku: "KM-002",  qty: 1   },
      ],
    },
    {
      name: "Cheese Burger", sku: "MN-B02", cat: "Burger", price: 40000,
      desc: "Beef patty 100gr, cheddar cheese, selada, tomat, saus spesial",
      recipe: [
        { sku: "BP-100",  qty: 1   },
        { sku: "BUN-001", qty: 1   },
        { sku: "CH-001",  qty: 1   },
        { sku: "SLD-001", qty: 20  },
        { sku: "TOM-001", qty: 20  },
        { sku: "SS-001",  qty: 15  },
        { sku: "KM-002",  qty: 1   },
      ],
    },
    {
      name: "Double Burger", sku: "MN-B03", cat: "Burger", price: 55000,
      desc: "2 beef patty 100gr, brioche bun, double cheddar, selada, tomat, BBQ sauce",
      recipe: [
        { sku: "BP-100",  qty: 2   },
        { sku: "BUN-002", qty: 1   },
        { sku: "CH-001",  qty: 2   },
        { sku: "SLD-001", qty: 25  },
        { sku: "TOM-001", qty: 25  },
        { sku: "BB-001",  qty: 15  },
        { sku: "SS-002",  qty: 20  },
        { sku: "KM-002",  qty: 1   },
      ],
    },
    {
      name: "Burger Jumbo", sku: "MN-B04", cat: "Burger", price: 65000,
      desc: "Beef patty 150gr, brioche bun, double cheese, sayuran lengkap",
      recipe: [
        { sku: "BP-150",  qty: 1   },
        { sku: "BUN-002", qty: 1   },
        { sku: "CH-001",  qty: 2   },
        { sku: "SLD-001", qty: 30  },
        { sku: "TOM-001", qty: 30  },
        { sku: "TIM-001", qty: 20  },
        { sku: "BB-001",  qty: 20  },
        { sku: "SS-001",  qty: 20  },
        { sku: "KM-002",  qty: 1   },
      ],
    },
    {
      name: "Chicken Burger", sku: "MN-B05", cat: "Burger", price: 38000,
      desc: "Chicken fillet crispy, selada, tomat, mayo",
      recipe: [
        { sku: "CF-001",  qty: 1   },
        { sku: "BUN-001", qty: 1   },
        { sku: "SLD-001", qty: 20  },
        { sku: "TOM-001", qty: 20  },
        { sku: "SS-004",  qty: 20  },
        { sku: "KM-002",  qty: 1   },
      ],
    },
    {
      name: "Spicy Burger", sku: "MN-B06", cat: "Burger", price: 42000,
      desc: "Beef patty 100gr, saus pedas, jalapeño, cheddar",
      recipe: [
        { sku: "BP-100",  qty: 1   },
        { sku: "BUN-001", qty: 1   },
        { sku: "CH-001",  qty: 1   },
        { sku: "SLD-001", qty: 15  },
        { sku: "TOM-001", qty: 15  },
        { sku: "SS-003",  qty: 25  },
        { sku: "KM-002",  qty: 1   },
      ],
    },
    // ── KENTANG ──
    {
      name: "Kentang Goreng (S)", sku: "MN-K01", cat: "Kentang", price: 15000,
      desc: "Kentang goreng crispy ukuran kecil",
      recipe: [
        { sku: "KNT-001", qty: 100 },
        { sku: "KM-003",  qty: 1   },
      ],
    },
    {
      name: "Kentang Goreng (M)", sku: "MN-K02", cat: "Kentang", price: 20000,
      desc: "Kentang goreng crispy ukuran sedang",
      recipe: [
        { sku: "KNT-001", qty: 150 },
        { sku: "KM-003",  qty: 1   },
      ],
    },
    {
      name: "Kentang Goreng (L)", sku: "MN-K03", cat: "Kentang", price: 28000,
      desc: "Kentang goreng crispy ukuran besar",
      recipe: [
        { sku: "KNT-001", qty: 250 },
        { sku: "KM-003",  qty: 1   },
      ],
    },
    // ── MINUMAN ──
    {
      name: "Coca-Cola", sku: "MN-M01", cat: "Minuman", price: 15000,
      desc: "Coca-Cola 330ml kaleng",
      recipe: [
        { sku: "CKL-330", qty: 1 },
        { sku: "KM-004",  qty: 1 },
      ],
    },
    {
      name: "Sprite", sku: "MN-M02", cat: "Minuman", price: 15000,
      desc: "Sprite 330ml kaleng",
      recipe: [
        { sku: "SPR-330", qty: 1 },
        { sku: "KM-004",  qty: 1 },
      ],
    },
    {
      name: "Air Mineral", sku: "MN-M03", cat: "Minuman", price: 8000,
      desc: "Air mineral 600ml",
      recipe: [
        { sku: "AQ-600", qty: 1 },
      ],
    },
    // ── PAKET COMBO ──
    {
      name: "Paket Klasik Combo", sku: "MN-P01", cat: "Paket", price: 55000,
      desc: "Burger Klasik + Kentang Goreng (M) + minuman pilihan",
      recipe: [
        { sku: "BP-100",  qty: 1   },
        { sku: "BUN-001", qty: 1   },
        { sku: "SLD-001", qty: 20  },
        { sku: "TOM-001", qty: 20  },
        { sku: "SS-001",  qty: 15  },
        { sku: "KNT-001", qty: 150 },
        { sku: "CKL-330", qty: 1   },
        { sku: "KM-002",  qty: 1   },
        { sku: "KM-003",  qty: 1   },
        { sku: "KM-004",  qty: 1   },
        { sku: "KM-005",  qty: 1   },
      ],
    },
    {
      name: "Paket Cheese Combo", sku: "MN-P02", cat: "Paket", price: 62000,
      desc: "Cheese Burger + Kentang Goreng (M) + minuman pilihan",
      recipe: [
        { sku: "BP-100",  qty: 1   },
        { sku: "BUN-001", qty: 1   },
        { sku: "CH-001",  qty: 1   },
        { sku: "SLD-001", qty: 20  },
        { sku: "TOM-001", qty: 20  },
        { sku: "SS-001",  qty: 15  },
        { sku: "KNT-001", qty: 150 },
        { sku: "CKL-330", qty: 1   },
        { sku: "KM-002",  qty: 1   },
        { sku: "KM-003",  qty: 1   },
        { sku: "KM-004",  qty: 1   },
        { sku: "KM-005",  qty: 1   },
      ],
    },
    {
      name: "Paket Family (4 pax)", sku: "MN-P03", cat: "Paket", price: 175000,
      desc: "4 Burger Klasik + 2 Kentang Goreng (L) + 4 minuman",
      recipe: [
        { sku: "BP-100",  qty: 4   },
        { sku: "BUN-001", qty: 4   },
        { sku: "SLD-001", qty: 80  },
        { sku: "TOM-001", qty: 80  },
        { sku: "SS-001",  qty: 60  },
        { sku: "KNT-001", qty: 500 },
        { sku: "CKL-330", qty: 2   },
        { sku: "SPR-330", qty: 2   },
        { sku: "KM-002",  qty: 4   },
        { sku: "KM-003",  qty: 2   },
        { sku: "KM-004",  qty: 4   },
        { sku: "KM-005",  qty: 1   },
      ],
    },
  ]

  for (const m of menuDefs) {
    const menuItem = await prisma.inventoryItem.create({
      data: {
        organizationId: orgId,
        name: m.name, sku: m.sku, category: m.cat,
        unit: "pcs", sellPrice: m.price, description: m.desc,
        isTrackable: false, isMenuItem: true, isActive: true,
      },
    })

    if (m.recipe?.length) {
      await prisma.recipeItem.createMany({
        data: m.recipe
          .filter((r) => bahan[r.sku])
          .map((r) => ({
            parentItemId: menuItem.id,
            childItemId: bahan[r.sku],
            quantity: r.qty,
          })),
      })
    }
  }

  console.log(`✅  ${menuDefs.length} menu dibuat (dengan resep/BOM).`)
  console.log("")
  console.log("🎉  Selesai! Stok = 0 (bersih). Menu & inventori sudah terisi.")
  console.log("    Masuk ke /dashboard/goods-receipt untuk isi stok awal.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
