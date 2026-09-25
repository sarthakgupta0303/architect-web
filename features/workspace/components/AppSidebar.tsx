'use client'

import { BarChart3, BookOpen, Check, ChevronsUpDown, Home, LayoutTemplate, LogOut, Menu as MenuIcon, Moon, PanelLeftClose, PanelLeftOpen, Plug, Plus, Settings, Sun, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { Tooltip } from '@/components/ui/Tooltip'
import { LogoMark } from '@/components/shared/Logo'
import { CreditsMeter } from '@/components/shared/CreditsMeter'
import { ApiError, apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { useWorkspace } from '../context'

type Props = { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onMobileOpenChange: (o: boolean) => void }

export function AppSidebar({ collapsed, onToggle, mobileOpen, onMobileOpenChange }: Props) {
  const { workspace } = useWorkspace()
  const base = `/w/${workspace.slug}`
  const items = [
    { href: base, label: 'Home', icon: Home, exact: true },
    { href: `${base}/templates`, label: 'Templates', icon: LayoutTemplate },
    { href: `${base}/integrations`, label: 'Integrations', icon: Plug },
    { href: `${base}/studio`, label: 'Studio', icon: BarChart3 },
    { href: `${base}/settings`, label: 'Settings', icon: Settings },
  ]

  const content = (isMobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-2 px-3 pb-2 pt-3', collapsed && !isMobile && 'flex-col')}>
        <WorkspaceSwitcher compact={collapsed && !isMobile} />
        {isMobile ? (
          <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => onMobileOpenChange(false)}><X className="size-4" /></Button>
        ) : (
          <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
            <Button variant="ghost" size="icon" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
          </Tooltip>
        )}
      </div>
      <nav aria-label="Workspace" className="mt-2 flex-1 space-y-0.5 px-3">
        {items.map((it) => <NavItem key={it.href} {...it} compact={collapsed && !isMobile} />)}
        <a href="https://github.com/sarthakgupta0303/architect-web#readme" target="_blank" rel="noopener noreferrer" className={cn('flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg', collapsed && !isMobile && 'justify-center')}>
          <BookOpen className="size-5 shrink-0" aria-hidden />{(!collapsed || isMobile) && 'Docs'}
        </a>
      </nav>
      <div className="space-y-3 border-t border-border p-3">
        {(!collapsed || isMobile) && <CreditsMeter />}
        <UserMenu compact={collapsed && !isMobile} />
      </div>
    </div>
  )

  return (
    <>
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface transition-[width] duration-200 lg:block', collapsed ? 'w-16' : 'w-60')}>
        {content(false)}
      </aside>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => onMobileOpenChange(true)}><MenuIcon className="size-5" /></Button>
        <Link href={base} aria-label="Home"><LogoMark /></Link>
        <span className="w-9" />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => onMobileOpenChange(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-surface animate-slide-in-right">{content(true)}</aside>
        </div>
      )}
    </>
  )
}

function NavItem({ href, label, icon: Icon, exact, compact }: { href: string; label: string; icon: typeof Home; exact?: boolean; compact: boolean }) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname.startsWith(href)
  const link = (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors', active ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg', compact && 'justify-center')}>
      <Icon className="size-5 shrink-0" aria-hidden />
      {compact ? <span className="sr-only">{label}</span> : label}
    </Link>
  )
  return compact ? <Tooltip content={label} side="right">{link}</Tooltip> : link
}

function WorkspaceSwitcher({ compact }: { compact: boolean }) {
  const { workspace, workspaces } = useWorkspace()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function create() {
    setSaving(true)
    setError(null)
    try {
      const { workspace: ws } = await apiFetch<{ workspace: { slug: string } }>('/api/workspaces', { body: { name } })
      setOpen(false)
      setName('')
      router.push(`/w/${ws.slug}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create workspace')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <button className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2', compact && 'flex-none justify-center')} aria-label="Switch workspace">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-fg">{workspace.name.charAt(0).toUpperCase()}</span>
            {!compact && (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{workspace.name}</span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
              </>
            )}
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuLabel>Workspaces</MenuLabel>
          {workspaces.map((w) => (
            <MenuItem key={w.id} onSelect={() => router.push(`/w/${w.slug}`)}>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === workspace.id && <Check className="size-4 text-primary-text" aria-hidden />}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Create workspace</MenuItem>
        </MenuContent>
      </Menu>
      <Dialog open={open} onOpenChange={setOpen} title="Create workspace" description="Workspaces keep projects, members and billing separate."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create} loading={saving} disabled={!name.trim()}>Create</Button></>}>
        <Label htmlFor="new-ws">Name</Label>
        <Input id="new-ws" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} invalid={!!error} autoFocus />
        <FieldError>{error}</FieldError>
      </Dialog>
    </>
  )
}

function UserMenu({ compact }: { compact: boolean }) {
  const { user } = useWorkspace()
  const { resolvedTheme, setTheme } = useTheme()

  async function signOut() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
      window.location.assign('/')
    } catch {
      toast.error('Could not sign out — please try again')
    }
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <button className={cn('flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-2', compact && 'justify-center')} aria-label="Account menu">
          <Avatar name={user.name ?? user.email} src={user.avatarUrl} />
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name ?? 'Your account'}</span>
              <span className="block truncate text-xs text-muted">{user.email}</span>
            </span>
          )}
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem onSelect={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          {resolvedTheme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          {resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={signOut}><LogOut className="size-4" aria-hidden /> Sign out</MenuItem>
      </MenuContent>
    </Menu>
  )
}
