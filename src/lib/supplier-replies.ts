export type SupplierReplyCommand = "READY" | "PARTIAL" | "SHIPPED" | "UNAVAILABLE"

export type ParsedSupplierReply = {
  orderCode: string
  command: SupplierReplyCommand
  quantity: number | null
  /// Satuan yang ditulis supplier, apa adanya. Kosong berarti supplier tidak
  /// menyebut satuan, dan jumlahnya ditafsirkan memakai satuan pesanan.
  unit: string | null
}

export type SupplierOrderMessageInput = {
  supplierName: string
  organizationName: string
  orderCode: string
  destinationName: string
  itemName: string
  /// Jumlah dan satuan yang dilihat supplier — boleh satuan kemasan.
  quantity: number
  unit: string
  /// Jumlah dalam satuan dasar, ditampilkan sebagai keterangan bila berbeda.
  baseQuantity?: number
  baseUnit?: string
  context?: string
}

const COMMANDS: Record<string, SupplierReplyCommand> = {
  READY: "READY",
  TERSEDIA: "READY",
  SEBAGIAN: "PARTIAL",
  PARTIAL: "PARTIAL",
  KIRIM: "SHIPPED",
  DIKIRIM: "SHIPPED",
  KOSONG: "UNAVAILABLE",
}

export function formatSupplierOrderMessage(input: SupplierOrderMessageInput) {
  const context = input.context?.trim()
  return [
    `Halo *${input.supplierName}*, berikut permintaan pembelian dari *${input.organizationName}*:`,
    "",
    `*Kode pesanan:* ${input.orderCode}`,
    `*Tujuan:* ${input.destinationName}`,
    `*Bahan:* ${input.itemName}`,
    `*Jumlah diminta:* ${input.quantity} ${input.unit}`
      + (input.baseQuantity != null && input.baseUnit && input.baseUnit !== input.unit
        ? ` (= ${input.baseQuantity} ${input.baseUnit})` : ""),
    ...(context ? [`*Catatan:* ${context}`] : []),
    "",
    "Mohon konfirmasi dengan membalas salah satu format berikut dalam satu baris:",
    "",
    `${input.orderCode} READY ${input.quantity} ${input.unit.toUpperCase()}`,
    `${input.orderCode} SEBAGIAN [jumlah tersedia] ${input.unit.toUpperCase()}`,
    `${input.orderCode} KOSONG 0`,
    "",
    "Jika barang sudah dikirim, balas:",
    `${input.orderCode} KIRIM [jumlah dikirim] ${input.unit.toUpperCase()}`,
    "",
    `Satuan boleh tidak ditulis — jumlah tanpa satuan dianggap dalam ${input.unit}.`,
    "Pastikan kode pesanan, status, dan jumlah tidak diubah agar balasan dapat dibaca otomatis.",
    "",
    "Terima kasih.",
  ].join("\n")
}

export function extractSupplierOrderCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  return value.trim().toUpperCase().match(/\b(?:PO|PB)-[A-Z0-9-]+\b/)?.[0] ?? null
}

export function parseSupplierReply(value: unknown): ParsedSupplierReply | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ")
  // Satuan opsional di belakang jumlah, mis. "PO-001 READY 2 BOX".
  const match = normalized.match(/\b((?:PO|PB)-[A-Z0-9-]+)\s+(READY|TERSEDIA|SEBAGIAN|PARTIAL|KIRIM|DIKIRIM|KOSONG)(?:\s+([0-9]+(?:[.,][0-9]{1,3})?))?(?:\s+([A-Z]{1,12}))?\b/)
  if (!match) return null

  const command = COMMANDS[match[2]]
  const quantity = match[3] == null ? null : Number(match[3].replace(",", "."))
  const unit = match[4] ? match[4].toLowerCase() : null
  if (!command || (quantity != null && !Number.isFinite(quantity))) return null
  if (command === "UNAVAILABLE") return quantity == null || quantity === 0 ? { orderCode: match[1], command, quantity: null, unit } : null
  if (quantity != null && quantity <= 0) return null
  if (quantity == null) return null
  return { orderCode: match[1], command, quantity, unit }
}

export type SupplierReplyStatus =
  | "WAITING" | "READY" | "PARTIAL" | "SHIPPED" | "UNAVAILABLE" | "NEEDS_REVIEW"

export type PurchaseReplyState = {
  supplierReplyStatus: SupplierReplyStatus
  promisedQuantity: number | null
  shippedQuantity: number | null
}

