import type { NextAuthConfig } from "next-auth"

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
        token.organizationId = (user as unknown as Record<string, unknown>).organizationId
        token.role = (user as unknown as Record<string, unknown>).role
        token.businessName = (user as unknown as Record<string, unknown>).businessName
        token.orgStatus = (user as unknown as Record<string, unknown>).orgStatus
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
        ;(session.user as unknown as Record<string, unknown>).organizationId = token.organizationId
        ;(session.user as unknown as Record<string, unknown>).role = token.role
        ;(session.user as unknown as Record<string, unknown>).businessName = token.businessName
        ;(session.user as unknown as Record<string, unknown>).orgStatus = token.orgStatus
        ;(session.user as unknown as Record<string, unknown>).orgPlan = token.orgPlan
        ;(session.user as unknown as Record<string, unknown>).locationIds = token.locationIds
        ;(session.user as unknown as Record<string, unknown>).isSuperAdmin = token.isSuperAdmin
      }
      return session
    },
  },
  providers: [],
}
