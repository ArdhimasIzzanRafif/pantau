import { createHash } from "node:crypto"

// Gunakan foto owner pertama secara konsisten, bukan foto pegawai yang sedang login.
export const businessPhotoOwnerSelect = {
  where: { role: "OWNER" as const },
  orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  take: 1,
  select: { user: { select: { image: true } } },
}

export function businessPhotoFile(image: string | null | undefined) {
  return image?.match(/^\/api\/uploads\/profile\/([a-zA-Z0-9_-][a-zA-Z0-9._-]*\.(?:jpe?g|png|webp))$/)?.[1] ?? null
}

export function publicBusinessPhotoUrl(token: string, image: string | null | undefined) {
  if (!businessPhotoFile(image)) return null
  const version = createHash("sha256").update(image!).digest("hex").slice(0, 16)
  return `/api/public/${encodeURIComponent(token)}/logo?v=${version}`
}
