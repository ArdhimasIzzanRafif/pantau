# Panduan Tes Manual Pantau — Semua Fitur

Dokumen ini dipakai untuk menguji aplikasi dari awal secara berurutan. Centang setiap kasus, tulis hasil aktual, dan simpan tangkapan layar jika gagal.

## 1. Aturan dan persiapan

### Lingkungan uji

- Lokal: `http://localhost:3000`
- Publik/ngrok: `https://superexplicit-charmain-prohibitively.ngrok-free.dev`
- Browser utama: Safari desktop dan Safari/Chrome ponsel.
- Gunakan organisasi khusus bernama **Pantau Manual QA** untuk tes yang mengubah atau menghapus data.
- Jangan menjalankan tes hapus bisnis pada akun Three Patties.

### Format pencatatan

Untuk setiap ID tes, isi:

- Status: `[ ] Belum` / `[x] Lulus` / `[!] Gagal`
- Hasil aktual: apa yang tampil atau berubah.
- Bukti: nama screenshot atau rekaman.
- Catatan bug: langkah terakhir sebelum gagal, pesan error, akun, browser, dan waktu.

### Data uji yang disarankan

| Data | Nilai |
|---|---|
| Bisnis | Pantau Manual QA |
| Owner | `owner.manualqa@example.com` |
| Password | `ManualQA#2026` |
| Gudang | Gudang QA |
| Outlet | Outlet QA |
| Bahan 1 | Beef QA; satuan dasar `kg`; kemasan `pcs`; isi `0,05 kg` |
| Bahan 2 | Bun QA; satuan dasar `pcs`; kemasan `pack`; isi `20 pcs` |
| Supplier | Supplier QA; nomor telepon uji milik sendiri |
| Menu | Beef Burger QA; harga Rp30.000 |
| Resep | Beef QA `0,05 kg` dan Bun QA `1 pcs` |
| Modifier | Pilihan Beef: Regular Rp0, Extra Beef Rp10.000 |
| Diskon | Diskon QA 10% |
| Meja | Meja QA 1 |

### Akun Three Patties untuk tes hak akses

Gunakan akun ini hanya untuk mengecek tampilan dan hak akses. Transaksi besar atau penghapusan data tetap dilakukan di organisasi QA.

| Peran | Email | Password |
|---|---|---|
| Owner | `owner@threepatties.com` | (gunakan password yang disimpan secara privat) |
| Kasir 725A | `kasir.725a@threepatties.com` | (gunakan password yang disimpan secara privat) |
| Kasir 575A | `kasir.575a@threepatties.com` | (gunakan password yang disimpan secara privat) |
| Gudang 725A | `gudang.725a@threepatties.com` | (gunakan password yang disimpan secara privat) |
| Gudang 575A | `gudang.575a@threepatties.com` | (gunakan password yang disimpan secara privat) |
| Supervisor | `supervisor@threepatties.com` | (gunakan password yang disimpan secara privat) |

## 2. Akun, autentikasi, dan status bisnis

### AUTH-01 — Registrasi bisnis baru

1. Buka `/register` di jendela private Safari.
2. Isi nama lengkap, nama bisnis, email unik, dan password yang memenuhi seluruh aturan.
3. Kirim formulir.

Hasil yang diharapkan:

- Validasi password memberi petunjuk yang jelas.
- Email duplikat ditolak tanpa membocorkan password.
- Registrasi berhasil mengarah ke halaman menunggu aktivasi.

### AUTH-02 — Bisnis belum aktif

1. Login memakai owner bisnis QA yang belum diaktifkan.

Hasil yang diharapkan:

- Pengguna diarahkan ke `/pending`.
- Dashboard dan API privat tidak dapat dibuka dengan mengetik URL langsung.

### AUTH-03 — Aktivasi dari admin platform

1. Login sebagai admin platform.
2. Buka daftar permintaan/bisnis.
3. Aktifkan Pantau Manual QA.
4. Login ulang sebagai owner QA.

