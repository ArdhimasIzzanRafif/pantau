import type { AlertType } from "@prisma/client"

// Ditulis sebagai string, bukan AlertType.X. Nilainya tetap diperiksa
// TypeScript terhadap enum Prisma, tetapi tidak ikut membaca objek enum saat
// berjalan — jadi client Prisma yang belum ikut ter-generate tidak bisa
// menyelipkan `undefined` ke dalam query.
export const SUPERVISOR_ALERT_TYPES: AlertType[] = [
  "LOW_STOCK",
  "GOODS_RECEIVED",
  "TRANSFER_REJECTED",
  "TRANSFER_SENT",
  "TRANSFER_COMPLETED",
  "OPNAME_COMPLETED",
  // Dipakai untuk selisih opname maupun selisih penerimaan transfer.
  "STOCK_SHORTAGE",
  "STOCK_SURPLUS",
]

/**
 * Memastikan notifikasi mengikuti penugasan lokasi terbaru. `null` berarti
 * Owner dan boleh melihat semua lokasi. Alert tanpa locationId (mis. transfer)
 * memakai lokasi dokumen referensinya; alert organisasi tanpa referensi tetap
 * boleh terlihat.
 */
export function isAlertLocationVisible(
  alert: { locationId: string | null; referenceId: string | null },
  accessibleLocationIds: Set<string> | null,
  referenceLocationIds: Map<string, readonly string[]>,
) {
  if (accessibleLocationIds === null) return true
  if (alert.locationId) return accessibleLocationIds.has(alert.locationId)
  if (!alert.referenceId) return true

  const locations = referenceLocationIds.get(alert.referenceId)
  return !locations || locations.some((locationId) => accessibleLocationIds.has(locationId))
}

/**
 * Supervisor menerima seluruh notifikasi operasional pada lokasi yang
 * ditugaskan padanya, termasuk opname dan selisihnya yang diselesaikan orang
 * lain — dialah yang mereview hasilnya. Pembatasnya murni penugasan lokasi,
 * yang sudah ditangani isAlertLocationVisible().
 */
export function isSupervisorAlertVisible(alert: { type: AlertType }) {
  return SUPERVISOR_ALERT_TYPES.includes(alert.type)
}
