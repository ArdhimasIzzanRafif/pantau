import type { Prisma } from "@prisma/client"

export class GuestSessionError extends Error {}

export async function resolveGuestOrderIdentity(
  tx: Prisma.TransactionClient,
  locationId: string,
  sessionId: string,
  customerName: string,
  tableNumber: string,
) {
  // Serialize first orders from two tabs so one session cannot acquire two names.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`guest-order:${locationId}:${sessionId}`}, 0))::text`
  const orders = await tx.pOSOrder.findMany({
    where: { locationId, guestSessionId: sessionId },
    select: { customerName: true, tableNumber: true, status: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  if (!orders.length) return { customerName, tableNumber }
  if (orders.every(order => order.status === "PAID" || order.status === "VOID")) {
    throw new GuestSessionError("Tagihan ini sudah selesai. Mulai pesanan baru untuk memesan lagi.")
  }
  const first = orders[0]
  if (first.tableNumber && first.tableNumber !== tableNumber) {
    throw new GuestSessionError("Sesi pesanan ini memakai meja lain. Mulai pesanan baru untuk pelanggan berikutnya.")
  }
  return { customerName: first.customerName || customerName, tableNumber: first.tableNumber || tableNumber }
}
