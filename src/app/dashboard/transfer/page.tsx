import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getLowStockTransferContext } from "@/lib/low-stock-transfer-context"
import { redirect } from "next/navigation"
import TransferPageClient from "./transfer-client"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function TransferPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams
  const warehouseId = typeof query.warehouseId === "string" ? query.warehouseId : ""
  const itemId = typeof query.itemId === "string" ? query.itemId : ""
  const alertId = typeof query.alertId === "string" ? query.alertId : ""
  // Kompatibilitas pesan WA lama: tautan stok gudang dahulu salah diarahkan
  // ke Transfer Barang. Alihkan langsung ke formulir pembelian supplier.
  if (warehouseId && itemId) {
    const target = new URLSearchParams({ view: "procurement", warehouseId, itemId })
    if (alertId) target.set("alertId", alertId)
    redirect(`/dashboard/suppliers?${target.toString()}`)
  }
  const rawLowStock = typeof query.lowStock === "string" ? query.lowStock : ""
  if (!rawLowStock) return <TransferPageClient initialLowStockLinkState="idle" />

  const session = await auth()
  const sessionUser = session?.user as { organizationId?: string | null } | undefined
  const organizationId = sessionUser?.organizationId
  if (!organizationId) return <TransferPageClient initialLowStockLinkState="checking" />

  const alertIds = [...new Set(rawLowStock.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 50)
  const linkOwners = await prisma.alert.findMany({
    where: { id: { in: alertIds }, type: "LOW_STOCK" },
    select: { organizationId: true },
  })

  // Hanya tautan milik bisnis yang sedang login yang boleh dinilai sebagai
  // kedaluwarsa. Tautan bisnis lain tetap diperiksa API dan berakhir 403.
  const belongsToCurrentBusiness = linkOwners.length > 0
    && linkOwners.every((alert) => alert.organizationId === organizationId)
  if (belongsToCurrentBusiness) {
    const context = await getLowStockTransferContext(organizationId, alertIds)
    if (!context || context.lines.length === 0) {
      return <TransferPageClient initialLowStockLinkState="expired" />
    }
  }

  return <TransferPageClient initialLowStockLinkState="checking" />
}
