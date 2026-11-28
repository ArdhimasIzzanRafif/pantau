import "dotenv/config"
import assert from "node:assert/strict"
import test, { after } from "node:test"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { deleteOrganizationData } from "../src/lib/delete-organization"

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const testDatabase = new URL(process.env.DATABASE_URL!)
assert.ok(["127.0.0.1", "localhost"].includes(testDatabase.hostname), "Use a local test database")
assert.ok(testDatabase.pathname.startsWith("/pantau_delete_test"), "Use a disposable deletion test database")

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

test("hapus yang melebihi lima detik tetap selesai dan membebaskan email akun", { timeout: 30_000 }, async () => {
  const email = `delete-slow-${randomUUID()}@qa.invalid`
  const user = await db.user.create({ data: { email, name: "Pemilik QA" } })
  const org = await db.organization.create({ data: { name: "Slow delete QA", slug: `delete-slow-${randomUUID()}`, users: { create: { userId: user.id, role: "OWNER" } } } })
  await db.verificationToken.createMany({ data: [
    { identifier: email, token: "reset-qa", expires: new Date(Date.now() + 60_000) },
    { identifier: `registration-retry:${user.id}:qa`, token: "retry-qa", expires: new Date(Date.now() + 60_000) },
  ] })
  let delayed = false
  const slow = db.$extends({ query: { organization: { async findUnique({ args, query }) {
    if (!delayed) {
      delayed = true
      // Simulate a remote connection crossing Prisma's default five seconds.
      await new Promise((resolve) => setTimeout(resolve, 5_500))
    }
    return query(args)
  } } } })
  try {
    await deleteOrganizationData(slow as unknown as PrismaClient, org.id, { removeOrphanedUsers: true, adminEmail: "qa@admin.invalid" })
    assert.equal(await db.organization.findUnique({ where: { id: org.id } }), null)
    assert.equal(await db.user.findUnique({ where: { id: user.id } }), null)
    assert.equal(await db.verificationToken.count({ where: { OR: [{ identifier: email }, { identifier: { startsWith: `registration-retry:${user.id}:` } }] } }), 0)
    // The email can be used for a fresh signup after an admin deletes the account.
    const replacement = await db.user.create({ data: { email } })
    await db.user.delete({ where: { id: replacement.id } })
    assert.equal(await db.platformAuditLog.count({ where: { targetId: org.id, action: "delete_organization" } }), 1)
  } finally {
    await deleteOrganizationData(db, org.id, { removeOrphanedUsers: true })
    await db.user.deleteMany({ where: { id: user.id } })
    await db.platformAuditLog.deleteMany({ where: { targetId: org.id } })
  }
})

test("hapus bisnis mempertahankan user dan data milik bisnis lain", async () => {
  const shared = await db.user.create({ data: { email: `shared-${randomUUID()}@qa.invalid` } })
  const orphan = await db.user.create({ data: { email: `orphan-${randomUUID()}@qa.invalid` } })
  const target = await db.organization.create({ data: { name: "Target QA", slug: `delete-target-${randomUUID()}`, users: { create: [{ userId: shared.id, role: "KASIR" }, { userId: orphan.id, role: "OWNER" }] } } })
  const retained = await db.organization.create({ data: { name: "Retained QA", slug: `delete-retained-${randomUUID()}`, users: { create: { userId: shared.id, role: "OWNER" } } } })
  await db.inventoryItem.create({ data: { organizationId: retained.id, name: "Bahan bisnis lain", unit: "pcs" } })
  try {
    await deleteOrganizationData(db, target.id, { removeOrphanedUsers: true })
    assert.equal(await db.user.findUnique({ where: { id: orphan.id } }), null)
    assert.ok(await db.user.findUnique({ where: { id: shared.id } }))
    assert.equal(await db.organizationUser.count({ where: { userId: shared.id, organizationId: retained.id } }), 1)
    assert.equal(await db.inventoryItem.count({ where: { organizationId: retained.id } }), 1)
  } finally {
    await deleteOrganizationData(db, target.id, { removeOrphanedUsers: true })
    await deleteOrganizationData(db, retained.id, { removeOrphanedUsers: true })
    await db.user.deleteMany({ where: { id: { in: [shared.id, orphan.id] } } })
  }
})

test("kegagalan akhir membatalkan seluruh penghapusan termasuk user dan token", async () => {
  const user = await db.user.create({ data: { email: `rollback-${randomUUID()}@qa.invalid` } })
  const org = await db.organization.create({ data: { name: "Rollback QA", slug: `delete-rollback-${randomUUID()}`, users: { create: { userId: user.id, role: "OWNER" } } } })
  await db.verificationToken.create({ data: { identifier: user.email, token: "rollback-token", expires: new Date(Date.now() + 60_000) } })
  const failing = db.$extends({ query: { platformAuditLog: { async create() { throw new Error("QA audit unavailable") } } } })
  try {
    await assert.rejects(deleteOrganizationData(failing as unknown as PrismaClient, org.id, { removeOrphanedUsers: true, adminEmail: "qa@admin.invalid" }), /QA audit unavailable/)
    assert.ok(await db.organization.findUnique({ where: { id: org.id } }))
    assert.ok(await db.user.findUnique({ where: { id: user.id } }))
    assert.equal(await db.organizationUser.count({ where: { organizationId: org.id } }), 1)
    assert.equal(await db.verificationToken.count({ where: { identifier: user.email } }), 1)
  } finally {
    await deleteOrganizationData(db, org.id, { removeOrphanedUsers: true })
  }
})

test("menghapus ulang bisnis yang sudah hilang aman", async () => {
  assert.equal(await deleteOrganizationData(db, `missing-${randomUUID()}`, { removeOrphanedUsers: true }), null)
})

after(async () => db.$disconnect())
