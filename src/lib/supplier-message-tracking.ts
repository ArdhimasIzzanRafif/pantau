import "server-only"

import { createHash } from "node:crypto"
import { Prisma, SupplierMessageDeliveryStatus } from "@prisma/client"
import { prisma } from "@/lib/db"

const DELIVERY_RANK: Record<SupplierMessageDeliveryStatus, number> = {
  UNKNOWN: 0,
  PROVIDER_ACCEPTED: 1,
  WHATSAPP_SENT: 2,
  DELIVERED: 3,
  READ: 4,
  // Kegagalan bukan kemajuan. Nilai khusus ini hanya boleh menggantikan
  // status sebelum DELIVERED; bukti sampai/dibaca tidak boleh dihapus.
  UNDELIVERED: -1,
}

export function cleanProviderValue(value: unknown) {
  if (value == null) return null
  const cleaned = String(value).trim().slice(0, 250)
  return cleaned || null
}

/**
 * Dokumentasi Fonnte menjamin field status/state, tetapi tidak mencantumkan
 * seluruh nilai yang mungkin. Nilai yang belum dikenal sengaja menjadi
 * UNKNOWN dan payload mentah tetap disimpan untuk kalibrasi, bukan ditebak.
 */
export function mapFonnteMessageStatus(
  providerStatus: string | null,
  providerState: string | null,
): SupplierMessageDeliveryStatus {
  const status = providerStatus?.toLowerCase().replace(/[\s_-]+/g, "") ?? ""
  const state = providerState?.toLowerCase().replace(/[\s_-]+/g, "") ?? ""

  if (state === "0" || ["invalid", "failed", "expired", "urlunreachable", "undelivered", "error"].includes(status)
    || ["failed", "undelivered", "error", "rejected"].includes(state)) return "UNDELIVERED"
  if (["read", "seen", "4"].includes(state) || status === "read") return "READ"
  if (["delivered", "3"].includes(state) || status === "delivered") return "DELIVERED"
  if (["sent", "2"].includes(state) || status === "sent") return "WHATSAPP_SENT"
  if (["processing", "pending", "waiting"].includes(status)) return "PROVIDER_ACCEPTED"
  return "UNKNOWN"
}

export function nextDeliveryStatus(
  current: SupplierMessageDeliveryStatus,
  incoming: SupplierMessageDeliveryStatus,
) {
  if (incoming === "UNDELIVERED") {
    return DELIVERY_RANK[current] < DELIVERY_RANK.DELIVERED ? incoming : current
  }
  if (current === "UNDELIVERED") return incoming === "UNKNOWN" ? current : incoming
  return DELIVERY_RANK[incoming] > DELIVERY_RANK[current] ? incoming : current
}

function payloadDate(value: unknown, fallback = new Date()) {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const numeric = Number(value)
    const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    if (Number.isFinite(date.getTime())) return date
  }
  if (typeof value === "string") {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) return date
  }
  return fallback
}