Hasil yang diharapkan:

- Status berubah aktif.
- Owner dapat masuk ke dashboard bisnisnya sendiri.

### AUTH-04 — Login dan logout

1. Coba password salah.
2. Login dengan password benar.
3. Logout, lalu tekan tombol Back browser.

Hasil yang diharapkan:

- Password salah ditolak dengan pesan aman.
- Login benar membuka dashboard sesuai peran.
- Setelah logout, halaman privat tidak dapat digunakan kembali.

### AUTH-05 — Lupa dan reset password

1. Buka `/forgot-password` dan masukkan email QA.
2. Buka tautan reset dari email, bila SMTP dikonfigurasi.
3. Masukkan password baru yang valid, lalu login.
4. Coba gunakan kembali token reset yang sama.

Hasil yang diharapkan:

- Sistem tidak mengungkap apakah email asing terdaftar.
- Token hanya berlaku sekali dan memiliki masa kedaluwarsa.
- Password lama tidak lagi dapat dipakai.

Catatan: pengiriman email nyata hanya dapat dinyatakan lulus bila kredensial SMTP tersedia.

### AUTH-06 — Bisnis ditangguhkan

1. Tangguhkan bisnis QA melalui admin platform.
2. Coba login sebagai owner QA.
3. Aktifkan kembali bisnis untuk melanjutkan tes.

Hasil yang diharapkan:

- Pengguna diarahkan ke `/suspended` dan tidak dapat mengakses data operasional.
- Setelah diaktifkan kembali, akses normal pulih.

## 3. Informasi bisnis dan lokasi

### SET-01 — Informasi bisnis dan logo

1. Buka **Pengaturan**.
2. Ubah nama bisnis sementara.
3. Unggah JPG, PNG, dan WebP valid di bawah 2 MB satu per satu.
4. Coba file yang terlalu besar atau bukan gambar.
5. Hapus foto, lalu unggah ulang logo.

Hasil yang diharapkan:

- Pratinjau foto tetap bulat, proporsional, dan berada di tengah bloknya.
- Format/ukuran tidak valid ditolak.
- Nama dan logo tersimpan setelah halaman dimuat ulang.

### SET-02 — Pengaturan struk dan QRIS

1. Isi identitas struk, pajak, catatan, dan data pembayaran yang tersedia.
2. Unggah QRIS statis yang valid.
3. Simpan dan buka ulang pengaturan.
4. Buat transaksi uji dan periksa pratinjau/hasil struk.

Hasil yang diharapkan:

- Nilai tersimpan konsisten.
- QRIS tampil tanpa terpotong.
- Pajak, total, dan catatan di struk sesuai pengaturan.

### LOC-01 — Membuat gudang

1. Buka pengelolaan lokasi dari Pengaturan.
2. Tambah **Gudang QA** dengan alamat uji.
3. Coba nama kosong dan nama duplikat.
4. Edit nama/alamat, lalu muat ulang.

Hasil yang diharapkan:

- Data wajib divalidasi.
- Gudang baru muncul sebagai lokasi stok.
- Perubahan tetap tersimpan.

### LOC-02 — Membuat outlet dan gudang pasangan

1. Tambah **Outlet QA**.
2. Pasangkan outlet dengan Gudang QA jika opsi tersedia.
3. Edit alamat outlet.

Hasil yang diharapkan:

- Outlet dan gudang tampil terpisah pada lokasi stok.
- Relasi outlet–gudang benar dan tidak tertukar dengan outlet lain.

## 4. Tim, peran, dan izin

### TEAM-01 — Membuat akun pegawai

1. Buka **Manajemen** pada Tim & Akun.
2. Buat satu akun untuk masing-masing peran: Supervisor, Admin Gudang, dan Kasir.
3. Pasangkan kasir ke Outlet QA dan admin gudang ke Gudang QA.
4. Coba email duplikat.

Hasil yang diharapkan:

