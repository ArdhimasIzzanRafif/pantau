# Deployment Pantau ke temporary domain Hostinger

Source berada di repository privat `ArdhimasIzzanRafif/pantau`, branch `main`.
Website memakai Next.js 16, Node.js 22 dan PostgreSQL melalui Prisma 7.

## Konfigurasi deployment

- Aktifkan paket hosting yang mendukung Web Apps / Node.js.
- Pilih Web Apps, buat aplikasi, dan gunakan temporary domain dahulu.
- Import repository GitHub `pantau`, branch `main`, root directory `.`.
- Pilih framework **Next.js**, Node.js **22.x**, package manager **npm**.
- Gunakan build command `npm run build:hostinger` dan start command
  `npm run start` jika diminta. Ikuti output directory bawaan preset Next.js.
- Masukkan environment variable di pengaturan Hostinger sebelum build.
  `.env.example` hanya mencantumkan nama variabel dan nilai aman.

`build:hostinger` menjalankan `prisma migrate deploy`, lalu `prisma generate`
dan `next build`. Database harus sudah tersedia sebelum command ini dijalankan.
Untuk build tanpa menjalankan migrasi gunakan `npm run build`.
Tidak ada seed, reset, atau penghapusan data otomatis pada build.

## Database dan secret

Gunakan database PostgreSQL terkelola terpisah untuk pengujian awal, misalnya
database staging yang baru. `localhost` di `DATABASE_URL` lokal menunjuk laptop,
sehingga tidak dapat dipakai dari server Hostinger. Ambil connection string dan
konfigurasi TLS dari penyedia database; jangan menonaktifkan verifikasi TLS.
Migrasi memerlukan koneksi yang didukung Prisma Migrate oleh penyedia tersebut.

Isi `NEXTAUTH_SECRET` dengan secret acak minimal 32 byte.
Isi `WHATSAPP_ENCRYPTION_KEY` dengan kunci acak 32 byte dalam format hex
(64 karakter). Saat memindahkan database yang sudah berisi token WhatsApp
terenkripsi, gunakan kunci enkripsi sebelumnya agar token tetap bisa dibaca.
Simpan semua nilai asli secara privat; jangan masukkan ke repository atau chat.

Set `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, dan `APP_URL` ke origin HTTPS
temporary domain. `NEXT_PUBLIC_APP_URL` dibaca saat build sehingga perubahan URL
memerlukan build ulang. Isi `SUPER_ADMIN_EMAIL` dan `ADMIN_NOTIFY_EMAIL` dengan
email admin yang benar. Email aplikasi memakai Gmail melalui `GMAIL_USER` dan
`GMAIL_APP_PASSWORD` (App Password).

Token WhatsApp diatur per bisnis melalui pengaturan aplikasi dan disimpan
terenkripsi di database. Awali dengan `WHATSAPP_OUTBOUND_ENABLED=false`; ubah
menjadi `true` hanya ketika siap mengetes dengan database staging yang berisi
nomor uji milik sendiri. `true` mengizinkan pengiriman ke semua nomor.
`WHATSAPP_ALLOWED_NUMBERS` merupakan daftar tambahan nomor yang diizinkan, bukan
pembatas untuk mode `true`; mode `false` tetap memblokir semua pengiriman.

## Pemeriksaan sebelum menghubungkan domain utama

- Daftar dan login akun uji; pastikan aktivasi admin dan hak akses sesuai.
- Pastikan data tersimpan dan migrasi database selesai.
- Unggah foto, cek kembali setelah restart dan redeploy.
- Periksa laporan dan ekspor Excel memakai data uji.
- Uji email dan WhatsApp secara eksplisit dengan penerima milik sendiri.

Unggahan saat ini disimpan di `public/uploads` pada filesystem server dan tidak
diunggah ke GitHub. Sebelum memakai data sungguhan, pastikan folder ini bertahan
melewati deployment Hostinger, atau pindahkan penyimpanan ke object storage.
Database eksternal saja tidak menyimpan berkas foto tersebut.

Jangan menghubungkan domain utama sebelum pemeriksaan temporary domain selesai.
Jangan menjalankan `db:reset`, `wipe-demo`, skrip wipe, atau seed demo pada database
produksi. Akun uji pada `setup-burger-arman.ts` memerlukan `SEED_PASSWORD` privat
minimal 12 karakter dan bukan bagian dari proses deployment.

Referensi resmi:

- https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/
- https://www.hostinger.com/support/how-to-deploy-prisma-apps-on-hostinger-node-js-hosting/
- https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/
