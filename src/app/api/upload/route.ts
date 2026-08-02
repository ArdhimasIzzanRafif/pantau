import { NextRequest } from "next/server"
import { writeFile } from "fs/promises"
import path from "path"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return err("File wajib diupload")

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!allowedTypes.includes(file.type)) return err("Format file harus JPG, PNG, WebP, atau GIF")

  if (file.size > 2 * 1024 * 1024) return err("Ukuran file maksimal 2MB")

  const folder = (formData.get("folder") as string | null) ?? "menu"
  const allowedFolders = ["menu", "qris", "receipts"]
  const safeFolder = allowedFolders.includes(folder) ? folder : "menu"

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const filePath = path.join(process.cwd(), "public", "uploads", safeFolder, fileName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  return ok({ url: `/uploads/${safeFolder}/${fileName}` }, 201)
}
