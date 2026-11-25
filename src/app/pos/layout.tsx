"use client"

import { useViewportHeight } from "@/components/use-viewport-height"
import { NavigationProgress } from "@/components/ui/navigation-progress"
import { OrganizationStatusGuard } from "@/components/organization-status-guard"

export default function POSLayout({ children }: { children: React.ReactNode }) {
  useViewportHeight()
  return (
    <div data-app-shell className="app-shell app-motion-scope pos-app overflow-hidden bg-slate-900">
      <OrganizationStatusGuard />
      <NavigationProgress />
      {children}
    </div>
  )
}
