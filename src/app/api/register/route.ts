import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { sendNewSignupNotification, sendRegistrationConfirmation } from "@/lib/email"
import { isPasswordValid } from "@/lib/password"

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, password, businessName, businessType, plan } = await req.json()

    if (!name || !email || !password || !businessName) {
      return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 })
    }
    if (!isPasswordValid(password)) {
      return NextResponse.json({ error: "Password harus minimal 8 karakter, mengandung huruf kecil, huruf besar, dan angka" }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 409 })
    }

    const hashed = await bcrypt.hash(password, 12)

    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      + "-" + Date.now().toString(36)

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, password: hashed },
      })

      const planValue = plan === "operasional" ? "PRO" : "STARTER"

      const org = await tx.organization.create({
        data: {
          name: businessName,
          slug,
          ownerPhone: phone ?? null,
          status: "PENDING",
          plan: planValue,
          users: {
            create: { userId: newUser.id, role: "OWNER" },
          },
          // Tidak membuat lokasi default — owner menambahkan gudang/outlet sendiri.
        },
      })

      return { user: newUser, org }
    })

    // Kirim email (non-blocking)
    sendNewSignupNotification({ ownerName: name, ownerEmail: email, ownerPhone: phone, businessName, businessType }).catch(console.error)
    sendRegistrationConfirmation({ ownerName: name, ownerEmail: email, businessName }).catch(console.error)

    return NextResponse.json({
      message: "Akun berhasil dibuat",
      userId: user.user.id,
      organizationId: user.org.id,
    })
  } catch (error) {
    console.error("Register error:", error)
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 })
  }
}
