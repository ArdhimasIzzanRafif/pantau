"use client"

import { useCallback, useState } from "react"
import { ConfirmModal } from "./confirm-modal"

type ConfirmRequest = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

/**
 * Dialog konfirmasi bersama, pengganti `window.confirm()`.
 *
 * `confirm()` bawaan browser tampil beda di tiap peramban dan sistem operasi,
 * memblokir thread, serta tidak bisa menampilkan status "sedang memproses".
 * Hook ini memakai `ConfirmModal` yang sama di seluruh aplikasi.
 *
 *   const { ask, dialog } = useConfirm()
 *   ask({ title: "Hapus anggota ini?", danger: true, onConfirm: () => ... })
 *   ...
 *   {dialog}
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const ask = useCallback((next: ConfirmRequest) => {
    setError("")
    setRequest(next)
  }, [])

  async function run() {
    if (!request) return
    setLoading(true)
    setError("")
    try {
      await request.onConfirm()
      setRequest(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tindakan gagal. Coba lagi.")
    } finally {
      setLoading(false)
    }
  }

  const dialog = (
    <ConfirmModal
      open={request !== null}
      onCancel={() => setRequest(null)}
      onConfirm={run}
      title={request?.title ?? ""}
      message={request?.message}
      confirmLabel={request?.confirmLabel}
      cancelLabel={request?.cancelLabel}
      danger={request?.danger}
      loading={loading}
      error={error}
    />
  )

  return { ask, dialog }
}