- Akun baru dapat login.
- Email duplikat ditolak.
- Pegawai hanya melihat lokasi yang menjadi tanggung jawabnya.

### TEAM-02 — Mengubah izin fitur

1. Buka pengaturan izin.
2. Matikan satu fitur untuk Admin Gudang, simpan, lalu login sebagai akun tersebut.
3. Coba buka URL fitur itu secara langsung.
4. Aktifkan kembali izinnya.

Hasil yang diharapkan:

- Menu hilang saat izin dimatikan.
- URL/API langsung tetap ditolak, bukan hanya disembunyikan dari sidebar.
- Izin aktif kembali setelah login ulang atau halaman dimuat ulang.

### TEAM-03 — Matriks akses minimum

| Peran | Verifikasi |
|---|---|
| Owner | Seluruh fitur organisasi, tim, lokasi, pengaturan, dan laporan |
| Supervisor | Fitur operasional/laporan sesuai izin; tidak mengelola organisasi lain |
| Admin Gudang | Inventori, supplier, barang masuk, transfer, opname, dan stok lokasi yang diizinkan |
| Kasir | POS/shift dan data outletnya; tidak dapat mengubah master tanpa izin |
| Admin platform | Administrasi platform; tidak tercampur dengan akun organisasi |

## 5. Master inventori dan supplier

### INV-01 — Bahan pecahan 0,05 kg

1. Buka **Master Inventori** dan tambah Beef QA.
2. Pilih satuan dasar `kg`.
3. Tambahkan kemasan `pcs` dengan isi `0,05 kg`.
4. Masukkan harga pokok yang diperlukan dan simpan.
5. Edit item dan pastikan angka tetap `0,05`, bukan dibulatkan menjadi nol.

Hasil yang diharapkan:

- Nilai desimal koma/titik diterima sesuai tampilan lokal.
- Data disimpan konkret sebagai 0,05 kg per pcs.
- Total stok tidak menampilkan angka floating panjang seperti `11.959999999999999`.

### INV-02 — Item berbasis pcs

1. Tambah Bun QA dengan satuan dasar `pcs`.
2. Tambahkan kemasan `pack`, isi 20 pcs.
3. Simpan, edit, nonaktifkan, lalu aktifkan kembali.

Hasil yang diharapkan:

- Konversi 1 pack = 20 pcs konsisten.
- Status item mengontrol kemunculannya pada pilihan transaksi tanpa menghapus riwayat.

### INV-03 — Validasi inventori

1. Coba nama kosong, satuan kosong, isi kemasan nol/negatif, dan SKU duplikat.
2. Coba hapus item yang sudah memiliki transaksi.

Hasil yang diharapkan:

- Input tidak valid ditolak dengan pesan spesifik.
- Data historis tidak rusak; item bertransaksi seharusnya dinonaktifkan atau penghapusan ditolak secara aman.

### SUP-01 — Supplier dan pemetaan bahan

1. Tambah Supplier QA, nomor telepon, dan catatan.
2. Petakan Beef QA serta Bun QA ke supplier.
3. Ubah harga/kemasan pembelian, kemudian muat ulang.

Hasil yang diharapkan:

- Supplier dan pemetaan tersimpan.
- Nomor telepon dinormalisasi secara benar.
- Bahan muncul di supplier yang tepat.

### SUP-02 — Pesanan supplier manual

1. Buat pesanan manual Beef QA sebanyak 10 pcs.
2. Periksa detail pesanan dan status.
3. Pastikan ekuivalensinya terbaca 0,5 kg.

Hasil yang diharapkan:

- 10 × 0,05 kg = 0,5 kg.
- Pesanan manual tidak menunggu balasan WhatsApp.
- Tab status dan riwayat berubah sesuai proses.

### SUP-03 — WhatsApp supplier

