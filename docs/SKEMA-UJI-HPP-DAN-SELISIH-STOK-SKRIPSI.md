# Skema uji HPP bahan dan selisih stok Three Patties

Disusun 16 November 2026 berdasarkan proposal Ardhimas Izzan Rafif, khususnya Subbab 2.4.2–2.4.5, 3.5, 3.6.2, dan 5.5.

Proposal: https://docs.google.com/document/d/1Zy36dk68uu8B-tTMUymqyUusTorL0wuPzUcnysXXd-M/edit

Dokumen ini membedakan verifikasi fungsi aplikasi dari evaluasi lapangan. Angka contoh adalah ilustrasi, bukan hasil penelitian. Jadwal berikut merupakan usulan; tanggal, durasi, biaya acuan, bahan, serta batas siklus harus disepakati bersama outlet dan pembimbing sebelum pengambilan data. Dokumen proposal asli tidak diubah.

## 1. Rancangan yang mengikuti proposal

| Tahap | KM 725A Gresik — perlakuan | KM 575A Ngawi — pembanding |
|---|---|---|
| Persiapan | Periksa stok awal, daftar bahan, BOM, harga, petugas, dan dokumen | Persiapan dengan aturan yang sama |
| Pretest | POS lama dan pencatatan persediaan manual | POS lama dan pencatatan persediaan manual |
| Pelatihan/pilot | Latihan aplikasi; data latihan dipisahkan dari data penelitian | Tetap manual; samakan pemahaman prosedur penghitungan |
| Posttest | Aplikasi Pantau untuk penjualan dan pergerakan persediaan | Tetap POS lama dan pencatatan persediaan manual |
| Analisis | Hitung perubahan indikator pretest ke posttest | Hitung dengan definisi dan batas waktu yang sama |

Usulan praktis: 14 hari pretest dan 14 hari posttest, masing-masing mencakup dua putaran hari dalam seminggu. Gunakan satu siklus opname per hari jika petugas mampu; bila tidak, tetapkan jadwal lebih jarang yang sama di kedua outlet. Satu siklus adalah rentang antara dua batas penghitungan, bukan satu shift kasir. Jumlah siklus aktual yang valid harus dilaporkan. Lakukan latihan 2–3 hari sebelum posttest dan jangan gabungkan data latihan. Tanggal belum ditetapkan.

Satu outlet per kelompok tidak cukup untuk mengklaim signifikansi statistik atau hubungan sebab-akibat secara umum. Siklus harian juga tidak mengubahnya menjadi banyak outlet independen. Gunakan analisis deskriptif dan komparatif sesuai proposal.

## 2. Tetapkan aturan sebelum mulai

1. Pilih bahan yang digunakan kedua outlet, terlacak, dapat dihitung fisiknya, memiliki harga, dan memakai satuan dasar yang sama. Buat daftar tetap. Jangan mengubah penanda pelacakan atau menghapus item selama pengamatan.
2. Dokumentasikan BOM menu dan bahan modifier. Gunakan biaya bahan, tanpa gaji dan overhead. Daftar bahan pembentuk HPP harus terdokumentasi dan konsisten antar-outlet serta antar-periode. Jika cakupannya berbeda dari laporan operasional, hitung indikator penelitian secara terpisah.
3. Nyatakan metode harga secara eksplisit: aplikasi memakai harga batch yang dikonsumsi bila tersedia, lalu harga master bila tidak. Terapkan dasar setara pada pencatatan manual. FEFO menentukan urutan pengambilan batch berdasarkan kedaluwarsa; jangan menyebut metode penilaian ini sebagai rata-rata tertimbang.
4. Bila data batch historis outlet manual tidak memadai, sepakati harga acuan penelitian yang terdokumentasi dan gunakan harga acuan itu pada kedua kelompok dalam lembar analisis terpisah. Jangan membandingkan harga acuan manual dengan HPP batch aplikasi seolah dasarnya identik. Perubahan metode ini perlu disepakati dan dinyatakan dalam metode penelitian.
5. Tetapkan waktu cutoff yang sama untuk stok fisik, stok teoritis, dan penjualan. Hentikan pergerakan saat menghitung atau pisahkan transaksi setelah cutoff. Contoh jadwal opname pukul 21.00 hanya sesuai bila operasional dan pencatatan kedua outlet memungkinkan.
6. Periode pertama dimulai dari saldo fisik awal yang sudah diverifikasi. Koreksi akhir siklus menjadi saldo awal berikutnya. Jangan menghitung selisih yang sama kembali.
7. Catat perubahan harga, BOM, promosi, jam buka, menu, dan keterlambatan input. Jangan menganggap data hilang sebagai nol.

