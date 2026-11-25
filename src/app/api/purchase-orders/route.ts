import { NextRequest } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { err, isResponse, ok, requireAuth } from "@/lib/api-helpers"
import { denyUnlessCanEdit, getFeatureAccess } from "@/lib/feature-access"
import { canAccessLocation, getAccessibleLocationIds } from "@/lib/location-access"
import { warehousePurchaseRoles } from "@/lib/warehouse-purchase-needs"
import { buatPesananSupplier, denganStatus, jadwalkanPengirimanPesanan, pesananInclude, PesananDitolak, type KelompokPesanan } from "@/lib/purchase-orders"
import { consumeNeedLinks, NeedLinkExpired, requireUnusedNeedLink } from "@/lib/need-action-link"
import { markOverdueSupplierResponses } from "@/lib/supplier-message-tracking"
import { validateWhatsAppRecipient } from "@/lib/whatsapp"

export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (await getFeatureAccess(user, "SUPPLIERS") === null && await getFeatureAccess(user, "GOODS_RECEIPT") === null) {
    return err("Tidak memiliki akses ke pesanan supplier", 403)
  }
  const locationIds = await getAccessibleLocationIds(user)
  await markOverdueSupplierResponses(new Date(), user.organizationId)

  const params = req.nextUrl.searchParams
  const kelompok = params.get("group") as KelompokPesanan | null
  const cari = params.get("q")?.trim() ?? ""
  const hanyaAktif = params.get("active") === "true"
  const orderId = params.get("id")
  const perPage = Math.min(30, Math.max(1, Number(params.get("perPage") ?? 10) || 10))
  const pageDiminta = Math.max(1, Number(params.get("page") ?? 1) || 1)

  const where: Prisma.PurchaseOrderWhereInput = {
    organizationId: user.organizationId,
    ...(locationIds && { locationId: { in: locationIds } }),
    ...(orderId && { id: orderId }),
    ...(hanyaAktif && { lines: { some: { status: "ACTIVE" } } }),
    ...(cari && {
      OR: [
        { shortCode: { contains: cari.replace(/^#/, "").toUpperCase() } },
        { supplier: { name: { contains: cari, mode: "insensitive" } } },
        { lines: { some: { item: { name: { contains: cari, mode: "insensitive" } } } } },
      ],
    }),
  }
  // Status gabungan dihitung dari baris, jadi daftar disaring setelah dibaca.
  // Jumlah pesanan per organisasi kecil (puluhan–ratusan), jadi ini aman.
  const semua = await prisma.purchaseOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 500,
    include: pesananInclude,
  })
  const diberiStatus = semua.map(denganStatus)
  const jumlah: Record<KelompokPesanan, number> = { PERLU_TINDAKAN: 0, MENUNGGU: 0, PENGIRIMAN: 0, SELESAI: 0 }
  for (const order of diberiStatus) jumlah[order.kelompok]++
  const tersaring = kelompok ? diberiStatus.filter((order) => order.kelompok === kelompok) : diberiStatus
  const pages = Math.max(1, Math.ceil(tersaring.length / perPage))
  const page = Math.min(pages, pageDiminta)
  return ok({ items: tersaring.slice((page - 1) * perPage, page * perPage), total: tersaring.length, page, pages, perPage, counts: jumlah })
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (isResponse(user)) return user
  if (!warehousePurchaseRoles.includes(user.role)) return err("Hanya penanggung jawab gudang yang dapat membuat pesanan supplier", 403)
  const forbidden = await denyUnlessCanEdit(user, "TRANSFER")
  if (forbidden) return forbidden

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const warehouseId = typeof body?.warehouseId === "string" ? body.warehouseId : ""
  const supplierId = typeof body?.supplierId === "string" ? body.supplierId : ""
  const urgency = body?.urgency === "URGENT" ? "URGENT" : "NORMAL"
  // "Catat pesanan manual": dipesan di luar Pantau, tanpa WA.
  const manual = body?.manual === true
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : null
  const lines = Array.isArray(body?.lines)
    ? (body!.lines as Array<Record<string, unknown>>).map((line) => ({
        itemId: typeof line?.itemId === "string" ? line.itemId : "",
        quantity: Math.round(Number(line?.quantity) * 1000) / 1000,
      }))
    : []
  if (!warehouseId || !supplierId || lines.length === 0 || lines.some((line) => !line.itemId)) {
    return err("Pilih gudang, supplier, dan minimal satu bahan")
  }
  if (!(await canAccessLocation(user, warehouseId))) return err("Tidak ada akses ke gudang ini", 403)

  if (!manual) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId, isActive: true },
      select: { name: true, phone: true },
    })
    if (!supplier?.phone) return err("Nomor WhatsApp supplier belum diisi", 409)
    const validation = await validateWhatsAppRecipient(user.organizationId, supplier.phone)
    if (!validation.valid) {
      return err(`${supplier.name}: ${validation.reason}. Perbaiki nomor supplier sebelum membuat pesanan.`, validation.unavailable ? 503 : 409)
    }
  }

  try {
    // Dibuka dari tautan WA: tautan bahan itu hanya boleh dipakai sekali.
    const linkItemId = typeof body?.linkItemId === "string" ? body.linkItemId : null
    const hasil = await prisma.$transaction(async (tx) => {
      if (linkItemId && (body?.fromLink || body?.alertId)) {
        await requireUnusedNeedLink(tx, user.organizationId, linkItemId, warehouseId, body?.alertId)
      }
      const dibuat = await buatPesananSupplier(tx, {
        organizationId: user.organizationId, userId: user.id, supplierId, warehouseId, lines, urgency, notes, manual,
      })
      // Tautan WA "isi pembelian" untuk bahan-bahan ini sudah terpakai.
      for (const line of lines) {
        await consumeNeedLinks(tx, user.organizationId, user.id, line.itemId, warehouseId, dibuat.order.id)
      }
      return dibuat
    })
    if (!manual) jadwalkanPengirimanPesanan()
    return ok({ id: hasil.order.id, shortCode: hasil.shortCode, waDiantrekan: hasil.terkirim }, 201)
  } catch (error) {
    if (error instanceof PesananDitolak) return err(error.message, 409)
    if (error instanceof NeedLinkExpired) return err(error.message, 410)
    console.error("Gagal membuat pesanan supplier", error)
    return err("Gagal membuat pesanan supplier", 500)
  }
}