1. Konfigurasikan token Fonnte/webhook khusus uji.
2. Kirim pesanan ke nomor uji milik sendiri.
3. Balas dengan format tersedia, sebagian tersedia, tidak tersedia, dan kalimat bebas.
4. Periksa inbox dan status pesanan.

Hasil yang diharapkan:

- Pesan keluar tercatat.
- Balasan dikenali atau masuk **Perlu ditinjau** tanpa kehilangan isi asli.
- Webhook dengan kunci salah ditolak.

Catatan: langkah ini memerlukan akun Fonnte, koneksi WhatsApp, dan nomor nyata; jangan mengirim ke supplier sungguhan saat QA.

## 6. Barang masuk, stok, dan kartu stok

### GR-01 — Barang masuk dengan konversi kemasan

1. Buka **Barang Masuk** untuk Gudang QA.
2. Terima Beef QA sebanyak 100 pcs dan Bun QA sebanyak 5 pack.
3. Isi supplier, harga, nomor referensi, batch, dan kedaluwarsa bila tersedia.
4. Simpan dan buka detail transaksi.

Hasil yang diharapkan:

- Beef bertambah 5 kg: 100 × 0,05 kg.
- Bun bertambah 100 pcs: 5 × 20 pcs.
- Nilai pembelian dan HPP/rata-rata bergerak dihitung tanpa digit desimal liar.
- Transaksi muncul di riwayat dan kartu stok.

### GR-02 — Validasi penerimaan

1. Coba kuantitas nol/negatif.
2. Coba lokasi, item, atau harga yang belum diisi.
3. Muat ulang halaman saat formulir belum dikirim.

Hasil yang diharapkan:

- Input tidak sah tidak mengubah stok.
- Pengiriman ganda tidak membuat transaksi ganda.

### STOCK-01 — Stok per lokasi

1. Buka **Stok per Lokasi**.
2. Bandingkan Gudang QA, Outlet QA, dan total.
3. Cari/filter Beef QA.

Hasil yang diharapkan:

- Total sama dengan penjumlahan seluruh lokasi.
- Angka ditampilkan dengan pembulatan yang manusiawi dan tetap akurat.
- Filter tidak mengubah saldo.

### STOCK-02 — Kartu stok

1. Buka **Kartu Stok** dan pilih Beef QA serta Gudang QA.
2. Periksa saldo awal, barang masuk, transfer, POS, waste, dan opname.
3. Ubah rentang tanggal/filter lokasi.

Hasil yang diharapkan:

- Urutan mutasi kronologis dan saldo berjalan konsisten.
- Pengguna lokasi terbatas tidak dapat melihat lokasi lain.
- Jumlah akhir sama dengan Stok per Lokasi.

## 7. Transfer, waste, dan opname

### TRF-01 — Alur transfer lengkap

1. Buat transfer Beef QA 2 kg dan Bun QA 20 pcs dari Gudang QA ke Outlet QA.
2. Setujui permintaan.
3. Tandai dikirim.
4. Login sebagai petugas outlet dan terima seluruh jumlah.

Hasil yang diharapkan:

- Status berurutan: diminta/disetujui/dikirim/diterima atau selesai.
- Stok sumber berkurang dan tujuan bertambah tepat satu kali.
- Kartu stok kedua lokasi memiliki referensi transfer yang sama.

### TRF-02 — Selisih, penolakan, dan pembatalan

1. Buat transfer kedua.
2. Terima dengan sebagian hilang/rusak bila opsi tersedia.
3. Uji satu permintaan yang ditolak dan satu yang dibatalkan.

Hasil yang diharapkan:

- Selisih menimbulkan catatan/peringatan.
- Stok mengikuti jumlah yang benar-benar diterima.
- Penolakan/pembatalan melepas reservasi dan tidak mengurangi stok dua kali.

### ADJ-01 — Waste dan penyesuaian

1. Catat Beef QA 0,1 kg sebagai rusak/kedaluwarsa.
2. Catat Bun QA 1 pcs sebagai complimentary atau penyesuaian yang tersedia.
3. Periksa stok, kartu stok, laporan, dan riwayat.

