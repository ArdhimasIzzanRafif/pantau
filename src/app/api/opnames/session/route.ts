import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"
import { getOpnameAccess } from "@/lib/opname-access"
import { OPNAME_SESSION_TTL_MS, releaseOpnameDraft } from "@/lib/opname-session"

class ActiveOpnameError extends Error {
  constructor(readonly operatorName: string | null) {
    super("ACTIVE_OPNAME")
  }
}

async function requireOpnameEditor() {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const opnameAccess = await getOpnameAccess(user)
  if (opnameAccess !== "EDIT") return err("Tidak memiliki izin melakukan opname", 403)
  return user
}

export async function GET() {
  const user = await requireOpnameEditor()
  if (isResponse(user)) return user

  const accessibleLocationIds = await getAccessibleLocationIds(user)
  const activeDrafts = await prisma.stockOpname.findMany({
    where: {
      organizationId: user.organizationId,
      locationId: accessibleLocationIds === null ? undefined : { in: accessibleLocationIds },
      status: "DRAFT",
      updatedAt: { gte: new Date(Date.now() - OPNAME_SESSION_TTL_MS) },
    },
    select: { locationId: true, createdById: true, updatedAt: true },
  })
  const operatorIds = [...new Set(activeDrafts.map((draft) => draft.createdById).filter((id): id is string => !!id))]
  const operators = await prisma.user.findMany({
    where: { id: { in: operatorIds } },
    select: { id: true, name: true },
  })
  const operatorNames = new Map(operators.map((operator) => [operator.id, operator.name]))

  return ok(activeDrafts.map((draft) => ({
    locationId: draft.locationId,
    operatorName: draft.createdById ? operatorNames.get(draft.createdById) ?? null : null,
    expiresAt: new Date(draft.updatedAt.getTime() + OPNAME_SESSION_TTL_MS),
  })))
}

export async function POST(req: NextRequest) {
  const user = await requireOpnameEditor()
  if (isResponse(user)) return user

  const { locationId } = await req.json() as { locationId?: string }
  if (!locationId) return err("Lokasi wajib dipilih")
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  try {
    const draft = await prisma.$transaction(async (tx) => {
      const lockedLocations = await tx.$queryRaw<Array<{ id: string; createdAt: Date }>>`
        SELECT "id", "createdAt"
        FROM "Location"
        WHERE "id" = ${locationId}
          AND "organizationId" = ${user.organizationId}
          AND "isActive" = true
        FOR UPDATE
      `
      if (lockedLocations.length === 0) throw new Error("LOCATION_UNAVAILABLE")

      // Cutoff ditentukan oleh server setelah kunci lokasi berhasil didapat.
      // Dengan begitu dua transaksi yang datang hampir bersamaan tetap memiliki
      // urutan pembukuan yang tegas dan waktu dari perangkat tidak dipercaya.
      const cutoffAt = new Date()
      const staleBefore = new Date(cutoffAt.getTime() - OPNAME_SESSION_TTL_MS)

      // Sesi yang kehilangan heartbeat dianggap ditinggalkan dan boleh diganti.
      await tx.stockOpname.deleteMany({
        where: {
          organizationId: user.organizationId,
          locationId,
          status: "DRAFT",
          updatedAt: { lt: staleBefore },
          items: { none: {} },
        },
      })

      const activeDraft = await tx.stockOpname.findFirst({
        where: {
          organizationId: user.organizationId,
          locationId,
          status: "DRAFT",
          updatedAt: { gte: staleBefore },
        },
        select: { createdById: true },
      })
      if (activeDraft) {
        const operator = activeDraft.createdById
          ? await tx.user.findUnique({ where: { id: activeDraft.createdById }, select: { name: true } })
          : null
        throw new ActiveOpnameError(operator?.name ?? null)
      }

      const previousOpname = await tx.stockOpname.findFirst({
        where: {
          organizationId: user.organizationId,
          locationId,
          status: { in: ["SUBMITTED", "REVIEWED"] },
        },
        orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
        select: { periodEnd: true },
      })

      // Opname pertama dimulai sejak lokasi dibuat. Setelah itu awal periode
      // selalu persis cutoff opname terakhir; query periode menggunakan batas
      // awal eksklusif agar tidak ada movement yang dihitung dua kali.
      const periodStart = previousOpname?.periodEnd ?? lockedLocations[0].createdAt

      return tx.stockOpname.create({
        data: {
          organizationId: user.organizationId,
          locationId,
          periodStart,
          periodEnd: cutoffAt,
          status: "DRAFT",
          createdById: user.id,
        },
        select: {
          id: true,
          locationId: true,
          periodStart: true,
          periodEnd: true,
          updatedAt: true,
        },
      })
    })

    return ok({
      ...draft,
      expiresAt: new Date(draft.updatedAt.getTime() + OPNAME_SESSION_TTL_MS),
    }, 201)
  } catch (error) {
    if (error instanceof ActiveOpnameError) {
      const operator = error.operatorName ? ` oleh ${error.operatorName}` : ""
      return err(`Opname sedang dilakukan${operator} di lokasi ini. Jika tab petugas sudah ditutup, coba lagi dalam dua menit.`, 409)
    }
    if (error instanceof Error && error.message === "LOCATION_UNAVAILABLE") {
      return err("Lokasi opname sudah tidak tersedia", 409)
    }
    throw error
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireOpnameEditor()
  if (isResponse(user)) return user

  const { draftId } = await req.json() as { draftId?: string }
  if (!draftId) return err("Sesi opname tidak valid")

  const heartbeatAt = new Date()
  const staleBefore = new Date(heartbeatAt.getTime() - OPNAME_SESSION_TTL_MS)
  const session = await prisma.stockOpname.findFirst({
    where: {
      id: draftId,
      organizationId: user.organizationId,
      createdById: user.id,
      status: "DRAFT",
      updatedAt: { gte: staleBefore },
    },
    select: { periodEnd: true },
  })
  if (!session) return err("Sesi opname sudah berakhir", 409)

  const updated = await prisma.stockOpname.updateMany({
    where: {
      id: draftId,
      organizationId: user.organizationId,
      createdById: user.id,
      status: "DRAFT",
      updatedAt: { gte: staleBefore },
    },
    // Tulis ulang cutoff yang sama hanya untuk memicu updatedAt. Heartbeat tidak
    // boleh menggeser cutoff stok yang sudah ditetapkan ketika sesi dimulai.
    data: { periodEnd: session.periodEnd },
  })
  if (updated.count === 0) return err("Sesi opname sudah berakhir", 409)

  return ok({ expiresAt: new Date(heartbeatAt.getTime() + OPNAME_SESSION_TTL_MS) })
}

export async function DELETE(req: NextRequest) {
  const user = await requireOpnameEditor()
  if (isResponse(user)) return user

  const { draftId } = await req.json() as { draftId?: string }
  if (!draftId) return err("Sesi opname tidak valid")

  return ok({ released: await releaseOpnameDraft(user, draftId) })
}
