"use client"

import { forwardRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react"

type StableDraftInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "value"
> & {
  value: string | number
  onCommit: (value: string) => void
  formatValue?: (value: string) => string
}

/**
 * Input untuk form besar dan daftar berulang.
 *
 * Ketikan disimpan di komponen ini, lalu dikirim ke state induk saat blur.
 * Dengan begitu satu digit tidak merender ulang seluruh modal atau seluruh
 * daftar. Enter juga melakukan commit melalui blur sebelum form dikirim.
 */
export const StableDraftInput = forwardRef<HTMLInputElement, StableDraftInputProps>(
  function StableDraftInput(
    { value, onCommit, formatValue = (nextValue) => nextValue, onBlur, onKeyDown, ...props },
    ref,
  ) {
    const externalValue = String(value ?? "")
    const [draft, setDraft] = useState(externalValue)
    const [lastExternalValue, setLastExternalValue] = useState(externalValue)

    if (externalValue !== lastExternalValue) {
      setLastExternalValue(externalValue)
      setDraft(externalValue)
    }

    return (
      <input
        {...props}
        ref={ref}
        value={draft}
        onChange={(event) => setDraft(formatValue(event.target.value))}
        onBlur={(event) => {
          onCommit(draft)
          onBlur?.(event)
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (!event.defaultPrevented && event.key === "Enter") event.currentTarget.blur()
        }}
      />
    )
  },
)

type StableDraftTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "defaultValue" | "onChange" | "value"
> & {
  value: string
  onCommit: (value: string) => void
}

export const StableDraftTextarea = forwardRef<HTMLTextAreaElement, StableDraftTextareaProps>(
  function StableDraftTextarea({ value, onCommit, onBlur, ...props }, ref) {
    const [draft, setDraft] = useState(value)
    const [lastExternalValue, setLastExternalValue] = useState(value)

    if (value !== lastExternalValue) {
      setLastExternalValue(value)
      setDraft(value)
    }

    return (
      <textarea
        {...props}
        ref={ref}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          onCommit(draft)
          onBlur?.(event)
        }}
      />
    )
  },
)