Hasil yang diharapkan:

- Saldo turun sesuai alasan.
- Alasan dan pelaku tercatat.
- Kuantitas melebihi stok ditolak jika stok negatif tidak diizinkan.

### OPN-01 — Opname tanpa selisih

1. Pastikan tidak ada transaksi lokasi selama sekurangnya 30 detik.
2. Buka **Opname Fisik**, pilih Outlet QA.
3. Isi jumlah fisik sama dengan saldo sistem dan kirim.

Hasil yang diharapkan:

- Hasil opname berstatus ditinjau/selesai sesuai alur.
- Selisih nol dan stok tidak berubah.

### OPN-02 — Pengaman transaksi aktif dan selisih

1. Buat transaksi POS atau mutasi stok.
2. Langsung coba kirim opname pada lokasi yang sama.
3. Tunggu masa tenang, lalu kirim opname dengan selisih kecil.

Hasil yang diharapkan:

- Opname langsung ditahan dengan pesan masa tenang, bukan gagal diam-diam.
- Setelah masa tenang, opname dapat dikirim.
- Selisih membuat penyesuaian, audit, dan kartu stok yang benar.

## 8. Master menu

### MENU-01 — Kategori, foto, dan pagination

1. Tambah kategori QA.
2. Tambah minimal 11 menu agar pagination aktif.
3. Unggah foto valid pada beberapa menu.
4. Coba pencarian, halaman berikutnya, jumlah per halaman, dan **Lihat semua**.

Hasil yang diharapkan:

- Foto tidak terdistorsi.
- Pagination tidak menggandakan atau melewatkan menu.
- **Lihat semua** menampilkan seluruh hasil yang sesuai filter.

### MENU-02 — Resep pecahan

1. Buat Beef Burger QA seharga Rp30.000.
2. Tambahkan Beef QA 0,05 kg dan Bun QA 1 pcs sebagai resep.
3. Simpan, buka ulang, lalu edit resep.

Hasil yang diharapkan:

- Resep tetap 0,05 kg.
- HPP menu dihitung dari bahan dan tidak berubah menjadi nol.
- Penjualan satu burger mengurangi Beef 0,05 kg dan Bun 1 pcs.

### MENU-03 — Modifier

1. Tambah grup **Pilihan Beef**.
2. Aktifkan **Wajib dipilih** dan set maksimal 1.
3. Tambahkan Regular Rp0 dan Extra Beef Rp10.000.
4. Hubungkan Extra Beef ke stok Beef QA 0,05 kg jika tersedia.
5. Simpan dan buka ulang menu.

Hasil yang diharapkan:

- Tata letak grup, nama opsi, harga, bahan stok, dan tombol hapus terbaca jelas di desktop/mobile.
- POS/QR tidak bisa lanjut tanpa memilih grup wajib.
- Hanya satu opsi dapat dipilih.
- Extra Beef menambah harga Rp10.000 dan mengurangi bahan tambahan tepat sekali.

### MENU-04 — Diskon

1. Buat diskon aktif 10% untuk Beef Burger QA.
2. Atur periode/jam serta outlet bila tersedia.
3. Uji sebelum, selama, dan setelah periode.

Hasil yang diharapkan:

- Harga Rp30.000 mendapat potongan Rp3.000 saat syarat terpenuhi.
- Diskon tidak diterapkan di luar syarat.
- Total tidak menjadi negatif dan aturan yang bertabrakan ditangani konsisten.

## 9. Meja, QR menu, dan pelanggan

### TABLE-01 — Membuat meja dan QR

1. Tambah Meja QA 1 pada Outlet QA.
2. Unduh/buka QR meja.
3. Buka tautan dari jendela private dan dari ponsel.

Hasil yang diharapkan:

- QR mengarah ke token meja dan outlet yang benar.
- Pelanggan tidak perlu login.
- Logo, outlet, nama meja, kategori, dan menu tampil benar.

