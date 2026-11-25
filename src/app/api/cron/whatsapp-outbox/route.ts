import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/db"
import { runOutboxOnce } from "@/lib/whatsapp-outbox-worker"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Pemicu antrean WhatsApp untuk penjadwal dari luar.
 *
 * Dibutuhkan pada hosting serverless, yang prosesnya mati di antara request
 * sehingga pemroses berkala di dalam proses (src/instrumentation.ts) tidak
 * dapat diandalkan. Panggil sekitar satu menit sekali, misalnya:
 *
 *   crontab:  * * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *               https://domain-anda/api/cron/whatsapp-outbox
 *
 *   Vercel:   { "crons": [{ "path": "/api/cron/whatsapp-outbox", "schedule": "* * * * *" }] }
 *             di vercel.json — Vercel mengirim header Authorization sendiri.
 *
 * Aman dipanggil beberapa kali bersamaan: penguncian baris di antrean yang
 * menjaga agar satu pesan tidak terkirim dua kali.
 */
async function handle(req: Request) {
  const expected = process.env.CRON_SECRET ?? ""
  if (!expected) {
    return Response.json(
      { error: "CRON_SECRET belum diisi, pemicu berkala dari luar belum aktif" },
      { status: 503 },
    )
  }

  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? new URL(req.url).searchParams.get("secret")
    ?? ""
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Tidak diizinkan" }, { status: 401 })
  }

  const sent = await runOutboxOnce(50)
  const waiting = await prisma.whatsAppOutbox.count({ where: { status: "PENDING" } })
  return Response.json({ diproses: sent, masihMenunggu: waiting })
}

export const GET = handle
export const POST = handle
