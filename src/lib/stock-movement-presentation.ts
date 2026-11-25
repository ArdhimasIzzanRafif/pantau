type MovementReference = { type: string; note: string | null; referenceId: string | null }

const DESCRIPTIONS: Record<string, string> = {
  GOODS_IN: "Penerimaan barang",
  GOODS_OUT: "Pengeluaran barang",
  TRANSFER_OUT: "Pengiriman barang ke lokasi tujuan",
  TRANSFER_IN: "Penerimaan transfer barang",
  TRANSFER_RETURN: "Pengembalian barang ke lokasi asal",
  TRANSFER_VARIANCE: "Selisih penerimaan transfer",
  OPNAME_CORRECTION: "Penyesuaian hasil opname",
  INITIAL_STOCK: "Pencatatan stok awal",
  POS_SALE: "Transaksi penjualan kasir",
  WASTE: "Pencatatan barang terbuang",
  DAMAGE: "Pencatatan barang rusak",
  LOSS: "Pencatatan barang hilang",
  COMPLIMENTARY: "Pemberian barang gratis",
  EXPIRED: "Pencatatan barang kedaluwarsa",
  PRODUCTION_IN: "Hasil produksi masuk stok",
  PRODUCTION_OUT: "Pemakaian bahan untuk produksi",
}

export function posStockMovementNote(orderNumber: string, includesModifier = false) {
  return `Penjualan ${orderNumber} · Pemakaian bahan sesuai resep${includesModifier ? " dan modifier" : ""}`
}

export function stockMovementPresentation(movement: MovementReference) {
  const note = movement.note?.trim()
  const id = movement.referenceId
  const shortId = id?.slice(0, 8)
  const automaticNote = Boolean(id && (
    note === id
    || (movement.type === "GOODS_IN" && note === `Penerimaan ${shortId}`)
    || (movement.type === "TRANSFER_OUT" && note === `Transfer ${shortId} dikirim`)
    || (movement.type === "OPNAME_CORRECTION" && note === `Koreksi opname ${shortId}`)
  ))
  // Teks lama selalu menyebut modifier, sehingga tidak membuktikan modifier dipakai.
  const legacyPos = movement.type === "POS_SALE" ? note?.match(/^POS (.+) \(termasuk resep modifier\)$/) : null
  const text = legacyPos ? posStockMovementNote(legacyPos[1])
    : !note || automaticNote ? DESCRIPTIONS[movement.type] ?? "Pergerakan stok" : movement.note!
  let link: { href: string; label: string } | null = null
  if (id) {
    const encodedId = encodeURIComponent(id)
    if (movement.type.startsWith("TRANSFER_")) {
      link = { href: `/dashboard/audit/transfer/${encodedId}`, label: "Lihat transfer" }
    } else if (movement.type === "GOODS_IN") {
      link = { href: `/dashboard/audit/receipt/${encodedId}`, label: "Lihat penerimaan" }
    } else if (movement.type === "OPNAME_CORRECTION") {
      link = { href: `/dashboard/audit/opname/${encodedId}`, label: "Lihat opname" }
    }
  }
  return { text, link }
}
