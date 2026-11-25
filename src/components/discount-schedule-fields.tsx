"use client"

import { CalendarCheck2, Check, Repeat2, Timer } from "lucide-react"
import { AppDatePicker } from "@/components/ui/app-date-picker"
import { DiscountScheduleForm, discountSchedulePreview } from "@/lib/discount-schedule-form"

type Props = {
  value: DiscountScheduleForm
  onChange: (patch: Partial<DiscountScheduleForm>) => void
}

const fieldClass = "min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"

export function DiscountScheduleFields({ value, onChange }: Props) {
  const period = value.scheduleMode === "PERIOD"
  const dateField = (end: boolean) => (
    <AppDatePicker value={end ? value.expiresAt : value.startsAt}
      onChange={(date) => onChange(end ? { expiresAt: date } : { startsAt: date })}
      ariaLabel={end ? "Tanggal berakhir diskon" : "Tanggal mulai diskon"}
      placeholder="Pilih tanggal" className={fieldClass} />
  )
  const timeField = (end: boolean) => (
    <input type="time" name={end ? "discountEndTime" : "discountStartTime"}
      aria-label={end ? "Jam berakhir diskon" : "Jam mulai diskon"}
      value={end ? value.endTime : value.startTime}
      onChange={(event) => onChange(end ? { endTime: event.currentTarget.value } : { startTime: event.currentTarget.value })}
      onBlur={(event) => onChange(end ? { endTime: event.currentTarget.value } : { startTime: event.currentTarget.value })}
      className={fieldClass} />
  )

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white">3</span>
        <div><h3 className="text-sm font-black text-slate-900">Jadwal berlaku</h3><p className="mt-0.5 text-xs text-slate-500">Tentukan kapan promo bisa digunakan. Semua waktu dalam WIB.</p></div>
      </div>

      <div role="group" aria-label="Jenis jadwal diskon" className="grid gap-3 sm:grid-cols-2">
        {([
          { mode: "PERIOD", title: "Sekali selama periode", description: "Aktif terus dari waktu mulai sampai berakhir.", Icon: CalendarCheck2 },
          { mode: "RECURRING", title: "Berulang", description: "Aktif pada hari dan jam tertentu, misalnya happy hour.", Icon: Repeat2 },
        ] as const).map(({ mode, title, description, Icon }) => (
          <button type="button" key={mode} aria-pressed={value.scheduleMode === mode}
            onClick={() => onChange({ scheduleMode: mode })}
            className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${value.scheduleMode === mode ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500" : "border-slate-200 bg-white hover:border-blue-300"}`}>
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${value.scheduleMode === mode ? "text-blue-600" : "text-slate-400"}`} />
            <span className="flex-1"><span className="block text-sm font-bold text-slate-900">{title}</span><span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span></span>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${value.scheduleMode === mode ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>
              {value.scheduleMode === mode && <Check className="h-3.5 w-3.5" />}
            </span>
          </button>
        ))}
      </div>

      {period ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {([false, true] as const).map((end) => (
            <div key={String(end)} className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">{end ? "Berakhir" : "Mulai"} <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">{dateField(end)}{timeField(end)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-600">Hari berlaku</p>
              <button type="button" onClick={() => onChange({ validDays: [] })} className="text-xs font-semibold text-blue-600">Setiap hari</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day, index) => (
                <button key={day} type="button" aria-pressed={value.validDays.includes(index)}
                  onClick={() => onChange({ validDays: value.validDays.includes(index) ? value.validDays.filter((selected) => selected !== index) : [...value.validDays, index] })}
                  className={`min-h-10 min-w-12 rounded-full border px-3 text-xs font-semibold transition-colors ${value.validDays.includes(index) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:border-blue-300"}`}>{day}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">{value.validDays.length ? "Hanya aktif pada hari yang dipilih." : "Berlaku setiap hari karena tidak ada hari yang dibatasi."}</p>
          </div>
          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <div className="space-y-2"><p className="text-xs font-semibold text-slate-600">Jam mulai — selesai</p>
              <div className="grid grid-cols-2 gap-2">{timeField(false)}{timeField(true)}</div>
              <p className="text-xs text-slate-400">Kosongkan keduanya untuk sepanjang hari.</p>
            </div>
            <div className="space-y-2"><p className="text-xs font-semibold text-slate-600">Batas tanggal <span className="font-normal text-slate-400">(opsional)</span></p>
              <div className="grid grid-cols-2 gap-2">{dateField(false)}{dateField(true)}</div>
              <p className="text-xs text-slate-400">Tanggal mulai dan tanggal terakhir promo.</p>
            </div>
          </div>
        </div>
      )}

      <div role="status" className="flex items-start gap-2.5 rounded-xl bg-blue-50 px-3.5 py-3 text-xs leading-relaxed text-blue-700">
        <Timer className="mt-0.5 h-4 w-4 shrink-0" /><p>{discountSchedulePreview(value)}</p>
      </div>
    </section>
  )
}
