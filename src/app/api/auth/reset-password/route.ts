import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { isPasswordValid } from "@/lib/password"

const noStoreHeaders = { "Cache-Control": "no-store" }

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") ?? ""
  const token = req.nextUrl.searchParams.get("token") ?? ""

  if (!email || !token) {
    return NextResponse.json(
      { valid: false, reason: "INVALID" },
      { status: 400, headers: noStoreHeaders },
    )
  }

  const record = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier: email, token } },
  })

  if (!record) {
    return NextResponse.json(
      { valid: false, reason: "INVALID" },
      { status: 404, headers: noStoreHeaders },
    )
  }

  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token } },
    })
    return NextResponse.json(
      { valid: false, reason: "EXPIRED" },
      { status: 410, headers: noStoreHeaders },
    )
  }

  return NextResponse.json({ valid: true }, { headers: noStoreHeaders })
}

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

  if (!record) {
    return NextResponse.json(
      { error: "Link tidak valid", reason: "INVALID" },
      { status: 400 },
    )
  }
  if (record.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } })
    return NextResponse.json(
      { error: "Link sudah kedaluwarsa, minta ulang", reason: "EXPIRED" },
      { status: 410 },
    )
  }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { email }, data: { password: hashed } })
  await prisma.verificationToken.delete({ where: { identifier_token: { identifier: email, token } } })

  return NextResponse.json({ ok: true })
}
