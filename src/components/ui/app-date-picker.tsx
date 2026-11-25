"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react"
import { AppPortal } from "@/components/ui/app-portal"

type AppDatePickerProps = {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  ariaLabel?: string
  className?: string
  disabled?: boolean
  clearable?: boolean
}

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function clampDateValue(value: string, min?: string, max?: string) {
  if (min && value < min) return min
  if (max && value > max) return max
  return value
}

function formatDate(value: string) {
  const date = parseDateValue(value)
  return date?.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }) ?? value
}

export function AppDatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pilih tanggal",
  ariaLabel,
  className = "",
  disabled = false,
  clearable = true,
}: AppDatePickerProps) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [draft, setDraft] = useState("")
  const [viewMonth, setViewMonth] = useState(() => new Date())
  const closeTimer = useRef(0)

  const openPicker = () => {
    if (disabled) return
    const initial = clampDateValue(value || toDateValue(new Date()), min, max)
    const initialDate = parseDateValue(initial) ?? new Date()
    window.clearTimeout(closeTimer.current)
    setDraft(initial)
    setViewMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1))
    setClosing(false)
    setOpen(true)
  }

  const closePicker = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 180)
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const mondayOffset = (firstDay.getDay() + 6) % 7
    const start = new Date(year, month, 1 - mondayOffset)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [viewMonth])

  const monthLabel = viewMonth.toLocaleDateString("id-ID", { month: "long", year: "numeric" })
  const canGoPrevious = !min || toDateValue(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0)) >= min
  const canGoNext = !max || toDateValue(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)) <= max

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        className={`flex min-w-0 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
        <span className={`min-w-0 flex-1 truncate ${value ? "text-slate-900" : "text-slate-400"}`}>
          {value ? formatDate(value) : placeholder}
        </span>
      </button>

      {open && (
        <AppPortal>
          <div className={`app-overlay ${closing ? "is-closing" : ""} z-[9999] isolate flex items-center justify-center p-4`}>
            <button type="button" aria-label="Tutup kalender" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={closePicker} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
                <div>
                  <h2 id={titleId} className="text-base font-semibold text-slate-900">Pilih tanggal</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Tanggal baru diterapkan setelah dikonfirmasi.</p>
                </div>
                <button type="button" onClick={closePicker} aria-label="Batal memilih tanggal" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-4 py-4 sm:px-5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                    disabled={!canGoPrevious}
                    aria-label="Bulan sebelumnya"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="text-sm font-semibold capitalize text-slate-900">{monthLabel}</div>
                  <button
                    type="button"
                    onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                    disabled={!canGoNext}
                    aria-label="Bulan berikutnya"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="py-1.5 text-center text-[11px] font-semibold text-slate-400">{day}</div>
                  ))}
                  {calendarDays.map((date) => {
                    const dateValue = toDateValue(date)
                    const outsideMonth = date.getMonth() !== viewMonth.getMonth()
                    const unavailable = (min ? dateValue < min : false) || (max ? dateValue > max : false)
                    const selected = dateValue === draft
                    const today = dateValue === toDateValue(new Date())
                    return (
                      <button
                        key={dateValue}
                        type="button"
                        disabled={unavailable}
                        onClick={() => setDraft(dateValue)}
                        className={`relative flex aspect-square min-h-10 items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                          selected
                            ? "bg-blue-600 text-white shadow-sm"
                            : unavailable
                              ? "text-slate-200"
                              : outsideMonth
                                ? "text-slate-300 hover:bg-slate-50"
                                : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                        }`}
                      >
                        {date.getDate()}
                        {today && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-blue-500" />}
                      </button>
                    )
                  })}
                </div>

                {clearable && value && (
                  <button
                    type="button"
                    onClick={() => { onChange(""); closePicker() }}
                    className="mt-2 text-xs font-semibold text-red-500 transition-colors hover:text-red-600"
                  >
                    Hapus tanggal
                  </button>
                )}
              </div>

              <div className="dialog-actions grid grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:px-5">
                <button type="button" onClick={closePicker} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!draft}
                  onClick={() => { onChange(draft); closePicker() }}
                  className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  Pilih tanggal
                </button>
              </div>
            </div>
          </div>
        </AppPortal>
      )}
    </>
  )
}
