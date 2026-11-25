import type { ReactNode } from "react"

/**
 * Kartu ringkasan "Info ..." pada halaman detail riwayat (shift, penerimaan,
 * opname). Barisnya dipisah garis tipis: label di kiri, nilai rata kanan.
 *
 * Teks bebas yang panjang — catatan, alasan penolakan — sebaiknya tidak
 * dipaksa rata kanan; pakai `InfoNote` supaya tampil sebagai paragraf penuh
 * di bawah daftar.
 */
export function InfoCard({ icon, title, children }: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2 text-slate-700">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">{children}</dl>
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    // Di HP label ditaruh di atas nilainya. Saat keduanya dipaksa sejajar, nilai
    // panjang seperti tanggal lengkap terdorong membungkus ke baris kedua dan
    // terlihat menumpuk di sebelah labelnya.
    <div className="flex flex-col gap-0.5 py-2.5 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-slate-800 sm:text-right">{value}</dd>
    </div>
  )
}

export function InfoNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="text-xs text-slate-400">{label}</div>
      <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
        {children}
      </p>
    </div>
  )
}