### TABLE-02 — Pesanan dari meja

1. Tambahkan menu biasa dan menu bermodifier ke keranjang.
2. Ubah jumlah, hapus satu item, lalu kirim pesanan.
3. Uji saat kasir belum membuka shift.
4. Buka shift, lalu kirim ulang.

Hasil yang diharapkan:

- Keranjang dan total selalu konsisten.
- Saat kasir belum buka, pelanggan mendapat pemberitahuan dan pesanan tidak terkirim.
- Saat shift buka, pesanan masuk ke outlet/meja yang tepat tanpa duplikasi.

### TABLE-03 — Tampilan responsif pelanggan

1. Uji lebar ponsel, tablet, dan desktop.
2. Gulir dari header ke daftar menu dan keranjang.
3. Putar ponsel portrait ke landscape.

Hasil yang diharapkan:

- Konten tidak menempel ke bagian atas browser; header memiliki jarak aman.
- Tidak ada konten tertutup address bar/notch.
- Keranjang tetap dapat digunakan dan tidak menutupi kartu menu.
- Loading memakai logo Pantau dan animasi berhenti setelah data tampil.

## 10. POS dan shift kasir

### POS-01 — Buka shift

1. Login sebagai kasir Outlet QA.
2. Buka shift dengan kas awal.
3. Coba membuka shift kedua pada kasir/lokasi yang sama.

Hasil yang diharapkan:

- Satu shift aktif tercatat dengan kas awal dan waktu.
- Shift ganda ditolak atau diarahkan ke shift yang masih aktif.

### POS-02 — Pesanan langsung

1. Buat pesanan dine-in, takeaway, dan jenis lain yang tersedia.
2. Tambahkan Beef Burger QA dengan Regular.
3. Tambahkan satu lagi dengan Extra Beef.
4. Ubah jumlah, beri catatan, hold/simpan bila tersedia, lalu lanjutkan.

Hasil yang diharapkan:

- Harga dasar, modifier, kuantitas, dan catatan benar.
- Pesanan yang ditahan dapat dibuka kembali tanpa kehilangan item.
- Stok belum/baru berkurang pada tahap yang memang dirancang, tidak dua kali.

### POS-03 — Diskon, pajak, dan pembayaran

1. Terapkan Diskon QA 10%.
2. Uji pembayaran tunai pas, tunai dengan kembalian, serta metode non-tunai yang tersedia.
3. Coba jumlah bayar kurang.
4. Selesaikan transaksi dan buka struk.

Hasil yang diharapkan:

- Subtotal, diskon, pajak, pembulatan, total, bayar, dan kembalian benar.
- Pembayaran kurang ditolak.
- Struk dan riwayat pesanan memakai nomor unik.

### POS-04 — Bayar pesanan QR meja

1. Buka pesanan yang dikirim dari Meja QA 1.
2. Verifikasi item/modifier, lalu bayar.

Hasil yang diharapkan:

- Pesanan muncul hanya sekali.
- Status pelanggan/kasir sinkron.
- Resep dasar dan modifier mengurangi stok tepat sekali.

### POS-05 — Batal/void dan cetak

1. Uji pembatalan sebelum bayar.
2. Uji void/refund setelah bayar bila tersedia dan peran mengizinkan.
3. Cetak struk melalui printer termal uji.

Hasil yang diharapkan:

- Aksi sensitif meminta konfirmasi/otorisasi.
- Stok dan laporan dikembalikan sesuai kebijakan, tanpa transaksi yatim.
- Format teks tidak terpotong pada lebar kertas yang dipilih.

Catatan: Bluetooth/USB dan pemotong kertas harus diuji dengan perangkat fisik; tes otomatis hanya memeriksa format perintah/struk.

### POS-06 — Tutup shift