export type SupplierReplyOutcome = {
  /** APPLIED = fakta baru dicatat. NEEDS_REVIEW = balasan tidak masuk akal. */
  outcome: "APPLIED" | "NEEDS_REVIEW"
  supplierReplyStatus: SupplierReplyStatus
  promisedQuantity: number | null
  shippedQuantity: number | null
  /** Waktu balasan dipakai untuk kolom ini bila bernilai true. */
  confirmed: boolean
  shipped: boolean
  note: string
}

/**
 * Menentukan perubahan yang boleh diterapkan sebuah balasan supplier.
 *
 * Tiga hal yang dijaga di sini:
 *
 * 1. Janji dan pengiriman adalah dua fakta terpisah. READY/SEBAGIAN mengisi
 *    `promisedQuantity`, KIRIM mengisi `shippedQuantity`. KIRIM tidak pernah
 *    menimpa janji, supaya selisih antara yang dijanjikan dan yang benar-benar
 *    dikirim tetap terlihat.
 * 2. SHIPPED tidak dapat turun. Barang yang sudah berangkat adalah kejadian
 *    fisik; balasan READY yang telat sampai tidak boleh menariknya kembali.
 *    Jumlah yang dibawanya tetap dicatat, hanya statusnya yang dipertahankan.
 * 3. Jumlah yang melebihi pesanan tidak pernah diterapkan diam-diam. Itu bisa
 *    berarti supplier salah ketik atau salah pesanan, jadi diserahkan ke
 *    manusia lewat NEEDS_REVIEW.
 */
export function applySupplierReply(
  current: PurchaseReplyState,
  reply: ParsedSupplierReply,
  orderedQuantity: number,
): SupplierReplyOutcome {
  const unchanged = {
    promisedQuantity: current.promisedQuantity,
    shippedQuantity: current.shippedQuantity,
    confirmed: false,
    shipped: false,
  }

  if (reply.quantity != null && reply.quantity > orderedQuantity) {
    return {
      ...unchanged,
      outcome: "NEEDS_REVIEW",
      // Statusnya hanya turun kalau pesanannya memang belum punya kemajuan.
      supplierReplyStatus: bolehTurunKarenaBalasanJanggal(current.supplierReplyStatus)
        ? "NEEDS_REVIEW" : current.supplierReplyStatus,
      note: `Jumlah balasan ${reply.quantity} melebihi pesanan ${orderedQuantity}`,
    }
  }

  const changes = { ...unchanged }
  let candidate: SupplierReplyStatus

  if (reply.command === "UNAVAILABLE") {
    candidate = "UNAVAILABLE"
    // Janji sebelumnya gugur begitu supplier menyatakan stoknya kosong —
    // kecuali barangnya sudah telanjur berangkat, yang ditangani di bawah.
    if (current.supplierReplyStatus !== "SHIPPED") changes.promisedQuantity = null
  } else if (reply.command === "SHIPPED") {
    // Ditimpa, bukan ditambahkan: webhook yang masuk dua kali untuk pengiriman
    // yang sama harus tetap menghasilkan jumlah yang sama.
    changes.shippedQuantity = reply.quantity
    changes.shipped = true
    candidate = "SHIPPED"
  } else {
    changes.promisedQuantity = reply.quantity
    changes.confirmed = true
    candidate = reply.quantity != null && reply.quantity < orderedQuantity ? "PARTIAL" : "READY"
  }

  const keepShipped = current.supplierReplyStatus === "SHIPPED" && candidate !== "SHIPPED"
  const supplierReplyStatus = keepShipped ? "SHIPPED" : candidate

  return {
    ...changes,
    outcome: "APPLIED",
    supplierReplyStatus,
    note: keepShipped
      ? `Balasan ${candidate} diterima setelah barang dikirim; status tetap SHIPPED`
      : `Balasan ${candidate} diterapkan`,
  }
}

export type UnitSnapshot = {
  /// Satuan yang dipakai saat pesanan dibuat, mis. "box".
  inputUnit: string | null
  /// Berapa satuan dasar dalam satu satuan pesanan, saat itu.
  conversionFactor: number | null
  /// Satuan dasar bahan, mis. "pcs".
  baseUnit: string | null
}

export type ResolvedReplyQuantity =
  | { ok: true; baseQuantity: number | null }
  | { ok: false; reason: string }

/**
 * Menerjemahkan jumlah pada balasan supplier menjadi satuan dasar.
 *
 * Yang dipakai adalah snapshot milik PESANAN, bukan konfigurasi bahan yang
 * berlaku sekarang. Pesanan "2 box" dengan 1 box = 20 pcs tetap berarti 40 pcs
 * walau master kemudian diubah menjadi 25 — supplier menjawab pesanan yang
 * dia terima, bukan pesanan versi baru.
 *
 * Satuan yang tidak dikenali tidak pernah ditebak: lebih baik ditinjau manusia
 * daripada salah mencatat jumlah barang.
 */
