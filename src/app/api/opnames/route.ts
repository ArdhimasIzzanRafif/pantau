import { MovementType, type OpnameStatus, type Prisma } from "@prisma/client"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, isResponse, ok, err } from "@/lib/api-helpers"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"
import { getOpnameAccess } from "@/lib/opname-access"
import { addStock, consumeStock } from "@/lib/stock-ledger"
import { getOpnameTransactionHold, OpnameQuietPeriodError } from "@/lib/opname-lock"
import { OPNAME_SESSION_TTL_MS } from "@/lib/opname-session"
import { getHistoryScope } from "@/lib/history-scope"
import { memberJoinedAt } from "@/lib/membership"

const OPNAME_PERIOD_CONFLICT = "OPNAME_PERIOD_CONFLICT"
const OPNAME_ACTIVE = "OPNAME_ACTIVE"
const OPNAME_SESSION_INVALID = "OPNAME_SESSION_INVALID"
const OPNAME_LOCATION_UNAVAILABLE = "OPNAME_LOCATION_UNAVAILABLE"

/** Barang yang dihitung bergerak sejak sesi opname dimulai — wajib dihitung ulang. */
class OpnameStaleError extends Error {
  constructor(readonly itemIds: string[]) {
    super("OPNAME_STALE")
  }
}

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const opnameAccess = await getOpnameAccess(user)
  if (!opnameAccess) return err("Tidak memiliki izin melihat opname", 403)

  const { searchParams } = new URL(req.url)
  const locationId = searchParams.get("locationId")
  const from       = searchParams.get("from")
  const to         = searchParams.get("to")
  // Halaman Opname menyaring berdasarkan periode, bukan tanggal pembuatan baris.
  const periodFrom = searchParams.get("periodFrom")
  const periodTo   = searchParams.get("periodTo")
  const page       = Math.max(1, Number(searchParams.get("page") ?? 1))
  const take       = 30
  const historyScope = await getHistoryScope(user, searchParams.get("history") === "1", "LOCATION")
  if (!historyScope.allowed) return err("Tidak memiliki akses ke Riwayat", 403)
  const accessibleLocationIds = await getAccessibleLocationIds(user)
  const activeSince = new Date(Date.now() - OPNAME_SESSION_TTL_MS)
  const joinedAt = await memberJoinedAt(user)

  if (locationId && !(await canAccessLocation(user, locationId))) {
    return err("Tidak ada akses ke lokasi ini", 403)
  }

  const where: Prisma.StockOpnameWhereInput = {
      organizationId: user.organizationId,
      ...(historyScope.actorId && { createdById: historyScope.actorId }),
      // Anggota baru mulai dari nol: opname yang selesai sebelum dia bergabung
      // bukan urusannya. Yang belum selesai tetap terlihat supaya tidak ada
      // pekerjaan yang menggantung tanpa penerus.
      ...(joinedAt ? { AND: [{ OR: [
        { createdAt: { gte: joinedAt } },
        { status: { in: ["DRAFT", "SUBMITTED"] as OpnameStatus[] } },
      ] }] } : {}),
      ...(accessibleLocationIds && { locationId: { in: accessibleLocationIds } }),
      ...(locationId && { locationId }),
      OR: [
        { status: { not: "DRAFT" } },
        { status: "DRAFT", updatedAt: { gte: activeSince } },
      ],
      ...(from || to ? {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to + "T23:59:59.999Z") }),
        },
      } : {}),
      ...(periodFrom || periodTo ? {
        periodStart: {
          ...(periodFrom && { gte: new Date(periodFrom) }),
          ...(periodTo && { lte: new Date(periodTo + "T23:59:59.999Z") }),
        },
      } : {}),
  }

  const [total, opnames] = await Promise.all([
    prisma.stockOpname.count({ where }),
    prisma.stockOpname.findMany({
      where,
      include: {
        location: true,
        items: { include: { item: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
  ])
  return ok({ items: opnames, total, page, pages: Math.ceil(total / take) })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user

  const opnameAccess = await getOpnameAccess(user)
  if (opnameAccess !== "EDIT") return err("Tidak memiliki izin menyelesaikan opname", 403)

  const body = await req.json()
  const { locationId, periodStart, periodEnd, shift, items, submit, draftId } = body as {
    locationId?: string
    periodStart?: string
    periodEnd?: string
    shift?: string
    items?: Array<{ itemId?: string; physicalQty?: number | null; notes?: string }>
    submit?: boolean
    draftId?: string
  }

  if (!locationId || !items?.length || (!draftId && (!periodStart || !periodEnd))) {
    return err("Lokasi, periode, dan item wajib diisi")
  }

  if (!(await canAccessLocation(user, locationId))) return err("Tidak ada akses ke lokasi ini", 403)

  // Transaksi didahulukan: bila baru ada transaksi (<30 dtk) di outlet ini,
  // tahan penyimpanan opname sampai transaksi benar-benar terbukukan.
  if (submit) {
    const hold = await getOpnameTransactionHold(user.organizationId, locationId)
    if (hold.held) {
      return ok({ error: `Ada transaksi baru — tunggu ${hold.secondsRemaining} detik sebelum simpan opname`, secondsRemaining: hold.secondsRemaining }, 423)
    }
  }

  // Klien lama tanpa draft masih mengirim periode sendiri. Untuk sesi web yang
  // memiliki draftId, periode otoritatif dibaca dari draft buatan server di
  // dalam transaksi dan nilai periode dari klien diabaikan.
  const requestedPeriodStartDate = periodStart ? new Date(periodStart) : null
  const requestedPeriodEndDate = periodEnd ? new Date(periodEnd) : null
  if (!draftId) {
    if (
      !requestedPeriodStartDate
      || !requestedPeriodEndDate
      || !Number.isFinite(requestedPeriodStartDate.getTime())
      || !Number.isFinite(requestedPeriodEndDate.getTime())
    ) {
      return err("Format periode tidak valid")
    }
    if (requestedPeriodStartDate > requestedPeriodEndDate) return err("Awal periode harus sebelum akhir periode")
    if (requestedPeriodEndDate > new Date()) return err("Akhir periode tidak boleh melebihi waktu sekarang")
  }

  const normalizedItems = items.map((item) => ({
    itemId: String(item.itemId ?? ""),
    physicalQty: item.physicalQty == null ? null : Number(item.physicalQty),
    notes: item.notes?.trim() || undefined,
  }))
  if (normalizedItems.some((item) => !item.itemId || item.physicalQty == null || !Number.isFinite(item.physicalQty) || item.physicalQty < 0)) {
    return err("Item dan jumlah fisik opname tidak valid")
  }
  if (new Set(normalizedItems.map((item) => item.itemId)).size !== normalizedItems.length) {
    return err("Item opname tidak boleh duplikat")
  }

  // Item non-trackable (bumbu/garnish) tetap dihitung saat opname walau tidak
  // dipotong otomatis saat penjualan — jadi tidak difilter isTrackable di sini.
  const validItemCount = await prisma.inventoryItem.count({
    where: {
      organizationId: user.organizationId,
      id: { in: normalizedItems.map((item) => item.itemId) },
    },
  })
  if (validItemCount !== normalizedItems.length) return err("Ada item stok yang tidak valid")

  try {
    const opname = await prisma.$transaction(async (tx) => {
      // Kunci baris lokasi agar dua request opname di lokasi yang sama diproses
      // bergantian. Setelah menunggu, request berikutnya membaca hasil commit
      // terbaru sehingga tidak dapat membukukan koreksi dari saldo lama.
      const lockedLocations = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Location"
        WHERE "id" = ${locationId}
          AND "organizationId" = ${user.organizationId}
          AND "isActive" = true
        FOR UPDATE
      `
      if (lockedLocations.length === 0) throw new Error(OPNAME_LOCATION_UNAVAILABLE)

      // Ulangi pemeriksaan setelah kunci lokasi didapat. Pemeriksaan awal di
      // atas hanya fast-path; pemeriksaan ini yang menutup race dengan bayar POS.
      if (submit) {
        const hold = await getOpnameTransactionHold(user.organizationId, locationId, tx)
        if (hold.held) throw new OpnameQuietPeriodError("OPNAME_HOLD", hold.secondsRemaining)
      }

      const activeSince = new Date(Date.now() - OPNAME_SESSION_TTL_MS)
      const ownDraft = draftId
        ? await tx.stockOpname.findFirst({
            where: {
              id: draftId,
              organizationId: user.organizationId,
              locationId,
              createdById: user.id,
              status: "DRAFT",
              updatedAt: { gte: activeSince },
            },
            select: { id: true, periodStart: true, periodEnd: true },
          })
        : null
      if (draftId && !ownDraft) throw new Error(OPNAME_SESSION_INVALID)

      const activeOtherOpname = await tx.stockOpname.findFirst({
        where: {
          organizationId: user.organizationId,
          locationId,
          status: "DRAFT",
          updatedAt: { gte: activeSince },
          ...(draftId && { id: { not: draftId } }),
        },
        select: { id: true },
      })
      if (activeOtherOpname) throw new Error(OPNAME_ACTIVE)

      const periodStartDate = ownDraft?.periodStart ?? requestedPeriodStartDate
      // Sesi web: cutoff dicatat saat opname DISIMPAN, bukan saat dimulai, sehingga
      // opname berikutnya berangkat dari jam selesai. Angkanya tetap sama dengan
      // stok saat mulai karena penyimpanan ditolak bila barang yang dihitung
      // bergerak sejak sesi dimulai (lihat pemeriksaan di bawah).
      const savedAt = new Date()
      const sessionStartedAt = ownDraft?.periodEnd ?? null
      const periodEndDate = submit && ownDraft ? savedAt : (ownDraft?.periodEnd ?? requestedPeriodEndDate)
      if (!periodStartDate || !periodEndDate) throw new Error(OPNAME_SESSION_INVALID)

      // Dijalankan setelah kunci lokasi, jadi transaksi POS/gudang yang datang
      // bersamaan menunggu dan tidak dapat lolos di antara pemeriksaan dan simpan.
      // Filternya sama dengan /api/opnames/activity yang dipantau halaman.
      if (submit && sessionStartedAt) {
        const moved = await tx.stockMovement.findMany({
          where: {
            organizationId: user.organizationId,
            locationId,
            itemId: { in: normalizedItems.map((item) => item.itemId) },
            type: { notIn: ["OPNAME_CORRECTION", "INITIAL_STOCK"] },
            createdAt: { gt: sessionStartedAt },
          },
          select: { itemId: true },
          distinct: ["itemId"],
        })
        if (moved.length > 0) throw new OpnameStaleError(moved.map((row) => row.itemId))
      }

      // Tolak periode yang bertumpang tindih dengan opname yang telah dibukukan,
      // termasuk opname yang baru saja diselesaikan oleh request bersamaan.
      // Batas yang hanya bersentuhan diperbolehkan: periode baru dimulai tepat
      // pada cutoff sebelumnya, tetapi movement pada batas awal tidak dihitung
      // kembali sebagai bagian dari periode audit baru.
      const overlappingOpname = await tx.stockOpname.findFirst({
        where: {
          organizationId: user.organizationId,
          locationId,
          status: { in: ["SUBMITTED", "REVIEWED"] },
          periodStart: { lt: periodEndDate },
          periodEnd: { gt: periodStartDate },
        },
        select: { id: true },
      })
      if (overlappingOpname) throw new Error(OPNAME_PERIOD_CONFLICT)

      // Hitung systemQty point-in-time: sum semua movement s/d periodEnd.
      // Ini penting agar opname tanggal 14 tidak ikut ngitung transfer/barang masuk
      // yang baru terjadi tanggal 17, misalnya.
      const itemIds = normalizedItems.map((i) => i.itemId)

      const movements = await tx.stockMovement.groupBy({
        by: ["itemId"],
        where: {
          organizationId: user.organizationId,
          locationId,
          itemId: { in: itemIds },
          affectsBalance: true,
          effectiveAt: { lte: periodEndDate },
        },
        _sum: { quantity: true },
      })
      const systemQtyMap: Record<string, number> = {}
      for (const m of movements) {
        systemQtyMap[m.itemId] = Number(m._sum.quantity ?? 0)
      }

      // Ambil harga dan status pelacakan sekaligus. Semua item tetap boleh
      // dikoreksi saat opname, tetapi hanya item terlacak yang diklasifikasikan
      // sebagai selisih persediaan penelitian.
      const itemMetadata = await tx.inventoryItem.findMany({
        where: { id: { in: itemIds }, organizationId: user.organizationId },
        select: { id: true, costPrice: true, isTrackable: true },
      })
      const metadataMap = new Map(itemMetadata.map((item) => [item.id, item]))

      const opnameItems = normalizedItems.map((item) => {
        const sysQty = systemQtyMap[item.itemId] ?? 0
        const diff = item.physicalQty != null ? item.physicalQty - sysQty : null
        const metadata = metadataMap.get(item.itemId)
        const isTrackable = metadata?.isTrackable === true
        const unitCostSnapshot = metadata?.costPrice == null ? null : Number(metadata.costPrice)
        const varianceValue = isTrackable && diff != null && unitCostSnapshot != null
          ? Math.round(Math.abs(diff) * unitCostSnapshot * 100) / 100
          : null
        const estimatedLoss = isTrackable && diff != null && diff < 0 ? varianceValue : 0
        return {
          itemId: item.itemId,
          systemQty: sysQty,
          physicalQty: item.physicalQty,
          difference: diff,
          estimatedLoss,
          unitCostSnapshot: isTrackable ? unitCostSnapshot : null,
          absoluteVarianceValue: varianceValue,
          notes: item.notes ?? null,
        }
      })

      const completedAt = submit ? savedAt : null
      const opnameData = {
        periodStart: periodStartDate,
        periodEnd: periodEndDate,
        shift: shift ?? null,
        status: submit ? "REVIEWED" as const : "DRAFT" as const,
        submittedAt: completedAt,
        reviewedAt: completedAt,
        reviewedById: submit ? user.id : null,
        reviewNotes: submit ? "Selisih dibukukan otomatis saat opname disimpan" : null,
        items: { create: opnameItems },
      }
      const newOpname = draftId
        ? await tx.stockOpname.update({
            where: { id: draftId },
            data: opnameData,
            include: { items: { include: { item: true } }, location: true },
          })
        : await tx.stockOpname.create({
            data: {
              organizationId: user.organizationId,
              locationId,
              createdById: user.id,
              ...opnameData,
            },
            include: { items: { include: { item: true } }, location: true },
          })

    if (submit) {
      const kurang: Array<{ itemId: string; name: string; qty: number }> = []
      const lebih: Array<{ itemId: string; name: string; qty: number }> = []

      for (const row of newOpname.items) {
        const difference = Number(row.difference ?? 0)
        const movementInput = {
          organizationId: user.organizationId,
          itemId: row.itemId,
          locationId,
          type: MovementType.OPNAME_CORRECTION,
          note: "Penyesuaian hasil opname",
          referenceId: newOpname.id,
          createdById: user.id,
          effectiveAt: periodEndDate,
        }

        if (difference < 0) {
          await consumeStock(tx, {
            ...movementInput,
            quantity: Math.abs(difference),
            allowNegative: true,
          })
          if (row.item.isTrackable) {
            kurang.push({ itemId: row.itemId, name: row.item.name, qty: Math.abs(difference) })
          }
        } else if (difference > 0) {
          await addStock(tx, { ...movementInput, quantity: difference })
          // Untuk item terlacak, stok lebih pun tetap selisih yang perlu
          // ditelusuri. Item tidak terlacak hanya diselaraskan saldonya.
          if (row.item.isTrackable) {
            lebih.push({ itemId: row.itemId, name: row.item.name, qty: difference })
          }
        }
      }

      // Satu peringatan untuk seluruh opname, bukan satu per barang. Opname
      // sepuluh barang dulu menghasilkan sepuluh kartu terpisah yang menutupi
      // peringatan lain; rinciannya tetap bisa dibuka lewat referenceId.
      const selisih = [...kurang, ...lebih]
      if (selisih.length > 0) {
        const satuBarang = selisih.length === 1
        const rincian = [
          kurang.length > 0 ? `${kurang.length} barang kurang` : null,
          lebih.length > 0 ? `${lebih.length} barang lebih` : null,
        ].filter(Boolean).join(" dan ")

        await tx.alert.create({
          data: {
            organizationId: user.organizationId,
            type: kurang.length > 0 ? "STOCK_SHORTAGE" : "STOCK_SURPLUS",
            severity: "CRITICAL",
            title: satuBarang
              ? `Selisih opname: ${selisih[0].name}`
              : `Selisih opname: ${selisih.length} barang`,
            message: satuBarang
              ? `Stok fisik ${kurang.length > 0 ? "kurang" : "lebih"} ${selisih[0].qty} dari catatan sistem di ${newOpname.location.name}.`
              : `${rincian} dari catatan sistem di ${newOpname.location.name}.`,
            locationId,
            // Hanya diisi bila selisihnya satu barang; peringatan gabungan
            // tidak mewakili satu item tertentu.
            itemId: satuBarang ? selisih[0].itemId : null,
            referenceId: newOpname.id,
          },
        })
      }
    }

    // Setiap opname yang selesai dicatat sebagai info, terlepas ada selisih
    // atau tidak. Selisihnya sendiri sudah punya peringatan kritis sendiri.
    if (submit) {
      await tx.alert.create({
        data: {
          organizationId: user.organizationId,
          type: "OPNAME_COMPLETED",
          severity: "INFO",
          title: "Opname selesai",
          message: `Opname di ${newOpname.location.name} selesai dengan ${opnameItems.length} item dihitung.`,
          locationId,
          referenceId: newOpname.id,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: submit ? "COMPLETE_OPNAME" : "CREATE_OPNAME",
        entity: "StockOpname",
        entityId: newOpname.id,
        after: { status: submit ? "REVIEWED" : "DRAFT", automaticPosting: submit === true },
      },
    })

      return newOpname
    })

    return ok(opname, 201)
  } catch (error) {
    if (error instanceof OpnameStaleError) {
      return ok({
        error: "Ada transaksi baru pada barang yang dihitung sejak opname dimulai. Perbarui dan hitung ulang barang tersebut sebelum menyimpan.",
        changedItemIds: error.itemIds,
      }, 409)
    }
    if (error instanceof OpnameQuietPeriodError && error.kind === "OPNAME_HOLD") {
      return ok({
        error: `Ada transaksi baru — tunggu ${error.secondsRemaining} detik sebelum simpan opname`,
        secondsRemaining: error.secondsRemaining,
      }, 423)
    }
    if (error instanceof Error && error.message === OPNAME_ACTIVE) {
      return err("Opname sedang dilakukan di lokasi ini. Tunggu petugas pertama menyelesaikannya.", 409)
    }
    if (error instanceof Error && error.message === OPNAME_SESSION_INVALID) {
      return err("Sesi opname sudah berakhir. Mulai opname kembali.", 409)
    }
    if (error instanceof Error && error.message === OPNAME_PERIOD_CONFLICT) {
      return err("Sudah ada opname pada lokasi dengan periode yang bertumpang tindih. Muat ulang data sebelum melanjutkan.", 409)
    }
    if (error instanceof Error && error.message === OPNAME_LOCATION_UNAVAILABLE) {
      return err("Lokasi opname sudah tidak tersedia", 409)
    }
    throw error
  }
}
