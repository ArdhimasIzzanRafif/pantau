import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

function getSuperAdminEmail() {
  return (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase()
}

export async function requireAdmin() {
  const session = await auth()
  const email = (session?.user?.email ?? "").toLowerCase()
  if (!email || email !== getSuperAdminEmail()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return { email }
}
