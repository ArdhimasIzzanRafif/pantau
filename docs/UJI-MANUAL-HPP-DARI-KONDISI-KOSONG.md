# Uji manual HPP dari kondisi kosong — 16 November 2026

Akun: **Bisnis Pantau**, owner **ardhimasrafif@gmail.com**. Jalankan urutan ini satu kali dari awal sampai akhir. Ini data latihan fungsi aplikasi, bukan data lapangan skripsi. Jangan menjalankan transaksi lain atau tes QR secara bersamaan, agar hasil angka tetap sesuai tabel.

## Kondisi yang sudah disiapkan

- Riwayat penjualan/pembayaran/shift, barang masuk, transfer dan reservasi, opname, waste, pergerakan lama, peringatan, serta audit organisasi sudah dihapus. Aturan diskon lama sudah dihapus agar tidak mengubah harga pengujian.
- Master Inventori, 12 Master Menu, 24 baris resep, grup Extra Topping/Extra Beef, pegawai dan hak akses, lokasi, meja, serta pengaturan dipertahankan.
- Outlet Jakarta dan Gudang 1 yang aktif masing-masing memiliki Beef **10 kg** dan Bun **10 pcs**. Gudang 1 yang nonaktif dipertahankan sebagai konfigurasi tetapi tidak diberi stok.
- Daftar transaksi Kartu Stok kosong. Pilih item dan lokasi untuk melihat **Saldo awal 10** pada ringkasan. Saldo pembuka tetap disimpan untuk perhitungan opname.
- Harga dasar Beef Rp150.000/kg. Kemasan 1 pcs = 0,05 kg; biaya per pcs Rp7.500.
- Harga dasar Bun Rp750/pcs. Kemasan 1 pack = 20 pcs; biaya per pack Rp15.000.
- Burger reguler: harga jual Rp30.000, resep Beef 0,05 kg + Bun 1 pcs, HPP Rp8.250.
- Burger + Extra Beef: harga jual Rp40.000, resep total Beef 0,10 kg + Bun 1 pcs, HPP Rp15.750.

Cadangan lengkap sebelum reset tersimpan secara lokal di `.local-backups/manual-hpp-reset-2026-11-16T05-41-19-826Z.json`. Data bisnis lain tidak menjadi target reset.

## Tahap 1 — Periksa kondisi awal

1. Muat ulang aplikasi dan login sebagai Owner. Pakai Owner untuk latihan ini supaya POS dan laporan HPP bisa dibuka dari akun yang sama.
2. Buka **Stok per Lokasi**. Pastikan masing-masing lokasi aktif: Beef 10 kg dan Bun 10 pcs.
3. Buka riwayat Barang Masuk, Transfer, Opname, Waste, serta Kasir/Shift: semuanya kosong.
4. Buka **HPP & Selisih Stok**, pilih hari ini dan **Outlet Jakarta**.

Hasil: omzet Rp0, HPP bahan Rp0, nilai selisih Rp0, kerugian tercatat Rp0, 0 transaksi dan 0 opname. Persentase **—**, karena belum ada opname dan HPP nol. Belum ada opname tidak sama dengan hasil penghitungan nol selisih.

## Tahap 2 — Periksa resep tanpa mengubahnya

1. Buka **Master Menu**, cari nama tepat **Burger**, lalu Edit.
2. Pastikan Beef 0,05 kg dan Bun 1 pcs.
3. Buka grup **Extra Topping**, opsi **Extra Beef**, lalu **Atur** bahan stok: Beef 0,05 kg, tambahan harga jual Rp10.000.
4. Tutup form tanpa mengubah resep/harga. Jangan gunakan menu QA untuk urutan ini karena harga jualnya berbeda.

Hasil: HPP reguler Rp8.250, tambahan HPP Extra Beef Rp7.500. Tambahan harga jual Rp10.000 berbeda dari biaya bahan tambahan Rp7.500.

## Tahap 3 — Buka shift

1. Buka **Buka Kasir**.
2. Pilih **Outlet Jakarta** dan **Buka Shift**.
3. Isi Modal Awal **100.000**.

Hasil: satu shift aktif milik akun yang membuka. Kas awal Rp100.000 tidak menambah omzet atau HPP. Selalu tutup menggunakan akun pembuka shift yang sama.

## Tahap 4 — Jual satu Burger reguler

1. Pilih **Burger** satu porsi, tanpa Extra Beef.
2. Pilih Takeaway untuk menyederhanakan tes meja.
3. Pastikan diskon dan pajak Rp0, lalu bayar **Tunai Rp30.000** tepat, tanpa kembalian.
4. Buka Stok per Lokasi dan laporan HPP untuk hari ini/Outlet Jakarta.

