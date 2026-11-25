/**
 * Menyiapkan organisasi "burger arman": akun owner + staf, dan lokasinya.
 *
 * Ini langkah SEBELUM seed-burger-arman.ts, karena script itu butuh organisasi
 * "burger arman" yang sudah punya owner, gudang, dan outlet.
 *
 * Aman dijalankan berulang (semua pakai upsert).
 *
 * Jalankan:
 *   npx tsx prisma/setup-burger-arman.ts
 *   npx tsx prisma/seed-burger-arman.ts
 *   npx tsx prisma/setup-burger-arman.ts   (lagi, untuk menugaskan outlet kedua)
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import "dotenv/config"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PASSWORD = process.env.SEED_PASSWORD ?? ""
if (!PASSWORD || PASSWORD.length < 12) {
  throw new Error("Isi SEED_PASSWORD dengan minimal 12 karakter sebelum menyiapkan akun uji")
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12)

  // ── Organisasi ───────────────────────────────────────────────────────────
  // Langsung ACTIVE + PRO supaya tidak perlu approval admin dan semua fitur terbuka.
  const org = await prisma.organization.upsert({
    where: { slug: "burger-arman" },
    update: { status: "ACTIVE", plan: "PRO" },
    create: { name: "burger arman", slug: "burger-arman", status: "ACTIVE", plan: "PRO" },
  })

  // ── Lokasi ───────────────────────────────────────────────────────────────
  const gudang = await prisma.location.upsert({
    where: { id: org.id + "_gudang" },
    update: {},
    create: { id: org.id + "_gudang", organizationId: org.id, name: "Gudang Pusat", type: "WAREHOUSE", address: "Jl. Gatot Subroto No. 88" },
  })
  const outletUtama = await prisma.location.upsert({
    where: { id: org.id + "_outlet1" },
    update: {},
    create: { id: org.id + "_outlet1", organizationId: org.id, name: "Outlet Utama", type: "OUTLET", address: "Jl. Kemang Raya No. 10" },
  })
  // Outlet kedua ("Outlet Cabang 2") dibuat oleh seed-burger-arman.ts.
  // Supervisor dapat SEMUA outlet yang ada, jadi jalankan script ini sekali
  // lagi setelah seed supaya outlet kedua ikut ditugaskan.
  const semuaOutlet = await prisma.location.findMany({
    where: { organizationId: org.id, type: "OUTLET" },
    select: { id: true },
  })

  // ── Akun ─────────────────────────────────────────────────────────────────
  // locations = lokasi yang boleh diakses. Owner otomatis bisa akses semua.
  const akun = [
    { email: "armansuhada05@gmail.com", name: "Arman (Owner)", role: "OWNER" as const, locations: [] },
    { email: "gudang.arman@demo.com", name: "Rizki (Admin Gudang)", role: "ADMIN_GUDANG" as const, locations: [gudang.id] },
    { email: "outlet.arman@demo.com", name: "Fajar (Supervisor Outlet)", role: "SUPERVISOR" as const, locations: semuaOutlet.map((o) => o.id) },
    { email: "kasir.arman@demo.com", name: "Nisa (Kasir Outlet Utama)", role: "KASIR" as const, locations: [outletUtama.id] },
  ]

  for (const a of akun) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { password: hash },
      create: { name: a.name, email: a.email, password: hash },
    })
    const orgUser = await prisma.organizationUser.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: { role: a.role },
      create: { organizationId: org.id, userId: user.id, role: a.role },
    })
    for (const locationId of a.locations) {
      await prisma.userLocation.upsert({
        where: { orgUserId_locationId: { orgUserId: orgUser.id, locationId } },
        update: {},
        create: { orgUserId: orgUser.id, locationId },
      })
    }
  }

  console.log(`✅ Organisasi "${org.name}" siap. Password menggunakan SEED_PASSWORD dari environment.`)
  for (const a of akun) console.log(`  ${a.role.padEnd(12)} → ${a.email}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
