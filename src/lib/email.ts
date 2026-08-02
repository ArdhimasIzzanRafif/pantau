import nodemailer from "nodemailer"

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? "banditclaude@gmail.com"

function createTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })
}

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return
  await createTransport().sendMail({
    from: `"Pantau" <${process.env.GMAIL_USER}>`,
    to, subject, html,
  })
}

export async function sendNewSignupNotification({
  ownerName, ownerEmail, ownerPhone, businessName, businessType,
}: {
  ownerName: string; ownerEmail: string; ownerPhone?: string
  businessName: string; businessType?: string
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const date = new Date().toLocaleString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  })
  const waNumber = ownerPhone?.replace(/\D/g, "").replace(/^0/, "62")

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `🎉 Pendaftar baru: ${businessName}`,
    html: `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
  <tr><td style="background:#0f172a;border-radius:16px 16px 0 0;padding:24px 32px">
    <span style="color:#3b82f6;font-weight:800;font-size:20px">Pantau</span>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 32px">
    <p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0f172a">Pendaftar baru masuk 🚀</p>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b">${date} · Menunggu persetujuan admin</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:110px">Nama</td><td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600">${ownerName}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Email</td><td style="padding:5px 0;color:#0f172a;font-size:13px">${ownerEmail}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Bisnis</td><td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600">${businessName}</td></tr>
      ${businessType ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Tipe</td><td style="padding:5px 0;color:#0f172a;font-size:13px">${businessType}</td></tr>` : ""}
      ${ownerPhone ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">WhatsApp</td><td style="padding:5px 0;font-size:13px"><a href="https://wa.me/${waNumber}" style="color:#25d366;font-weight:600;text-decoration:none">${ownerPhone} · Chat WA →</a></td></tr>` : ""}
    </table>
    <a href="${appUrl}/admin/requests" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px">Lihat di Admin Panel →</a>
  </td></tr>
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:14px 32px;text-align:center">
    <p style="margin:0;font-size:12px;color:#cbd5e1">© 2026 Pantau · Sistem Manajemen Operasional</p>
  </td></tr>
</table></td></tr></table></body></html>`,
  })
}

export async function sendRegistrationConfirmation({
  ownerName, ownerEmail, businessName,
}: {
  ownerName: string; ownerEmail: string; businessName: string
}) {
  await sendEmail({
    to: ownerEmail,
    subject: `Pendaftaran ${businessName} sedang diproses`,
    html: `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
  <tr><td style="background:#0f172a;border-radius:16px 16px 0 0;padding:24px 32px">
    <span style="color:#3b82f6;font-weight:800;font-size:20px">Pantau</span>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 32px">
    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a">Pendaftaran Diterima</p>
    <p style="margin:0 0 28px;font-size:15px;color:#64748b;line-height:1.6">
      Halo <strong style="color:#0f172a">${ownerName}</strong>, terima kasih sudah mendaftar! Tim kami akan meninjau akun Anda dan menghubungi Anda secepatnya untuk memulai onboarding.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:28px">
      <tr><td><p style="margin:0 0 16px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Langkah selanjutnya</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td width="32" valign="top"><div style="width:28px;height:28px;background:#2563eb;border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:700;color:#fff">1</div></td>
          <td style="padding-left:12px"><p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#0f172a">Tinjauan akun</p><p style="margin:0;font-size:13px;color:#94a3b8">Tim kami memeriksa data pendaftaran Anda</p></td>
        </tr></table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
          <td width="32" valign="top"><div style="width:28px;height:28px;background:#e2e8f0;border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:700;color:#94a3b8">2</div></td>
          <td style="padding-left:12px"><p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#94a3b8">Kami menghubungi Anda</p><p style="margin:0;font-size:13px;color:#cbd5e1">Via WhatsApp atau email untuk jadwal onboarding</p></td>
        </tr></table>
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="32" valign="top"><div style="width:28px;height:28px;background:#e2e8f0;border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:700;color:#94a3b8">3</div></td>
          <td style="padding-left:12px"><p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#94a3b8">Akses penuh Pantau</p><p style="margin:0;font-size:13px;color:#cbd5e1">Mulai kelola bisnis Anda dengan lebih efisien</p></td>
        </tr></table>
      </td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">Ada pertanyaan? Balas email ini atau hubungi kami langsung.<br>Salam, <strong style="color:#475569">Tim Pantau</strong></p>
  </td></tr>
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:14px 32px;text-align:center">
    <p style="margin:0;font-size:12px;color:#cbd5e1">© 2026 Pantau · Sistem Manajemen Operasional</p>
  </td></tr>
</table></td></tr></table></body></html>`,
  })
}

export async function sendApprovalEmail({
  ownerName, ownerEmail, businessName, trialEndsAt,
}: {
  ownerName: string; ownerEmail: string; businessName: string; trialEndsAt: Date
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const trialDate = trialEndsAt.toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  })

  await sendEmail({
    to: ownerEmail,
    subject: `🎉 Akun ${businessName} sudah aktif — Selamat datang di Pantau!`,
    html: `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
  <tr><td style="background:#0f172a;border-radius:16px 16px 0 0;padding:24px 32px">
    <span style="color:#3b82f6;font-weight:800;font-size:20px">Pantau</span>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 32px">
    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a">Akun Anda Telah Disetujui! 🚀</p>
    <p style="margin:0 0 28px;font-size:15px;color:#64748b;line-height:1.6">
      Halo <strong style="color:#0f172a">${ownerName}</strong>, selamat! Akun <strong style="color:#0f172a">${businessName}</strong> sudah aktif dan siap digunakan.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin-bottom:28px">
      <tr><td>
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.08em">Info Langganan Anda</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;width:110px">Status</td>
            <td style="padding:4px 0;font-size:13px"><span style="background:#16a34a;color:#fff;font-weight:700;font-size:11px;padding:2px 10px;border-radius:20px">AKTIF</span></td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px">Aktif hingga</td>
            <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600">${trialDate}</td>
          </tr>
        </table>
      </td></tr>
    </table>
    <a href="${appUrl}/login" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:16px 36px;border-radius:14px;margin-bottom:28px;letter-spacing:0.01em">
      Akses Pantau →
    </a>
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6">Ada pertanyaan? Balas email ini — kami siap membantu.<br>Salam, <strong style="color:#475569">Tim Pantau</strong></p>
  </td></tr>
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:14px 32px;text-align:center">
    <p style="margin:0;font-size:12px;color:#cbd5e1">© 2026 Pantau · Sistem Manajemen Operasional</p>
  </td></tr>
</table></td></tr></table></body></html>`,
  })
}

export async function sendPasswordResetEmail({
  name, email, resetUrl,
}: { name: string; email: string; resetUrl: string }) {
  await sendEmail({
    to: email,
    subject: "Reset password Pantau kamu",
    html: `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
  <tr><td style="background:#0f172a;border-radius:16px 16px 0 0;padding:24px 32px">
    <span style="color:#3b82f6;font-weight:800;font-size:20px">Pantau</span>
  </td></tr>
  <tr><td style="background:#fff;padding:36px 32px">
    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a">Reset Password</p>
    <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6">
      Halo <strong style="color:#0f172a">${name}</strong>, kami menerima permintaan reset password untuk akun <strong>${email}</strong>.
    </p>
    <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px;margin-bottom:24px">
      Reset Password Sekarang →
    </a>
    <p style="margin:0 0 8px;font-size:13px;color:#94a3b8">Link ini hanya berlaku selama <strong>1 jam</strong>.</p>
    <p style="margin:0;font-size:13px;color:#cbd5e1">Jika kamu tidak meminta reset password, abaikan email ini.</p>
  </td></tr>
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:14px 32px;text-align:center">
    <p style="margin:0;font-size:12px;color:#cbd5e1">© 2026 Pantau · Sistem Manajemen Operasional</p>
  </td></tr>
</table></td></tr></table></body></html>`,
  })
}
