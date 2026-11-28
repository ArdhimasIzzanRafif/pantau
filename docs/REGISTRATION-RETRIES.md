# Pengajuan ulang pendaftaran

- Pengajuan awal tercatat sebagai 1/3 dengan status `PENDING`.
- Penolakan pengajuan 1 atau 2 menghasilkan `REJECTED`. Pemilik mengisi ulang
  formulir `/register` dengan email akun sebelumnya. Sistem memakai
  user dan bisnis yang sama, memperbarui data formulir, menambah hitungan, dan
  mengembalikan status ke `PENDING`.
- Setelah pengajuan ketiga ditolak, status menjadi `SUSPENDED`. Formulir tidak
  dapat membuka blokir ini. Admin dapat mengaktifkan melalui detail bisnis.
- `PENDING`, akun aktif, anggota non-owner, dan akun dengan beberapa bisnis tidak
  dapat diubah melalui formulir pendaftaran. Suspensi manual tetap memerlukan admin.
- Penolakan/persetujuan hanya memproses pengajuan `PENDING` satu kali, dengan
  pengecekan status dan nomor pengajuan pada penulisan database serta audit admin.
- Nama pemilik, nama bisnis, WhatsApp, paket, dan password dapat diperbarui.
  Password lama membuktikan kepemilikan akun jika tetap dipakai. Jika pengguna
  memilih password baru, kirim tautan verifikasi ke email akun yang tersimpan.
  Pengguna membuka tautan dan melengkapi formulir Daftar; tidak perlu melalui Login.
- Tautan acak 256-bit disimpan sebagai hash dalam `VerificationToken`, memiliki
  namespace tersendiri, berlaku 20 menit, hanya dapat dipakai sekali, dan dibatasi
  pengiriman ulang satu menit. Penggantian password melalui alur lain membatalkan
  tautan lama. Pengajuan dan password tidak berubah sebelum verifikasi berhasil.

## Migrasi dan deployment

`npm run build:hostinger` menjalankan dua migrasi: penambahan status `REJECTED`,
kemudian kolom `registrationAttempts`. Migrasi kedua membuka penolakan lama yang
sebelumnya ditandai `SUSPENDED` tanpa timestamp suspensi atau masa aktif, hanya
untuk satu owner tanpa lokasi, inventori, pesanan, penerimaan, atau audit perubahan
status oleh admin. Bisnis operasional dan suspensi manual dipertahankan.

## Pengujian

`tests/registration-retry.test.ts` memerlukan database PostgreSQL lokal terpisah
dengan nama berawalan `pantau_registration_test`. Terapkan migrasi pada database
sementara tersebut, lalu jalankan:

```sh
node --import tsx --test --test-concurrency=1 tests/registration-retry.test.ts
node --import tsx --test tests/organization-subscription.test.ts
```

Tes mencakup tiga pengajuan, revisi data, email beda kapital, password salah,
kiriman serentak, peninjauan berulang, penangguhan ketiga, aktivasi admin,
suspensi manual, keanggotaan bisnis lain, migrasi penolakan lama, password baru,
tautan kedaluwarsa/salah/terpakai, dan batas pengiriman ulang. Jangan
menjalankan tes ini pada database aplikasi atau Hostinger.
