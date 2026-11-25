import { prisma } from "@/lib/db"
import { ownerPhone, sendWhatsApp } from "@/lib/whatsapp"
import { after } from "next/server"

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Menjadwalkan pengiriman pemberitahuan setelah respons selesai.
 *
 * Dibungkus karena `after()` menolak dipanggil di luar request, sedangkan
 * fungsi ini dipanggil dari dalam transaksi stok. Tanpa pengaman, satu skrip,
 * seed, atau pekerjaan latar yang menurunkan stok ke bawah ambang minimum akan
 * MEMBATALKAN seluruh transaksi stoknya — hanya gara-gara pemberitahuan yang
 * tidak bisa dijadwalkan.
 */
function kirimSetelahTransaksi(tugas: () => Promise<void>) {
  try {
    after(tugas)
  } catch {
    // Di luar request tidak ada yang menjalankan tugas ini, dan itu memang
    // tidak apa-apa: alert-nya sudah tersimpan di database.
  }
}

/**
 * Antrean WA stok menipis per TRANSAKSI. Satu order POS bisa menurunkan
 * beberapa bahan sekaligus; penanggung jawab cukup menerima SATU WA per lokasi
 * berisi semua bahannya, bukan satu WA per bahan.
 *
 * Kuncinya objek transaksi itu sendiri, jadi dua transaksi yang berjalan
 * bersamaan tidak saling mencampur antreannya.
 */
const antreanWa = new WeakMap<object, { orgId: string; perLokasi: Map<string, string[]> }>()

function antrekanWa(tx: Tx, orgId: string, locationId: string, alertId: string) {
  let antrean = antreanWa.get(tx)
  if (!antrean) {
    antrean = { orgId, perLokasi: new Map() }
    antreanWa.set(tx, antrean)
    const milikTransaksiIni = antrean
    kirimSetelahTransaksi(async () => {
      for (const [lokasiId, alertIds] of milikTransaksiIni.perLokasi) {
        // Hanya alert yang benar-benar tersimpan (transaksinya tidak batal).
        const tersimpan = await prisma.alert.findMany({
          where: { id: { in: alertIds }, organizationId: orgId, isResolved: false }, select: { id: true },
        })
        const ids = alertIds.filter((id) => tersimpan.some((row) => row.id === id))
        if (ids.length === 1) await kirimNotifikasiStokMenipis(orgId, ids[0], { kirimKePenanggungJawab: true })
        else if (ids.length > 1) await kirimNotifikasiStokMenipisGabungan(orgId, lokasiId, ids)
      }
    })
  }
  const daftar = antrean.perLokasi.get(locationId) ?? []
  if (!daftar.includes(alertId)) daftar.push(alertId)
  antrean.perLokasi.set(locationId, daftar)
}

