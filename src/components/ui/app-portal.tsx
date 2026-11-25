"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

const subscribe = () => () => undefined

/** Render overlay langsung di body agar tidak terpotong scroller/stacking
 * context halaman dashboard. Snapshot server tetap false untuk mencegah
 * hydration mismatch. */
export function AppPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false)
  if (!mounted) return null
  return createPortal(children, document.body)
}