export function resolveReplyQuantity(
  reply: ParsedSupplierReply,
  snapshot: UnitSnapshot,
): ResolvedReplyQuantity {
  if (reply.quantity == null) return { ok: true, baseQuantity: null }

  const faktor = snapshot.conversionFactor == null ? 1 : Number(snapshot.conversionFactor)
  const satuanPesanan = snapshot.inputUnit?.toLowerCase() ?? null
  const satuanDasar = snapshot.baseUnit?.toLowerCase() ?? null

  // Tanpa satuan: pakai satuan pesanan, persis seperti yang tertulis di pesan
  // yang dikirim ke supplier.
  if (!reply.unit) return { ok: true, baseQuantity: reply.quantity * faktor }

  const ditulis = reply.unit.toLowerCase()
  if (satuanPesanan && ditulis === satuanPesanan) {
    return { ok: true, baseQuantity: reply.quantity * faktor }
  }
  if (satuanDasar && ditulis === satuanDasar) {
    return { ok: true, baseQuantity: reply.quantity }
  }
  return {
    ok: false,
    reason: `Satuan "${reply.unit}" pada balasan tidak sesuai pesanan`
      + `${satuanPesanan ? ` (${satuanPesanan}` : ""}${satuanDasar && satuanDasar !== satuanPesanan ? ` atau ${satuanDasar}` : ""}${satuanPesanan ? ")" : ""}`,
  }
}

/**
 * Obrolan biasa: pesan yang tidak memuat perintah apa pun.
 *
 * Supplier sering menulis "gmn mn" atau "udah belum" setelah menjawab dengan
 * benar. Pesan seperti itu tidak mengaku apa-apa, jadi tidak boleh mengubah
 * status pesanan yang sudah punya kemajuan. Dari WAITING statusnya tetap boleh
 * berubah, karena di situ NEEDS_REVIEW justru memberi tahu bahwa ada balasan
 * masuk yang tidak terbaca.
 */
export function bolehTurunKarenaObrolan(current: SupplierReplyStatus) {
  return current === "WAITING" || current === "NEEDS_REVIEW"
}

/**
 * Balasan yang TERBACA tetapi tidak masuk akal — jumlahnya melebihi pesanan,
 * atau satuannya asing.
 *
 * Berbeda dari obrolan biasa: di sini supplier benar-benar mengaku sesuatu
 * yang janggal, dan itu memang perlu ditinjau manusia. Satu-satunya yang
 * dilindungi adalah SHIPPED, karena barangnya sudah di jalan — menurunkannya
 * akan menyembunyikan kiriman yang sedang ditunggu.
 */
export function bolehTurunKarenaBalasanJanggal(current: SupplierReplyStatus) {
  return current !== "SHIPPED"
}

/**
 * Apakah pesan ini setidaknya BERMAKSUD menjadi balasan pesanan?
 *
 * Supplier sering mengobrol di nomor yang sama: "gmn mn", "udah belum",
 * "makasih". Pesan seperti itu tidak menyebut kode pesanan dan tidak memuat
 * perintah apa pun, jadi tidak boleh dipasangkan ke pesanan mana pun — sekali
 * dipasangkan, ia menimpa catatan balasan terakhir dan membuat pesanan yang
 * sehat terlihat bermasalah.
 *
 * Yang masih dianggap balasan adalah pesan yang memuat salah satu kata
 * perintah, walau kode pesanannya lupa ditulis. Itu memang perlu ditinjau
 * manusia, bukan diabaikan.
 */
export function sepertiBalasanSupplier(value: unknown) {
  if (typeof value !== "string") return false
  const normalized = value.trim().toUpperCase()
  if (extractSupplierOrderCode(normalized)) return true
  return Object.keys(COMMANDS).some((kata) => new RegExp(`\\b${kata}\\b`).test(normalized))
}


// ─── Pesanan banyak bahan (Tahap 1) ──────────────────────────────────────────

export type PurchaseOrderLineForMessage = {
  /// Nama bahan seperti yang dikenal supplier (dari pemetaan), atau nama Pantau.
  name: string
  quantity: number
  unit: string
}

/** Petunjuk jawaban standar, sama di WA pesanan dan balasan otomatis. */
export const BARIS_JAWABAN_STANDAR = "Balas: *1* siap semua · *2 [jumlah]* sebagian · *3* kosong · *4* sudah dikirim · *5* minta bayar dulu"

/** Batas baris per WA. Pesanan lebih panjang dipecah jadi beberapa WA berurutan. */
export const ORDER_LINES_PER_MESSAGE = 30

function salamWaktu(now = new Date()) {
  const jam = Number(new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" }).format(now))
  if (jam < 11) return "Selamat pagi"
  if (jam < 15) return "Selamat siang"
  if (jam < 18) return "Selamat sore"
  return "Selamat malam"
}

const angkaPesan = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 3 })

