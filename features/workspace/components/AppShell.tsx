'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { AppSidebar } from './AppSidebar'
import { CommandPalette } from './CommandPalette'

/** App shell: sidebar + content. The project workspace (/p/...) renders full-bleed without the sidebar. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const inProject = /\/w\/[^/]+\/p\//.test(pathname)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem('sidebar_collapsed') === '1') } catch { /* storage unavailable */ }
  }, [])
  useEffect(() => setMobileOpen(false), [pathname])

  function toggle() {
    setCollapsed((c) => {
      try { localStorage.setItem('sidebar_collapsed', c ? '0' : '1') } catch { /* storage unavailable */ }
      return !c
    })
  }

  if (inProject) return <><CommandPalette />{children}</>

  return (
    <div className="flex min-h-screen">
      <AppSidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
      <div className="min-w-0 flex-1">{children}</div>
      <CommandPalette />
    </div>
  )
}
