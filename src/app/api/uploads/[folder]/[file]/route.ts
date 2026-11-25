import { readFile } from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"
import { isResponse, requireAuth } from "@/lib/api-helpers"

const PUBLIC_FOLDERS = new Set(["menu", "qris"])
const ALLOWED_FOLDERS = new Set(["menu", "qris", "receipts", "stock-adjustments", "profile", "purchase-docs"])
const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  // Hanya ada di folder purchase-docs (invoice supplier); tetap wajib login.
  pdf: "application/pdf",
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ folder: string; file: string }> },
) {
  const { folder, file } = await params
  if (!ALLOWED_FOLDERS.has(folder) || !/^[a-zA-Z0-9._-]+$/.test(file)) {
    return NextResponse.json({ error: "File tidak valid" }, { status: 400 })
  }

  if (!PUBLIC_FOLDERS.has(folder)) {
    const user = await requireAuth()
    if (isResponse(user)) return user
  }

  const extension = file.split(".").pop()?.toLowerCase() ?? ""
  const contentType = CONTENT_TYPES[extension]
  if (!contentType) return NextResponse.json({ error: "Format file tidak didukung" }, { status: 415 })

  try {
    const filePath = path.join(process.cwd(), "public", "uploads", folder, file)
    const contents = await readFile(filePath)
    return new NextResponse(contents, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 })
  }
}