/**
 * WA pesanan bergaya manusia: semua bahan ditulis di chat (tanpa tautan),
 * dengan kode pendek dan jawaban standar singkat di akhir. Mengembalikan satu
 * WA, atau beberapa WA berurutan bila bahannya lebih dari ORDER_LINES_PER_MESSAGE.
 */
export function formatPurchaseOrderMessages(input: {
  supplierName: string
  organizationName: string
  destinationName: string
  shortCode: string
  lines: PurchaseOrderLineForMessage[]
  notes?: string | null
  now?: Date
}): string[] {
  const potongan: PurchaseOrderLineForMessage[][] = []
  for (let i = 0; i < input.lines.length; i += ORDER_LINES_PER_MESSAGE) {
    potongan.push(input.lines.slice(i, i + ORDER_LINES_PER_MESSAGE))
  }
  const total = potongan.length
  return potongan.map((baris, index) => {
    const bagian = total > 1 ? ` (bagian ${index + 1}/${total})` : ""
    const daftar = baris.map((line) => `• ${line.name} ${angkaPesan(line.quantity)} ${line.unit}`)
    const terakhir = index === total - 1
    return [
      `${salamWaktu(input.now)}, ${input.supplierName}. Order kirim ke *${input.destinationName} (${input.organizationName})*${bagian}:`,
      ...daftar,
      ...(terakhir && input.notes?.trim() ? ["", `Catatan: ${input.notes.trim()}`] : []),
      ...(terakhir ? [
        "",
        `Kode: #${input.shortCode}`,
        BARIS_JAWABAN_STANDAR,
        "Terima kasih 🙏",
      ] : []),
    ].join("\n")
  })
}

export type ParsedOrderReply = {
  /// Kode pendek yang ditulis supplier (tanpa "#"), atau null bila tidak ada.
  shortCode: string | null
  command: SupplierReplyCommand
  /// Jumlah hanya untuk "sebagian" (2 [jumlah]) atau "dikirim [jumlah]".
  quantity: number | null
  /// true bila dijawab dengan angka standar (1–4): jawaban paling pasti.
  viaAngka?: boolean
}

// ── Kosakata balasan supplier ────────────────────────────────────────────────
// Ditulis dalam bentuk dasar; huruf berulang dirapatkan saat dibandingkan
// ("siappp" = "siap", "okee" = "oke"), jadi tidak perlu menulis setiap variasi.

