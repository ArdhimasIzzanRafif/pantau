"use client"

import { useState } from "react"
import { WarningModal } from "./warning-modal"

/**
 * Pesan kesalahan sebuah form.
 *
 * Di HP tampil sebagai pop up: pesan di dalam form mudah terlewat karena berada
 * di luar layar, dan kemunculannya menggeser isi form saat pengguna sedang
 * mengetik. Di layar besar seluruh form terlihat sekaligus, jadi pesannya cukup
 * ditampilkan di tempatnya.
 *
 * `onClose` opsional — sebagian form menerima pesan error sebagai prop dan tidak
 * punya cara menghapusnya. Pop up tetap bisa ditutup karena komponen ini
 * mengingat sendiri pesan mana yang sudah ditutup pengguna.
 */
export function FormAlert({
  message,
  onClose,
  title,
}: {
  message: string
  onClose?: () => void
  title?: string
}) {
  const [dismissed, setDismissed] = useState(false)
  const [shownMessage, setShownMessage] = useState(message)

  // Pesan baru selalu ditampilkan lagi, termasuk bila isinya sama dengan yang
  // barusan ditutup tetapi muncul dari percobaan simpan berikutnya.
  if (message !== shownMessage) {
    setShownMessage(message)
    setDismissed(false)
  }

  if (!message) return null

  const close = () => {
    setDismissed(true)
    onClose?.()
  }

  return (
    <>
      <div
        role="alert"
        className="hidden rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:block"
      >
        {message}
      </div>
      <WarningModal
        open={!dismissed}
        onClose={close}
        title={title}
        messages={[message]}
        className="sm:hidden"
      />
    </>
  )
}
