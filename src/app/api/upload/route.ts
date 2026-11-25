import { NextRequest } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import crypto from "crypto"
import path from "path"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return err("File wajib diupload")

  const folder = (formData.get("folder") as string | null) ?? "menu"
  const allowedFolders = ["menu", "qris", "receipts", "stock-adjustments", "profile", "purchase-docs"]
  const safeFolder = allowedFolders.includes(folder) ? folder : "menu"
  // Dokumen pesanan supplier (invoice) boleh PDF dan sedikit lebih besar.
  const dokumenPesanan = safeFolder === "purchase-docs"

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", ...(dokumenPesanan ? ["application/pdf"] : [])]
  if (!allowedTypes.includes(file.type)) return err(dokumenPesanan ? "Format file harus JPG, PNG, WebP, atau PDF" : "Format file harus JPG, PNG, WebP, atau GIF")

  if (file.size > (dokumenPesanan ? 5 : 2) * 1024 * 1024) return err(`Ukuran file maksimal ${dokumenPesanan ? 5 : 2}MB`)

  const extByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
  }
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extByMime[file.type]}`
  const targetDirectory = path.join(process.cwd(), "public", "uploads", safeFolder)
  const filePath = path.join(targetDirectory, fileName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await mkdir(targetDirectory, { recursive: true })
  await writeFile(filePath, buffer)

  return ok({ url: `/api/uploads/${safeFolder}/${fileName}` }, 201)
}
