import nodemailer from "nodemailer"

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? "banditclaude@gmail.com"

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!)
}

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
  const phoneDigits = ownerPhone?.replace(/\D/g, "") ?? ""
  const waNumber = phoneDigits.replace(/^0/, "62").replace(/^8/, "628")
  const hasWhatsApp = /^[1-9]\d{7,14}$/.test(waNumber)
  const detail = (label: string, value: string) => `
    <tr><td style="padding:0 0 18px">
      <p class="muted" style="margin:0 0 5px;font-size:12px;line-height:18px;color:#64748b">${label}</p>
      <p class="ink" style="margin:0;font-size:15px;line-height:23px;font-weight:600;color:#172033;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(value)}</p>
    </td></tr>`

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `🎉 Pendaftar baru: ${businessName}`,
    html: `
<!DOCTYPE html>
<html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>Pendaftaran bisnis baru · Pantau</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media only screen and (max-width:480px) {
    .outer { padding:16px 10px !important; }
    .content { padding:24px 20px !important; }
    .brand { padding:22px 20px !important; }
    .title { font-size:26px !important; line-height:33px !important; }
  }
  @media (prefers-color-scheme:dark) {
    body,.canvas { background-color:#111827 !important; }
    .surface { background-color:#1e293b !important; border-color:#334155 !important; }
    .soft { background-color:#263449 !important; border-color:#40516a !important; }
    .ink { color:#f1f5f9 !important; }
    .muted { color:#b8c5d6 !important; }
    .logo { color:#93b4ff !important; }
    .badge { background-color:#44361f !important; color:#fcd68a !important; }
    .brand,.footer { border-color:#334155 !important; }
  }
  .phone a { color:inherit !important; text-decoration:none !important; }
</style></head>
<body class="canvas" style="margin:0;padding:0;width:100%;background-color:#edf2f7;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(businessName)} mendaftar. Tinjau data bisnis dan hubungi pemilik melalui WhatsApp.</div>
<table role="presentation" class="canvas" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#edf2f7"><tr><td class="outer" align="center" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="560" align="center"><tr><td><![endif]-->
<table role="presentation" class="surface" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;table-layout:fixed;background-color:#ffffff;border:1px solid #dfe7f0;border-radius:20px">
  <tr><td class="brand" style="padding:26px 32px;border-bottom:1px solid #dfe7f0">
    <p class="logo" style="margin:0;color:#2563eb;font-size:25px;line-height:30px;font-weight:800;letter-spacing:-1px">Pantau</p>
    <p class="muted" style="margin:4px 0 0;color:#64748b;font-size:12px;line-height:18px">Notifikasi pendaftaran bisnis</p>
  </td></tr>
  <tr><td class="content" style="padding:30px 32px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="badge" bgcolor="#fff4d6" style="background-color:#fff4d6;color:#875b08;padding:6px 11px;border-radius:20px;font-size:11px;line-height:16px;font-weight:700">MENUNGGU PERSETUJUAN</td></tr></table>
    <h1 class="title ink" style="margin:18px 0 10px;color:#172033;font-size:30px;line-height:38px;font-weight:700;letter-spacing:-0.7px;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(businessName)}</h1>
    <p class="muted" style="margin:0 0 8px;color:#64748b;font-size:15px;line-height:24px">Tinjau data pendaftar berikut sebelum menyetujui akses bisnis.</p>
    <p class="muted" style="margin:0 0 26px;color:#64748b;font-size:12px;line-height:20px">${date} WIB</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed">
      ${detail("Nama pemilik", ownerName)}
      ${detail("Email", ownerEmail)}
      ${businessType ? detail("Jenis bisnis", businessType) : ""}
    </table>
    ${ownerPhone ? `
    <table role="presentation" class="soft" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;background-color:#f3f7fb;border:1px solid #dfe7f0;border-radius:14px"><tr><td style="padding:18px">
      <p class="muted" style="margin:0 0 6px;color:#64748b;font-size:12px;line-height:18px">WhatsApp pemilik</p>
      <p class="ink phone" style="margin:0 0 16px;color:#172033;font-size:20px;line-height:28px;font-weight:700;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(ownerPhone)}</p>
      ${hasWhatsApp ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#15803d" style="background-color:#15803d;border-radius:9px;mso-padding-alt:14px 12px">
        <a href="https://wa.me/${waNumber}" target="_blank" style="display:block;padding:14px 12px;border:1px solid #15803d;border-radius:9px;color:#ffffff;font-size:14px;line-height:20px;font-weight:700;text-align:center;text-decoration:none;white-space:nowrap">Chat WhatsApp &nbsp; &#8599;</a>
      </td></tr></table>` : ""}
    </td></tr></table>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr><td align="center" bgcolor="#2563eb" style="background-color:#2563eb;border-radius:10px;mso-padding-alt:16px 12px">
      <a href="${escapeHtml(appUrl)}/admin/requests" style="display:block;padding:16px 12px;border:1px solid #2563eb;border-radius:10px;color:#ffffff;font-size:15px;line-height:20px;font-weight:700;text-align:center;text-decoration:none;white-space:nowrap">Tinjau pendaftaran &nbsp; &#8594;</a>
    </td></tr></table>
    <p class="muted" style="margin:14px 0 0;color:#64748b;font-size:12px;line-height:19px;text-align:center">Persetujuan akun dilakukan melalui Admin Panel.</p>
  </td></tr>
  <tr><td class="footer" style="padding:20px;border-top:1px solid #dfe7f0;text-align:center">
    <p class="muted" style="margin:0;color:#64748b;font-size:11px;line-height:18px">© ${new Date().getFullYear()} Pantau<br>Sistem Manajemen Operasional</p>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
  })
}

export async function sendRegistrationVerificationEmail({ email, verificationUrl }: { email: string; verificationUrl: string }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw new Error("Email transport unavailable")
  await sendEmail({
    to: email,
    subject: "Konfirmasi email untuk daftar ulang Pantau",
    html: `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<style>@media(prefers-color-scheme:dark){.canvas{background-color:#111827!important}.card{background-color:#1e293b!important;border-color:#334155!important}.ink{color:#f1f5f9!important}.muted{color:#b8c5d6!important}.logo{color:#93b4ff!important}}@media(max-width:480px){.content{padding:26px 20px!important}}</style></head>
<body class="canvas" style="margin:0;padding:0;background-color:#edf2f7;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;overflow:hidden;mso-hide:all">Lanjutkan daftar ulang dengan data bisnis dan password baru.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;table-layout:fixed;background-color:#ffffff;border:1px solid #dfe7f0;border-radius:18px"><tr><td class="content" style="padding:32px">
<p class="logo" style="margin:0 0 28px;color:#2563eb;font-size:25px;font-weight:800">Pantau</p>
<h1 class="ink" style="margin:0 0 12px;color:#172033;font-size:25px;line-height:33px">Lanjutkan daftar ulang</h1>
<p class="muted" style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:24px">Konfirmasi bahwa email ini milik Anda sebelum menggunakan password baru. Setelah membuka tautan, isi kembali formulir Daftar dengan data bisnis dan password yang Anda inginkan.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#2563eb" style="background-color:#2563eb;border-radius:10px;mso-padding-alt:16px 12px"><a href="${escapeHtml(verificationUrl)}" style="display:block;padding:16px 12px;border:1px solid #2563eb;border-radius:10px;color:#ffffff;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;text-align:center">Lanjut ke formulir Daftar &#8594;</a></td></tr></table>
<p class="muted" style="margin:20px 0 8px;color:#64748b;font-size:12px;line-height:20px">Tautan berlaku 20 menit dan hanya dapat digunakan sekali. Pengajuan baru dihitung setelah formulir berhasil dikirim.</p>
<p class="muted" style="margin:0;color:#64748b;font-size:12px;line-height:20px">Jika Anda tidak meminta daftar ulang, abaikan email ini. Data akun Anda tetap tersimpan.</p>
</td></tr></table></td></tr></table></body></html>`,
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
