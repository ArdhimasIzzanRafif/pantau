import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"

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
})
