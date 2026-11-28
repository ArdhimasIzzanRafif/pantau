import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { sendNewSignupNotification, sendRegistrationConfirmation } from "@/lib/email"
import { isPasswordValid } from "@/lib/password"
import { submitRegistration, registrationErrorResponse } from "@/lib/registration"

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, password, businessName, businessType, plan } = await req.json()

    if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== "string" || typeof businessName !== "string" || !businessName.trim() || (phone != null && typeof phone !== "string")) {
      return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 })
    }
    if (!isPasswordValid(password)) {
      return NextResponse.json({ error: "Password harus minimal 8 karakter, mengandung huruf kecil, huruf besar, dan angka" }, { status: 400 })
    }

    const result = await submitRegistration(prisma, { name, email, phone, password, businessName, plan })

    // Kirim email (non-blocking)
    sendNewSignupNotification({ ownerName: name, ownerEmail: email, ownerPhone: phone, businessName, businessType }).catch(console.error)
    sendRegistrationConfirmation({ ownerName: name, ownerEmail: email, businessName }).catch(console.error)

    return NextResponse.json({
      message: result.resubmitted ? "Pengajuan ulang berhasil dikirim" : "Akun berhasil dibuat",
      ...result,
    })
  } catch (error) {
    const failure = registrationErrorResponse(error)
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status })
    console.error("Register error:", error)
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 })
  }
}
