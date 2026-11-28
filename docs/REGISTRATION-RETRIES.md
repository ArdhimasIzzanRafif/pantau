# Pengajuan ulang pendaftaran

- Pengajuan awal tercatat sebagai 1/3 dengan status `PENDING`.
- Penolakan pengajuan 1 atau 2 menghasilkan `REJECTED`. Pemilik mengisi ulang
  formulir `/register` dengan email dan password akun sebelumnya. Sistem memakai
  user dan bisnis yang sama, memperbarui data formulir, menambah hitungan, dan
  mengembalikan status ke `PENDING`.
- Setelah pengajuan ketiga ditolak, status menjadi `SUSPENDED`. Formulir tidak
  dapat membuka blokir ini. Admin dapat mengaktifkan melalui detail bisnis.
- `PENDING`, akun aktif, anggota non-owner, dan akun dengan beberapa bisnis tidak
  dapat diubah melalui formulir pendaftaran. Suspensi manual tetap memerlukan admin.
- Penolakan/persetujuan hanya memproses pengajuan `PENDING` satu kali, dengan
  pengecekan status dan nomor pengajuan pada penulisan database serta audit admin.
- Daftar ulang memverifikasi password lama dan tidak menggantinya. Reset password
  tetap melalui alur Lupa password yang sudah tersedia.

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
suspensi manual, keanggotaan bisnis lain, dan migrasi penolakan lama. Jangan
menjalankan tes ini pada database aplikasi atau Hostinger.
