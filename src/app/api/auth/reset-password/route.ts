import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { isPasswordValid } from "@/lib/password"

export async function POST(req: NextRequest) {
  const { email, token, password } = await req.json()

  if (!email || !token || !password) {
    return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 })
  }
  if (!isPasswordValid(password)) {
    return NextResponse.json({ error: "Password harus minimal 8 karakter, mengandung huruf kecil, huruf besar, dan angka" }, { status: 400 })
  }

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  })

  if (!record) return NextResponse.json({ error: "Link tidak valid" }, { status: 400 })
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } })
    return NextResponse.json({ error: "Link sudah kadaluarsa, minta ulang" }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { email }, data: { password: hashed } })
  await prisma.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } })

  return NextResponse.json({ ok: true })
}
