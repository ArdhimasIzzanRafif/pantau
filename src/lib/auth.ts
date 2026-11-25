import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"

const IDENTITY_REFRESH_SECONDS = 30

function assignIdentity(
  token: Record<string, unknown>,
  identity: {
    id: string
    email: string
    image: string | null
    organizationId: string | null
    role: string | null
    businessName: string | null
    orgStatus: string | null
    orgPlan: string | null
    locationIds: string[]
    isSuperAdmin: boolean
  },
) {
  token.id = identity.id
  token.email = identity.email
  token.picture = identity.image
  token.organizationId = identity.organizationId
  token.role = identity.role
  token.businessName = identity.businessName
  token.orgStatus = identity.orgStatus
  token.orgPlan = identity.orgPlan
  token.locationIds = identity.locationIds
  token.isSuperAdmin = identity.isSuperAdmin
  token.identityCheckedAt = Math.floor(Date.now() / 1000)
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            organizations: {
              include: {
                organization: true,
                assignedLocations: { select: { locationId: true } },
              },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        })

        if (!user?.password) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!valid) return null

        const orgUser = user.organizations[0]

        const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase()
        const isSuperAdmin = !!superAdminEmail && user.email.toLowerCase() === superAdminEmail

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          organizationId: orgUser?.organizationId ?? null,
          role: orgUser?.role ?? null,
          businessName: orgUser?.organization.name ?? null,
          orgStatus: orgUser?.organization.status ?? null,
          orgPlan: orgUser?.organization.plan ?? null,
          locationIds: orgUser?.assignedLocations.map((l) => l.locationId) ?? [],
          isSuperAdmin,
        }
      },
    }),
  ],
  callbacks: {
    /**
     * JWT menyimpan ID organisasi agar permintaan cepat, tetapi ID itu dapat
     * menjadi usang ketika database development dipulihkan atau di-seed ulang.
     * Cocokkan ulang lewat email secara berkala supaya data tidak tampak hilang
     * hanya karena browser masih membawa cookie dari database sebelumnya.
     */
    async jwt({ token, user, trigger }) {
      if (user) {
        assignIdentity(token, {
          id: user.id as string,
          email: user.email ?? "",
          image: user.image ?? null,
          organizationId: (user as unknown as Record<string, unknown>).organizationId as string | null,
          role: (user as unknown as Record<string, unknown>).role as string | null,
          businessName: (user as unknown as Record<string, unknown>).businessName as string | null,
          orgStatus: (user as unknown as Record<string, unknown>).orgStatus as string | null,
          orgPlan: (user as unknown as Record<string, unknown>).orgPlan as string | null,
          locationIds: ((user as unknown as Record<string, unknown>).locationIds as string[] | undefined) ?? [],
          isSuperAdmin: Boolean((user as unknown as Record<string, unknown>).isSuperAdmin),
        })
      }

      const checkedAt = Number(token.identityCheckedAt ?? 0)
      const now = Math.floor(Date.now() / 1000)
      const email = typeof token.email === "string" ? token.email : ""
      if (email && (trigger === "update" || !checkedAt || now - checkedAt >= IDENTITY_REFRESH_SECONDS)) {
        const currentUser = await prisma.user.findUnique({
          where: { email },
          include: {
            organizations: {
              include: {
                organization: true,
                assignedLocations: { select: { locationId: true } },
              },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        })

        if (currentUser) {
          const membership = currentUser.organizations[0]
          const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase()
          assignIdentity(token, {
            id: currentUser.id,
            email: currentUser.email,
            image: currentUser.image,
            organizationId: membership?.organizationId ?? null,
            role: membership?.role ?? null,
            businessName: membership?.organization.name ?? null,
            orgStatus: membership?.organization.status ?? null,
            orgPlan: membership?.organization.plan ?? null,
            locationIds: membership?.assignedLocations.map((location) => location.locationId) ?? [],
            isSuperAdmin: !!superAdminEmail && currentUser.email.toLowerCase() === superAdminEmail,
          })
        }
      }

      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      if (token.email) session.user.email = token.email as string
      session.user.image = typeof token.picture === "string" ? token.picture : null
      ;(session.user as unknown as Record<string, unknown>).organizationId = token.organizationId
      ;(session.user as unknown as Record<string, unknown>).role = token.role
      ;(session.user as unknown as Record<string, unknown>).businessName = token.businessName
      ;(session.user as unknown as Record<string, unknown>).orgStatus = token.orgStatus
      ;(session.user as unknown as Record<string, unknown>).orgPlan = token.orgPlan
      ;(session.user as unknown as Record<string, unknown>).locationIds = token.locationIds
      ;(session.user as unknown as Record<string, unknown>).isSuperAdmin = token.isSuperAdmin
      return session
    },
  },
})
