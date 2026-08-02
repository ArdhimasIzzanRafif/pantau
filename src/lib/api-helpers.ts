import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export type SessionUser = {
  id: string
  email: string
  name?: string | null
  organizationId: string
  role: string
  businessName?: string | null
}

export async function requireAuth(): Promise<SessionUser | NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const user = session.user as any
  if (!user.organizationId) {
    return NextResponse.json({ error: "Tidak ada organisasi" }, { status: 403 })
  }
  return user as SessionUser
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
