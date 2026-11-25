/**
 * Menyelaraskan peringatan stok menipis dengan stok saat ini.
 *
 * Peringatan LOW_STOCK biasanya dibuat saat ada stok keluar. Data yang
 * dimasukkan langsung (seed/impor) bisa sudah di bawah ambang tanpa
 * peringatan, atau sudah habis tapi peringatannya masih "menipis".
 * Script ini menjalankan pengecekan yang sama untuk semua saldo ≤ ambang.
 *
 * WhatsApp TIDAK dikirim dari script (tidak ada request yang aktif).
 * Kirim lewat tombol "Kirim WA" di halaman Peringatan.
 *
 * Jalankan: NODE_PATH=tests/stubs npx tsx prisma/sinkron-stok-menipis.ts
 */
import "dotenv/config"
import { prisma } from "../src/lib/db"
import { checkAndCreateLowStockAlert } from "../src/lib/stock-alerts"

async function main() {
  const rows = await prisma.$queryRaw<Array<{ organizationId: string; itemId: string; locationId: string }>>`
    SELECT b."organizationId", b."itemId", b."locationId"
    FROM "StockBalance" b
    JOIN "InventoryLocationSetting" s ON s."organizationId" = b."organizationId"
      AND s."itemId" = b."itemId" AND s."locationId" = b."locationId"
    WHERE s."minStock" IS NOT NULL AND b.quantity <= s."minStock"`

  for (const row of rows) {
    await prisma.$transaction((tx) => checkAndCreateLowStockAlert(tx, row.organizationId, row.itemId, row.locationId))
  }
  console.log(`✅ ${rows.length} saldo di bawah ambang diperiksa.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
