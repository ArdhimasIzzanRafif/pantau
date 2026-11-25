/**
 * Keputusan saat halaman Barang Masuk dibuka lewat tautan
 * `/dashboard/goods-receipt?purchaseRequestId=…`.
 *
 * Dipisah dari komponen supaya aturannya dapat diuji tanpa peramban: yang
 * menentukan benar atau salah di sini adalah pesanan mana yang dipilih dan
 * pesan apa yang muncul, bukan cara React merendernya.
 */
export type PesananTautan = {
  id: string
  orderCode: string
  quantity: number | string
  receivedQuantity: number | string
}

export type KeputusanTautan =
  | { aksi: "abaikan" }
  | { aksi: "buka"; pesanan: PesananTautan }
  | { aksi: "pesan"; judul: string; isi: string }

export function putuskanTautanPenerimaan(input: {
  /// Nilai parameter purchaseRequestId, null kalau tautannya biasa.
  id: string | null
  /// Daftar pesanan aktif; hanya bermakna setelah selesai dimuat.
  pesananAktif: PesananTautan[]
  sudahDimuat: boolean
  /// Permintaan daftar pesanan gagal. Dibedakan dari daftar kosong: kosong
  /// berarti tahu tidak ada pesanan, gagal berarti tidak tahu apa-apa.
  gagalMemuat?: boolean
}): KeputusanTautan {
  if (!input.id) return { aksi: "abaikan" }
  // Daftar kosong pun keadaan yang sah — yang penting sudah selesai dimuat.
  if (!input.sudahDimuat) return { aksi: "abaikan" }

  if (input.gagalMemuat) {
    return {
      aksi: "pesan",
      judul: "Daftar pesanan gagal dimuat",
      isi: "Tidak dapat memastikan pesanan itu masih ada. Periksa koneksi lalu muat ulang halaman.",
    }
  }

  const pesanan = input.pesananAktif.find((baris) => baris.id === input.id)
  if (!pesanan) {
    return {
      aksi: "pesan",
      judul: "Pesanan tidak ditemukan",
      isi: "Pesanan itu mungkin sudah selesai, dibatalkan, atau bukan milik lokasi yang Anda akses. Pilih pesanan dari daftar di bawah.",
    }
  }
  const sisa = Number(pesanan.quantity) - Number(pesanan.receivedQuantity)
  if (sisa <= 0) {
    return {
      aksi: "pesan",
      judul: "Pesanan sudah diterima seluruhnya",
      isi: `${pesanan.orderCode} tidak menyisakan jumlah yang perlu dicatat.`,
    }
  }
  return { aksi: "buka", pesanan }
}
