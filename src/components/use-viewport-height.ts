"use client"

import { useEffect } from "react"

/**
 * Keyboard iOS mengecilkan dan kadang menggeser visual viewport tanpa
 * mengubah layout viewport. Dialog harus mengikuti kedua perubahan itu.
 *
 * Shell/dashboard mempertahankan tinggi layar saat keyboard muncul; keyboard
 * menimpa halaman. Visibilitas input diserahkan ke focusing steps browser agar
 * tidak ada koreksi scroll JavaScript kedua.
 * Halaman publik yang memakai scroll dokumen tetap mengikuti tinggi visual.
 */
export function useViewportHeight({ resetWindowScroll = true }: { resetWindowScroll?: boolean } = {}) {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const mobileShellQuery = window.matchMedia("(max-width: 767px) and (pointer: coarse)")

    // Mengunci body dibutuhkan di iPhone ketika keyboard muncul. Pada Safari
    // desktop, body fixed justru dapat kehilangan compositing layer ketika page
    // zoom berubah sehingga seluruh aplikasi tampak putih walau DOM masih ada.
    const syncDocumentLock = () => {
      document.documentElement.toggleAttribute(
        "data-app-shell-active",
        resetWindowScroll && mobileShellQuery.matches,
      )
    }
    syncDocumentLock()

    let viewportFrame = 0
    // `innerHeight` tetap mewakili layout viewport pada Safari iOS saat
    // keyboard mengecilkan visual viewport. Simpan nilai terbesar supaya shell
    // aplikasi tidak ikut memendek atau melompat selama keyboard dibuka.
    let frameHeight = Math.max(window.innerHeight, viewport.height)
    let frameWidth = viewport.width
    let keyboardOpen = false
    let lastAppHeight = ""
    let lastVisibleHeight = ""
    let lastViewportTop = ""
    let lastKeyboardOpen = false

    const apply = () => {
      if (viewport.height <= 0) return

      const isMobile = mobileShellQuery.matches
      syncDocumentLock()

      if (Math.abs(viewport.width - frameWidth) > 1) {
        frameWidth = viewport.width
        frameHeight = Math.max(window.innerHeight, viewport.height)
      } else if (!keyboardOpen) {
        // Jangan pernah mengambil tinggi keyboard sebagai tinggi frame baru.
        // Nilai hanya boleh bertambah selama orientasi/lebar tidak berubah.
        //
        // Selama keyboard terbuka tinggi frame dibekukan sepenuhnya: Safari
        // sempat melaporkan innerHeight yang berubah-ubah saat keyboard dan
        // address bar beranimasi, dan itu membuat shell serta dialog ikut
        // melar-menyusut.
        frameHeight = Math.max(frameHeight, window.innerHeight, viewport.height)
      }

      // Dua ambang batas (histeresis). Dengan satu ambang, tinggi viewport yang
      // naik-turun selama keyboard beranimasi — dan pergantian keyboard huruf ke
      // angka yang tingginya berbeda — membuat status ini menyala-mati berkali-
      // kali. Setiap pergantian mengubah layout body, dan itulah yang terlihat
      // bergerak-gerak saat mengetik. Sekali terbuka, keyboard baru dianggap
      // tertutup ketika layar hampir kembali penuh.
      const openThreshold = Math.max(120, frameHeight * 0.16)
      const closeThreshold = 64
      const threshold = keyboardOpen ? closeThreshold : openThreshold
      const keyboardVisible = resetWindowScroll && isMobile
        && viewport.height < frameHeight - threshold
      keyboardOpen = keyboardVisible

      // offsetTop Safari dapat tertinggal setelah keyboard ditutup. Shell fixed
      // tidak memakai nilai ini; variabel hanya disimpan untuk perhitungan
      // panel keyboard-aware dan selalu dinolkan ketika keyboard sudah hilang.
      const viewportTop = !resetWindowScroll || keyboardVisible ? Math.max(0, viewport.offsetTop) : 0

      const appHeight = `${Math.round(resetWindowScroll ? frameHeight : viewport.height)}px`
      const visibleHeight = `${Math.round(viewport.height)}px`
      const viewportTopValue = `${Math.round(viewportTop)}px`

      // Hindari style mutation berulang saat Safari mengirim banyak event
      // visualViewport.scroll untuk satu gesture yang sama.
      if (appHeight !== lastAppHeight) {
        document.documentElement.style.setProperty("--app-height", appHeight)
        lastAppHeight = appHeight
      }
      if (visibleHeight !== lastVisibleHeight) {
        document.documentElement.style.setProperty("--app-visible-height", visibleHeight)
        lastVisibleHeight = visibleHeight
      }
      if (viewportTopValue !== lastViewportTop) {
        document.documentElement.style.setProperty("--app-viewport-top", viewportTopValue)
        lastViewportTop = viewportTopValue
      }
      if (keyboardVisible !== lastKeyboardOpen) {
        document.documentElement.toggleAttribute("data-keyboard-open", keyboardVisible)
        lastKeyboardOpen = keyboardVisible
      }

      // Jangan mengoreksi posisi scroll dari sini. Focusing steps browser sudah
      // menangani visibilitas kolom. Koreksi kedua dari JavaScript adalah sumber
      // gerakan "naik, turun, lalu kembali" saat keyboard beranimasi.
    }

    const scheduleApply = () => {
      if (viewportFrame) return
      viewportFrame = window.requestAnimationFrame(() => {
        viewportFrame = 0
        apply()
      })
    }

    apply()
    viewport.addEventListener("resize", scheduleApply)
    if (!resetWindowScroll) viewport.addEventListener("scroll", scheduleApply)
    viewport.addEventListener("scrollend", scheduleApply)
    window.addEventListener("resize", scheduleApply)
    return () => {
      viewport.removeEventListener("resize", scheduleApply)
      if (!resetWindowScroll) viewport.removeEventListener("scroll", scheduleApply)
      viewport.removeEventListener("scrollend", scheduleApply)
      window.removeEventListener("resize", scheduleApply)
      window.cancelAnimationFrame(viewportFrame)
      document.documentElement.style.removeProperty("--app-height")
      document.documentElement.style.removeProperty("--app-visible-height")
      document.documentElement.style.removeProperty("--app-viewport-top")
      document.documentElement.removeAttribute("data-keyboard-open")
      document.documentElement.removeAttribute("data-app-shell-active")
    }
  }, [resetWindowScroll])
}
