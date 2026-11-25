/**
 * Seed data demo untuk organisasi "burger arman".
 *
 * Tujuan: menyiapkan BERAGAM KONDISI supaya tiap fitur bisa didemokan tanpa
 * perlu menyiapkan data manual — stok aman/menipis/habis, batch kedaluwarsa,
 * transfer di semua status, opname dengan selisih, shift kasir, order POS,
 * dan alert.
 *
 * Aman dijalankan berulang: semua record buatan script ini memakai id berawalan
 * "bademo_", dan di awal script record berawalan itu dihapus lalu dibuat ulang.
 * Data lama milik arman (yang tidak berawalan "bademo_") tidak disentuh.
 *
 * Jalankan: npx tsx prisma/seed-burger-arman.ts
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const P = "bademo_" // penanda semua data demo buatan script ini

// Helper tanggal: hari ini dikurangi n hari (jam bisa diatur biar realistis)
function daysAgo(n: number, hour = 12) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d
}
function daysAhead(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(12, 0, 0, 0)
  return d
}

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: "burger arman" } })
  if (!org) throw new Error('Organisasi "burger arman" tidak ditemukan.')

  const orgUser = await prisma.organizationUser.findFirst({
    where: { organizationId: org.id, role: "OWNER" },
    include: { user: true },
  })
  if (!orgUser) throw new Error("Owner organisasi tidak ditemukan.")
  const userId = orgUser.userId

  console.log(`🍔 Mengisi data demo untuk "${org.name}" (owner: ${orgUser.user.email})`)

  // ── Bersihkan data demo lama (hanya yang berawalan "bademo_") ────────────
  // Urutan penting: anak dulu, baru induk, supaya tidak melanggar foreign key.
  await prisma.pOSPayment.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.pOSOrderItemModifier.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.pOSOrderItem.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.pOSOrder.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.pOSShift.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.stockOpnameItem.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.stockOpname.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.stockTransferItem.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.stockTransfer.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.goodsReceiptItem.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.goodsReceipt.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.stockAdjustment.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.stockMovement.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.stockBatch.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.stockBalance.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.inventoryLocationSetting.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.alert.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.auditLog.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.recipeItem.deleteMany({ where: { id: { startsWith: P } } })
  // Tabel ini tidak punya kolom id (primary key-nya gabungan itemId+groupId),
  // jadi yang dipakai sebagai penanda demo adalah groupId-nya.
  await prisma.inventoryItemModifier.deleteMany({ where: { groupId: { startsWith: P } } })
  await prisma.menuModifierOption.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.menuModifierGroup.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.discountRule.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.table.deleteMany({ where: { id: { startsWith: P } } })

  // ── Lokasi ───────────────────────────────────────────────────────────────
  // Pakai gudang & outlet yang sudah ada, lalu tambah outlet kedua supaya
  // transfer antar-outlet dan perbandingan stok per lokasi bisa didemokan.
  const gudang = await prisma.location.findFirst({
    where: { organizationId: org.id, type: "WAREHOUSE" },
  })
  const outlet1 = await prisma.location.findFirst({
    where: { organizationId: org.id, type: "OUTLET" },
  })
  if (!gudang || !outlet1) throw new Error("Gudang atau outlet belum ada di organisasi ini.")

  const outlet2 = await prisma.location.upsert({
    where: { id: P + "outlet2" },
    update: {},
    create: {
      id: P + "outlet2",
      organizationId: org.id,
      name: "Outlet Cabang 2",
      type: "OUTLET",
      address: "Jl. Demo Cabang No. 2",
    },
  })

  // ── Supplier ─────────────────────────────────────────────────────────────
  const supplier = await prisma.supplier.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "CV Sumber Daging" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "CV Sumber Daging",
      contactPerson: "Pak Hendra",
      phone: "081234567890",
    },
  })

  // ── Meja (untuk demo QR order) ───────────────────────────────────────────
  for (let i = 1; i <= 4; i++) {
    await prisma.table.create({
      data: {
        id: `${P}table${i}`,
        organizationId: org.id,
        locationId: outlet1.id,
        name: `Meja ${i}`,
        tableToken: `${P}token${i}`,
        sortOrder: i,
      },
    })
  }

  // ── Master item: bahan baku & menu ───────────────────────────────────────
  const bahanDefs = [
    { key: "PATTY", name: "Beef Patty 80gr", unit: "pcs", costPrice: 15000, minStock: 50 },
    { key: "BUN", name: "Burger Bun", unit: "pcs", costPrice: 3500, minStock: 80 },
    { key: "CHEESE", name: "Cheese Slice", unit: "pcs", costPrice: 4000, minStock: 40 },
    { key: "LETTUCE", name: "Selada Segar", unit: "ikat", costPrice: 8000, minStock: 10 },
    { key: "POTATO", name: "Kentang Beku", unit: "kg", costPrice: 22000, minStock: 15 },
    { key: "SAUCE", name: "Saus Spesial", unit: "botol", costPrice: 25000, minStock: 5 },
    { key: "CUP", name: "Cup 16oz", unit: "pcs", costPrice: 1200, minStock: 100 },
  ]
  const menuDefs = [
    { key: "CHEESEBURGER", name: "Cheeseburger", category: "Burger", sellPrice: 35000 },
    { key: "DOUBLEBURGER", name: "Double Burger", category: "Burger", sellPrice: 55000 },
    { key: "FRIES", name: "Kentang Goreng", category: "Snack", sellPrice: 18000 },
    { key: "ICETEA", name: "Es Teh Manis", category: "Minuman", sellPrice: 8000, isTrackable: false },
    { key: "COFFEE", name: "Kopi Susu", category: "Minuman", sellPrice: 20000, isTrackable: false },
  ]

  const item: Record<string, { id: string }> = {}

  for (const d of bahanDefs) {
    const sku = `BA-${d.key}`
    item[d.key] = await prisma.inventoryItem.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku } },
      update: { name: d.name, costPrice: d.costPrice, minStock: d.minStock },
      create: {
        organizationId: org.id,
        name: d.name,
        sku,
        category: "Bahan Baku",
        unit: d.unit,
        costPrice: d.costPrice,
        minStock: d.minStock,
      },
    })
  }
  for (const d of menuDefs) {
    const sku = `BA-${d.key}`
    item[d.key] = await prisma.inventoryItem.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku } },
      update: { name: d.name, sellPrice: d.sellPrice },
      create: {
        organizationId: org.id,
        name: d.name,
        sku,
        category: d.category,
        sellPrice: d.sellPrice,
        isMenuItem: true,
        isAvailableForQr: true,
        isTrackable: d.isTrackable !== false,
      },
    })
  }

  // ── Resep (BOM) ──────────────────────────────────────────────────────────
  // Saat menu laku di POS, bahan bakunya ikut terpotong sesuai resep ini.
  const resep = [
    { parent: "CHEESEBURGER", child: "PATTY", qty: 1 },
    { parent: "CHEESEBURGER", child: "BUN", qty: 1 },
    { parent: "CHEESEBURGER", child: "CHEESE", qty: 1 },
    { parent: "DOUBLEBURGER", child: "PATTY", qty: 2 },
    { parent: "DOUBLEBURGER", child: "BUN", qty: 1 },
    { parent: "DOUBLEBURGER", child: "CHEESE", qty: 2 },
    { parent: "FRIES", child: "POTATO", qty: 0.15 },
  ]
  for (const [i, r] of resep.entries()) {
    await prisma.recipeItem.create({
      data: {
        id: `${P}recipe${i}`,
        parentItemId: item[r.parent].id,
        childItemId: item[r.child].id,
        quantity: r.qty,
      },
    })
  }

  // ── Modifier menu ────────────────────────────────────────────────────────
  const grupPedas = await prisma.menuModifierGroup.create({
    data: { id: P + "mg_pedas", organizationId: org.id, name: "Level Pedas", maxSelect: 1 },
  })
  await prisma.menuModifierOption.createMany({
    data: [
      { id: P + "mo_p1", groupId: grupPedas.id, name: "Tidak Pedas", price: 0, sortOrder: 0 },
      { id: P + "mo_p2", groupId: grupPedas.id, name: "Pedas", price: 0, sortOrder: 1 },
      { id: P + "mo_p3", groupId: grupPedas.id, name: "Extra Pedas", price: 2000, sortOrder: 2 },
    ],
  })
  const grupUkuran = await prisma.menuModifierGroup.create({
    data: { id: P + "mg_ukuran", organizationId: org.id, name: "Ukuran", isRequired: true, maxSelect: 1 },
  })
  await prisma.menuModifierOption.createMany({
    data: [
      { id: P + "mo_u1", groupId: grupUkuran.id, name: "Reguler", price: 0, sortOrder: 0 },
      { id: P + "mo_u2", groupId: grupUkuran.id, name: "Large", price: 5000, sortOrder: 1 },
    ],
  })
  await prisma.inventoryItemModifier.create({
    data: { itemId: item.CHEESEBURGER.id, groupId: grupPedas.id },
  })
  await prisma.inventoryItemModifier.create({
    data: { itemId: item.FRIES.id, groupId: grupUkuran.id, isRequired: true },
  })

  // ── Diskon ───────────────────────────────────────────────────────────────
  await prisma.discountRule.createMany({
    data: [
      { id: P + "disc1", organizationId: org.id, name: "Diskon Member 10%", type: "PERCENT", value: 10, minPurchase: 50000 },
      { id: P + "disc2", organizationId: org.id, name: "Potongan Rp 5.000", type: "AMOUNT", value: 5000, minPurchase: 30000 },
    ],
  })

  // ── KONDISI STOK + RIWAYATNYA (inti demo) ────────────────────────────────
  // PENTING: aplikasi punya DUA sumber angka stok yang harus selalu sama —
  // halaman "Stok per Lokasi" membaca StockBalance, sedangkan Opname Fisik
  // menjumlahkan StockMovement. Kalau keduanya tidak cocok, stok sistem saat
  // opname akan berbeda dengan yang tampil di halaman stok.
  //
  // Karena itu di sini yang ditulis adalah stok AKHIR yang diinginkan plus
  // riwayat transaksinya; stok awal dihitung mundur (akhir − total riwayat)
  // supaya penjumlahan movement dijamin sama dengan StockBalance.
  type Riwayat = { type: "GOODS_IN" | "GOODS_OUT" | "TRANSFER_IN" | "TRANSFER_OUT" | "POS_SALE" | "WASTE"; qty: number; day: number; note: string }
  const stokDefs: Array<{ key: string; loc: string; akhir: number; riwayat?: Riwayat[] }> = [
    // Gudang: stok besar, aman
    { key: "PATTY", loc: gudang.id, akhir: 200, riwayat: [
      { type: "GOODS_IN", qty: 120, day: 10, note: "Terima dari CV Sumber Daging" },
      { type: "TRANSFER_OUT", qty: -60, day: 7, note: "Kirim ke outlet" },
    ] },
    { key: "BUN", loc: gudang.id, akhir: 300, riwayat: [
      { type: "GOODS_IN", qty: 200, day: 10, note: "Terima dari CV Sumber Daging" },
      { type: "TRANSFER_OUT", qty: -50, day: 2, note: "Kirim ke outlet" },
    ] },
    { key: "CHEESE", loc: gudang.id, akhir: 250 },
    { key: "POTATO", loc: gudang.id, akhir: 60 },
    { key: "SAUCE", loc: gudang.id, akhir: 20 },
    { key: "CUP", loc: gudang.id, akhir: 800 },
    { key: "LETTUCE", loc: gudang.id, akhir: 25 },
    // Outlet 1: campur — ada yang menipis dan habis
    { key: "PATTY", loc: outlet1.id, akhir: 60, riwayat: [ // aman
      { type: "TRANSFER_IN", qty: 58, day: 6, note: "Terima dari gudang (2 rusak)" },
      { type: "WASTE", qty: -2, day: 3, note: "Gosong saat masak" },
    ] },
    { key: "BUN", loc: outlet1.id, akhir: 95, riwayat: [ // aman
      { type: "TRANSFER_IN", qty: 50, day: 2, note: "Terima dari gudang" },
    ] },
    { key: "CHEESE", loc: outlet1.id, akhir: 8, riwayat: [ // MENIPIS (min 40)
      { type: "POS_SALE", qty: -32, day: 3, note: "Terjual lewat POS" },
      { type: "WASTE", qty: -4, day: 2, note: "Kedaluwarsa, dibuang" },
    ] },
    { key: "LETTUCE", loc: outlet1.id, akhir: 2, riwayat: [ // MENIPIS (min 10)
      { type: "WASTE", qty: -3, day: 2, note: "Layu, dibuang" },
    ] },
    { key: "SAUCE", loc: outlet1.id, akhir: 0, riwayat: [ // HABIS
      { type: "GOODS_OUT", qty: -8, day: 1, note: "Habis terpakai" },
    ] },
    { key: "POTATO", loc: outlet1.id, akhir: 18 }, // aman
    { key: "CUP", loc: outlet1.id, akhir: 130, riwayat: [ // aman
      { type: "POS_SALE", qty: -20, day: 4, note: "Terpakai untuk minuman" },
    ] },
    // Outlet 2: baru buka, stok tipis di mana-mana
    { key: "PATTY", loc: outlet2.id, akhir: 12, riwayat: [
      { type: "TRANSFER_IN", qty: 12, day: 5, note: "Stok awal dari gudang" },
    ] },
    { key: "BUN", loc: outlet2.id, akhir: 20 },
    { key: "CHEESE", loc: outlet2.id, akhir: 5 },
    { key: "CUP", loc: outlet2.id, akhir: 40 },
  ]

  let mvNo = 0
  for (const [i, s] of stokDefs.entries()) {
    const totalRiwayat = (s.riwayat ?? []).reduce((total, r) => total + r.qty, 0)
    const stokAwal = s.akhir - totalRiwayat

    await prisma.stockMovement.create({
      data: {
        id: `${P}mv${mvNo++}`,
        organizationId: org.id,
        itemId: item[s.key].id,
        locationId: s.loc,
        type: "INITIAL_STOCK",
        quantity: stokAwal,
        note: "Stok awal",
        createdById: userId,
        effectiveAt: daysAgo(30),
      },
    })
    for (const r of s.riwayat ?? []) {
      await prisma.stockMovement.create({
        data: {
          id: `${P}mv${mvNo++}`,
          organizationId: org.id,
          itemId: item[s.key].id,
          locationId: s.loc,
          type: r.type,
          quantity: r.qty,
          note: r.note,
          createdById: userId,
          effectiveAt: daysAgo(r.day),
        },
      })
    }

    await prisma.stockBalance.create({
      data: {
        id: `${P}sb${i}`,
        organizationId: org.id,
        itemId: item[s.key].id,
        locationId: s.loc,
        quantity: s.akhir,
      },
    })
  }

  // Batas minimum PER LOKASI.
  // PENTING: alert LOW_STOCK hanya ditampilkan aplikasi kalau kombinasi
  // item+lokasi punya baris InventoryLocationSetting dengan minStock terisi
  // (lihat src/app/api/alerts/route.ts). Tanpa ini, alertnya tidak akan tampil.
  const minPerLokasi = [
    { key: "CHEESE", loc: outlet1.id, min: 40 },
    { key: "LETTUCE", loc: outlet1.id, min: 10 },
    { key: "SAUCE", loc: outlet1.id, min: 5 },
    { key: "PATTY", loc: outlet2.id, min: 30 },
    { key: "CHEESE", loc: outlet2.id, min: 20 },
  ]
  for (const [i, m] of minPerLokasi.entries()) {
    await prisma.inventoryLocationSetting.create({
      data: {
        id: `${P}ils${i}`,
        organizationId: org.id,
        itemId: item[m.key].id,
        locationId: m.loc,
        minStock: m.min,
      },
    })
  }

  // ── Batch: normal, mau kedaluwarsa, sudah kedaluwarsa ───────────────────
  const batchDefs = [
    { key: "PATTY", loc: gudang.id, no: "BATCH-PATTY-01", qty: 120, expiry: daysAhead(30), cost: 15000 },
    { key: "PATTY", loc: outlet1.id, no: "BATCH-PATTY-02", qty: 60, expiry: daysAhead(3), cost: 15500 }, // segera kedaluwarsa
    { key: "CHEESE", loc: outlet1.id, no: "BATCH-CHEESE-01", qty: 8, expiry: daysAgo(2), cost: 4000 }, // SUDAH kedaluwarsa
    { key: "POTATO", loc: gudang.id, no: "BATCH-POTATO-01", qty: 60, expiry: daysAhead(60), cost: 22000 },
  ]
  const batch: Record<string, { id: string }> = {}
  for (const [i, b] of batchDefs.entries()) {
    batch[b.no] = await prisma.stockBatch.create({
      data: {
        id: `${P}batch${i}`,
        organizationId: org.id,
        itemId: item[b.key].id,
        locationId: b.loc,
        batchNumber: b.no,
        initialQuantity: b.qty,
        quantity: b.qty,
        expiryDate: b.expiry,
        costPrice: b.cost,
        receivedAt: daysAgo(10),
      },
    })
  }

  // ── Barang masuk: satu sudah dikonfirmasi, satu masih draft ─────────────
  await prisma.goodsReceipt.create({
    data: {
      id: P + "gr1",
      organizationId: org.id,
      locationId: gudang.id,
      supplierId: supplier.id,
      receiptNumber: "GR-DEMO-0001",
      supplier: supplier.name,
      status: "CONFIRMED",
      receivedAt: daysAgo(10),
      createdById: userId,
      items: {
        create: [
          { id: P + "gri1", itemId: item.PATTY.id, quantity: 120, costPrice: 15000, purchaseQuantity: 120, purchaseUnit: "pcs", purchaseUnitCost: 15000, lineTotal: 1800000 },
          { id: P + "gri2", itemId: item.BUN.id, quantity: 200, costPrice: 3500, purchaseQuantity: 200, purchaseUnit: "pcs", purchaseUnitCost: 3500, lineTotal: 700000 },
        ],
      },
    },
  })
  await prisma.goodsReceipt.create({
    data: {
      id: P + "gr2",
      organizationId: org.id,
      locationId: gudang.id,
      supplierId: supplier.id,
      receiptNumber: "GR-DEMO-0002",
      supplier: supplier.name,
      status: "DRAFT", // menunggu dikonfirmasi — bisa didemokan alur konfirmasinya
      receivedAt: new Date(),
      createdById: userId,
      items: {
        create: [
          { id: P + "gri3", itemId: item.CHEESE.id, quantity: 100, costPrice: 4000, purchaseQuantity: 100, purchaseUnit: "pcs", purchaseUnitCost: 4000, lineTotal: 400000 },
          { id: P + "gri4", itemId: item.SAUCE.id, quantity: 12, costPrice: 25000, purchaseQuantity: 12, purchaseUnit: "botol", purchaseUnitCost: 25000, lineTotal: 300000 },
        ],
      },
    },
  })

  // ── Transfer: semua status supaya tiap tahap alur bisa ditunjukkan ──────
  await prisma.stockTransfer.create({
    data: {
      id: P + "tf_pending",
      organizationId: org.id,
      fromLocationId: gudang.id,
      toLocationId: outlet2.id,
      status: "PENDING", // baru diajukan, menunggu persetujuan
      notes: "Permintaan stok awal Outlet Cabang 2",
      createdById: userId,
      createdAt: daysAgo(1),
      items: { create: [{ id: P + "tfi1", itemId: item.PATTY.id, quantity: 40 }] },
    },
  })
  await prisma.stockTransfer.create({
    data: {
      id: P + "tf_sent",
      organizationId: org.id,
      fromLocationId: gudang.id,
      toLocationId: outlet1.id,
      status: "SENT", // sudah dikirim, menunggu konfirmasi penerimaan
      notes: "Pengiriman rutin mingguan",
      sentAt: daysAgo(1),
      createdById: userId,
      createdAt: daysAgo(2),
      items: {
        create: [
          { id: P + "tfi2", itemId: item.BUN.id, quantity: 50 },
          { id: P + "tfi3", itemId: item.CHEESE.id, quantity: 60 },
        ],
      },
    },
  })
  await prisma.stockTransfer.create({
    data: {
      id: P + "tf_received",
      organizationId: org.id,
      fromLocationId: gudang.id,
      toLocationId: outlet1.id,
      status: "RECEIVED", // selesai, tapi ada selisih terima (2 rusak)
      notes: "Sudah diterima outlet",
      sentAt: daysAgo(7),
      receivedAt: daysAgo(6),
      createdById: userId,
      confirmedById: userId,
      receiptNotes: "2 patty rusak saat pengiriman",
      createdAt: daysAgo(7),
      items: {
        create: [
          { id: P + "tfi4", itemId: item.PATTY.id, quantity: 60, receivedQty: 58, damagedQty: 2 },
        ],
      },
    },
  })
  await prisma.stockTransfer.create({
    data: {
      id: P + "tf_rejected",
      organizationId: org.id,
      fromLocationId: gudang.id,
      toLocationId: outlet2.id,
      status: "REJECTED", // ditolak, ada alasannya
      notes: "Ditolak: stok gudang belum cukup",
      createdById: userId,
      createdAt: daysAgo(4),
      items: { create: [{ id: P + "tfi5", itemId: item.POTATO.id, quantity: 30 }] },
    },
  })

  // ── Opname: draft, menunggu review, dan sudah selesai ───────────────────
  await prisma.stockOpname.create({
    data: {
      id: P + "op_draft",
      organizationId: org.id,
      locationId: outlet2.id,
      periodStart: daysAgo(1),
      periodEnd: new Date(),
      shift: "Pagi",
      status: "DRAFT", // sedang dihitung, belum dikirim
      createdById: userId,
      items: {
        create: [
          { id: P + "opi1", itemId: item.PATTY.id, systemQty: 12 },
          { id: P + "opi2", itemId: item.CHEESE.id, systemQty: 5 },
        ],
      },
    },
  })
  await prisma.stockOpname.create({
    data: {
      id: P + "op_submitted",
      organizationId: org.id,
      locationId: outlet1.id,
      periodStart: daysAgo(7),
      periodEnd: new Date(),
      shift: "Malam",
      status: "SUBMITTED", // menunggu persetujuan owner
      submittedAt: daysAgo(1),
      createdById: userId,
      items: {
        create: [
          // selisih minus (kurang) → ada estimasi rugi
          { id: P + "opi3", itemId: item.CHEESE.id, systemQty: 12, physicalQty: 8, difference: -4, estimatedLoss: 16000, notes: "Kurang 4 slice" },
          // selisih plus (lebih) → rugi 0
          { id: P + "opi4", itemId: item.BUN.id, systemQty: 92, physicalQty: 95, difference: 3, estimatedLoss: 0, notes: "Lebih 3 bun" },
          // pas, tidak ada selisih
          { id: P + "opi5", itemId: item.PATTY.id, systemQty: 60, physicalQty: 60, difference: 0, estimatedLoss: 0 },
        ],
      },
    },
  })
  const opnameSelesai = await prisma.stockOpname.create({
    data: {
      id: P + "op_reviewed",
      organizationId: org.id,
      locationId: outlet1.id,
      periodStart: daysAgo(30),
      periodEnd: daysAgo(23),
      shift: "Pagi",
      status: "REVIEWED", // sudah disetujui
      submittedAt: daysAgo(23),
      reviewedAt: daysAgo(22),
      reviewedById: userId,
      reviewNotes: "Disetujui, selisih wajar",
      createdById: userId,
      items: {
        create: [
          { id: P + "opi6", itemId: item.PATTY.id, systemQty: 70, physicalQty: 65, difference: -5, estimatedLoss: 75000, notes: "Selisih 5 patty" },
        ],
      },
    },
  })

  // ── Penyesuaian stok: waste, rusak, kedaluwarsa, gratisan ───────────────
  const adjustDefs = [
    { key: "CHEESE", loc: outlet1.id, type: "EXPIRED" as const, qty: 4, cost: 4000, note: "Kedaluwarsa, dibuang" },
    { key: "BUN", loc: outlet1.id, type: "DAMAGE" as const, qty: 3, cost: 3500, note: "Bun hancur saat penyimpanan" },
    { key: "PATTY", loc: outlet1.id, type: "WASTE" as const, qty: 2, cost: 15000, note: "Gosong saat masak" },
    { key: "COFFEE", loc: outlet1.id, type: "COMPLIMENTARY" as const, qty: 2, cost: 0, note: "Gratis untuk pelanggan komplain" },
  ]
  for (const [i, a] of adjustDefs.entries()) {
    await prisma.stockAdjustment.create({
      data: {
        id: `${P}adj${i}`,
        organizationId: org.id,
        locationId: a.loc,
        itemId: item[a.key].id,
        type: a.type,
        quantity: a.qty,
        unitCost: a.cost,
        totalCost: a.cost * a.qty,
        note: a.note,
        createdById: userId,
        createdAt: daysAgo(i + 1),
      },
    })
  }

  // ── Shift kasir: satu sudah tutup (ada selisih kas), satu masih buka ────
  const shiftTutup = await prisma.pOSShift.create({
    data: {
      id: P + "shift_closed",
      organizationId: org.id,
      locationId: outlet1.id,
      cashierId: userId,
      shiftNumber: "SHIFT-DEMO-01",
      openingBalance: 300000,
      closingBalance: 1235000,
      expectedCash: 1250000, // selisih kurang Rp 15.000 — bagus untuk demo
      totalSales: 950000,
      totalOrders: 12,
      notes: "Selisih kas kurang Rp 15.000",
      openedAt: daysAgo(1, 8),
      closedAt: daysAgo(1, 22),
      status: "CLOSED",
    },
  })
  const shiftBuka = await prisma.pOSShift.create({
    data: {
      id: P + "shift_open",
      organizationId: org.id,
      locationId: outlet1.id,
      cashierId: userId,
      shiftNumber: "SHIFT-DEMO-02",
      openingBalance: 500000,
      status: "OPEN",
      openedAt: daysAgo(0, 8),
    },
  })

  // ── Riwayat penjualan 14 hari (untuk grafik dashboard) ──────────────────
  // Grafik membaca order berstatus PAID memakai paidAt, jadi tanggalnya
  // disebar ke belakang supaya tren penjualan kelihatan.
  let nomor = 100
  for (let d = 13; d >= 1; d--) {
    const jumlahOrder = 2 + (d % 3) // variasi 2–4 order per hari
    for (let n = 0; n < jumlahOrder; n++) {
      const pakaiDouble = (d + n) % 2 === 0
      const menuId = pakaiDouble ? item.DOUBLEBURGER.id : item.CHEESEBURGER.id
      const menuNama = pakaiDouble ? "Double Burger" : "Cheeseburger"
      const harga = pakaiDouble ? 55000 : 35000
      const qty = 1 + (n % 2)
      const fries = 18000
      const subtotal = harga * qty + fries
      const waktu = daysAgo(d, 11 + n * 3)
      await prisma.pOSOrder.create({
        data: {
          id: `${P}ord${nomor}`,
          organizationId: org.id,
          locationId: outlet1.id,
          shiftId: shiftTutup.id,
          cashierId: userId,
          orderNumber: `ORD-DEMO-${nomor}`,
          orderType: n % 3 === 0 ? "TAKEAWAY" : "DINE_IN",
          tableNumber: n % 3 === 0 ? null : `Meja ${(n % 4) + 1}`,
          customerName: ["Andi", "Sinta", "Rudi", "Maya"][n % 4],
          status: "PAID",
          subtotal,
          total: subtotal,
          paidAt: waktu,
          createdAt: waktu,
          items: {
            create: [
              { id: `${P}oi${nomor}a`, menuItemId: menuId, name: menuNama, price: harga, qty, subtotal: harga * qty },
              { id: `${P}oi${nomor}b`, menuItemId: item.FRIES.id, name: "Kentang Goreng", price: fries, qty: 1, subtotal: fries },
            ],
          },
          payments: {
            create: [{ id: `${P}pay${nomor}`, method: n % 2 === 0 ? "CASH" : "QRIS", amount: subtotal, change: 0 }],
          },
        },
      })
      nomor++
    }
  }

  // ── Order hari ini: berbagai status untuk demo layar kasir ──────────────
  // Lunas (tunai)
  await prisma.pOSOrder.create({
    data: {
      id: P + "ord_paid",
      organizationId: org.id,
      locationId: outlet1.id,
      shiftId: shiftBuka.id,
      cashierId: userId,
      orderNumber: "ORD-DEMO-201",
      orderType: "DINE_IN",
      tableNumber: "Meja 1",
      customerName: "Dewi",
      status: "PAID",
      subtotal: 88000,
      discountType: "PERCENT",
      discountValue: 10,
      discountAmount: 8800,
      discountLabel: "Diskon Member 10%",
      total: 79200,
      paidAt: new Date(),
      items: {
        create: [
          { id: P + "oi_paid_a", menuItemId: item.CHEESEBURGER.id, name: "Cheeseburger", price: 35000, qty: 2, subtotal: 70000, modifiers: { create: [{ id: P + "om1", groupName: "Level Pedas", optionName: "Extra Pedas", price: 2000 }] } },
          { id: P + "oi_paid_b", menuItemId: item.ICETEA.id, name: "Es Teh Manis", price: 8000, qty: 1, subtotal: 8000 },
        ],
      },
      payments: { create: [{ id: P + "pay_paid", method: "CASH", amount: 100000, change: 20800 }] },
    },
  })
  // Masih terbuka di meja (belum bayar)
  await prisma.pOSOrder.create({
    data: {
      id: P + "ord_open",
      organizationId: org.id,
      locationId: outlet1.id,
      shiftId: shiftBuka.id,
      cashierId: userId,
      orderNumber: "ORD-DEMO-202",
      orderType: "DINE_IN",
      tableNumber: "Meja 3",
      customerName: "Budi",
      status: "OPEN",
      subtotal: 73000,
      total: 73000,
      items: {
        create: [
          { id: P + "oi_open_a", menuItemId: item.DOUBLEBURGER.id, name: "Double Burger", price: 55000, qty: 1, subtotal: 55000 },
          { id: P + "oi_open_b", menuItemId: item.COFFEE.id, name: "Kopi Susu", price: 20000, qty: 1, subtotal: 20000 },
        ],
      },
    },
  })
  // Ditahan (pesanan disimpan dulu)
  await prisma.pOSOrder.create({
    data: {
      id: P + "ord_held",
      organizationId: org.id,
      locationId: outlet1.id,
      shiftId: shiftBuka.id,
      cashierId: userId,
      orderNumber: "ORD-DEMO-203",
      orderType: "TAKEAWAY",
      customerName: "Rina",
      status: "HELD",
      subtotal: 36000,
      total: 36000,
      notes: "Pelanggan pesan dulu, bayar nanti",
      items: { create: [{ id: P + "oi_held", menuItemId: item.FRIES.id, name: "Kentang Goreng", price: 18000, qty: 2, subtotal: 36000 }] },
    },
  })
  // Dibatalkan
  await prisma.pOSOrder.create({
    data: {
      id: P + "ord_void",
      organizationId: org.id,
      locationId: outlet1.id,
      shiftId: shiftBuka.id,
      cashierId: userId,
      orderNumber: "ORD-DEMO-204",
      orderType: "DINE_IN",
      tableNumber: "Meja 2",
      status: "VOID",
      subtotal: 35000,
      total: 35000,
      voidReason: "Pelanggan batal pesan",
      items: { create: [{ id: P + "oi_void", menuItemId: item.CHEESEBURGER.id, name: "Cheeseburger", price: 35000, qty: 1, subtotal: 35000 }] },
    },
  })
  // Pesanan dari QR meja, menunggu pembayaran
  await prisma.pOSOrder.create({
    data: {
      id: P + "ord_qr",
      organizationId: org.id,
      locationId: outlet1.id,
      orderNumber: "ORD-DEMO-205",
      orderType: "DINE_IN",
      tableNumber: "Meja 4",
      customerName: "Tamu Meja 4",
      status: "PENDING_PAYMENT",
      subtotal: 43000,
      total: 43000,
      guestSessionId: P + "guest1",
      notes: "Pesanan dari QR meja",
      items: {
        create: [
          { id: P + "oi_qr_a", menuItemId: item.CHEESEBURGER.id, name: "Cheeseburger", price: 35000, qty: 1, subtotal: 35000 },
          { id: P + "oi_qr_b", menuItemId: item.ICETEA.id, name: "Es Teh Manis", price: 8000, qty: 1, subtotal: 8000 },
        ],
      },
    },
  })

  // ── Alert: bermacam jenis & tingkat keparahan ───────────────────────────
  await prisma.alert.createMany({
    data: [
      { id: P + "al1", organizationId: org.id, type: "LOW_STOCK", severity: "WARNING", title: "Stok Cheese Slice menipis", message: "Cheese Slice di outlet tinggal 8 pcs (minimum 40 pcs)", locationId: outlet1.id, itemId: item.CHEESE.id },
      { id: P + "al2", organizationId: org.id, type: "LOW_STOCK", severity: "CRITICAL", title: "Saus Spesial habis", message: "Saus Spesial di outlet sudah 0 botol (minimum 5 botol)", locationId: outlet1.id, itemId: item.SAUCE.id },
      { id: P + "al3", organizationId: org.id, type: "LOW_STOCK", severity: "WARNING", title: "Selada Segar menipis", message: "Selada Segar di outlet tinggal 2 ikat (minimum 10 ikat)", locationId: outlet1.id, itemId: item.LETTUCE.id },
      { id: P + "al4", organizationId: org.id, type: "LOW_STOCK", severity: "WARNING", title: "Beef Patty menipis di Cabang 2", message: "Beef Patty di Outlet Cabang 2 tinggal 12 pcs (minimum 30 pcs)", locationId: outlet2.id, itemId: item.PATTY.id },
      // Selisih opname — referensinya opname yang SUDAH direview supaya alert ini tampil
      { id: P + "al5", organizationId: org.id, type: "STOCK_SHORTAGE", severity: "CRITICAL", title: "Selisih stok: Beef Patty 80gr", message: "Selisih -5 pcs saat opname. Estimasi rugi Rp 75.000", locationId: outlet1.id, itemId: item.PATTY.id, referenceId: opnameSelesai.id },
      { id: P + "al6", organizationId: org.id, type: "GOODS_RECEIVED", severity: "INFO", title: "Barang masuk dikonfirmasi", message: "GR-DEMO-0001 dari CV Sumber Daging telah dikonfirmasi", locationId: gudang.id, createdAt: daysAgo(10) },
      { id: P + "al7", organizationId: org.id, type: "TRANSFER_REJECTED", severity: "WARNING", title: "Transfer ditolak", message: "Transfer kentang ke Outlet Cabang 2 ditolak karena stok gudang belum cukup", locationId: gudang.id, createdAt: daysAgo(4) },
      { id: P + "al8", organizationId: org.id, type: "ITEM_NO_COST_PRICE", severity: "INFO", title: "Item tanpa harga pokok", message: "Ada item menu yang belum diisi harga pokoknya", createdAt: daysAgo(5) },
      // Sudah diselesaikan — untuk demo tab "riwayat alert"
      { id: P + "al9", organizationId: org.id, type: "TRANSFER_COMPLETED", severity: "INFO", title: "Transfer selesai diterima", message: "Transfer patty ke outlet telah diterima (2 rusak)", locationId: outlet1.id, isResolved: true, resolvedAt: daysAgo(6), resolvedById: userId, createdAt: daysAgo(6) },
      { id: P + "al10", organizationId: org.id, type: "OPNAME_COMPLETED", severity: "INFO", title: "Opname selesai direview", message: "Opname periode lalu telah disetujui", locationId: outlet1.id, isResolved: true, resolvedAt: daysAgo(22), resolvedById: userId, createdAt: daysAgo(22) },
    ],
  })

  // ── Audit log ────────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { id: P + "au1", organizationId: org.id, userId, action: "CREATE", entity: "GoodsReceipt", entityId: P + "gr1", createdAt: daysAgo(10) },
      { id: P + "au2", organizationId: org.id, userId, action: "CREATE", entity: "StockTransfer", entityId: P + "tf_sent", createdAt: daysAgo(2) },
      { id: P + "au3", organizationId: org.id, userId, action: "SUBMIT_OPNAME", entity: "StockOpname", entityId: P + "op_submitted", createdAt: daysAgo(1) },
      { id: P + "au4", organizationId: org.id, userId, action: "REVIEW_OPNAME", entity: "StockOpname", entityId: opnameSelesai.id, createdAt: daysAgo(22) },
      { id: P + "au5", organizationId: org.id, userId, action: "VOID_ORDER", entity: "POSOrder", entityId: P + "ord_void", createdAt: new Date() },
    ],
  })

  console.log(`
✅ Data demo "burger arman" siap.

Kondisi yang bisa didemokan:
  Stok        → aman (Beef Patty), menipis (Cheese 8/40, Selada 2/10), habis (Saus 0/5)
  Batch       → normal, segera kedaluwarsa (3 hari), sudah kedaluwarsa
  Barang masuk→ 1 dikonfirmasi + 1 draft (bisa didemokan alur konfirmasi)
  Transfer    → PENDING, SENT, RECEIVED (2 rusak), REJECTED
  Opname      → DRAFT, SUBMITTED (selisih minus & plus), REVIEWED
  Penyesuaian → waste, rusak, kedaluwarsa, gratisan
  Shift       → 1 tutup (selisih kas -15.000), 1 masih buka
  Order       → PAID (tunai & QRIS), OPEN di meja, HELD, VOID, PENDING_PAYMENT dari QR
  Grafik      → riwayat penjualan 13 hari ke belakang
  Alert       → 8 aktif (INFO/WARNING/CRITICAL) + 2 sudah selesai
  Lokasi      → Gudang Pusat, outlet lama, dan Outlet Cabang 2 (baru)
`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
