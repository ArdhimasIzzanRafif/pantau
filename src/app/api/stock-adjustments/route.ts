import { AdjustmentType, MovementType } from "@prisma/client"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { denyUnlessCanEdit } from "@/lib/feature-access"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"
import { consumeStock, StockError } from "@/lib/stock-ledger"
import { attachActors } from "@/lib/actors"
import { STOCK_ADJUSTMENT_NOTE_MAX_LENGTH } from "@/lib/stock-adjustment-validation"

const TYPES = new Set(Object.values(AdjustmentType))

// Tanggal dikirim sebagai YYYY-MM-DD dari sisi pengguna, dibaca sebagai
// waktu Jakarta supaya batas harinya tidak melenceng.
function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null
  const date = new Date(value.includes("T") ? value : `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`)
  return Number.isFinite(date.getTime()) ? date : null
}
const MOVEMENT_BY_TYPE: Record<AdjustmentType, MovementType> = {
  WASTE: MovementType.WASTE,
  DAMAGE: MovementType.DAMAGE,
  LOSS: MovementType.LOSS,
  COMPLIMENTARY: MovementType.COMPLIMENTARY,
  EXPIRED: MovementType.EXPIRED,
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const itemId = searchParams.get("itemId")
  const type = searchParams.get("type")
  const from = parseDate(searchParams.get("from"))
  const to = parseDate(searchParams.get("to"), true)
  if (from && to && from > to) return err("Tanggal awal harus sebelum tanggal akhir")
  const accessibleLocationIds = await getAccessibleLocationIds(user)
  if (locationId && !(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  const adjustments = await prisma.stockAdjustment.findMany({
    where: {
      organizationId: user.organizationId,
      ...(accessibleLocationIds && { locationId: { in: accessibleLocationIds } }),
      ...(locationId && { locationId }),
      ...(itemId && { itemId }),
      ...(type && TYPES.has(type as AdjustmentType) && { type: type as AdjustmentType }),
      ...(from || to ? {
        createdAt: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      } : {}),
    },
    include: {
      item: { select: { id: true, name: true, unit: true, isTrackable: true, isMenuItem: true } },
      location: { select: { id: true, name: true } },
      batch: { select: { id: true, batchNumber: true, expiryDate: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  })
  return ok(await attachActors(user.organizationId, adjustments))
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  // Kasir mencatat barang rusak langsung dari halaman POS. Role ini memang
  // tidak punya daftar fitur backoffice untuk diatur, jadi izinnya bersandar
  // pada penugasan outlet yang diperiksa di bawah — bukan fitur ADJUSTMENTS.
  if (user.role !== "KASIR") {
    const forbidden = await denyUnlessCanEdit(user, "ADJUSTMENTS")
    if (forbidden) return forbidden
  }

  const body = await req.json()
  const locationId = typeof body.locationId === "string" ? body.locationId : ""
  const itemId = typeof body.itemId === "string" ? body.itemId : ""
  const batchId = typeof body.batchId === "string" && body.batchId ? body.batchId : null
  const type = typeof body.type === "string" && TYPES.has(body.type as AdjustmentType)
    ? body.type as AdjustmentType
    : null
  const quantity = Number(body.quantity)
  const note = typeof body.note === "string" ? body.note.trim() : ""
  const evidenceUrl = typeof body.evidenceUrl === "string" ? body.evidenceUrl : null

  if (!locationId || !itemId || !type) return err("Lokasi, item, dan jenis kejadian wajib diisi")
  if (!Number.isFinite(quantity) || quantity <= 0) return err("Jumlah harus lebih dari 0")
  if (note.length < 3) return err("Keterangan wajib diisi minimal 3 karakter")
  if (typeof body.note === "string" && body.note.length > STOCK_ADJUSTMENT_NOTE_MAX_LENGTH) {
    return err(`Keterangan maksimal ${STOCK_ADJUSTMENT_NOTE_MAX_LENGTH} karakter`)
  }
  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, organizationId: user.organizationId },
    select: { id: true, name: true, costPrice: true, isTrackable: true },
  })
  if (!item) return err("Item tidak ditemukan", 404)
  // Item yang stoknya tidak dilacak tidak punya saldo maupun batch. Kejadiannya
  // tetap perlu tercatat — hanya tidak ada stok yang bisa dikurangi.
  if (batchId && !item.isTrackable) {
    return err("Item ini tidak dilacak stoknya, jadi tidak memiliki batch")
  }

  let batchCost: number | null = null
  if (batchId) {
    const batch = await prisma.stockBatch.findFirst({
      where: { id: batchId, organizationId: user.organizationId, itemId, locationId, quantity: { gt: 0 } },
      select: { costPrice: true },
    })
    if (!batch) return err("Batch tidak ditemukan atau stoknya sudah habis", 404)
    batchCost = batch.costPrice == null ? null : Number(batch.costPrice)
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const unitCost = batchCost ?? (item.costPrice == null ? null : Number(item.costPrice))
      const adjustment = await tx.stockAdjustment.create({
        data: {
          organizationId: user.organizationId,
          locationId,
          itemId,
          batchId,
          type,
          quantity,
          unitCost,
          totalCost: unitCost == null ? null : unitCost * quantity,
          note,
          evidenceUrl,
          createdById: user.id,
        },
      })

      if (item.isTrackable) {
        await consumeStock(tx, {
          organizationId: user.organizationId,
          itemId,
          locationId,
          batchId,
          type: MOVEMENT_BY_TYPE[type],
          quantity,
          note,
          referenceId: adjustment.id,
          createdById: user.id,
        })
      }
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "CREATE_STOCK_ADJUSTMENT",
          entity: "StockAdjustment",
          entityId: adjustment.id,
          after: { type, itemId, locationId, batchId, quantity, note, stockReduced: item.isTrackable },
        },
      })
      return tx.stockAdjustment.findUnique({
        where: { id: adjustment.id },
        include: { item: true, location: true, batch: true },
      })
    })
    const [withActor] = result ? await attachActors(user.organizationId, [result]) : [null]
    return ok(withActor, 201)
  } catch (error) {
    if (error instanceof StockError) return err(error.message, 409)
    console.error("Create stock adjustment failed:", error)
    return err("Gagal mencatat pengurangan stok", 500)
  }
}