export async function checkAndCreateLowStockAlert(
  tx: Tx,
  orgId: string,
  itemId: string,
  locationId: string
) {
  const bal = await tx.stockBalance.findUnique({
    where: { itemId_locationId: { itemId, locationId } },
    include: {
      item: {
        include: { locationSettings: { where: { locationId }, select: { minStock: true } } },
      },
      location: {
        select: {
          name: true, type: true, whatsappPhone: true,
          // Gudang pemasok outlet: dipakai untuk memeriksa stok tersedia.
          fulfillmentWarehouse: { select: { id: true, name: true, whatsappPhone: true, isActive: true } },
        },
      },
    },
  })
  if (!bal) return

  const perLocationMin = bal.item.locationSettings[0]?.minStock
  let minStock = perLocationMin != null ? Number(perLocationMin) : null
  const adaAmbang = minStock != null

  if (minStock == null) {
    // Bahan GUDANG tanpa ambang tetap dianggap HABIS bila stoknya 0 dan bahan
    // ini dipasok supplier di gudang ini — sama dengan aturan kebutuhan beli
    // (lib/warehouse-purchase-needs.ts). Outlet tetap wajib punya ambang.
    if (bal.location.type !== "WAREHOUSE" || Number(bal.quantity) > 0) return
    const dipetakan = await tx.itemSupplier.findFirst({ where: { organizationId: orgId, itemId, locationId }, select: { id: true } })
    if (!dipetakan) return
    minStock = 0
  }

  const qty = Number(bal.quantity)
  if (qty > minStock) return

  // Gudang yang sudah punya PO aktif untuk bahan ini sedang menunggu supplier:
  // tidak perlu peringatan/WA "isi pembelian" lagi.
  if (bal.location.type === "WAREHOUSE") {
    const poAktif = await tx.purchaseRequest.findFirst({
      where: { organizationId: orgId, itemId, locationId, status: "ACTIVE" }, select: { id: true },
    })
    if (poAktif) return
  }

  // INFO = menipis (masih ada stok), KRITIS = habis (stok 0 atau kurang).
  const habis = qty <= 0
  const severity = habis ? "CRITICAL" as const : "INFO" as const
  const judul = `Stok ${bal.item.name} ${habis ? "Habis" : "Menipis"}`
  const pesan = `Stok ${bal.item.name} di ${bal.location.name} saat ini ${qty} ${bal.item.unit}${habis ? " (HABIS)" : ""}${adaAmbang ? `, ambang minimum ${minStock} ${bal.item.unit}` : ""}. ${bal.location.type === "OUTLET" ? "Admin gudang pemenuhan diminta menindaklanjuti pengiriman atau pengadaan." : "Segera lakukan pengisian stok."}`

  const existing = await tx.alert.findFirst({
    where: { organizationId: orgId, type: "LOW_STOCK", itemId, locationId, isResolved: false },
  })
  // Episode yang masih berjalan (INFO) lalu stoknya habis: naikkan jadi KRITIS
  // pada alert yang sama dan kirim WA sekali lagi. Tidak membuat alert kedua.
  if (existing && habis && existing.severity !== "CRITICAL") {
    await tx.alert.update({ where: { id: existing.id }, data: { severity, title: judul, message: pesan } })
    antrekanWa(tx, orgId, locationId, existing.id)
    return
  }
  if (existing) {
    const used = await tx.auditLog.findFirst({ where: { organizationId: orgId, entity: "Alert", entityId: existing.id, action: "USE_NEED_LINK" }, select: { id: true } })
    if (!used) return
    const active = bal.location.type === "OUTLET"
      ? await tx.stockTransfer.findFirst({ where: { organizationId: orgId, toLocationId: locationId, status: { in: ["PENDING", "APPROVED", "SENT"] }, items: { some: { itemId } } }, select: { id: true } })
      : await tx.purchaseRequest.findFirst({ where: { organizationId: orgId, locationId, itemId, status: "ACTIVE" }, select: { id: true } })
    if (active) return
    // A later stock movement can start a new episode. Old links stay consumed.
    await tx.alert.update({ where: { id: existing.id }, data: { isResolved: true, resolvedAt: new Date() } })
  }

  const alert = await tx.alert.create({
    data: {
      organizationId: orgId,
      type: "LOW_STOCK",
      // Menipis = pemberitahuan (INFO); habis = KRITIS karena menu bisa tidak
      // dapat dijual. Selisih opname dan transfer gagal tetap kritis.
      severity,
      title: judul,
      message: pesan,
      locationId,
      itemId,
    },
  })

  antrekanWa(tx, orgId, locationId, alert.id)

  // Bila outlet menipis saat gudang memang sudah kosong secara fisik, tidak
  // ada pengiriman yang bisa diberangkatkan untuk memicu pemeriksaan gudang.
  // Pastikan episode pengadaan gudang tetap dibuat. Stok yang hanya habis
  // karena reservasi tidak masuk jalur ini; pembelian baru dipicu ketika
  // transfer tersebut benar-benar dikirim dan stok fisiknya berkurang.
  const gudang = bal.location.type === "OUTLET" && bal.location.fulfillmentWarehouse?.isActive
    ? bal.location.fulfillmentWarehouse
    : null
  if (gudang) {
    const saldoGudang = await tx.stockBalance.findUnique({
      where: { itemId_locationId: { itemId, locationId: gudang.id } },
      select: { quantity: true },
    })
    if (saldoGudang && Number(saldoGudang.quantity) <= 0) {
      await checkAndCreateLowStockAlert(tx, orgId, itemId, gudang.id)
    }
  }
}