## 3. Rumus operasional

```text
Kebutuhan bahan = jumlah menu terjual × kebutuhan bahan per porsi
HPP bahan = Σ (kebutuhan bahan resep utama + kebutuhan bahan modifier) × biaya per satuan dasar

Stok teoritis = saldo awal + semua pergerakan masuk − semua pergerakan keluar
Selisih kuantitas = stok fisik − stok teoritis sebelum koreksi
Nilai selisih siklus = Σ |selisih kuantitas tiap bahan| × biaya bahan historis
Nilai selisih periode = Σ nilai selisih semua siklus valid
Persentase periode = nilai selisih periode ÷ HPP bahan periode yang sama × 100%

Penurunan outlet = persentase pretest − persentase posttest
Perbedaan penurunan = penurunan outlet aplikasi − penurunan outlet manual
```

Jangan menjumlahkan kg dengan pcs. Konversi ke satuan dasar sebelum menghitung. Jangan menjumlahkan selisih bertanda sebelum mengambil absolut; kurang dan lebih tidak boleh saling menghapus. Jangan memakai rata-rata sederhana persentase siklus untuk persentase periode. Waste yang sudah tercatat mengurangi stok teoritis dan disajikan terpisah; tidak ditambahkan lagi ke nilai selisih opname.

HPP nol menghasilkan persentase tidak dihitung. Nol persen hanya sah bila HPP positif, penghitungan fisik sudah dilakukan, data biaya lengkap, dan hasil selisih bernilai nol. Penurunan 3% ke 2% berarti 1 poin persentase.

## 4. Uji angka terkendali sebelum data lapangan

Gunakan organisasi/akun QA terpisah. Jangan memasukkan data contoh ke akun bisnis yang akan dipakai penelitian.

### Data acuan

| Item | Satuan dasar | Konversi | Harga dasar | Resep Burger |
|---|---|---|---:|---:|
| Beef | kg | 1 pcs patty = 0,05 kg | Rp150.000/kg | 0,05 kg |
| Bun | pcs | 1 pack = 20 pcs; harga Rp15.000/pack | Rp750/pcs | 1 pcs |

Burger dijual Rp30.000. Extra Beef menambah 0,05 kg beef dan harga jual Rp10.000. Biaya tambahan bahan tetap Rp7.500, berbeda dari tambahan harga jual.