1. Catat kas fisik dan tutup shift.
2. Bandingkan kas awal, penjualan tunai, pengeluaran/selisih, dan kas akhir.
3. Coba membuat transaksi setelah shift ditutup.

Hasil yang diharapkan:

- Rekap shift benar dan selisih terlihat jelas.
- Transaksi baru ditahan sampai shift berikutnya dibuka.

## 11. Dashboard, laporan, peringatan, dan audit

### RPT-01 — Dashboard

1. Buka dashboard owner sebelum dan sesudah transaksi QA.
2. Ganti rentang tanggal/lokasi bila tersedia.

Hasil yang diharapkan:

- Kartu ringkasan dan grafik memakai data/rentang yang sama.
- Pengguna terbatas hanya melihat lokasi yang berhak dilihat.

### RPT-02 — HPP dan selisih stok

1. Buka **HPP & Selisih Stok**.
2. Bandingkan Beef Burger QA dengan biaya Beef/Bun dan hasil transaksi.
3. Uji Burger dengan Extra Beef; biaya bahan modifier harus ikut HPP.
4. Uji filter tanggal/lokasi dan **Ekspor Excel**.
5. Coba periode tanpa opname, HPP nol, serta biaya historis belum lengkap.
6. Selesaikan opname dengan selisih nol dan pastikan jumlah siklus tetap bertambah.

Hasil yang diharapkan:

- HPP sesuai resep dan harga pokok saat transaksi.
- Nilai selisih menjumlahkan absolut stok kurang dan stok lebih. Waste yang telah dicatat mengurangi stok teoritis dan tampil terpisah sebagai kerugian tercatat.
- HPP nol, belum ada opname, atau komponen hitungan belum lengkap tidak menghasilkan 0% semu. Nol persen hanya ditampilkan pada hasil yang memang dapat dihitung.
- Harga master baru tidak mengubah HPP transaksi atau nilai selisih opname yang sudah memiliki snapshot historis.
- Ekspor memuat angka laporan yang sama dengan layar beserta rincian stok kurang/lebih, jumlah siklus, dan status kelengkapan.

Untuk persiapan penelitian, contoh angka, rancangan pretest/posttest, dan batas penggunaan laporan kalender, lihat [Skema Uji HPP dan Selisih Stok Skripsi](SKEMA-UJI-HPP-DAN-SELISIH-STOK-SKRIPSI.md).

### RPT-03 — Peringatan

1. Atur batas minimum Beef QA di Outlet QA.
2. Turunkan stok hingga di bawah batas, lalu hingga habis.
3. Pulihkan stok.

Hasil yang diharapkan:

- Status Normal, Stok Rendah, dan Habis berubah tepat.
- Peringatan tidak bocor ke lokasi pengguna lain.
- Peringatan selesai/hilang ketika stok pulih sesuai desain.

### RPT-04 — Riwayat/audit

1. Cari kejadian tambah/edit inventori, barang masuk, transfer, opname, waste, menu, dan pegawai.
2. Filter pelaku, lokasi, tanggal, dan jenis kejadian.

Hasil yang diharapkan:

- Pelaku, waktu, entitas, lokasi, dan perubahan tercatat.
- Akun lokasi terbatas tidak dapat melihat kejadian lokasi lain.
- Audit tidak dapat diedit dari UI biasa.

## 12. Admin platform dan isolasi data

### ADM-01 — Ringkasan platform

1. Login sebagai admin platform.
2. Buka dashboard, bisnis, pengguna, permintaan, kesehatan, sistem, dan penggunaan.

Hasil yang diharapkan:

- Angka ringkasan sesuai daftar detail.
- Data organisasi tidak tercampur.
- Pengguna organisasi biasa ditolak dari seluruh `/admin`.

### ADM-02 — Hapus bisnis QA

1. Pastikan target tepat **Pantau Manual QA**, bukan Three Patties.
2. Pastikan organisasi QA sudah memiliki inventori, supplier, barang masuk, transfer, menu, resep, modifier, POS, opname, audit, dan peringatan.
3. Hapus bisnis melalui admin platform dan konfirmasi.
4. Cari ulang bisnis serta coba login sebagai akun QA.