/// Stok tidak ada. Diperiksa SEBELUM kata siap: "tidak ada" ≠ "ada".
const FRASA_KOSONG = [
  "KOSONG", "HABIS", "ABIS", "SOLD OUT", "OUT OF STOCK", "TIDAK TERSEDIA", "STOK KOSONG",
  "TIDAK ADA", "TDK ADA", "GAK ADA", "GA ADA", "GK ADA", "NGGAK ADA", "ENGGAK ADA", "NDAK ADA", "TAK ADA", "BELUM ADA", "BLM ADA",
  "LAGI KOSONG", "LG KOSONG", "LAGI HABIS", "LG HABIS",
]
/// Belum pasti / menolak / minta waktu: tidak pernah diterapkan otomatis.
const FRASA_RAGU = [
  "BELUM SIAP", "BLM SIAP", "TIDAK SIAP", "GAK SIAP", "GA SIAP",
  "BELUM BISA", "BLM BISA", "TIDAK BISA", "TDK BISA", "GAK BISA", "GA BISA", "GK BISA", "NGGAK BISA", "ENGGAK BISA", "NDAK BISA", "TAK BISA",
  "TIDAK SANGGUP", "GAK SANGGUP", "BELUM SANGGUP", "MAAF", "SORRY", "CEK DULU", "DICEK DULU", "SAYA CEK", "KAMI CEK", "TANYA DULU",
  "KONFIRMASI DULU", "NANTI DIKABARI", "SAYA KABARI", "KAMI KABARI", "DIKABARI", "TUNGGU", "SEBENTAR", "BENTAR", "MUNGKIN",
  "KAYAKNYA", "SEPERTINYA", "BELUM TAHU", "BELUM TAU", "GAK TAU", "GA TAU",
]
/// Barang SUDAH berangkat.
const FRASA_SUDAH_KIRIM = [
  "SUDAH DIKIRIM", "UDAH DIKIRIM", "UDH DIKIRIM", "SDH DIKIRIM", "TELAH DIKIRIM", "BARUSAN DIKIRIM", "BARU DIKIRIM",
  "SUDAH KIRIM", "UDAH KIRIM", "UDH KIRIM", "SDH KIRIM", "SUDAH DIANTAR", "UDAH DIANTAR", "SEDANG DIANTAR", "LAGI DIANTAR",
  "SUDAH JALAN", "UDAH JALAN", "LAGI JALAN", "LAGI DI JALAN", "DI JALAN", "DALAM PERJALANAN", "SUDAH BERANGKAT", "UDAH BERANGKAT",
  "OTW", "ON THE WAY", "MELUNCUR", "TERKIRIM", "SUDAH OTW", "KURIR JALAN", "SUDAH SAMPAI", "UDAH SAMPAI",
]
/// "kirim/dikirim" tanpa penanda waktu dianggap sudah dikirim (jawaban standar
/// "4 sudah dikirim"), KECUALI disertai waktu yang akan datang → artinya siap.
const KATA_KIRIM = ["KIRIM", "DIKIRIM", "DIANTAR", "ANTAR"]
const PENANDA_NANTI = ["BESOK", "NANTI", "LUSA", "PAGI", "SIANG", "SORE", "MALAM", "JAM", "AKAN", "MAU", "SEGERA", "HARI INI", "MINGGU DEPAN", "SIAP KIRIM", "BISA KIRIM", "BISA DIKIRIM", "INSYAALLAH", "INSYA ALLAH"]
/// Sebagian: wajib ada tepat satu angka ("cuma ada 20", "tinggal 15").
const KATA_SEBAGIAN = ["SEBAGIAN", "PARTIAL", "CUMA", "CUMAN", "CMN", "HANYA", "TINGGAL", "SISA", "SISANYA", "MAKSIMAL", "MAX", "PALING"]
/// Mengiyakan dengan jelas, boleh muncul di kalimat apa pun.
const FRASA_SIAP_KUAT = [
  "SIAP", "READY", "SANGGUP", "TERSEDIA", "PROSES", "DIPROSES", "DIPROSESKAN", "DISIAPKAN", "SIAPKAN", "DISIAPIN", "SIAPIN",
  "LAKSANAKAN", "ACC", "DEAL", "KONFIRM", "CONFIRM", "TERKONFIRMASI", "DICATAT", "NOTED", "ORDER DITERIMA", "PESANAN DITERIMA",
  "ORDERAN DITERIMA", "STOK ADA", "BARANG ADA", "ADA STOK", "ADA BARANG", "ADA SEMUA", "LENGKAP", "AMAN",
]
/// Mengiyakan tetapi umum ("ya", "ok", "bisa"): hanya dihitung bila pesannya
/// MEMANG sekadar mengiyakan. "gmn ya" atau "ok tapi…" tidak ikut.
const KATA_SIAP_LEMAH = [
  "OK", "OKE", "OKEY", "OKAY", "OCE", "OKELAH", "SIP", "BAIK", "BAIKLAH", "BISA", "BOLEH", "ADA", "YA", "IYA", "Y", "YOI", "YUP",
  "NGGIH", "INGGIH", "GAS", "MANTAP", "BERES", "SEGERA", "INSYAALLAH", "INSYA", "ALLAH", "DITUNGGU", "LANJUT", "JADI",
]
/// Kata pengisi yang boleh menemani kata lemah ("ok pak makasih").
const KATA_PENGISI = [
  "PAK", "BU", "BAPAK", "IBU", "KAK", "KAKAK", "BOS", "BOSS", "MAS", "MBAK", "MBA", "BANG", "DIK", "GAN", "SIS", "BRO", "TEH", "AA",
  "TERIMA", "KASIH", "TERIMAKASIH", "MAKASIH", "MAKASI", "THANKS", "THANK", "YOU", "THX", "TQ", "SAMA", "SAMA2",
  "SAYA", "KAMI", "AKU", "DULU", "YAH", "DEH", "SIH", "KOK", "NIH", "TUH", "AJA", "SAJA", "LAH", "KAN", "NYA", "YG", "YANG", "DAN",
  "SEMUA", "SEMUANYA", "PESANAN", "PESANANNYA", "ORDER", "ORDERAN", "ORDERANNYA", "NYA", "INI", "ITU", "SUDAH", "UDAH", "UDH", "SDH",
]

