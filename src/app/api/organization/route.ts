import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function GET() {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const [org, dbUser] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true, qrisImageUrl: true, qrisPayload: true, midtransServerKey: true, midtransClientKey: true, midtransProduction: true, receiptLogoUrl: true, receiptWifiName: true, receiptWifiPassword: true, receiptFooterText: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
  ])
  if (!org) return err("Organisasi tidak ditemukan", 404)
  return ok({
    ...org,
    businessName: org.name,
    userName: dbUser?.name ?? null,
    midtransServerKey: undefined,
    hasMidtrans: !!org.midtransServerKey,
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

    // Any authenticated user can update their own display name
    // Mobile sends `name`, web sends `userName`
    const newUserName = typeof body.userName === "string" ? body.userName : typeof body.name === "string" ? body.name : undefined
    if (newUserName !== undefined && newUserName.trim()) {
      await prisma.user.update({ where: { id: user.id }, data: { name: newUserName.trim() } })
    }

    // Everything below is OWNER-only
    if (user.role !== "OWNER") return ok({ ok: true })

    const orgData: Record<string, unknown> = {}

    // Mobile sends `businessName`, web sends `businessName` too
    if (typeof body.businessName === "string" && body.businessName.trim()) orgData.name = body.businessName.trim()
    if ("qrisImageUrl" in body) orgData.qrisImageUrl = (body.qrisImageUrl as string | null) ?? null
    if ("qrisPayload" in body) orgData.qrisPayload = (body.qrisPayload as string | null) ?? null
    if ("midtransServerKey" in body) orgData.midtransServerKey = (body.midtransServerKey as string | null) || null
    if ("midtransClientKey" in body) orgData.midtransClientKey = (body.midtransClientKey as string | null) || null
    if (typeof body.midtransProduction === "boolean") orgData.midtransProduction = body.midtransProduction
    if ("receiptLogoUrl" in body) orgData.receiptLogoUrl = (body.receiptLogoUrl as string | null) ?? null
    if ("receiptWifiName" in body) orgData.receiptWifiName = (body.receiptWifiName as string | null) || null
    if ("receiptWifiPassword" in body) orgData.receiptWifiPassword = (body.receiptWifiPassword as string | null) || null
    if ("receiptFooterText" in body) orgData.receiptFooterText = (body.receiptFooterText as string | null) || null

    if (Object.keys(orgData).length > 0) {
      await prisma.organization.update({ where: { id: user.organizationId }, data: orgData })
    }

    return ok({ ok: true })
  } catch (e) {
    console.error("[PATCH /api/organization]", e)
    return err(`Server error: ${e instanceof Error ? e.message : String(e)}`, 500)
  }
}
