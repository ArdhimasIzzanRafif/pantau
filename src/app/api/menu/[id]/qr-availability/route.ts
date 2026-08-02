import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

// Kasir-accessible endpoint — only toggles isAvailableForQr, nothing else
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { id } = await params
  const { isAvailableForQr } = await req.json()
  if (typeof isAvailableForQr !== "boolean") return err("isAvailableForQr harus boolean")

  const item = await prisma.inventoryItem.findFirst({
    where: { id, organizationId: user.organizationId, isMenuItem: true },
  })
  if (!item) return err("Menu tidak ditemukan", 404)

  const updated = await prisma.inventoryItem.update({
    where: { id },
    data: { isAvailableForQr },
    select: { id: true, isAvailableForQr: true },
  })
  return ok(updated)
}