Hasil yang diharapkan:

- Seluruh data turunan terhapus tanpa error foreign key.
- Organisasi lain dan seluruh data Three Patties tetap ada.
- Akun QA tidak bisa login lagi.

Tes ini destruktif dan harus menjadi langkah terakhir.

### ADM-03 — Isolasi antarorganisasi

1. Saat login sebagai QA, salin ID/URL resource Three Patties jika terlihat di browser lain.
2. Coba buka resource tersebut dengan sesi QA.

Hasil yang diharapkan:

- Server mengembalikan tidak ditemukan/ditolak.
- Tidak ada nama, stok, transaksi, atau file organisasi lain yang bocor.

## 13. Stabilitas, keamanan dasar, dan tampilan

### SYS-01 — Refresh dan navigasi

1. Refresh keras pada setiap halaman utama.
2. Gunakan Back/Forward setelah simpan transaksi.
3. Buka dua tab dan lakukan perubahan bergantian.

Hasil yang diharapkan:

- Tidak ada halaman putih atau loading tanpa akhir.
- Tombol simpan mencegah klik ganda.
- Data lama diperbarui atau konflik dijelaskan dengan aman.

### SYS-02 — Sesi dan proteksi request

1. Biarkan sesi hingga kedaluwarsa atau hapus cookie pada tab lain.
2. Coba kirim formulir lama.
3. Coba API privat tanpa login.

Hasil yang diharapkan:

- Pengguna diminta login ulang.
- Request anonim/CSRF ditolak dan tidak mengubah data.

### SYS-03 — Safari, ponsel, dan ngrok

1. Jalankan alur dashboard, menu publik, serta POS melalui localhost dan URL ngrok.
2. Uji Safari desktop, Safari iPhone, dan satu browser Chromium.
3. Uji koneksi lambat serta offline sesaat.

Hasil yang diharapkan:

- Tidak ada horizontal scroll yang tidak perlu, teks terpotong, atau tombol tertutup.
- Loading menampilkan logo Pantau dengan animasi yang halus.
- Error jaringan memiliki pesan dan tombol coba lagi; transaksi tidak terduplikasi.

## 14. Rekap hasil

| Kelompok | ID | Status | Catatan/bukti |
|---|---|---|---|
| Autentikasi | AUTH-01 s.d. AUTH-06 |  |  |
| Pengaturan/lokasi | SET-01 s.d. LOC-02 |  |  |
| Tim/izin | TEAM-01 s.d. TEAM-03 |  |  |
| Inventori/supplier | INV-01 s.d. SUP-03 |  |  |
| Stok | GR-01 s.d. STOCK-02 |  |  |
| Transfer/opname | TRF-01 s.d. OPN-02 |  |  |
| Master menu | MENU-01 s.d. MENU-04 |  |  |
| Meja/QR | TABLE-01 s.d. TABLE-03 |  |  |
| POS/shift | POS-01 s.d. POS-06 |  |  |
| Laporan | RPT-01 s.d. RPT-04 |  |  |
| Admin | ADM-01 s.d. ADM-03 |  |  |
| Sistem/UI | SYS-01 s.d. SYS-03 |  |  |

## 15. Kriteria selesai

Pengujian manual dianggap selesai bila:

- Seluruh kasus kritis transaksi, stok, pembayaran, hak akses, dan isolasi organisasi lulus.
- Tidak ada error 500, loading tanpa akhir, stok negatif tak disengaja, atau transaksi ganda.
- Semua kegagalan memiliki langkah reproduksi dan bukti.
- Tes eksternal dicatat terpisah: email SMTP, WhatsApp/Fonnte, QRIS nyata, dan printer fisik.
- Data QA telah dihapus setelah bukti dikumpulkan, sedangkan data Three Patties tetap utuh.
