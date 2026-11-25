import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { businessPhotoFile, businessPhotoOwnerSelect } from "@/lib/public-business-photo"
import { hasOrganizationAccess } from "@/lib/organization-subscription"

// Hanya sajikan foto owner yang sedang dipakai oleh outlet publik ini.
// Folder foto profil pengguna lainnya tetap memerlukan login.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const location = await prisma.location.findUnique({
    where: { menuToken: token },
    select: { isActive: true, organization: { select: { status: true, trialEndsAt: true, users: businessPhotoOwnerSelect } } },
  })
  const file = location?.isActive && hasOrganizationAccess(location.organization)
    ? businessPhotoFile(location.organization.users[0]?.user.image) : null
  if (!file) return new NextResponse(null, { status: 404 })
  try {
    const contents = await readFile(path.join(process.cwd(), "public", "uploads", "profile", file))
    const extension = file.split(".").pop()
    return new NextResponse(contents, { headers: {
      "Content-Type": extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