export type HasilKirimWa = { tujuan: "GUDANG" | "OWNER" | "OUTLET" | "LOKASI"; nomor: string; ok: boolean; error: string | null }

/**
 * Mengirim WA stok menipis untuk satu alert LOW_STOCK. Dipakai saat alert
 * pertama dibuat DAN saat pengguna menekan "Kirim ulang WA" di Peringatan.
 *
 * Isi pesan dihitung ulang dari stok terkini. Setiap pengiriman dicatat di
 * audit (WA_LOW_STOCK) beserta berhasil/gagalnya, supaya halaman Peringatan
 * bisa menunjukkan apakah pesannya masuk.
 *
 * Untuk OUTLET: stok gudang yang benar-benar tersedia tetap dicantumkan, tetapi
 * pesan langsung dikirim ke penanggung jawab gudang pemenuhan. Nomor outlet
 * tidak dipakai sebagai penerima notifikasi stok menipis.
 */
export async function kirimNotifikasiStokMenipis(
  orgId: string,
  alertId: string,
  opsi: { kirimKePenanggungJawab: boolean; userId?: string },
): Promise<HasilKirimWa[]> {
  const alert = await prisma.alert.findFirst({
    where: { id: alertId, organizationId: orgId, type: "LOW_STOCK" },
    select: { itemId: true, locationId: true },
  })
  if (!alert?.itemId || !alert.locationId) return []
  const { itemId, locationId } = alert

  const bal = await prisma.stockBalance.findUnique({
    where: { itemId_locationId: { itemId, locationId } },
    include: {
      item: { include: { locationSettings: { where: { locationId }, select: { minStock: true } } } },
      location: {
        select: {
          name: true, type: true, whatsappPhone: true,
          fulfillmentWarehouse: { select: { id: true, name: true, whatsappPhone: true, isActive: true } },
        },
      },
    },
  })
  if (!bal) return []

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerPhone: true, whatsappIntegration: { select: { senderPhone: true } } },
  })
  // Nomor pengirim yang terhubung adalah nomor owner operasional. Link belanja
  // dikirim ke nomor itu sendiri; ownerPhone dan env hanya menjadi cadangan.
  const nomorOwner = organization?.whatsappIntegration?.senderPhone?.trim()
    || organization?.ownerPhone?.trim()
    || ownerPhone()
  const baseUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")
  const unit = bal.item.unit
  const qty = Number(bal.quantity)
  const minStock = bal.item.locationSettings[0]?.minStock
  const sisa = `Sisa: ${qty} ${unit}${minStock != null ? ` (minimum ${Number(minStock)} ${unit})` : ""}`
  const hasil: HasilKirimWa[] = []
  // Judul WA dibedakan: habis (kritis) vs menipis (info).
  const keadaan = qty <= 0 ? "HABIS" : "menipis"

  async function kirim(tujuan: HasilKirimWa["tujuan"], nomor: string, pesan: string) {
    const terkirim = await sendWhatsApp(orgId, nomor, pesan)
    const catatan = { tujuan, nomor, ok: terkirim.ok, error: terkirim.ok ? null : terkirim.error ?? "Gagal mengirim" }
    hasil.push(catatan)
    await prisma.auditLog.create({ data: {
      organizationId: orgId, userId: opsi.userId ?? null,
      action: "WA_LOW_STOCK", entity: "Alert", entityId: alertId, after: catatan,
    } })
  }

  if (bal.location.type !== "OUTLET") {
    // Stok gudang menipis/habis: tautan pengisian pembelian selalu dikirim ke
    // owner karena owner yang menentukan jumlah saat akan berbelanja. Nomor
    // gudang tidak dipakai untuk tindakan pengadaan ini.
    const reservasi = await prisma.stockReservation.aggregate({
      where: { organizationId: orgId, itemId, locationId, status: "ACTIVE" }, _sum: { quantity: true },
    })
    const dipesan = Number(reservasi._sum.quantity ?? 0)
    const tersedia = Math.max(0, qty - dipesan)
    const keadaanGudang = tersedia <= 0 ? "HABIS" : "menipis"
    const rincianGudang = `Gudang: ${bal.location.name}\nBahan: ${bal.item.name}\nTersedia: ${tersedia} ${unit}`
      + (dipesan > 0 ? ` (fisik ${qty}, ${dipesan} sudah untuk pengiriman outlet)` : "")
      + (minStock != null ? `\nMinimum: ${Number(minStock)} ${unit}` : "")
    if (nomorOwner) {
      const tautan = `${baseUrl}/dashboard/suppliers?view=procurement&warehouseId=${locationId}&itemId=${itemId}&alertId=${alertId}`
      await kirim("OWNER", nomorOwner,
        `[Pantau] Stok gudang ${keadaanGudang}\n\n${rincianGudang}\n\nIsi jumlah yang akan dibeli saat belanja:\n${tautan}`)
    }
    return hasil
  }

  const gudang = bal.location.fulfillmentWarehouse?.isActive ? bal.location.fulfillmentWarehouse : null
  let tersediaGudang = 0
  let rincianGudang = "\nGudang pemasok belum dipasangkan"
  if (gudang) {
    const [saldo, reservasi] = await Promise.all([
      prisma.stockBalance.findUnique({
        where: { itemId_locationId: { itemId, locationId: gudang.id } },
        select: { quantity: true },
      }),
      prisma.stockReservation.aggregate({
        where: { organizationId: orgId, itemId, locationId: gudang.id, status: "ACTIVE" },
        _sum: { quantity: true },
      }),
    ])
    const fisik = Number(saldo?.quantity ?? 0)
    const dikunci = Number(reservasi._sum.quantity ?? 0)
    tersediaGudang = Math.max(0, fisik - dikunci)
    rincianGudang = `\nTersedia di ${gudang.name}: ${tersediaGudang} ${unit}`
      + (dikunci > 0 ? ` (fisik ${fisik}, ${dikunci} sudah dialokasikan)` : "")
  }
  const rincian = `Outlet: ${bal.location.name}\nBahan: ${bal.item.name}\n${sisa}${rincianGudang}`
  const nomorGudang = gudang?.whatsappPhone?.trim() || ""
  const tautan = gudang && nomorGudang
    ? `${baseUrl}/dashboard/transfer?lowStock=${alertId}`
    : `${baseUrl}/dashboard/alerts`
  // Ambang adalah pemicu pemberitahuan, bukan jaminan stok gudang tersedia.
  // Gudang tetap harus mengetahui stok outlet menipis/habis agar dapat memilih
  // mengirim stok yang ada atau menindaklanjuti pengadaan.
  if (opsi.kirimKePenanggungJawab) {
    const penerima = nomorGudang || nomorOwner
    if (penerima) {
      const fallback = nomorGudang ? "" : `\n\nGudang pemenuhan belum memiliki nomor WhatsApp; pesan ini dikirim ke owner.`
      const tindakan = tersediaGudang > 0
        ? "Buat pengiriman dari gudang ke outlet"
        : "Stok gudang juga habis. Tindak lanjuti pengadaan"
      await kirim(nomorGudang ? "GUDANG" : "OWNER", penerima,
        `[Pantau] Stok outlet ${keadaan}\n\n${rincian}${fallback}\n\n${tindakan}:\n${tautan}`)
    }
  }
  return hasil
}


