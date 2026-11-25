"use client"

import { useEffect, useId, useRef } from "react"
import { AlertTriangle, X } from "lucide-react"
import { createPortal } from "react-dom"

type WarningModalProps = {
  open: boolean
  onClose: () => void
  title?: string
  messages: string[]
  /** Kelas tambahan untuk lapisan overlay, mis. membatasinya ke layar HP saja. */
  className?: string
}

export function WarningModal({ open, onClose, title = "Belum bisa dilanjutkan", messages, className = "" }: WarningModalProps) {
  const titleId = useId()
  const messageId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus({ preventScroll: true })
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className={`app-overlay z-[9999] isolate flex items-center justify-center p-4 ${className}`}>
      <button type="button" aria-label="Tutup peringatan" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]" onClick={onClose} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start gap-4 px-6 pb-5 pt-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 pr-5">
            <h2 id={titleId} className="text-base font-semibold leading-6 text-slate-900">{title}</h2>
            <div id={messageId} className="mt-1.5 text-sm leading-6 text-slate-500">
              {messages.length === 1 ? messages[0] : (
                <ul className="list-disc space-y-1 pl-4">
                  {messages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
                </ul>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button ref={closeRef} type="button" onClick={onClose} className="min-h-10 w-full rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 sm:w-auto">
            Mengerti
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
