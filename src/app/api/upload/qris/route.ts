import { NextRequest } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang bisa upload QRIS", 403)

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return err("File wajib diupload")

  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
  if (!allowedTypes.includes(file.type)) return err("Format file harus PNG, JPG, atau WEBP")
  if (file.size > 5 * 1024 * 1024) return err("Ukuran file maksimal 5MB")

  const ext = file.name.split(".").pop() ?? "png"
  const fileName = `qris-${user.organizationId}.${ext}`
  const dir = path.join(process.cwd(), "public", "uploads", "qris")
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, fileName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const url = `/uploads/qris/${fileName}`
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { qrisImageUrl: url },
  })

  return ok({ url })
}
