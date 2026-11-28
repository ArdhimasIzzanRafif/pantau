import bcrypt from "bcryptjs"
import { Prisma, type PrismaClient } from "@prisma/client"
import { registrationVerificationHash, registrationVerificationIdentifier } from "./registration-verification"

export const MAX_REGISTRATION_ATTEMPTS = 3

export class RegistrationError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export class RegistrationVerificationRequired extends RegistrationError {
  constructor(public userId: string, public email: string, public passwordHash: string | null) {
    super("Verifikasi email diperlukan untuk menggunakan password baru.", 202)
  }
}

export type RegistrationInput = {
  name: string; email: string; phone?: string; password: string
  businessName: string; plan?: string; retryToken?: string
}

export function rejectedRegistrationStatus(attempts: number) {
  return attempts >= MAX_REGISTRATION_ATTEMPTS ? "SUSPENDED" as const : "REJECTED" as const
}

/** Reuse the rejected signup. New passwords require proof of email ownership. */
export async function submitRegistration(db: PrismaClient, input: RegistrationInput) {
  const email = input.email.trim().toLowerCase()
  const existing = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })
  if (input.retryToken && !existing) throw new RegistrationError("Email tidak sesuai dengan tautan verifikasi.", 400)
  const passwordMatches = !!existing?.password && await bcrypt.compare(input.password, existing.password)
  const hashed = existing ? null : await bcrypt.hash(input.password, 12)
  const plan = input.plan === "operasional" ? "PRO" as const : "STARTER" as const

  return db.$transaction(async (tx) => {
    if (existing) {
      const owner = await tx.user.findUnique({
        where: { id: existing.id },
        include: { organizations: { include: { organization: true } } },
      })
      // A member of an existing/multiple business must use login, not signup.
      const membership = owner?.organizations.length === 1 ? owner.organizations[0] : null
      if (!owner || !membership || membership.role !== "OWNER" || owner?.password !== existing.password) {
        throw new RegistrationError("Email sudah terdaftar. Silakan masuk ke akun Anda.")
      }
      const org = membership.organization
      if (org.status === "SUSPENDED") {
        throw new RegistrationError(org.registrationAttempts >= MAX_REGISTRATION_ATTEMPTS
          ? "Pengajuan Anda sudah ditolak 3 kali. Akun ditangguhkan; hubungi admin untuk diaktifkan kembali."
          : "Akun ditangguhkan oleh admin. Hubungi admin untuk diaktifkan kembali.", 403)
      }
      if (org.status !== "REJECTED") {
        throw new RegistrationError(org.status === "PENDING"
          ? "Pengajuan Anda masih menunggu persetujuan admin. Silakan masuk untuk melihat statusnya."
          : "Email sudah terdaftar. Silakan masuk ke akun Anda.")
      }
      if (org.registrationAttempts >= MAX_REGISTRATION_ATTEMPTS) {
        throw new RegistrationError("Batas 3 kali pengajuan sudah tercapai. Hubungi admin untuk diaktifkan kembali.", 403)
      }
      let newPassword: string | undefined
      if (!passwordMatches) {
        if (!input.retryToken) throw new RegistrationVerificationRequired(owner.id, owner.email, owner.password)
        if (!/^[a-f0-9]{64}$/.test(input.retryToken)) {
          throw new RegistrationError("Tautan verifikasi tidak valid. Minta tautan baru melalui formulir Daftar.", 400)
        }
        const consumed = await tx.verificationToken.deleteMany({ where: {
          identifier: registrationVerificationIdentifier(owner.id, owner.password),
          token: registrationVerificationHash(input.retryToken), expires: { gt: new Date() },
        } })
        if (consumed.count !== 1) throw new RegistrationError("Tautan verifikasi kedaluwarsa atau sudah digunakan. Minta tautan baru melalui formulir Daftar.", 400)
        newPassword = await bcrypt.hash(input.password, 12)
      }
      // Conditional write prevents parallel submissions consuming two attempts.
      const updated = await tx.organization.updateMany({
        where: { id: org.id, status: "REJECTED", registrationAttempts: org.registrationAttempts },
        data: { name: input.businessName.trim(), ownerPhone: input.phone?.trim() || null, plan,
          status: "PENDING", registrationAttempts: { increment: 1 }, suspendedAt: null },
      })
      if (updated.count !== 1) throw new RegistrationError("Status pengajuan sudah berubah. Muat ulang dan coba lagi.")
      await tx.user.update({ where: { id: owner.id }, data: { name: input.name.trim(), ...(newPassword ? { password: newPassword } : {}) } })
      return { userId: owner.id, organizationId: org.id, email: owner.email, registrationAttempts: org.registrationAttempts + 1, resubmitted: true }
    }

    const user = await tx.user.create({ data: { name: input.name.trim(), email, password: hashed } })
    const slug = input.businessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      + "-" + user.id
    const org = await tx.organization.create({ data: {
      name: input.businessName.trim(), slug, ownerPhone: input.phone?.trim() || null,
      status: "PENDING", plan, registrationAttempts: 1,
      users: { create: { userId: user.id, role: "OWNER" } },
    } })
    return { userId: user.id, organizationId: org.id, email: user.email, registrationAttempts: 1, resubmitted: false }
  })
}

export async function reviewRegistration(db: PrismaClient, id: string, action: "approve" | "reject", adminEmail: string) {
  return db.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({ where: { id }, include: {
      users: { where: { role: "OWNER" }, take: 1, select: { user: { select: { name: true, email: true } } } },
    } })
    if (!org) throw new RegistrationError("Pengajuan tidak ditemukan", 404)
    if (org.status !== "PENDING") throw new RegistrationError("Pengajuan ini sudah diproses. Muat ulang daftar permintaan.")
    const now = new Date()
    const status = action === "approve" ? "ACTIVE" : rejectedRegistrationStatus(org.registrationAttempts)
    const trialEndsAt = action === "approve" ? new Date(now.getTime() + 30 * 86400000) : org.trialEndsAt
    const updated = await tx.organization.updateMany({
      where: { id, status: "PENDING", registrationAttempts: org.registrationAttempts },
      data: { status, trialEndsAt, suspendedAt: status === "SUSPENDED" ? now : null },
    })
    if (updated.count !== 1) throw new RegistrationError("Pengajuan ini sudah diproses. Muat ulang daftar permintaan.")
    await tx.platformAuditLog.create({ data: {
      adminEmail, action: `${action}_registration`, targetType: "organization", targetId: id,
      before: { status: org.status, registrationAttempts: org.registrationAttempts },
      after: { status, registrationAttempts: org.registrationAttempts },
    } })
    return { name: org.name, owner: org.users[0]?.user, status, trialEndsAt, registrationAttempts: org.registrationAttempts }
  })
}

export function registrationErrorResponse(error: unknown) {
  if (error instanceof RegistrationError) return { error: error.message, status: error.status }
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
    return { error: "Data pendaftaran sudah berubah. Silakan masuk atau muat ulang sebelum mencoba lagi.", status: 409 }
  }
  return null
}
