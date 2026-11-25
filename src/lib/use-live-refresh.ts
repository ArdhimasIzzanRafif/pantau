"use client"

import { useEffect, useRef } from "react"

/**
 * Menjaga data di layar tetap mengikuti perubahan yang dibuat pengguna lain.
 *
 * Data dimuat ulang saat layar kembali dibuka (pindah tab/aplikasi lalu kembali)
 * dan secara berkala selama layar terlihat. Saat tab tersembunyi tidak ada
 * permintaan sama sekali, supaya tidak membebani server sia-sia.
 *
 * `refresh` harus memuat ulang TANPA menyalakan indikator loading, agar isi
 * layar tidak berkedip setiap kali disegarkan.
 */
export function useLiveRefresh(refresh: () => void, intervalMs = 20_000) {
  const savedRefresh = useRef(refresh)

  useEffect(() => {
    savedRefresh.current = refresh
  }, [refresh])

  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== "visible") return
      savedRefresh.current()
    }
    window.addEventListener("focus", run)
    document.addEventListener("visibilitychange", run)
    const intervalId = window.setInterval(run, intervalMs)
    return () => {
      window.removeEventListener("focus", run)
      document.removeEventListener("visibilitychange", run)
      window.clearInterval(intervalId)
    }
  }, [intervalMs])
}
