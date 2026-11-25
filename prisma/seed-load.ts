/**
 * Load test seed — generates realistic high-volume data.
 * Run: npx tsx prisma/seed-load.ts
 *
 * Default: ~12 months of data, ~50 orders/day across 2 locations = ~18k orders total.
 * Tweak DAYS and ORDERS_PER_DAY to scale up or down.
 */

import {
  PrismaClient,
  type OrderType,
  type PaymentMethod,
  type Prisma,
} from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import "dotenv/config"

const DAYS          = 365   // how many days back to generate
const ORDERS_PER_DAY = 50   // average orders per location per day

const pool    = new Pool({ connectionString: process.env.DATABASE_URL!, max: 5 })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter })

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function randomDate(daysAgo: number) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(rand(8, 22), rand(0, 59), rand(0, 59))
  return d
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function main() {
  console.log("🔍 Looking up demo organization...")

  const org = await prisma.organization.findFirst({
    where: { slug: "burger-bali-demo" },
    include: {
      locations: { select: { id: true, name: true } },
      users: {
        select: { userId: true, role: true },
        take: 10,
      },
    },
  })

  if (!org) {
    console.error("❌ Demo org not found. Run `npm run seed` first.")
    process.exit(1)
  }
  if (!org.locations.length) {
    console.error("❌ No locations found in demo org.")
    process.exit(1)
  }

  const menuItems = await prisma.inventoryItem.findMany({
    where: { organizationId: org.id, isMenuItem: true, isActive: true },
    select: { id: true, sellPrice: true, name: true },
    take: 20,
  })

  if (!menuItems.length) {
    console.error("❌ No menu items found. Run `npm run seed` first.")
    process.exit(1)
  }

  // Prefer kasir users for cashierId, fall back to any user
  const kasirUsers = org.users.filter((u) => u.role === "KASIR")
  const cashierIds = (kasirUsers.length ? kasirUsers : org.users).map((m) => m.userId)
  const locations  = org.locations

  const totalOrders = DAYS * ORDERS_PER_DAY * locations.length
  console.log(`📊 Generating ~${totalOrders.toLocaleString()} orders across ${locations.length} locations over ${DAYS} days...`)
  console.log("   This may take a few minutes.\n")

  let created = 0

  for (const loc of locations) {
    console.log(`  📍 Seeding location: ${loc.name}`)

    for (let d = DAYS; d >= 1; d--) {
      const dayOrders = rand(ORDERS_PER_DAY - 10, ORDERS_PER_DAY + 10)

      // Create one shift per day per location
      const openedAt  = randomDate(d)
      openedAt.setHours(8, 0, 0)
      const closedAt  = new Date(openedAt)
      closedAt.setHours(22, 30, 0)

      const shift = await prisma.pOSShift.create({
        data: {
          organizationId: org.id,
          locationId:     loc.id,
          cashierId:      pick(cashierIds),
          shiftNumber:    `SHIFT-${loc.id.slice(-4)}-${String(DAYS - d + 1).padStart(4, "0")}`,
          openingBalance: 500_000,
          status:         "CLOSED",
          openedAt,
          closedAt,
        },
      })

      // Batch order creation for the day
      const orderData: Prisma.POSOrderUncheckedCreateInput[] = []
      let totalShiftSales = 0

      for (let o = 0; o < dayOrders; o++) {
        const orderDate   = randomDate(d)
        const itemCount   = rand(1, 4)
        const orderItems  = Array.from({ length: itemCount }, () => pick(menuItems))

        const subtotal    = orderItems.reduce((s, item) => s + Number(item.sellPrice) * rand(1, 3), 0)
        const total       = Math.round(subtotal)
        totalShiftSales  += total

        orderData.push({
          organizationId: org.id,
          locationId:     loc.id,
          shiftId:        shift.id,
          cashierId:      cashierIds.length ? pick(cashierIds) : null,
          orderNumber:    `ORD-${Date.now()}-${o}`,
          orderType:      pick<OrderType>(["DINE_IN", "TAKEAWAY", "DINE_IN"]),
          status:         "PAID",
          subtotal,
          total,
          paidAt:         orderDate,
          createdAt:      orderDate,
          updatedAt:      orderDate,
          items: {
            create: orderItems.map((item) => {
              const qty = rand(1, 3)
              return {
                menuItemId: item.id,
                name:       item.name,
                price:      Number(item.sellPrice),
                qty,
                discount:   0,
                subtotal:   Number(item.sellPrice) * qty,
              }
            }),
          },
          payments: {
            create: [{
              method: pick<PaymentMethod>(["CASH", "QRIS", "TRANSFER", "CASH"]),
              amount: total,
              change: 0,
            }],
          },
        })
      }

      // Create orders in batches of 20 to avoid overwhelming the DB
      for (let i = 0; i < orderData.length; i += 20) {
        const batch = orderData.slice(i, i + 20)
        await Promise.all(batch.map((data) => prisma.pOSOrder.create({ data })))
        created += batch.length
      }

      // Update shift totals
      await prisma.pOSShift.update({
        where: { id: shift.id },
        data: {
          totalSales:  totalShiftSales,
          totalOrders: dayOrders,
          closingBalance: 500_000 + totalShiftSales,
          expectedCash:   500_000 + totalShiftSales,
        },
      })

      if (d % 30 === 0) {
        process.stdout.write(`    ✓ ${created.toLocaleString()} orders created so far...\r`)
      }
    }
  }

  console.log(`\n✅ Done! Created ${created.toLocaleString()} orders total.`)
  console.log("   Run your app and check the dashboard performance.\n")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect().then(() => pool.end()))
