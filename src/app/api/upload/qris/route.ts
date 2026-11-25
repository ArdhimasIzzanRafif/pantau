import { NextRequest } from "next/server"
import { mkdir, unlink } from "fs/promises"
import path from "path"
import sharp from "sharp"
import jsQR from "jsqr"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { validateQrisPayload } from "@/lib/qris"

const QRIS_DIRECTORY = path.join(process.cwd(), "public", "uploads", "qris")

async function decodeQr(buffer: Buffer) {
  const { data, info } = await sharp(buffer, { limitInputPixels: 25_000_000 })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return jsQR(
    new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    info.width,
    info.height,
    { inversionAttempts: "attemptBoth" },
  )?.data ?? null
}

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

  const buffer = Buffer.from(await file.arrayBuffer())
  let decodedPayload: string | null
  try {
    decodedPayload = await decodeQr(buffer)
  } catch {
    return err("File gambar rusak atau tidak dapat dibaca")
  }
  if (!decodedPayload) {
    return err("Kode QR tidak terdeteksi. Upload foto atau screenshot QRIS yang jelas")
  }

  const validation = validateQrisPayload(decodedPayload)
  if (!validation.valid) return err(validation.error)

  const safeOrganizationId = user.organizationId.replace(/[^a-zA-Z0-9_-]/g, "")
  const fileName = `qris-${safeOrganizationId}.webp`
  const filePath = path.join(QRIS_DIRECTORY, fileName)
  await mkdir(QRIS_DIRECTORY, { recursive: true })
  await sharp(buffer, { limitInputPixels: 25_000_000 })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(filePath)

  const url = `/uploads/qris/${fileName}`
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { qrisImageUrl: url, qrisPayload: validation.payload },
  })

  return ok({ url, verified: true })
}

export async function DELETE() {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (user.role !== "OWNER") return err("Hanya Owner yang bisa menghapus QRIS", 403)

  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { qrisImageUrl: true },
  })

  const localPrefix = "/uploads/qris/"
  if (organization?.qrisImageUrl?.startsWith(localPrefix)) {
    const fileName = path.basename(organization.qrisImageUrl)
    await unlink(path.join(QRIS_DIRECTORY, fileName)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    })
  }

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { qrisImageUrl: null, qrisPayload: null },
  })

  return ok({ message: "QRIS dihapus" })
}
