"use client"

import { useEffect, useId, useRef } from "react"
import { AlertTriangle, Trash2, X } from "lucide-react"
import { createPortal } from "react-dom"

type ConfirmModalProps = {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  error?: string
}

export function ConfirmModal({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  danger = false,
  loading = false,
  error,
}: ConfirmModalProps) {
  const titleId = useId()
  const messageId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus({ preventScroll: true })
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCancel()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, loading, onCancel])

  if (!open) return null

  return createPortal(
    <div className="app-overlay z-[9999] isolate flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup konfirmasi"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]"
        onClick={loading ? undefined : onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start gap-4 px-6 pb-5 pt-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
            {danger ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1 pr-5">
            <h2 id={titleId} className="text-base font-semibold leading-6 text-slate-900">{title}</h2>
            {message && <p id={messageId} className="mt-1.5 text-sm leading-6 text-slate-500">{message}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <p role="alert" className="mx-6 mb-5 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`min-h-10 rounded-xl px-5 text-sm font-semibold text-white transition disabled:opacity-60 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {loading ? "Memproses..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
