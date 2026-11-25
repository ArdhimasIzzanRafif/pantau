"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

export function NavigationProgress() {
  const pathname = usePathname()
  const [pending, setPending] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    const frame = window.requestAnimationFrame(() => setPending(false))
    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  useEffect(() => {
    const start = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as Element | null
      const anchor = target?.closest<HTMLAnchorElement>("a[href]")
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return

      const nextUrl = new URL(anchor.href, window.location.href)
      const currentUrl = new URL(window.location.href)
      if (nextUrl.origin !== currentUrl.origin) return
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) return

      setPending(true)
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => setPending(false), 10000)
    }

    document.addEventListener("click", start, true)
    return () => {
      document.removeEventListener("click", start, true)
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className={`navigation-progress fixed inset-x-0 top-0 z-[100] h-0.5 origin-left bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)] ${pending ? "navigation-progress--active" : ""}`}
    />
  )
}
