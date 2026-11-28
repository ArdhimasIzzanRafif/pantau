import { createHash, randomBytes } from "node:crypto"
import type { PrismaClient } from "@prisma/client"

export const REGISTRATION_VERIFICATION_TTL_MS = 20 * 60_000
const RESEND_COOLDOWN_MS = 60_000

export function registrationVerificationIdentifier(userId: string, password: string | null) {
  // A password reset invalidates links issued before that reset.
  const fingerprint = createHash("sha256").update(password ?? "").digest("hex").slice(0, 24)
  return `registration-retry:${userId}:${fingerprint}`
}

export function registrationVerificationHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

/** Store only a hash; the email link is a single-use, 256-bit ownership proof. */
export async function issueRegistrationVerification(db: PrismaClient, userId: string, password: string | null) {
  const identifier = registrationVerificationIdentifier(userId, password)
  const token = randomBytes(32).toString("hex")
  const now = Date.now()
  return db.$transaction(async (tx) => {
      // Serialize issuance even when there is no token row to lock yet.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`
      const recent = await tx.verificationToken.findFirst({ where: {
        identifier, expires: { gt: new Date(now + REGISTRATION_VERIFICATION_TTL_MS - RESEND_COOLDOWN_MS) },
      } })
      if (recent) return null
      await tx.verificationToken.deleteMany({ where: { identifier } })
      await tx.verificationToken.create({ data: {
        identifier, token: registrationVerificationHash(token), expires: new Date(now + REGISTRATION_VERIFICATION_TTL_MS),
      } })
      return { token, identifier }
  })
}
