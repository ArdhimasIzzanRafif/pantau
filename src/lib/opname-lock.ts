import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

// Masa tenang (quiet period) untuk menyerialkan opname dan transaksi agar tidak
// bentrok di satu outlet. Selama window ini, transaksi POS diblokir sesaat
// setelah opname disimpan, dan sebaliknya opname ditahan bila baru ada transaksi.
export const OPNAME_QUIET_MS = 30_000

type LockState = { locked: boolean; secondsRemaining: number }
type HoldState = { held: boolean; secondsRemaining: number }
type LockQueryClient = Pick<Prisma.TransactionClient, "stockOpname" | "stockMovement">

function remainingSeconds(sinceMs: number) {
  return Math.ceil((OPNAME_QUIET_MS - (Date.now() - sinceMs)) / 1000)
}

// POS: transaksi ditahan selama masa tenang setelah opname baru saja disimpan
// di outlet ini (memberi waktu koreksi stok benar-benar terbukukan).
export async function getPosCooldown(
  organizationId: string,
  locationId: string,
  db: LockQueryClient = prisma,
): Promise<LockState> {
  const recent = await db.stockOpname.findFirst({
    where: {
      organizationId,
      locationId,
      status: { in: ["SUBMITTED", "REVIEWED"] },
      submittedAt: { gte: new Date(Date.now() - OPNAME_QUIET_MS) },
    },
    orderBy: { submittedAt: "desc" },
    select: { submittedAt: true },
  })
  if (!recent?.submittedAt) return { locked: false, secondsRemaining: 0 }
  const secondsRemaining = remainingSeconds(recent.submittedAt.getTime())
  return secondsRemaining > 0
    ? { locked: true, secondsRemaining }
    : { locked: false, secondsRemaining: 0 }
}

// Opname: penyimpanan ditahan bila baru ada transaksi (mis. penjualan POS,
// barang masuk, transfer) < 30 detik lalu di outlet ini — transaksi didahulukan.
export async function getOpnameTransactionHold(
  organizationId: string,
  locationId: string,
  db: LockQueryClient = prisma,
): Promise<HoldState> {
  const lastTx = await db.stockMovement.findFirst({
    where: {
      organizationId,
      locationId,
      type: { notIn: ["OPNAME_CORRECTION", "INITIAL_STOCK"] },
      createdAt: { gte: new Date(Date.now() - OPNAME_QUIET_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })
  if (!lastTx?.createdAt) return { held: false, secondsRemaining: 0 }
  const secondsRemaining = remainingSeconds(lastTx.createdAt.getTime())
  return secondsRemaining > 0
    ? { held: true, secondsRemaining }
    : { held: false, secondsRemaining: 0 }
}

// Semua finalisasi yang mengubah stok di POS dan opname memakai kunci baris
// lokasi yang sama. Pengecekan quiet period kemudian dilakukan DI DALAM
// transaksi tersebut, sehingga dua request yang datang hampir bersamaan tidak
// dapat sama-sama lolos berdasarkan data lama.
export async function lockStockFlowLocation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  locationId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Location"
    WHERE "id" = ${locationId}
      AND "organizationId" = ${organizationId}
    FOR UPDATE
  `
  return rows.length > 0
}

export class OpnameQuietPeriodError extends Error {
  constructor(
    readonly kind: "POS_COOLDOWN" | "OPNAME_HOLD",
    readonly secondsRemaining: number,
  ) {
    super(kind)
    this.name = "OpnameQuietPeriodError"
  }
}