| Kasus | Langkah dan hasil yang harus sama dengan hitungan manual |
|---|---|
| HPP-01 Konversi dan resep | Jual 1 Burger reguler: beef Rp7.500 + bun Rp750 = HPP Rp8.250. Stok berkurang 0,05 kg dan 1 pcs. |
| HPP-02 Modifier | Jual 1 Burger + Extra Beef: kebutuhan beef 0,10 kg dan bun 1 pcs. HPP Rp15.750, harga jual Rp40.000. |
| HPP-03 Snapshot | Setelah transaksi lunas, ubah harga master di akun QA. HPP transaksi lama tetap sama; transaksi berikutnya mengikuti dasar biaya batch/master yang berlaku. |
| HPP-04 Status transaksi | Pesanan ditahan/belum bayar dan pesanan batal tidak masuk HPP transaksi lunas dalam laporan. |
| SEL-01 Kurang dan lebih | Pada cutoff, sistem beef 5 kg dan bun 100 pcs; fisik beef 4,9 kg dan bun 102 pcs. Kurang Rp15.000 + lebih Rp1.500 = nilai absolut Rp16.500. |
| SEL-02 Waste | Catat waste beef 0,05 kg sebelum cutoff: biaya Rp7.500. Stok teoritis berkurang. Jika fisik sama dengan teoritis setelah waste, selisih opname nol; kerugian tercatat Rp7.500. |
| SEL-03 Siklus tanpa selisih | Selesaikan opname dengan semua fisik sama dengan sistem. Siklus tetap dihitung; bila HPP positif dan data lengkap, persentase 0%. |
| SEL-04 Data kosong | Biaya historis kosong, HPP tidak lengkap, atau fisik belum diisi: status data belum lengkap, rasio tidak dihitung. Harga Rp0 eksplisit untuk bahan gratis berbeda dari kosong. |
| SEL-05 Tidak ada aktivitas | Tanpa opname: jangan tafsirkan nol selisih. HPP nol: rasio tidak dihitung. |
| RPT-01 Contoh periode | Jika 100 Burger reguler menghasilkan HPP Rp825.000 dan nilai selisih Rp16.500, hasil rasio 2%. |
| RPT-02 Banyak siklus | Siklus A: selisih Rp16.500/HPP Rp825.000; B: selisih Rp3.300/HPP Rp82.500. Gabungan Rp19.800/Rp907.500 = sekitar 2,18%, bukan rata-rata 3%. |
| RPT-03 Filter dan ekspor | Pilih outlet/periode yang sama; bandingkan seluruh nilai, status, jumlah transaksi dan siklus di layar dengan Excel. Pastikan transaksi di luar periode/outlet lain tidak masuk. |
| RPT-04 Pengulangan | Setelah koreksi siklus pertama, hitung fisik yang sama pada siklus berikutnya tanpa pergerakan lain: selisih baru nol, bukan mengulang selisih pertama. |

## 5. Pelaksanaan setiap siklus lapangan

1. Pastikan saldo awal sama dengan hasil fisik akhir siklus sebelumnya.
2. Simpan bukti barang masuk, transfer, penjualan beserta modifier, dan waste di kedua outlet. Outlet manual menggunakan lembar dengan kolom setara.
3. Pada cutoff, simpan catatan stok teoritis sebelum koreksi. Hitung fisik independen; bila memungkinkan pemeriksa tidak diberi jumlah sistem terlebih dahulu, lalu verifikasi ulang perbedaan besar.
4. Simpan fisik, selisih, biaya historis per bahan, nilai absolut, dan bukti penelusuran. Aplikasi tidak menentukan penyebab selisih secara otomatis.
5. Rekonsiliasi setelah hasil disetujui. Saldo berikutnya mengikuti hasil fisik.
6. Nilai kelengkapan setiap siklus. Bila tidak bisa direkonstruksi, tandai tidak lengkap, tulis alasan dan dampak pengecualiannya. Hindari memilih hanya hari yang hasilnya baik.
7. Hitung HPP dengan cakupan bahan dan rentang waktu yang tepat sama dengan siklus. Simpan sumber penjualan dan BOM yang digunakan.

## 6. Format data yang perlu disiapkan

### Lembar per item per siklus

| Outlet | Fase | Siklus | Awal–cutoff WIB | Item | Satuan | Stok awal | Masuk | Keluar | Teoritis sebelum koreksi | Fisik | Selisih bertanda | Biaya/unit historis | Nilai absolut | Status kelengkapan | Sumber/bukti |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

### Lembar penjualan/BOM

| Outlet | Fase | Waktu transaksi | Menu | Qty | Modifier | Bahan | Jumlah dasar bahan | Dasar harga/batch | Biaya | Status lunas/batal |
|---|---|---|---|---|---|---|---|---|---|---|

### Ringkasan siklus

| Outlet | Fase | Siklus | Awal–cutoff WIB | HPP bahan | Stok kurang Rp | Stok lebih Rp | Nilai absolut Rp | Rasio % | Waste tercatat Rp | Lengkap/tidak | Alasan pengecualian |
|---|---|---|---|---|---|---|---|---|---|---|---|

### Ringkasan hasil penelitian — angka ilustrasi