function jsonPayload(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export function statusEventKey(organizationId: string, payload: Record<string, unknown>) {
  return createHash("sha256").update([
    organizationId,
    cleanProviderValue(payload.id) ?? "",
    cleanProviderValue(payload.stateid) ?? "",
    cleanProviderValue(payload.status) ?? "",
    cleanProviderValue(payload.state) ?? "",
    cleanProviderValue(payload.timestamp) ?? "",
  ].join("\u001f")).digest("hex")
}

export async function recordSupplierMessageStatus(input: {
  organizationId: string
  payload: Record<string, unknown>
  receivedAt?: Date
}) {
  const providerMessageId = cleanProviderValue(input.payload.id)
  const providerStateId = cleanProviderValue(input.payload.stateid)
  const providerStatus = cleanProviderValue(input.payload.status)
  const providerState = cleanProviderValue(input.payload.state)
  if (!providerMessageId && !providerStateId) return { outcome: "INVALID" as const }

  const receivedAt = input.receivedAt ?? new Date()
  const occurredAt = payloadDate(input.payload.timestamp, receivedAt)
  const mappedStatus = mapFonnteMessageStatus(providerStatus, providerState)
  const eventKey = statusEventKey(input.organizationId, input.payload)

  try {
    return await prisma.$transaction(async (tx) => {
      let request = providerMessageId ? await tx.purchaseRequest.findFirst({
        where: { organizationId: input.organizationId, providerMessageId },
      }) : null
      if (!request && providerStateId) {
        const previous = await tx.supplierMessageStatusEvent.findFirst({
          where: { organizationId: input.organizationId, providerStateId },
          orderBy: { occurredAt: "desc" },
          select: { purchaseRequestId: true },
        })
        if (previous) request = await tx.purchaseRequest.findFirst({
          where: { id: previous.purchaseRequestId, organizationId: input.organizationId },
        })
      }
      if (!request) return { outcome: "NOT_FOUND" as const }

      const appliedStatus = nextDeliveryStatus(request.providerDeliveryStatus, mappedStatus)
      const startsResponseClock = request.status === "ACTIVE"
        && request.supplierReplyStatus === "WAITING"
        && request.responseDueAt == null
        && (appliedStatus === "DELIVERED" || appliedStatus === "READ")
      const responseDueAt = startsResponseClock
        ? new Date(occurredAt.getTime() + request.responseTimeoutMinutes * 60_000)
        : request.responseDueAt

      await tx.supplierMessageStatusEvent.create({
        data: {
          organizationId: input.organizationId,
          purchaseRequestId: request.id,
          eventKey,
          providerMessageId,
          providerStateId,
          providerStatus,
          providerState,
          mappedStatus,
          occurredAt,
          payload: jsonPayload(input.payload),
        },
      })

      // Pesanan banyak bahan: satu WA mewakili semua baris, jadi status
      // pengantarannya berlaku untuk setiap baris yang masih aktif.
      const saudara = request.purchaseOrderId
        ? await tx.purchaseRequest.findMany({
            where: { organizationId: input.organizationId, purchaseOrderId: request.purchaseOrderId, id: { not: request.id } },
            select: { id: true },
          })
        : []
      if (saudara.length > 0) {
        await tx.purchaseRequest.updateMany({
          where: { id: { in: saudara.map((row) => row.id) } },
          data: {
            providerDeliveryStatus: appliedStatus,
            providerStatusRaw: providerStatus,
            providerStateRaw: providerState,
            ...(providerStateId ? { providerStateId } : {}),
            deliveryStatusUpdatedAt: occurredAt,
            ...(appliedStatus === "DELIVERED" ? { deliveredAt: request.deliveredAt ?? occurredAt } : {}),
            ...(appliedStatus === "READ" ? { readAt: request.readAt ?? occurredAt, deliveredAt: request.deliveredAt ?? occurredAt } : {}),
            ...(appliedStatus === "UNDELIVERED" ? { undeliveredAt: occurredAt } : {}),
            ...(startsResponseClock ? { responseDueAt } : {}),
          },
        })
      }

      await tx.purchaseRequest.update({
        where: { id: request.id },
        data: {
          providerDeliveryStatus: appliedStatus,
          providerStatusRaw: providerStatus,
          providerStateRaw: providerState,
          ...(providerStateId ? { providerStateId } : {}),
          deliveryStatusUpdatedAt: occurredAt,
          ...(appliedStatus === "DELIVERED" && !request.deliveredAt ? { deliveredAt: occurredAt } : {}),
          ...(appliedStatus === "READ" ? {
            readAt: request.readAt ?? occurredAt,
            deliveredAt: request.deliveredAt ?? occurredAt,
          } : {}),
          ...(appliedStatus === "UNDELIVERED" ? { undeliveredAt: occurredAt } : {}),
          ...(startsResponseClock ? { responseDueAt } : {}),
        },
      })

      return { outcome: "APPLIED" as const, requestId: request.id, status: appliedStatus, responseDueAt }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { outcome: "DUPLICATE" as const }
    }
    throw error
  }
}

/** Menandai PO yang pesannya sudah sampai tetapi belum dijawab sampai tenggat. */
export async function markOverdueSupplierResponses(now = new Date(), organizationId?: string) {
  const overdue = await prisma.purchaseRequest.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      status: "ACTIVE",
      supplierReplyStatus: "WAITING",
      providerDeliveryStatus: { in: ["DELIVERED", "READ"] },
      responseDueAt: { lte: now },
      responseOverdueAt: null,
    },
    select: { id: true, organizationId: true, responseDueAt: true },
  })
  if (overdue.length === 0) return 0

  await prisma.$transaction(async (tx) => {
    for (const request of overdue) {
      const marked = await tx.purchaseRequest.updateMany({
        where: { id: request.id, responseOverdueAt: null, supplierReplyStatus: "WAITING" },
        data: { responseOverdueAt: now },
      })
      if (marked.count === 1) {
        await tx.auditLog.create({ data: {
          organizationId: request.organizationId,
          action: "SUPPLIER_RESPONSE_OVERDUE",
          entity: "PurchaseRequest",
          entityId: request.id,
          after: { responseDueAt: request.responseDueAt?.toISOString(), markedAt: now.toISOString() },
        } })
      }
    }
  })
  return overdue.length
}
