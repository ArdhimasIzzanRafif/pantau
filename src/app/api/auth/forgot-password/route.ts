import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { randomBytes } from "crypto"
import { sendPasswordResetEmail } from "@/lib/email"

export async function POST(req: NextRequest) {
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: "Email wajib diisi" }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { email } })

  // Selalu return sukses agar tidak bocorkan apakah email terdaftar
  if (!user) return NextResponse.json({ ok: true })

  // Hapus token lama jika ada
  await prisma.verificationToken.deleteMany({ where: { identifier: email } })

  const token = randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 jam

  await prisma.verificationToken.create({ data: { identifier: email, token, expires } })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const resetUrl = `${appUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`

  sendPasswordResetEmail({ name: user.name ?? "Pengguna", email, resetUrl }).catch(console.error)

  return NextResponse.json({ ok: true })
}
