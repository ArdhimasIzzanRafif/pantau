import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const [org, dbUser] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, plan: true, qrisImageUrl: true, qrisPayload: true, receiptLogoUrl: true, receiptWifiName: true, receiptWifiPassword: true, receiptFooterText: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, image: true } }),
  ])
  if (!org) return err("Organisasi tidak ditemukan", 404)
  return ok({
    ...org,
    businessName: org.name,
    userName: dbUser?.name ?? null,
    userImage: dbUser?.image ?? null,
  })
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth()
    if (isResponse(user)) return user

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch (e) {
      return err(`Body parse gagal: ${e instanceof Error ? e.message : String(e)}`, 400)
    }

    let updatedUserImage: string | null | undefined

    // Any authenticated user can update their own display name
    // Mobile sends `name`, web sends `userName`
    const newUserName = typeof body.userName === "string" ? body.userName : typeof body.name === "string" ? body.name : undefined
    if (newUserName !== undefined && newUserName.trim()) {
      await prisma.user.update({ where: { id: user.id }, data: { name: newUserName.trim() } })
    }

    // Foto profil sendiri — semua user boleh ubah punya sendiri
    if ("image" in body) {
      if (body.image !== null && body.image !== "") {
        if (typeof body.image !== "string" || !/^\/api\/uploads\/profile\/[a-zA-Z0-9._-]+$/.test(body.image)) {
          return err("URL foto profil tidak valid")
        }
        updatedUserImage = body.image
      } else {
        updatedUserImage = null
      }
      await prisma.user.update({ where: { id: user.id }, data: { image: updatedUserImage } })
    }

    // Everything below is OWNER-only
    if (user.role !== "OWNER") return ok({ ok: true, userImage: updatedUserImage })

    const orgData: Record<string, unknown> = {}

    // Mobile sends `businessName`, web sends `businessName` too
    if (typeof body.businessName === "string" && body.businessName.trim()) orgData.name = body.businessName.trim()
    if ("receiptLogoUrl" in body) orgData.receiptLogoUrl = (body.receiptLogoUrl as string | null) ?? null
    if ("receiptWifiName" in body) orgData.receiptWifiName = (body.receiptWifiName as string | null) || null
    if ("receiptWifiPassword" in body) orgData.receiptWifiPassword = (body.receiptWifiPassword as string | null) || null
    if ("receiptFooterText" in body) orgData.receiptFooterText = (body.receiptFooterText as string | null) || null
    // Ganti paket langganan sendiri — hanya dua paket yang dijual: Kasir (STARTER) & Operasional (PRO)
    if ("plan" in body) {
      if (body.plan !== "STARTER" && body.plan !== "PRO") return err("Paket tidak valid")
      orgData.plan = body.plan
    }

    if (Object.keys(orgData).length > 0) {
      await prisma.organization.update({ where: { id: user.organizationId }, data: orgData })
    }

    return ok({ ok: true, userImage: updatedUserImage })
  } catch (e) {
    console.error("[PATCH /api/organization]", e)
    return err(`Server error: ${e instanceof Error ? e.message : String(e)}`, 500)
  }
}