/** Huruf berulang dirapatkan dan emoji persetujuan diterjemahkan ke kata. */
function rapikan(value: string) {
  return value.toUpperCase()
    .replace(/[👍👌✅🆗]/gu, " OK ")
    .replace(/[🙏]/gu, " MAKASIH ")
    .replace(/[.,!?;:()"'*_~]+/g, " ")
    .replace(/([A-Z])\1+/g, "$1")
    .replace(/\s+/g, " ").trim()
}
const RAPI = (daftar: string[]) => [...new Set(daftar.map(rapikan))]
const D_KOSONG = RAPI(FRASA_KOSONG), D_RAGU = RAPI(FRASA_RAGU), D_SUDAH_KIRIM = RAPI(FRASA_SUDAH_KIRIM)
const D_KIRIM = RAPI(KATA_KIRIM), D_NANTI = RAPI(PENANDA_NANTI), D_SEBAGIAN = RAPI(KATA_SEBAGIAN)
const D_SIAP_KUAT = RAPI(FRASA_SIAP_KUAT), D_SIAP_LEMAH = new Set(RAPI(KATA_SIAP_LEMAH)), D_PENGISI = new Set(RAPI(KATA_PENGISI))
const memuat = (teks: string, daftar: string[]) => daftar.some((frasa) => new RegExp(`(^|\\s)${frasa}(\\s|$)`).test(teks))

/**
 * Membaca balasan supplier untuk pesanan banyak bahan (jawaban standar).
 *
 * Diterima: angka 1–4 ("1", "2 30", "3", "4"), atau kata standar (siap/ok/baik,
 * sebagian [jumlah], kosong/habis, kirim/sudah dikirim), dengan atau tanpa kode
 * pendek ("#DBE6 1"). Pesan yang memuat dua arti sekaligus, atau tidak memuat
 * jawaban standar, mengembalikan null — tidak pernah ditebak.
 */
export function parseOrderReply(value: unknown): ParsedOrderReply | null {
  if (typeof value !== "string") return null
  const teks = value.trim().toUpperCase().replace(/[.,!?;:]+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim()
  if (!teks) return null
  // Format lama dengan kode PO per bahan ditangani parseSupplierReply.
  if (extractSupplierOrderCode(teks)) return null

  let sisa = teks
  let shortCode: string | null = null
  const kode = sisa.match(/#\s?([0-9A-F]{4,6})\b/)
  if (kode) {
    shortCode = kode[1]
    sisa = sisa.replace(kode[0], " ").replace(/\s+/g, " ").trim()
  }

  // Angka saja: "1", "2 30", "3", "4", "4 300" (boleh diikuti satuan).
  const angka = sisa.match(/^([1-4])(?:\s+([0-9]+(?:[.,][0-9]{1,3})?))?(?:\s+[A-Z]{1,12})?$/)
  if (angka) {
    const jumlah = angka[2] == null ? null : Number(angka[2].replace(",", "."))
    const command = ({ "1": "READY", "2": "PARTIAL", "3": "UNAVAILABLE", "4": "SHIPPED" } as const)[angka[1] as "1" | "2" | "3" | "4"]
    if (command === "PARTIAL" && (jumlah == null || !(jumlah > 0))) return null
    if ((command === "READY" || command === "UNAVAILABLE") && jumlah != null) return null
    return { shortCode, command, quantity: jumlah, viaAngka: true }
  }

  const isi = rapikan(sisa)
  if (!isi) return null
  const angkaDiPesan = isi.match(/\b([0-9]+(?:[.,][0-9]{1,3})?)\b/g) ?? []
  const jumlah = angkaDiPesan.length === 1 ? Number(angkaDiPesan[0].replace(",", ".")) : null

  // Urutan penting: ragu → kosong → sebagian → kirim → siap.
  if (memuat(isi, D_RAGU)) return null
  const kosong = memuat(isi, D_KOSONG)
  // "habis" + kata siap ("ok tapi coklat habis") = dua arti → ditinjau manusia.
  const tanpaKosong = D_KOSONG.reduce((t, frasa) => t.replace(new RegExp(`(^|\\s)${frasa}(?=\\s|$)`, "g"), " "), isi).replace(/\s+/g, " ").trim()
  const sebagian = memuat(isi, D_SEBAGIAN)
  if (kosong) {
    if (sebagian || memuat(tanpaKosong, D_SIAP_KUAT) || memuat(tanpaKosong, [...D_SIAP_LEMAH])) return null
    return { shortCode, command: "UNAVAILABLE", quantity: null }
  }
  if (sebagian) {
    if (jumlah == null || !(jumlah > 0)) return null
    return { shortCode, command: "PARTIAL", quantity: jumlah }
  }
  const sudahKirim = memuat(isi, D_SUDAH_KIRIM)
  const kirim = memuat(isi, D_KIRIM)
  if (sudahKirim || (kirim && !memuat(isi, D_NANTI))) {
    return { shortCode, command: "SHIPPED", quantity: jumlah }
  }
  // "besok dikirim", "siap kirim sore" → disanggupi, belum berangkat.
  if (kirim) return { shortCode, command: "READY", quantity: null }
  if (memuat(isi, D_SIAP_KUAT)) return { shortCode, command: "READY", quantity: null }
  // Kata umum hanya bila SELURUH pesan berisi kata mengiyakan/pengisi.
  // Kata waktu saja ("besok ya") belum tentu siap → ditinjau manusia.
  const kata = isi.split(" ")
  const adaLemah = kata.some((k) => D_SIAP_LEMAH.has(k))
  const semuaDikenal = kata.every((k) => D_SIAP_LEMAH.has(k) || D_PENGISI.has(k))
  if (adaLemah && semuaDikenal) return { shortCode, command: "READY", quantity: null }
  return null
}


// ─── Pembaca balasan fleksibel (Tahap 2) ─────────────────────────────────────
//
// "Fleksibel di depan, tegas di belakang": semua pesan supplier diterima dan
// digolongkan, tetapi hanya golongan yang PASTI yang boleh diterapkan otomatis.
// Fungsi di sini murni (tanpa database) supaya mudah diuji.

export type JenisLampiran = "DOKUMEN" | "FOTO" | "SUARA" | "LAIN"

export type BahanDisebut = {
  lineId: string
  command: "PARTIAL" | "UNAVAILABLE"
  /// Angka seperti ditulis supplier (biasanya satuan beli, mis. "1 dus").
  quantity: number | null
}

export type KlasifikasiBalasan =
  | { kind: "LAMPIRAN"; jenis: JenisLampiran; shortCode: string | null }
  | { kind: "STANDAR"; reply: ParsedOrderReply }
  | { kind: "SEBUT_BAHAN"; bahan: BahanDisebut[]; sisanya: "READY" | null; shortCode: string | null }
  | { kind: "BAYAR"; nominal: number | null; shortCode: string | null }
  | { kind: "TANYA"; shortCode: string | null }
  | { kind: "BASA_BASI"; shortCode: string | null }
  | { kind: "TAK_DIKENAL"; shortCode: string | null }

const KATA_BAYAR = ["TRANSFER", "TF", "BAYAR", "DIBAYAR", "PEMBAYARAN", "REKENING", "REK", "DP", "LUNAS", "TAGIHAN", "INVOICE", "NOTA", "TOTAL", "CASH", "COD"]
const KATA_TIDAK_ADA = ["KOSONG", "HABIS", "GAK ADA", "GA ADA", "NGGAK ADA", "TIDAK ADA", "TDK ADA", "LAGI KOSONG"]
const AWAL_TANYA = /^(APA|APAKAH|BERAPA|KAPAN|MERK|MEREK|MAU|BISA|GIMANA|BAGAIMANA|YANG MANA|UKURAN|JADI|BOLEH|DIMANA|DI MANA|KOK)\b/
const BASA_BASI = /^((TERIMA ?KASIH|TERIMAKASIH|MAKASIH|MAKASI|THANKS?|THX|TQ|SAMA[- ]?SAMA|SAMSAM|ASSALAMU.?ALAIKUM|WA.?ALAIKUM.?SALAM|SELAMAT (PAGI|SIANG|SORE|MALAM)|PAGI|SIANG|SORE|MALAM|HALO|HALLO|HAI|HI|PAK|BU|KAK|BOS|MAS|MBA|MBAK|YA|IYA|NGGIH|SIP|SIPP+)\s*)+$/

/** Kata penting dari nama bahan untuk dicocokkan di chat ("Coklat Bubuk" → coklat, bubuk). */
function kataNama(nama: string) {
  const umum = new Set(["SEGAR", "BESAR", "KECIL", "ISI", "PACK", "SLICE", "BUBUK", "CAIR", "BEKU", "SPESIAL"])
  return nama.toUpperCase().split(/[^A-Z0-9]+/).filter((kata) => kata.length >= 4 && !umum.has(kata) && !/^\d/.test(kata))
}

function ambilNominal(teks: string): number | null {
  // "1.250.000", "1,25jt", "1250000", "Rp 1.250.000", "500rb"
  const jt = teks.match(/(\d+(?:[.,]\d+)?)\s*(JT|JUTA)\b/)
  if (jt) return Math.round(Number(jt[1].replace(",", ".")) * 1_000_000)
  const rb = teks.match(/(\d+(?:[.,]\d+)?)\s*(RB|RIBU|K)\b/)
  if (rb) return Math.round(Number(rb[1].replace(",", ".")) * 1_000)
  const besar = teks.match(/\d{1,3}(?:[.,]\d{3})+|\d{5,}/)
  return besar ? Number(besar[0].replace(/[.,]/g, "")) : null
}

/**
 * Menggolongkan satu pesan supplier. `lines` adalah bahan aktif pada pesanan
 * yang dituju (bila diketahui), dipakai untuk mengenali "coklat cuma 1 dus".
 * Golongan selain STANDAR tidak pernah diterapkan otomatis.
 */
export function klasifikasiBalasan(
  input: { message: string; type?: string | null; url?: string | null; fileName?: string | null },
  lines: Array<{ id: string; names: string[] }> = [],
): KlasifikasiBalasan {
  const mentah = input.message.trim()
  const teks = mentah.toUpperCase().replace(/\s+/g, " ")
  const kode = teks.match(/#\s?([0-9A-F]{4,6})\b/)
  const shortCode = kode ? kode[1] : null
  const tanpaKode = (kode ? teks.replace(kode[0], " ") : teks).replace(/\s+/g, " ").trim()

  // 1. Lampiran: file, foto, atau voice note (Fonnte menulis "non-text message").
  const jenisFonnte = (input.type ?? "").toLowerCase()
  const lampiran = Boolean(input.url) || /NON-TEXT MESSAGE/.test(teks)
    || ["image", "document", "audio", "video", "ptt", "voice", "file"].includes(jenisFonnte)
  if (lampiran) {
    const nama = `${input.fileName ?? ""} ${input.url ?? ""}`.toLowerCase()
    const jenis: JenisLampiran = /\.(pdf|docx?|xlsx?)\b/.test(nama) || jenisFonnte === "document" || jenisFonnte === "file" ? "DOKUMEN"
      : /\.(jpe?g|png|webp|heic)\b/.test(nama) || jenisFonnte === "image" ? "FOTO"
      : /\.(ogg|mp3|m4a|opus)\b/.test(nama) || ["audio", "ptt", "voice"].includes(jenisFonnte) ? "SUARA" : "LAIN"
    return { kind: "LAMPIRAN", jenis, shortCode }
  }

  // 2. Urusan bayar SELALU ditinjau, walau ada kata "ok" ("ok transfer dulu").
  const adaKata = (daftar: string[]) => daftar.some((kata) => new RegExp(`(^|\\s)${kata}(\\s|$|[.,!?])`).test(tanpaKode))
  if (/^5(\s|$)/.test(tanpaKode) || adaKata(KATA_BAYAR)) {
    return { kind: "BAYAR", nominal: ambilNominal(tanpaKode.replace(/^5\s*/, "")), shortCode }
  }

  // 3. Bahan disebut namanya: "siap, tapi coklat cuma ada 1 dus".
  const bahan: BahanDisebut[] = []
  const potongan = tanpaKode.split(/,|;|\bTAPI\b|\bTP\b|\bDAN\b|\bSAMA\b|\bSEDANGKAN\b|\n/)
  for (const line of lines) {
    const kunci = line.names.flatMap(kataNama)
    if (kunci.length === 0) continue
    const bagian = potongan.find((p) => kunci.some((kata) => new RegExp(`(^|[^A-Z])${kata}([^A-Z]|$)`).test(p)))
    if (!bagian) continue
    const tidakAda = KATA_TIDAK_ADA.some((kata) => bagian.includes(kata))
    const angka = bagian.match(/\b(\d+(?:[.,]\d{1,3})?)\b/)
    if (tidakAda) bahan.push({ lineId: line.id, command: "UNAVAILABLE", quantity: null })
    else if (angka) bahan.push({ lineId: line.id, command: "PARTIAL", quantity: Number(angka[1].replace(",", ".")) })
  }
  if (bahan.length > 0) {
    const sisanya = /(^|\s)(SIAP|OK|OKE|ADA|BAIK|SANGGUP|READY)(\s|$|[.,!])/.test(tanpaKode) ? "READY" as const : null
    return { kind: "SEBUT_BAHAN", bahan, sisanya, shortCode }
  }

  // 4. Jawaban standar (angka 1–4 atau kata baku). Kalimat bertanda tanya
  //    BUKAN jawaban ("masih ada?"), kecuali jawaban angka murni.
  const standar = parseOrderReply(mentah)
  if (standar && (standar.viaAngka || !mentah.includes("?"))) return { kind: "STANDAR", reply: standar }

  // 5. Pertanyaan perlu dijawab manusia; basa-basi tidak perlu apa-apa.
  if (mentah.includes("?") || AWAL_TANYA.test(tanpaKode)) return { kind: "TANYA", shortCode }
  const tanpaEmoji = tanpaKode.replace(/[^\p{L}\p{N}\s.,!-]/gu, "").replace(/[.,!]/g, " ").replace(/\s+/g, " ").trim()
  if (!tanpaEmoji || BASA_BASI.test(tanpaEmoji)) return { kind: "BASA_BASI", shortCode }
  return { kind: "TAK_DIKENAL", shortCode }
}
