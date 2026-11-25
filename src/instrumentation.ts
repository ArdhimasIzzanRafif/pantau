/**
 * Dijalankan sekali setiap kali instance server Next dimulai.
 *
 * Dipakai untuk menyalakan pemroses antrean WhatsApp, supaya pesan yang
 * dijadwalkan ulang setelah gagal tetap terkirim tanpa menunggu ada pengguna
 * yang membuka aplikasi.
 */
export async function register() {
  // Hanya di runtime Node; runtime Edge tidak punya akses database.
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { startOutboxWorker } = await import("@/lib/whatsapp-outbox-worker")
  startOutboxWorker()
}