/**
 * Satu WA untuk BEBERAPA bahan yang menipis di satu lokasi dalam satu
 * transaksi. Aturan penerimanya sama dengan kirimNotifikasiStokMenipis;
 * setiap alert tetap mendapat catatan WA_LOW_STOCK sendiri supaya statusnya
 * tampil di Peringatan.
 */
export async function kirimNotifikasiStokMenipisGabungan(orgId: string, locationId: string, alertIds: string[]) {
  const alerts = await prisma.alert.findMany({
    where: { id: { in: alertIds }, organizationId: orgId, type: "LOW_STOCK", locationId },
    select: { id: true, itemId: true },
  })
  const lokasi = await prisma.location.findFirst({
    where: { id: locationId, organizationId: orgId },
    select: {
      name: true, type: true, whatsappPhone: true,
      fulfillmentWarehouse: { select: { id: true, name: true, whatsappPhone: true, isActive: true } },
    },
  })
  if (!lokasi || alerts.length === 0) return []
  const itemIds = alerts.map((a) => a.itemId!).filter(Boolean)
  const [saldo, pengaturan, reservasi] = await Promise.all([
    prisma.stockBalance.findMany({ where: { organizationId: orgId, locationId, itemId: { in: itemIds } }, include: { item: { select: { name: true, unit: true } } } }),
    prisma.inventoryLocationSetting.findMany({ where: { organizationId: orgId, locationId, itemId: { in: itemIds } }, select: { itemId: true, minStock: true } }),
    prisma.stockReservation.groupBy({ by: ["itemId"], where: { organizationId: orgId, locationId, itemId: { in: itemIds }, status: "ACTIVE" }, _sum: { quantity: true } }),
  ])
  const gudang = lokasi.type === "OUTLET" && lokasi.fulfillmentWarehouse?.isActive ? lokasi.fulfillmentWarehouse : null
  const [saldoGudang, reservasiGudang] = gudang ? await Promise.all([
    prisma.stockBalance.findMany({
      where: { organizationId: orgId, locationId: gudang.id, itemId: { in: itemIds } }, select: { itemId: true, quantity: true },
    }),
    prisma.stockReservation.groupBy({
      by: ["itemId"], where: { organizationId: orgId, locationId: gudang.id, itemId: { in: itemIds }, status: "ACTIVE" }, _sum: { quantity: true },
    }),
  ]) : [[], []]

  // Bahan HABIS ditaruh paling atas karena paling mendesak.
  const baris = alerts.map((alert) => {
    const bal = saldo.find((row) => row.itemId === alert.itemId)
    const qty = Number(bal?.quantity ?? 0)
    const min = pengaturan.find((row) => row.itemId === alert.itemId)?.minStock
    const dipesan = Number(reservasi.find((row) => row.itemId === alert.itemId)?._sum.quantity ?? 0)
    const stokGudang = Number(saldoGudang.find((row) => row.itemId === alert.itemId)?.quantity ?? 0)
    const dikunciGudang = Number(reservasiGudang.find((row) => row.itemId === alert.itemId)?._sum.quantity ?? 0)
    return { alertId: alert.id, itemId: alert.itemId!, nama: bal?.item.name ?? "Bahan", unit: bal?.item.unit ?? "", qty, min: min == null ? null : Number(min), dipesan,
      stokGudang, tersediaGudang: Math.max(0, stokGudang - dikunciGudang), dikunciGudang }
  }).sort((a, b) => Number(a.qty > 0) - Number(b.qty > 0) || a.nama.localeCompare(b.nama))

  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { ownerPhone: true, whatsappIntegration: { select: { senderPhone: true } } },
  })
  const nomorOwner = organization?.whatsappIntegration?.senderPhone?.trim()
    || organization?.ownerPhone?.trim()
    || ownerPhone()
  const baseUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")
  const hasil: HasilKirimWa[] = []

  async function kirim(tujuan: HasilKirimWa["tujuan"], nomor: string, pesan: string, alertTujuan = baris.map((b) => b.alertId)) {
    const terkirim = await sendWhatsApp(orgId, nomor, pesan)
    const catatan = { tujuan, nomor, ok: terkirim.ok, error: terkirim.ok ? null : terkirim.error ?? "Gagal mengirim", gabungan: baris.length }
    hasil.push(catatan)
    for (const alertId of alertTujuan) {
      await prisma.auditLog.create({ data: {
        organizationId: orgId, action: "WA_LOW_STOCK", entity: "Alert", entityId: alertId, after: catatan,
      } })
    }
  }

  if (lokasi.type !== "OUTLET") {
    const daftar = baris.map((b) => {
      const tersedia = Math.max(0, b.qty - b.dipesan)
      return `• ${b.nama}: tersedia ${tersedia} ${b.unit}${tersedia <= 0 ? " (HABIS)" : ""}${b.min != null ? ` · min ${b.min}` : ""}`
    })
    const jumlahHabis = baris.filter((b) => b.qty - b.dipesan <= 0).length
    // Sama seperti notifikasi satu bahan: form pembelian adalah tindakan owner,
    // termasuk ketika beberapa kebutuhan digabung dalam satu pesan.
    if (nomorOwner) {
      const pertama = baris[0]
      const tautan = `${baseUrl}/dashboard/suppliers?view=procurement&warehouseId=${locationId}&itemId=${pertama.itemId}&alertId=${pertama.alertId}`
      await kirim("OWNER", nomorOwner,
        `[Pantau] Stok gudang: ${ringkasKeadaan(jumlahHabis, baris.length)}\n\nGudang: ${lokasi.name}\n${daftar.join("\n")}`
        + `\n\nIsi jumlah yang akan dibeli saat belanja (bahan dari supplier yang sama bisa dipesan sekaligus):\n${tautan}`)
    }
    return hasil
  }

  const daftar = baris.map((b) => `• ${b.nama}: outlet ${b.qty} ${b.unit}${b.qty <= 0 ? " (HABIS)" : ""}${b.min != null ? ` · ambang ${b.min}` : ""} · gudang tersedia ${b.tersediaGudang}`)
  const jumlahHabis = baris.filter((b) => b.qty <= 0).length
  const kepala = `[Pantau] Stok outlet: ${ringkasKeadaan(jumlahHabis, baris.length)}\n\nOutlet: ${lokasi.name}${gudang ? `\nDipasok dari: ${gudang.name}` : ""}\n${daftar.join("\n")}`
  const nomorGudang = gudang?.whatsappPhone?.trim() || ""
  const tautan = gudang && nomorGudang
    ? `${baseUrl}/dashboard/transfer?lowStock=${baris.map((b) => b.alertId).join(",")}`
    : `${baseUrl}/dashboard/alerts`
  const penerima = nomorGudang || nomorOwner
  if (penerima) {
    const fallback = nomorGudang ? "" : `\n\nGudang pemenuhan belum memiliki nomor WhatsApp; pesan ini dikirim ke owner.`
    await kirim(nomorGudang ? "GUDANG" : "OWNER", penerima,
      `${kepala}${fallback}\n\nTindak lanjuti pengiriman atau pengadaan:\n${tautan}`,
      baris.map((b) => b.alertId))
  }
  return hasil
}

function ringkasKeadaan(jumlahHabis: number, total: number) {
  const menipis = total - jumlahHabis
  return [jumlahHabis ? `${jumlahHabis} bahan HABIS` : "", menipis ? `${menipis} bahan menipis` : ""].filter(Boolean).join(", ")
}