| Outlet | Fase | Siklus valid | Nilai selisih | HPP bahan | Rasio |
|---|---|---:|---:|---:|---:|
| Aplikasi | Pretest | 14 | Rp300.000 | Rp10.000.000 | 3% |
| Aplikasi | Posttest | 14 | Rp200.000 | Rp10.000.000 | 2% |
| Manual | Pretest | 14 | Rp400.000 | Rp10.000.000 | 4% |
| Manual | Posttest | 14 | Rp350.000 | Rp10.000.000 | 3,5% |

Penurunan aplikasi = 1 poin persentase; manual = 0,5 poin; perbedaan penurunan = 0,5 poin. Pada ilustrasi ini indikator aplikasi benar-benar turun dan penurunannya lebih besar. Dua syarat ini diperlukan untuk menyatakan H1 didukung secara deskriptif sesuai proposal. Jika keduanya naik dan aplikasi hanya naik lebih sedikit, laporkan sebagai kenaikan relatif lebih kecil, bukan penurunan aktual.

## 7. Penyesuaian aplikasi yang dibuat

- HPP nol, tanpa opname, serta data biaya/fisik belum lengkap tidak menghasilkan 0% semu.
- Siklus opname dengan selisih nol ikut dihitung.
- Nilai selisih historis tidak diisi ulang dari harga master hari ini. Catatan tanpa snapshot biaya diberi penanda belum lengkap; jangan mengarang harga historis.
- Biaya Rp0 eksplisit untuk bahan gratis tetap valid.
- Waste dipisahkan dari nilai absolut selisih; pengurangan tanpa biaya ditandai parsial.
- Status perhitungan dan komponen yang belum lengkap tersedia pada layar dan ekspor Excel.
- Ringkasan semua outlet tidak menutupi outlet yang belum mempunyai opname.

## 8. Batas aplikasi saat ini dan masukan sebelum penelitian

1. Laporan aplikasi adalah laporan operasional per rentang tanggal kalender. HPP difilter menurut waktu pembayaran; opname menurut akhir siklus. Memilih tanggal saja belum menjamin waktu dan cakupan siklus benar-benar sama. Siklus lintas tanggal/bulan atau transaksi sesudah opname perlu direkonsiliasi dengan lembar siklus; jangan langsung memakai rasio kalender sebagai rasio penelitian.
2. Laporan belum menyediakan konfigurasi penelitian berupa fase pretest/posttest, daftar bahan tetap, impor data outlet manual, dan pembandingan dua kelompok. Gunakan lembar penelitian di atas untuk analisis tersebut. Label “Dapat dihitung” hanya memeriksa komponen yang tersedia, bukan membuktikan semua transaksi lapangan sudah lengkap.
3. Item terlacak pada laporan mengikuti konfigurasi saat laporan dibaca. Bekukan penanda pelacakan dan simpan daftar bahan sebagai lampiran; perubahan penanda historis memerlukan pengembangan snapshot pelacakan lebih lanjut.
4. HPP transaksi sudah menyimpan total biaya saat pembayaran, tetapi rincian BOM/biaya historis setiap bahan belum menjadi snapshot penelitian lengkap. Simpan versi BOM serta sumber harga selama pengamatan; perubahan resep saat pesanan masih ditahan harus dicatat.
5. Kejadian complimentary ditampilkan bersama pengurangan stok pada “Kerugian tercatat”. Dalam pembahasan penelitian, pisahkan pemberian gratis yang disengaja dari waste, kerusakan, dan kehilangan; seluruh nilai itu tidak otomatis merupakan kehilangan yang tidak terjelaskan.
6. Jangan mengubah sumber data outlet kontrol menjadi aplikasi selama posttest. Jika kelak ditambahkan formulir analisis manual, gunakan sebagai alat analisis setelah pencatatan operasional manual dilakukan, dan jelaskan prosedurnya dalam metode.

Prioritas sebelum pengamatan: sepakati durasi/cutoff, daftar bahan, metode harga yang dapat dilaksanakan di kedua outlet, dan lembar kelengkapan. Setelah itu lakukan uji angka terkendali, latihan petugas, lalu ambil data lapangan. Skema ini membantu menjaga kesesuaian aplikasi dan proposal tanpa mengklaim hasil penelitian sebelum datanya tersedia.
