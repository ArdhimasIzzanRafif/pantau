import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { sendNewSignupNotification, sendRegistrationConfirmation, sendRegistrationVerificationEmail } from "@/lib/email"
import { isPasswordValid } from "@/lib/password"
import { submitRegistration, registrationErrorResponse, RegistrationVerificationRequired } from "@/lib/registration"
import { issueRegistrationVerification, registrationVerificationHash } from "@/lib/registration-verification"

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, password, businessName, businessType, plan, retryToken } = await req.json()

    if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== "string" || typeof businessName !== "string" || !businessName.trim() || (phone != null && typeof phone !== "string")) {
      return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 })
    }
    if (!isPasswordValid(password)) {
      return NextResponse.json({ error: "Password harus minimal 8 karakter, mengandung huruf kecil, huruf besar, dan angka" }, { status: 400 })
    }
    if (retryToken != null && typeof retryToken !== "string") return NextResponse.json({ error: "Tautan verifikasi tidak valid" }, { status: 400 })

    const result = await submitRegistration(prisma, { name, email, phone, password, businessName, plan, retryToken })

    // Kirim email (non-blocking)
    sendNewSignupNotification({ ownerName: name, ownerEmail: email, ownerPhone: phone, businessName, businessType }).catch(console.error)
    sendRegistrationConfirmation({ ownerName: name, ownerEmail: email, businessName }).catch(console.error)

    return NextResponse.json({
      message: result.resubmitted ? "Pengajuan ulang berhasil dikirim" : "Akun berhasil dibuat",
      ...result,
    })
  } catch (error) {
    if (error instanceof RegistrationVerificationRequired) {
      try {
        const challenge = await issueRegistrationVerification(prisma, error.userId, error.passwordHash)
        if (!challenge) return NextResponse.json({ error: "Tautan verifikasi baru saja dikirim. Periksa inbox/spam atau tunggu 1 menit sebelum meminta ulang." }, { status: 429 })
        const url = new URL("/register", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
        url.searchParams.set("email", error.email)
        url.searchParams.set("retryToken", challenge.token)
        try {
          await sendRegistrationVerificationEmail({ email: error.email, verificationUrl: url.toString() })
        } catch {
          await prisma.verificationToken.deleteMany({ where: { identifier: challenge.identifier, token: registrationVerificationHash(challenge.token) } })
          return NextResponse.json({ error: "Email verifikasi belum dapat dikirim. Coba lagi sebentar." }, { status: 503 })
        }
        return NextResponse.json({ requiresEmailVerification: true, message: "Kami mengirim tautan verifikasi ke email akun Anda. Buka tautan tersebut, lalu lengkapi formulir dengan data dan password baru. Pengajuan belum dihitung sebelum formulir berhasil dikirim." }, { status: 202 })
      } catch {
        return NextResponse.json({ error: "Verifikasi email belum dapat diproses. Coba lagi sebentar." }, { status: 503 })
      }
    }
    const failure = registrationErrorResponse(error)
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status })
    console.error("Register error:", error)
    return NextResponse.json({ error: "Terjadi kesalahan" }, { status: 500 })
  }
}
