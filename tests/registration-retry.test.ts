// Dedicated disposable database only. Never run against an application database.
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { RegistrationError, RegistrationVerificationRequired, submitRegistration, reviewRegistration } from "../src/lib/registration"
import { issueRegistrationVerification, registrationVerificationHash, registrationVerificationIdentifier } from "../src/lib/registration-verification"
import { hasOrganizationAccess } from "../src/lib/organization-subscription"

test("daftar ulang melalui form: tiga pengajuan, batas admin, tanpa akun ganda", { timeout: 90_000 }, async (t) => {
  const url = new URL(process.env.DATABASE_URL!)
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname))
  assert.ok(url.pathname.startsWith("/pantau_registration_test"), "Use a disposable registration test database")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  const marker = randomUUID()
  const input = { name: "Pendaftar QA", email: `${marker}@registration.invalid`, phone: "081234567890", password: "TestDaftar123!", businessName: "Warung QA", plan: "kasir", retryToken: undefined as string | undefined }
  const admin = "admin@registration.invalid"
  const orgIds: string[] = []
  const userIds: string[] = []
  const capture = async (patch: Partial<typeof input> = {}) => {
    const result = await submitRegistration(db, { ...input, ...patch })
    if (!orgIds.includes(result.organizationId)) orgIds.push(result.organizationId)
    if (!userIds.includes(result.userId)) userIds.push(result.userId)
    return result
  }
  const fails = (status: number) => (error: unknown) => error instanceof RegistrationError && error.status === status
  try {
    const first = await capture({ email: `  ${input.email.toUpperCase()}  ` })
    const originalPassword = (await db.user.findUniqueOrThrow({ where: { id: first.userId } })).password
    await t.test("pengajuan awal dinormalisasi dan menunggu admin", async () => {
      assert.equal(first.registrationAttempts, 1)
      assert.equal(first.resubmitted, false)
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: first.userId } })).email, input.email)
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: first.organizationId } })).status, "PENDING")
      await assert.rejects(capture(), fails(409))
    })
    await t.test("penolakan pertama tidak menangguhkan atau membuka akses aplikasi", async () => {
      const result = await reviewRegistration(db, first.organizationId, "reject", admin)
      assert.equal(result.status, "REJECTED")
      assert.equal(hasOrganizationAccess(result), false)
      await assert.rejects(reviewRegistration(db, first.organizationId, "reject", admin), fails(409))
    })
    await t.test("password salah tidak mengambil alih akun atau memakan kesempatan", async () => {
      await assert.rejects(capture({ password: "Different123!" }), (error: unknown) => error instanceof RegistrationVerificationRequired)
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: first.organizationId } })).registrationAttempts, 1)
    })
    await t.test("daftar ulang kedua memakai ID dan password lama serta menyimpan revisi", async () => {
      const second = await capture({ name: "Pemilik Revisi", businessName: "Warung Revisi", plan: "operasional" })
      assert.equal(second.userId, first.userId)
      assert.equal(second.organizationId, first.organizationId)
      assert.equal(second.registrationAttempts, 2)
      const org = await db.organization.findUniqueOrThrow({ where: { id: first.organizationId } })
      assert.equal(org.name, "Warung Revisi")
      assert.equal(org.plan, "PRO")
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: first.userId } })).password, originalPassword)
      assert.equal((await reviewRegistration(db, org.id, "reject", admin)).status, "REJECTED")
    })
    await t.test("dua kiriman bersamaan hanya mencatat pengajuan ketiga sekali", async () => {
      const results = await Promise.allSettled([capture(), capture()])
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1)
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: first.organizationId } })).registrationAttempts, 3)
      assert.equal(await db.user.count({ where: { email: input.email } }), 1)
      assert.equal(await db.organizationUser.count({ where: { userId: first.userId } }), 1)
    })
    await t.test("penolakan ketiga menangguhkan dan menutup daftar ulang keempat", async () => {
      const third = await reviewRegistration(db, first.organizationId, "reject", admin)
      assert.equal(third.status, "SUSPENDED")
      const org = await db.organization.findUniqueOrThrow({ where: { id: first.organizationId } })
      assert.ok(org.suspendedAt)
      await assert.rejects(capture(), fails(403))
      await assert.rejects(reviewRegistration(db, org.id, "approve", admin), fails(409))
      const logs = await db.platformAuditLog.findMany({ where: { targetId: org.id }, orderBy: { createdAt: "asc" } })
      assert.equal(logs.length, 3)
      assert.equal((logs[2].after as { status: string }).status, "SUSPENDED")
    })
    await t.test("admin tetap dapat mengaktifkan akun yang mencapai batas", async () => {
      await db.organization.update({ where: { id: first.organizationId }, data: { status: "ACTIVE", suspendedAt: null, trialEndsAt: new Date(Date.now() + 86400000) } })
      assert.equal(hasOrganizationAccess(await db.organization.findUniqueOrThrow({ where: { id: first.organizationId } })), true)
      await assert.rejects(capture(), fails(409))
    })
    const manual = await capture({ email: `manual-${input.email}` })
    await t.test("suspensi manual sebelum tiga pengajuan tetap memerlukan admin", async () => {
      await db.organization.update({ where: { id: manual.organizationId }, data: { status: "SUSPENDED", suspendedAt: new Date() } })
      await assert.rejects(capture({ email: `manual-${input.email}` }), fails(403))
    })
    const approved = await capture({ email: `approved-${input.email}` })
    await t.test("persetujuan tidak dapat diulang dan memulai masa aktif 30 hari", async () => {
      const result = await reviewRegistration(db, approved.organizationId, "approve", admin)
      assert.equal(result.status, "ACTIVE")
      assert.ok(result.trialEndsAt!.getTime() > Date.now() + 29 * 86400000)
      await assert.rejects(reviewRegistration(db, approved.organizationId, "reject", admin), fails(409))
    })
    const member = await capture({ email: `member-${input.email}` })
    await t.test("anggota non-owner tidak dapat mengubah bisnis lewat formulir daftar", async () => {
      await reviewRegistration(db, member.organizationId, "reject", admin)
      await db.organizationUser.updateMany({ where: { userId: member.userId }, data: { role: "KASIR" } })
      await assert.rejects(capture({ email: `member-${input.email}` }), fails(409))
    })
    const multi = await capture({ email: `multi-${input.email}` })
    await t.test("akun dengan beberapa bisnis tidak boleh diubah lewat formulir daftar", async () => {
      await reviewRegistration(db, multi.organizationId, "reject", admin)
      await db.organizationUser.create({ data: { userId: multi.userId, organizationId: approved.organizationId, role: "KASIR" } })
      await assert.rejects(capture({ email: `multi-${input.email}` }), fails(409))
    })
    await t.test("email serentak yang benar-benar baru tidak membuat dua akun", async () => {
      const fresh = `parallel-${input.email}`
      const results = await Promise.allSettled([capture({ email: fresh }), capture({ email: fresh })])
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1)
      assert.equal(await db.user.count({ where: { email: fresh } }), 1)
    })
    await t.test("migrasi membuka penolakan lama tanpa membuka suspensi manual", async () => {
      const legacy = await capture({ email: `legacy-${input.email}` })
      const blocked = await capture({ email: `blocked-${input.email}` })
      const used = await capture({ email: `used-${input.email}` })
      for (const id of [legacy.organizationId, blocked.organizationId, used.organizationId]) {
        await db.organization.update({ where: { id }, data: { status: "SUSPENDED", suspendedAt: null } })
      }
      await db.platformAuditLog.create({ data: { adminEmail: admin, action: "change_status", targetType: "organization", targetId: blocked.organizationId, after: { status: "SUSPENDED" } } })
      await db.location.create({ data: { organizationId: used.organizationId, name: "Outlet lama", type: "OUTLET" } })
      const migration = readFileSync(new URL("../prisma/migrations/20261128010100_registration_attempts/migration.sql", import.meta.url), "utf8")
      await db.$executeRawUnsafe(migration.slice(migration.indexOf('UPDATE "Organization"')))
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: legacy.organizationId } })).status, "REJECTED")
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: blocked.organizationId } })).status, "SUSPENDED")
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: used.organizationId } })).status, "SUSPENDED")
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: manual.organizationId } })).status, "SUSPENDED")
      assert.equal((await capture({ email: `legacy-${input.email}` })).registrationAttempts, 2)
    })
    const changed = await capture({ email: `changed-${input.email}` })
    await reviewRegistration(db, changed.organizationId, "reject", admin)
    const changedInput = { email: `changed-${input.email}`, password: "PasswordBaru123!", name: "Pemilik Baru", businessName: "Restoran Baru", phone: "089999999999", plan: "operasional" }
    const owner = await db.user.findUniqueOrThrow({ where: { id: changed.userId } })
    let linkToken = ""
    await t.test("password baru meminta verifikasi email dan tidak mengubah akun sebelum verifikasi", async () => {
      await assert.rejects(capture(changedInput), (error: unknown) => error instanceof RegistrationVerificationRequired && error.email === changedInput.email)
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: changed.userId } })).password, owner.password)
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: changed.organizationId } })).registrationAttempts, 1)
      const links = await Promise.all([issueRegistrationVerification(db, owner.id, owner.password), issueRegistrationVerification(db, owner.id, owner.password)])
      assert.equal(links.filter(Boolean).length, 1)
      const link = links.find(Boolean)
      assert.ok(link)
      linkToken = link.token
      const row = await db.verificationToken.findFirstOrThrow({ where: { identifier: link.identifier } })
      assert.notEqual(row.token, linkToken)
      assert.equal(row.token, registrationVerificationHash(linkToken))
      assert.equal(await issueRegistrationVerification(db, owner.id, owner.password), null)
    })
    await t.test("tautan salah, beda email, dan kedaluwarsa tidak memakan kesempatan daftar", async () => {
      await assert.rejects(capture({ ...changedInput, retryToken: "f".repeat(64) }), fails(400))
      await assert.rejects(capture({ ...changedInput, email: `unknown-${input.email}`, retryToken: linkToken }), fails(400))
      await db.verificationToken.updateMany({ where: { identifier: registrationVerificationIdentifier(owner.id, owner.password) }, data: { expires: new Date(Date.now() - 1) } })
      await assert.rejects(capture({ ...changedInput, retryToken: linkToken }), fails(400))
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: changed.organizationId } })).registrationAttempts, 1)
      const link = await issueRegistrationVerification(db, owner.id, owner.password)
      assert.ok(link)
      linkToken = link.token
    })
    await t.test("email terverifikasi mengizinkan semua data dan password baru tanpa menggandakan akun", async () => {
      const result = await capture({ ...changedInput, retryToken: linkToken })
      assert.equal(result.userId, changed.userId)
      assert.equal(result.organizationId, changed.organizationId)
      assert.equal(result.registrationAttempts, 2)
      const user = await db.user.findUniqueOrThrow({ where: { id: changed.userId } })
      const org = await db.organization.findUniqueOrThrow({ where: { id: changed.organizationId } })
      assert.equal(user.email, changedInput.email)
      assert.equal(user.name, changedInput.name)
      assert.ok(await bcrypt.compare(changedInput.password, user.password!))
      assert.equal(await bcrypt.compare(input.password, user.password!), false)
      assert.equal(org.name, changedInput.businessName)
      assert.equal(org.ownerPhone, changedInput.phone)
      assert.equal(org.plan, "PRO")
      assert.equal(org.status, "PENDING")
    })
    await t.test("tautan terpakai tidak dapat mengganti password lagi pada pengajuan berikutnya", async () => {
      await reviewRegistration(db, changed.organizationId, "reject", admin)
      await assert.rejects(capture({ ...changedInput, password: "LagiBerbeda123!", retryToken: linkToken }), fails(400))
      assert.equal((await db.organization.findUniqueOrThrow({ where: { id: changed.organizationId } })).registrationAttempts, 2)
      const user = await db.user.findUniqueOrThrow({ where: { id: changed.userId } })
      const challenge = await issueRegistrationVerification(db, user.id, user.password)
      assert.ok(challenge)
      await db.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash("ResetTerpisah123!", 4) } })
      await assert.rejects(capture({ ...changedInput, password: "LagiBerbeda123!", retryToken: challenge.token }), fails(400))
    })
    assert.ok(await bcrypt.compare(input.password, originalPassword!))
  } finally {
    await db.verificationToken.deleteMany({ where: { OR: userIds.map((id) => ({ identifier: { startsWith: `registration-retry:${id}:` } })) } })
    await db.platformAuditLog.deleteMany({ where: { targetId: { in: orgIds } } })
    await db.organization.deleteMany({ where: { id: { in: orgIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.$disconnect()
  }
})