Hasil:

| Pemeriksaan | Nilai |
|---|---:|
| Beef Outlet Jakarta | 9,95 kg |
| Bun Outlet Jakarta | 9 pcs |
| Omzet | Rp30.000 |
| HPP bahan | Rp8.250 |
| Laba kotor | Rp21.750 |
| Persentase selisih | —, belum ada opname |

Gudang tetap Beef 10 kg dan Bun 10 pcs. HPP tidak dihitung dari modal awal shift.

## Tahap 5 — Jual satu Burger + Extra Beef

1. Pilih **Burger** satu porsi.
2. Centang **Extra Beef**.
3. Pastikan harga Rp40.000, tanpa diskon/pajak; bayar **Tunai Rp40.000** tepat.
4. Periksa riwayat penjualan: Extra Beef harus terlihat pada transaksi ini.

Hasil kumulatif dua transaksi:

| Pemeriksaan | Nilai |
|---|---:|
| Beef Outlet Jakarta | 9,85 kg |
| Bun Outlet Jakarta | 8 pcs |
| Omzet | Rp70.000 |
| HPP bahan | Rp24.000 |
| Laba kotor | Rp46.000 |
| Transaksi lunas | 2 |
| Persentase selisih | —, belum ada opname |

Rincian HPP: Rp8.250 + Rp15.750 = Rp24.000. Gudang belum berubah.

## Tahap 6 — Opname pertama dengan stok cocok

1. Tunggu setidaknya **30 detik setelah transaksi** terakhir sebelum memulai opname. Hentikan pergerakan stok selama penghitungan.
2. Buka **Opname Fisik**, pilih **Outlet Jakarta**, mulai sesi baru.
3. Isi stok fisik Beef **9,85 kg** dan Bun **8 pcs**.
4. Pada form kemasan + satuan lepas, isi Beef **0 pcs kemasan + 9,85 kg lepas**; Bun **0 pack + 8 pcs lepas**. Jangan memasukkan 9,85 sebagai jumlah pcs patty.
5. Simpan dan sesuaikan stok.

Hasil: selisih keduanya nol, jumlah opname **1**, HPP tetap Rp24.000, persentase **0%** yang sah. Saldo tetap 9,85 kg dan 8 pcs.

## Tahap 7 — Catat waste yang diketahui

1. Buka **Waste & Penyesuaian**, tambah pengurangan stok.
2. Lokasi **Outlet Jakarta**, jenis **Terbuang**, item **Beef**, jumlah **0,05 kg**.
3. Isi keterangan “Latihan HPP: beef terbuang 50 gram”, lalu simpan.

Hasil: Beef outlet menjadi **9,80 kg**, Bun tetap **8 pcs**. Kerugian tercatat **Rp7.500**. Omzet/HPP tetap Rp70.000/Rp24.000. Nilai selisih opname masih Rp0; waste tidak ditambahkan lagi ke pembilang selisih.

## Tahap 8 — Opname kedua dengan stok kurang dan lebih

Tahap ini sengaja membuat perbedaan untuk menguji rumus; gunakan hanya sebagai data latihan.

1. Tunggu 30 detik setelah pergerakan terakhir. Mulai sesi opname baru **Outlet Jakarta**.
2. Sistem seharusnya Beef **9,80 kg**, Bun **8 pcs**.
3. Isi fisik Beef **9,70 kg**, Bun **9 pcs**; simpan.

Hasil:

| Komponen | Perhitungan | Nilai |
|---|---|---:|
| Beef kurang | 0,10 kg × Rp150.000 | Rp15.000 |
| Bun lebih | 1 pcs × Rp750 | Rp750 |
| Nilai absolut selisih | Rp15.000 + Rp750 | Rp15.750 |
| Persentase | Rp15.750 ÷ Rp24.000 × 100% | 65,63% pada layar |
| Kerugian tercatat | Waste tahap sebelumnya | Rp7.500 |
| Jumlah opname | Dua sesi tersimpan | 2 |

Saldo setelah koreksi: Beef **9,70 kg**, Bun **9 pcs**. Rasio tinggi ini dihasilkan contoh latihan dengan penjualan sedikit, bukan penilaian kinerja outlet. Stok kurang dan lebih tidak saling menghapus.

## Tahap 9 — Uji validasi dan konversi Barang Masuk

