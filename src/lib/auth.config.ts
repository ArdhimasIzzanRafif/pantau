import type { NextAuthConfig } from "next-auth"
import { effectiveOrganizationStatus } from "./organization-subscription"

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.picture = user.image
        token.organizationId = (user as unknown as Record<string, unknown>).organizationId
        token.role = (user as unknown as Record<string, unknown>).role
        token.businessName = (user as unknown as Record<string, unknown>).businessName
        token.orgStatus = (user as unknown as Record<string, unknown>).orgStatus
        token.orgExpiresAt = (user as unknown as Record<string, unknown>).orgExpiresAt
        token.orgPlan = (user as unknown as Record<string, unknown>).orgPlan
        token.locationIds = (user as unknown as Record<string, unknown>).locationIds
        token.isSuperAdmin = (user as unknown as Record<string, unknown>).isSuperAdmin
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        if (token.email) session.user.email = token.email as string
        session.user.image = typeof token.picture === "string" ? token.picture : null
        ;(session.user as unknown as Record<string, unknown>).organizationId = token.organizationId
        ;(session.user as unknown as Record<string, unknown>).role = token.role
        ;(session.user as unknown as Record<string, unknown>).businessName = token.businessName
        ;(session.user as unknown as Record<string, unknown>).orgStatus = effectiveOrganizationStatus({
          status: typeof token.orgStatus === "string" ? token.orgStatus : null,
          trialEndsAt: typeof token.orgExpiresAt === "string" ? token.orgExpiresAt : null,
        })
        ;(session.user as unknown as Record<string, unknown>).orgExpiresAt = token.orgExpiresAt
        ;(session.user as unknown as Record<string, unknown>).orgPlan = token.orgPlan
        ;(session.user as unknown as Record<string, unknown>).locationIds = token.locationIds
        ;(session.user as unknown as Record<string, unknown>).isSuperAdmin = token.isSuperAdmin
      }
      return session
    },
  },
  providers: [],
}
