export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  const token = process.env.WA_FONNTE_TOKEN
  if (!token) return

  try {
    await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        target: phone,
        message,
        countryCode: "62",
      }),
    })
  } catch {
    // Jangan block request utama kalau WA gagal kirim
    console.error("[WA] Gagal kirim notifikasi ke", phone)
  }
}

export function ownerPhone(): string {
  return process.env.OWNER_PHONE ?? ""
}
