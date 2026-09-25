'use client'

import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { Folder, Home, LayoutTemplate, Moon, Plus, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import * as RD from '@radix-ui/react-dialog'
import { apiFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/contracts/common'
import type { ProjectCardDto } from '@/lib/contracts/projects'
import { useWorkspace } from '../context'

export function CommandPalette() {
  const { workspace, workspaces } = useWorkspace()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const projects = useQuery({
    queryKey: ['palette-projects', workspace.slug],
    queryFn: () => apiFetch<Paginated<ProjectCardDto>>(`/api/workspaces/${workspace.slug}/projects?limit=50`),
    enabled: open,
  })

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  const item = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-fg aria-selected:bg-surface-2'
  return (
    <RD.Root open={open} onOpenChange={setOpen}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <RD.Content className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-popover animate-scale-in">
          <RD.Title className="sr-only">Command palette</RD.Title>
          <RD.Description className="sr-only">Search projects and actions</RD.Description>
          <Command label="Command palette" className="flex flex-col">
            <Command.Input placeholder="Search projects and actions…" className="h-12 border-b border-border bg-transparent px-4 text-sm text-fg placeholder:text-muted focus:outline-none" />
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">No results</Command.Empty>
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                <Command.Item className={item} onSelect={() => go(`/w/${workspace.slug}?new=1`)}><Plus className="size-4" aria-hidden /> New project</Command.Item>
                <Command.Item className={item} onSelect={() => go(`/w/${workspace.slug}`)}><Home className="size-4" aria-hidden /> Home</Command.Item>
                <Command.Item className={item} onSelect={() => go(`/w/${workspace.slug}/templates`)}><LayoutTemplate className="size-4" aria-hidden /> Templates</Command.Item>
                <Command.Item className={item} onSelect={() => go(`/w/${workspace.slug}/settings`)}><Settings className="size-4" aria-hidden /> Workspace settings</Command.Item>
                <Command.Item className={item} onSelect={() => { setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'); setOpen(false) }}><Moon className="size-4" aria-hidden /> Toggle theme</Command.Item>
              </Command.Group>
              {(projects.data?.items.length ?? 0) > 0 && (
                <Command.Group heading="Projects" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                  {projects.data!.items.map((p) => (
                    <Command.Item key={p.id} value={`project ${p.name}`} className={item} onSelect={() => go(`/w/${workspace.slug}/p/${p.id}`)}>
                      <Folder className="size-4" aria-hidden /> {p.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {workspaces.length > 1 && (
                <Command.Group heading="Switch workspace" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                  {workspaces.filter((w) => w.id !== workspace.id).map((w) => (
                    <Command.Item key={w.id} value={`workspace ${w.name}`} className={item} onSelect={() => go(`/w/${w.slug}`)}>{w.name}</Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
