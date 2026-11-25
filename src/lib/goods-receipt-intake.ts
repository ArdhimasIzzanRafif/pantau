import "server-only"

import { MovementType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { addStock, StockError } from "@/lib/stock-ledger"
import { convertToBase, UnitError } from "@/lib/unit-conversion"
import { continueOutstandingNeeds } from "@/lib/transfer-flow"
import { sudahDikonfirmasi } from "@/lib/purchase-orders"
import { InventoryCostError, resolveReceiptPurchaseCost } from "@/lib/inventory-cost"

/// Penolakan yang punya pesan untuk pengguna, bukan kesalahan server.
export class PenerimaanDitolak extends Error {}

type ReceiptInput = {
  itemId?: string
  /// Jumlah barang BAIK, dalam satuan yang dipilih pengguna.
  inputQuantity?: number
  /// Tiba tetapi rusak, dan tidak ikut tiba. Dicatat, tidak masuk stok.
  damagedQuantity?: number
  missingQuantity?: number
  inputUnit?: "base" | "pack"
  inputUnitCost?: number | null
  // Backward-compatible fields for older clients.
  quantity?: number
  costPrice?: number | null
  batchNumber?: string | null
  expiryDate?: string | null
}

export type PencatatPenerimaan = { id: string; organizationId: string }

/// Kesalahan satuan adalah salah ketik pengguna, bukan kerusakan server.
function bungkusKesalahanSatuan<T>(jalankan: () => T): T {
  try {
    return jalankan()
  } catch (error) {
    if (error instanceof UnitError) throw new PenerimaanDitolak(error.message)
    throw error
  }
}

const roundMoney = (value: number) => Math.round(value * 100) / 100
const roundBaseCost = (value: number) => Math.round(value * 1_000_000) / 1_000_000

/**
 * Mencatat satu penerimaan barang, termasuk seluruh aturan pengadaannya.
 *
 * Dipisahkan dari route agar aturannya dapat diuji langsung tanpa sesi login,
 * dan agar route hanya mengurus autentikasi, izin, dan akses lokasi.
 */
export async function recordGoodsReceipt(
  user: PencatatPenerimaan,
  body: Record<string, unknown>,
) {
  const teks = (value: unknown) => typeof value === "string" ? value.trim() : ""
  const locationId = typeof body.locationId === "string" ? body.locationId : ""
  const purchaseRequestId = typeof body.purchaseRequestId === "string" && body.purchaseRequestId ? body.purchaseRequestId : null
  // Pesanan banyak bahan: satu penerimaan untuk semua bahannya.
  const purchaseOrderId = typeof body.purchaseOrderId === "string" && body.purchaseOrderId ? body.purchaseOrderId : null
  const clientRequestId = typeof body.clientRequestId === "string" && body.clientRequestId.trim()
    ? body.clientRequestId.trim().slice(0, 100)
    : null
  const confirmFreeReceipt = body.confirmFreeReceipt === true
  const items = Array.isArray(body.items) ? body.items as ReceiptInput[] : []
  if (!locationId || items.length === 0) throw new PenerimaanDitolak("Lokasi dan item wajib diisi")

  // Tanggal kejadian nyata, bukan waktu data diketik. Penerimaan yang telat
  // dicatat tetap masuk ke tanggal barangnya benar-benar tiba.
  const receivedAt = typeof body.receivedAt === "string" && body.receivedAt
    ? new Date(body.receivedAt.length <= 10 ? `${body.receivedAt}T12:00:00+07:00` : body.receivedAt)
    : new Date()
  if (!Number.isFinite(receivedAt.getTime())) throw new PenerimaanDitolak("Tanggal penerimaan tidak valid")

  // Permintaan yang sama dikirim ulang mengembalikan hasil lama, bukan
  // menambah stok untuk kedua kalinya.
  if (clientRequestId) {
    const sebelumnya = await prisma.goodsReceipt.findFirst({
      where: { clientRequestId, organizationId: user.organizationId },
      include: { location: true, items: { include: { item: true, batch: true } } },
    })
    if (sebelumnya) return { receipt: sebelumnya, created: false }
  }

  const supplierId = typeof body.supplierId === "string" && body.supplierId ? body.supplierId : null
  const supplierRecord = supplierId
    ? await prisma.supplier.findFirst({
        where: { id: supplierId, organizationId: user.organizationId, isActive: true },
        select: { id: true, name: true },
      })
    : null
  if (supplierId && !supplierRecord) throw new PenerimaanDitolak("Supplier tidak valid atau sudah nonaktif")
  const supplierName = supplierRecord?.name
    ?? (typeof body.supplier === "string" ? body.supplier.trim() || null : null)

  const inventoryItems = await prisma.inventoryItem.findMany({
    where: {
      organizationId: user.organizationId,
      // Item non-trackable (bumbu/garnish) tetap boleh menerima barang masuk.
      id: { in: items.map((item) => String(item.itemId ?? "")) },
    },
    select: { id: true, name: true, unit: true, packSize: true, packUnit: true, costPrice: true, minStock: true },
  })
  const itemMap = new Map(inventoryItems.map((item) => [item.id, item]))
  if (items.some((item) => !itemMap.has(String(item.itemId ?? "")))) throw new PenerimaanDitolak("Ada item inventori yang tidak valid")

  const normalized = bungkusKesalahanSatuan(() => items.map((input) => {
    const itemId = String(input.itemId ?? "")
    const inventoryItem = itemMap.get(itemId)!
    const hasNewPurchaseFields = input.inputQuantity !== undefined
    // Barang Masuk mengonversi kembali ke satuan dasar lewat satu pintu yang
    // sama dengan seluruh aplikasi. Jumlah 0 dibiarkan lolos: kiriman yang
    // semuanya rusak tetap sah dicatat.
    const purchaseQuantity = hasNewPurchaseFields ? Number(input.inputQuantity) : Number(input.quantity)
    const konversi = purchaseQuantity > 0
      ? convertToBase(inventoryItem, purchaseQuantity, hasNewPurchaseFields ? input.inputUnit : "base")
      : null
    const usePack = konversi != null && konversi.conversionFactor !== 1
    const quantity = konversi?.baseQuantity ?? 0
    const rawPurchaseCost = hasNewPurchaseFields ? input.inputUnitCost : input.costPrice
    let purchaseUnitCost: number
    try {
      purchaseUnitCost = resolveReceiptPurchaseCost(
        rawPurchaseCost,
        inventoryItem.costPrice,
        inventoryItem.name,
        confirmFreeReceipt,
      )
    } catch (error) {
      if (error instanceof InventoryCostError) throw new PenerimaanDitolak(error.message)
      throw error
    }
    const lineTotal = purchaseUnitCost == null ? null : roundMoney(purchaseQuantity * purchaseUnitCost)
    // Tanpa barang baik tidak ada harga satuan yang dapat dihitung.
    const baseCost = lineTotal == null || quantity <= 0 ? null : roundBaseCost(lineTotal / quantity)

    // Rusak dan tidak tiba dicatat dalam satuan dasar yang sama dengan stok,
    // memakai faktor konversi yang sama dengan barang baiknya.
    const keSatuanDasar = (value: unknown) => {
      const angka = Number(value ?? 0)
      if (!Number.isFinite(angka) || angka <= 0) return 0
      return convertToBase(inventoryItem, angka, hasNewPurchaseFields ? input.inputUnit : "base").baseQuantity
    }

    return {
      itemId,
      quantity,
      damagedQuantity: keSatuanDasar(input.damagedQuantity),
      missingQuantity: keSatuanDasar(input.missingQuantity),
      costPrice: baseCost,
      purchaseQuantity,
      purchaseUnit: konversi?.inputUnit ?? inventoryItem.unit,
      purchaseUnitCost,
      lineTotal,
      // Snapshot faktor konversi: riwayat lama tidak ikut berubah ketika
      // konfigurasi kemasan diperbarui di kemudian hari.
      packSizeSnapshot: usePack ? konversi!.conversionFactor : null,
      batchNumber: typeof input.batchNumber === "string" ? input.batchNumber.trim() : "",
      expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T23:59:59.999+07:00`) : null,
    }
  }))
  if (normalized.some((item) => !item.itemId || !Number.isFinite(item.purchaseQuantity) || item.purchaseQuantity < 0 || !Number.isFinite(item.quantity) || item.quantity < 0)) {
    throw new PenerimaanDitolak("Jumlah barang tidak boleh negatif")
  }
  // Barang baik boleh 0 — kiriman yang seluruhnya rusak tetap perlu dicatat —
  // tetapi satu baris tanpa angka apa pun tidak ada gunanya.
  if (normalized.some((item) => item.quantity + item.damagedQuantity + item.missingQuantity <= 0)) {
    throw new PenerimaanDitolak("Isi jumlah barang baik, rusak, atau tidak tiba")
  }
  if (normalized.some((item) => item.expiryDate && !Number.isFinite(item.expiryDate.getTime()))) {
    throw new PenerimaanDitolak("Tanggal kedaluwarsa tidak valid")
  }

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      // Baris pesanan yang ditautkan, per bahan. Pesanan lama = satu baris;
      // pesanan banyak bahan = semua baris yang masih aktif.
      const linkedLines = new Map<string, Awaited<ReturnType<typeof tx.purchaseRequest.findFirst>> & object>()
      // Diisi bila pesanan belum dikonfirmasi supplier (jalur darurat).
      let tanpaKonfirmasi: { alasan: string; shortCode: string } | null = null
      if (purchaseRequestId) {
        await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id = ${purchaseRequestId} FOR UPDATE`
        const line = await tx.purchaseRequest.findFirst({ where: { id: purchaseRequestId, organizationId: user.organizationId } })
        if (!line) throw new StockError("Pesanan supplier tidak ditemukan")
        if (line.status !== "ACTIVE") throw new StockError("Pesanan supplier ini sudah selesai")
        linkedLines.set(line.itemId, line)
        if (!["READY", "PARTIAL", "SHIPPED"].includes(line.supplierReplyStatus)) {
          const alasan = teks(body.tanpaKonfirmasi)
          if (alasan.length < 5) {
            throw new StockError(`Pesanan ${line.orderCode} masih menunggu konfirmasi supplier. Isi alasan barang datang tanpa konfirmasi.`)
          }
          if (typeof body.imageUrl !== "string" || !body.imageUrl) {
            throw new StockError("Barang yang datang tanpa konfirmasi wajib disertai foto barang/surat jalan")
          }
          tanpaKonfirmasi = { alasan: alasan.slice(0, 300), shortCode: line.orderCode }
        }
      } else if (purchaseOrderId) {
        await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE "purchaseOrderId" = ${purchaseOrderId} FOR UPDATE`
        const order = await tx.purchaseOrder.findFirst({
          where: { id: purchaseOrderId, organizationId: user.organizationId },
          include: { lines: { where: { status: "ACTIVE" } } },
        })
        if (!order) throw new StockError("Pesanan supplier tidak ditemukan")
        if (order.lines.length === 0) throw new StockError("Pesanan supplier ini sudah selesai")
        for (const line of order.lines) linkedLines.set(line.itemId, line)
        // Penerimaan normal hanya setelah supplier memastikan barangnya ada.
        // Barang yang ternyata sudah datang tetap boleh dicatat, tetapi tidak
        // diam-diam: wajib alasan dan foto, dan owner mendapat peringatan.
        if (!sudahDikonfirmasi(order)) {
          const alasan = teks(body.tanpaKonfirmasi)
          if (alasan.length < 5) {
            throw new StockError(`Pesanan #${order.shortCode} belum dikonfirmasi supplier. Tandai sudah dikonfirmasi, atau isi alasan barang datang tanpa konfirmasi.`)
          }
          if (typeof body.imageUrl !== "string" || !body.imageUrl) throw new StockError("Barang yang datang tanpa konfirmasi wajib disertai foto barang/surat jalan")
          tanpaKonfirmasi = { alasan: alasan.slice(0, 300), shortCode: order.shortCode }
        }
      }
      const adaPesanan = linkedLines.size > 0
      if (adaPesanan) {
        const contoh = [...linkedLines.values()][0]
        if (contoh.locationId !== locationId || contoh.supplierId !== supplierRecord?.id) {
          throw new StockError("Gudang atau supplier tidak sesuai dengan pesanan")
        }
        for (const row of normalized) {
          const line = linkedLines.get(row.itemId)
          if (!line) throw new StockError("Penerimaan dari pesanan harus memakai bahan yang tercantum pada pesanan")
          const remaining = Math.max(0, Number(line.quantity) - Number(line.receivedQuantity))
          // Angka supplier adalah acuan pemeriksaan, bukan batas stok. Barang
          // fisik dapat tiba kurang atau lebih. Kekurangan diturunkan dari
          // jumlah baik + rusak, sementara kelebihan barang baik tetap masuk
          // stok dan dicatat pada audit pesanan.
          const supplierRemaining = line.shippedQuantity != null
            ? Math.max(0, Number(line.shippedQuantity) - Number(line.receivedQuantity))
            : line.supplierReplyStatus === "PARTIAL" && line.promisedQuantity != null
              ? Math.max(0, Number(line.promisedQuantity) - Number(line.receivedQuantity))
              : remaining
          const inspectionReference = Math.min(remaining, supplierRemaining)
          row.missingQuantity = Math.max(0, inspectionReference - row.quantity - row.damagedQuantity)
        }
        if (new Set(normalized.map((row) => row.itemId)).size !== normalized.length) {
          throw new StockError("Bahan yang sama tercantum dua kali dalam penerimaan")
        }
      }
      // Kompatibel dengan kode lama yang memakai satu baris pesanan.
      const linkedRequest = purchaseRequestId ? [...linkedLines.values()][0] : null
      const gr = await tx.goodsReceipt.create({
        data: {
          organizationId: user.organizationId,
          locationId,
          supplierId: supplierRecord?.id ?? null,
          supplier: supplierName,
          receiptNumber: teks(body.receiptNumber) || null,
          notes: teks(body.notes) || null,
          imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
          status: "CONFIRMED",
          createdById: user.id,
          purchaseRequestId: linkedRequest?.id ?? null,
          purchaseOrderId,
          clientRequestId,
          receivedAt,
          withoutConfirmationReason: tanpaKonfirmasi?.alasan ?? null,
        },
        include: { location: true },
      })
      if (tanpaKonfirmasi) {
        await tx.alert.create({ data: {
          organizationId: user.organizationId, type: "GOODS_RECEIVED", severity: "WARNING",
          title: "Barang diterima tanpa konfirmasi supplier",
          message: `Pesanan #${tanpaKonfirmasi.shortCode}${supplierName ? ` dari ${supplierName}` : ""} diterima di ${gr.location.name} sebelum supplier mengonfirmasi. Alasan: ${tanpaKonfirmasi.alasan}`,
          locationId, referenceId: gr.id,
        } })
        await tx.auditLog.create({ data: {
          organizationId: user.organizationId, userId: user.id, action: "RECEIVE_WITHOUT_SUPPLIER_CONFIRMATION",
          entity: "PurchaseOrder", entityId: purchaseOrderId!, after: { receiptId: gr.id, alasan: tanpaKonfirmasi.alasan },
        } })
      }

      for (const [index, input] of normalized.entries()) {
        const inventoryItem = itemMap.get(input.itemId)!
        const currentBalance = await tx.stockBalance.findUnique({
          where: { itemId_locationId: { itemId: input.itemId, locationId } },
        })
        const currentQty = Number(currentBalance?.quantity ?? 0)
        const currentCost = inventoryItem.costPrice == null ? null : Number(inventoryItem.costPrice)
        const locationSetting = await tx.inventoryLocationSetting.findUnique({
          where: {
            organizationId_itemId_locationId: {
              organizationId: user.organizationId,
              itemId: input.itemId,
              locationId,
            },
          },
          select: { minStock: true },
        })

        if (input.costPrice != null && input.costPrice > 0) {
          const newWAC = currentCost != null && currentQty > 0
            ? (currentQty * currentCost + input.quantity * input.costPrice) / (currentQty + input.quantity)
            : input.costPrice
          await tx.inventoryItem.update({
            where: { id: input.itemId },
            data: { costPrice: roundBaseCost(newWAC) },
          })

          if (currentCost != null && currentCost > 0) {
            const pctChange = ((input.costPrice - currentCost) / currentCost) * 100
            // Kenaikan berapa pun dicatat: di bawah 20% sebagai info, 20% ke atas
            // sebagai kritis karena perlu dicek ke invoice supplier.
            if (pctChange > 0) {
              const berat = pctChange >= 20
              await tx.alert.create({
                data: {
                  organizationId: user.organizationId,
                  type: "PRICE_ANOMALY",
                  severity: berat ? "CRITICAL" : "INFO",
                  title: berat
                    ? `Kenaikan harga beli signifikan: ${inventoryItem.name}`
                    : `Harga beli naik: ${inventoryItem.name}`,
                  message: berat
                    ? `Harga beli ${inventoryItem.name} di ${gr.location.name} naik ${pctChange.toFixed(1)}%. Harap verifikasi invoice supplier.`
                    : `Harga beli ${inventoryItem.name} di ${gr.location.name} naik ${pctChange.toFixed(1)}%, masih di bawah batas 20%.`,
                  locationId,
                  itemId: input.itemId,
                  referenceId: gr.id,
                },
              })
            }
          }
        }

        const receiptItem = await tx.goodsReceiptItem.create({
          data: {
            receiptId: gr.id,
            itemId: input.itemId,
            quantity: input.quantity,
            damagedQuantity: input.damagedQuantity,
            missingQuantity: input.missingQuantity,
            costPrice: input.costPrice,
            purchaseQuantity: input.purchaseQuantity,
            purchaseUnit: input.purchaseUnit,
            purchaseUnitCost: input.purchaseUnitCost,
            lineTotal: input.lineTotal,
            packSizeSnapshot: input.packSizeSnapshot,
            batchNumber: input.batchNumber || null,
            expiryDate: input.expiryDate,
          },
        })
        const effectiveBatchNumber = input.batchNumber || (input.expiryDate ? `AUTO-${gr.id.slice(-6)}-${index + 1}` : null)
        // Barang rusak dan yang tidak tiba tidak pernah menyentuh stok.
        const batchId = input.quantity <= 0 ? null : await addStock(tx, {
          organizationId: user.organizationId,
          itemId: input.itemId,
          locationId,
          type: MovementType.GOODS_IN,
          quantity: input.quantity,
          note: teks(body.receiptNumber) ? `Penerimaan ${teks(body.receiptNumber)}` : "Penerimaan barang",
          referenceId: gr.id,
          createdById: user.id,
          batchNumber: effectiveBatchNumber,
          expiryDate: input.expiryDate,
          costPrice: input.costPrice,
        })
        if (batchId) {
          await tx.goodsReceiptItem.update({ where: { id: receiptItem.id }, data: { batchId, batchNumber: effectiveBatchNumber } })
        }

        if (locationSetting && currentQty + input.quantity > Number(locationSetting.minStock)) {
          await tx.alert.updateMany({
            where: {
              organizationId: user.organizationId,
              type: "LOW_STOCK",
              itemId: input.itemId,
              locationId,
              isResolved: false,
            },
            data: { isResolved: true, resolvedAt: new Date(), resolvedById: user.id },
          })
        }

        // Pesanan supplier TIDAK dicari otomatis di sini. Barang masuk manual
        // tidak boleh menutup pesanan siapa pun — menebak pesanan mana yang
        // dimaksud pernah membuat pesanan yang salah ikut tertutup.
      }

      // Stok gudang baru saja bertambah, jadi sisa kebutuhan outlet yang
      // sempat tertahan dapat dilanjutkan. Outlet tidak diminta mengisi lagi.
      const lokasiPenerima = await tx.location.findFirst({
        where: { id: locationId, organizationId: user.organizationId },
        select: { type: true },
      })
      if (lokasiPenerima?.type === "WAREHOUSE") {
        for (const input of normalized) {
          if (input.quantity <= 0) continue
          await continueOutstandingNeeds(tx, {
            organizationId: user.organizationId,
            warehouseId: locationId,
            itemId: input.itemId,
            userId: user.id,
          })
        }
      }

      for (const row of adaPesanan ? normalized : []) {
        const line = linkedLines.get(row.itemId)!
        const diterimaBaik = row.quantity
        const receivedQuantity = Number(line.receivedQuantity) + diterimaBaik
        const fulfilled = receivedQuantity >= Number(line.quantity)
        await tx.purchaseRequest.update({
          where: { id: line.id },
          data: {
            receivedQuantity,
            ...(fulfilled && { status: "FULFILLED", resolvedAt: new Date(), resolvedById: user.id }),
          },
        })
        await tx.auditLog.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            action: fulfilled ? "PURCHASE_FULFILLED" : "PURCHASE_PARTIALLY_RECEIVED",
            entity: "PurchaseRequest",
            entityId: line.id,
            before: { receivedQuantity: Number(line.receivedQuantity), status: line.status },
          // CONFIRM_PURCHASE_RECEIPT selalu tercatat sebagai kejadiannya;
          // action di atas menyatakan hasil akhirnya terpenuhi atau belum.
            after: {
              receivedQuantity,
              status: fulfilled ? "FULFILLED" : line.status,
              barangBaik: diterimaBaik,
              barangRusak: row.damagedQuantity,
              tidakTiba: row.missingQuantity,
              kelebihanDariPesanan: Math.max(0, receivedQuantity - Number(line.quantity)),
              penerimaanId: gr.id,
              ...(purchaseOrderId ? { purchaseOrderId } : {}),
            },
          },
        })
      }

      // Sebut nama barangnya, bukan hanya jumlah jenisnya — supaya peringatan
      // bisa dibaca sekilas tanpa harus membuka detail penerimaan.
      const rincian = normalized.map((row) => {
        const nama = itemMap.get(row.itemId)?.name ?? "Item"
        return `${nama} ${row.purchaseQuantity.toLocaleString("id-ID")} ${row.purchaseUnit}`
      })
      const ditampilkan = rincian.slice(0, 3).join(", ")
      const sisa = rincian.length - 3
      const daftarItem = sisa > 0 ? `${ditampilkan}, +${sisa} lainnya` : ditampilkan

      await tx.alert.create({
        data: {
          organizationId: user.organizationId,
          type: "GOODS_RECEIVED",
          severity: "INFO",
          title: "Barang masuk dicatat",
          message: `${daftarItem} diterima di ${gr.location.name}${gr.supplier ? ` dari ${gr.supplier}` : ""}.`,
          locationId,
          referenceId: gr.id,
        },
      })

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: "CREATE",
          entity: "GoodsReceipt",
          entityId: gr.id,
        },
      })
      return tx.goodsReceipt.findUnique({
        where: { id: gr.id },
        include: { location: true, items: { include: { item: true, batch: true } } },
      })
    })
    return { receipt, created: true }
  } catch (error) {
    if (error instanceof StockError) throw new PenerimaanDitolak(error.message)

    // Dua permintaan kembar berangkat bersamaan: keduanya lolos pemeriksaan di
    // awal, lalu database menolak yang kedua. Kembalikan hasil yang pertama.
    if (clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const sebelumnya = await prisma.goodsReceipt.findFirst({
        where: { clientRequestId, organizationId: user.organizationId },
        include: { location: true, items: { include: { item: true, batch: true } } },
      })
      if (sebelumnya) return { receipt: sebelumnya, created: false }
    }

    // Kesalahan tak terduga diteruskan apa adanya agar route mencatatnya
    // sebagai 500, bukan disamarkan menjadi kesalahan pengguna.
    throw error
  }
}