1. Buka **Barang Masuk**, buat penerimaan baru ke **Gudang 1 yang aktif**.
2. Pilih **Bun**, jumlah **1**, satuan **pack**.
3. Coba kosongkan harga lalu simpan: harus muncul popup dan penerimaan tidak terbentuk.
4. Coba isi harga **0**: karena HPP Bun di master Rp750/pcs, penerimaan gratis harus ditolak. Jangan mengubah master menjadi gratis pada urutan ini.
5. Isi harga valid **Rp15.000 per pack**, lalu **Konfirmasi Diterima**. Bila field menampilkan harga per pcs, nilainya harus Rp750/pcs; jangan memasukkan Rp15.000 ke field per pcs.
6. Supplier boleh dilewati jika form menyatakannya opsional. Jika diwajibkan oleh alur pengadaan yang dipilih, gunakan alur penerimaan manual dan buat supplier latihan secara terpisah.

Hasil: Bun Gudang menjadi **30 pcs** (10 + 20), bukan 11 pcs. Beef Gudang tetap 10 kg. Barang masuk bertambah satu riwayat valid; percobaan kosong/nol tidak menambah riwayat. HPP penjualan lama tetap Rp24.000.

## Tahap 10 — Transfer Gudang ke Outlet

1. Buka **Transfer Barang**, ajukan transfer Bun **5 pcs**, dari **Gudang 1 aktif** ke **Outlet Jakarta**.
2. Konfirmasi/setujui transfer sesuai tombol pada kartu. Jika status **Disetujui, Siap Dikirim**, klik **Kirim Barang**; alur manual dapat langsung dikirim setelah konfirmasi.
3. Terima di Outlet Jakarta, isi diterima baik **5 pcs**, rusak dan tidak tiba **0**, lalu selesaikan.

Hasil setelah status Diterima:

| Lokasi | Beef | Bun |
|---|---:|---:|
| Gudang 1 aktif | 10 kg | 25 pcs |
| Outlet Jakarta | 9,70 kg | 14 pcs |

Transfer tidak menambah omzet atau HPP penjualan. Selama barang masih dikirim, stok tujuan belum boleh dianggap diterima. Jangan membandingkan saldo akhir sebelum penerimaan selesai.

## Tahap 11 — Pastikan selisih lama tidak dihitung ulang

1. Tunggu 30 detik setelah transfer selesai.
2. Buat opname baru Outlet Jakarta dengan fisik sama dengan sistem: Beef **9,70 kg**, Bun **14 pcs**.
3. Simpan.

Hasil: selisih sesi ketiga nol, jumlah opname **3**. Total nilai selisih periode tetap **Rp15.750**, bukan Rp31.500. Persentase periode tetap **65,63%**, HPP Rp24.000, dan kerugian tercatat Rp7.500.

## Tahap 12 — Cocokkan laporan, Excel, dan shift

1. Buka **HPP & Selisih Stok**, pilih **hari ini sampai hari ini**, outlet **Outlet Jakarta**.
2. Cocokkan omzet Rp70.000, HPP Rp24.000, laba kotor Rp46.000, nilai selisih Rp15.750, rasio 65,63%, waste Rp7.500, 2 transaksi dan 3 opname.
3. Klik **Ekspor Excel**, bandingkan angka/statusnya. Excel menyimpan rasio yang dibulatkan dua desimal.
4. Coba filter **kemarin sampai kemarin**: setelah reset ini seharusnya tidak ada transaksi/opname; persentase —. Kembalikan filter ke hari ini.
5. Buka Manajemen Shift dari kasir dan tutup shift menggunakan akun pembukanya. Isi kas aktual **Rp170.000** = modal awal Rp100.000 + dua penjualan tunai Rp70.000.

Hasil: shift ditutup dengan selisih kas Rp0. Barang masuk, transfer, waste, dan koreksi opname tidak dianggap sebagai penjualan tunai POS. Angka selisih kas shift berbeda dari selisih stok pada laporan HPP.

## Jika hasil berbeda

Hentikan urutan pada tahap yang tidak cocok. Catat nomor tahap, hasil yang diharapkan, hasil aktual, outlet, waktu, dan nomor dokumen. Jangan lanjut membuat transaksi tambahan karena hasil tahap berikutnya bergantung pada saldo tahap sebelumnya. Jangan menghapus riwayat atau mengubah master untuk memaksa angka cocok.

Setelah urutan ini selesai, akun akan berisi data latihan yang baru dibuat sendiri. Data ini harus dipisahkan/dibersihkan sebelum pengambilan data lapangan skripsi. Rancangan penelitian lengkap tersedia di [Skema Uji HPP dan Selisih Stok](SKEMA-UJI-HPP-DAN-SELISIH-STOK-SKRIPSI.md).
