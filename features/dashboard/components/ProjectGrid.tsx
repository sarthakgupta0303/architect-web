'use client'

import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ExternalLink, FolderPlus, MoreHorizontal, Pencil, Search, SearchX, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { StatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import { atLeast } from '@/lib/authz'
import { FRAMEWORK_LABELS } from '@/lib/contracts/common'
import type { ProjectCardDto } from '@/lib/contracts/projects'
import { initials } from '@/lib/utils'
import { useProjects, type ProjectFilter } from '../hooks/use-projects'

export function ProjectGrid() {
  const { workspace } = useWorkspace()
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const query = useProjects(workspace.slug, filter, q)
  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <section aria-labelledby="projects-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="projects-heading" className="text-xl font-semibold">Projects</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" label="Filter projects" value={filter} onChange={setFilter}
            options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'Mine' }, { value: 'shared', label: 'Shared' }, { value: 'deployed', label: 'Deployed' }]} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" aria-label="Search projects" className="h-8 w-44 pl-9 text-sm" maxLength={100} />
          </div>
        </div>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
        ) : query.isError ? (
          <ErrorState message={query.error instanceof ApiError ? query.error.message : 'Could not load projects'} onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          q || filter !== 'all' ? (
            <EmptyState icon={SearchX} title="No projects match" body="Try a different search or filter."
              action={<Button variant="secondary" onClick={() => { setSearch(''); setFilter('all') }}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={FolderPlus} title="Describe your first agent app" body="Type what you want above, pick a template, or try the demo project to explore every feature."
              action={<Button onClick={() => document.getElementById('dashboard-prompt')?.querySelector('textarea')?.focus()}>Start building</Button>} />
          )
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((p) => <ProjectCard key={p.id} project={p} />)}
            </ul>
            {query.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>Load more</Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function ProjectCard({ project }: { project: ProjectCardDto }) {
  const { workspace, role, user } = useWorkspace()
  const qc = useQueryClient()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState(project.name)
  const [nameError, setNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const href = `/w/${workspace.slug}/p/${project.id}`
  const canEdit = atLeast(role, 'editor')
  const canDelete = atLeast(role, 'admin')

  async function rename() {
    const next = name.trim()
    if (!next) return setNameError('Name is required')
    setBusy(true)
    const snapshot = qc.getQueriesData({ queryKey: ['projects'] })
    qc.setQueriesData<{ pages: { items: ProjectCardDto[] }[] }>({ queryKey: ['projects'] }, (d) =>
      d?.pages ? { ...d, pages: d.pages.map((pg) => ({ ...pg, items: pg.items.map((it) => (it.id === project.id ? { ...it, name: next } : it)) })) } : d)
    setRenameOpen(false)
    try {
      await apiFetch(`/api/projects/${project.id}`, { method: 'PATCH', body: { name: next } })
      toast.success('Project renamed')
    } catch (e) {
      snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      toast.error(e instanceof ApiError ? e.message : 'Could not rename project')
    } finally {
      setBusy(false)
      qc.invalidateQueries({ queryKey: ['projects'] })
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await apiFetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      setDeleteOpen(false)
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast('Project deleted', {
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await apiFetch(`/api/projects/${project.id}/restore`, { method: 'POST' })
              qc.invalidateQueries({ queryKey: ['projects'] })
              toast.success('Project restored')
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : 'Could not restore project')
            }
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not delete project')
    } finally {
      setBusy(false)
    }
  }

  const status = project.status === 'archived' ? 'archived' : project.status
  const who = project.createdBy?.id === user.id ? 'you' : project.createdBy?.name ?? 'a teammate'

  return (
    <li className="group relative">
      <Link href={href} className="card-interactive block overflow-hidden rounded-xl border border-border bg-surface">
        <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-primary/25 via-surface-2 to-accent/15">
          {project.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl font-bold text-fg/70">{initials(project.name)}</span>
          )}
          <span className="absolute left-3 top-3"><StatusPill status={status} /></span>
        </div>
        <div className="p-4">
          <p className="truncate pr-8 font-semibold">{project.name}</p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span className="font-mono">{FRAMEWORK_LABELS[project.framework] ?? project.framework}</span>
            <span aria-hidden>·</span>
            <span>Edited {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })} by {who}</span>
          </p>
        </div>
      </Link>
      {canEdit && (
        <div className="absolute bottom-3 right-3">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${project.name}`}><MoreHorizontal className="size-4" /></Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => window.location.assign(href)}><ExternalLink className="size-4" aria-hidden /> Open</MenuItem>
              <MenuItem onSelect={() => { setName(project.name); setNameError(null); setRenameOpen(true) }}><Pencil className="size-4" aria-hidden /> Rename</MenuItem>
              {canDelete && (<><MenuSeparator /><MenuItem destructive onSelect={() => setDeleteOpen(true)}><Trash2 className="size-4" aria-hidden /> Delete</MenuItem></>)}
            </MenuContent>
          </Menu>
        </div>
      )}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen} title="Rename project"
        footer={<><Button variant="secondary" onClick={() => setRenameOpen(false)}>Cancel</Button><Button onClick={rename} loading={busy}>Save</Button></>}>
        <Label htmlFor={`rename-${project.id}`}>Name</Label>
        <Input id={`rename-${project.id}`} value={name} maxLength={80} autoFocus invalid={!!nameError} onChange={(e) => { setName(e.target.value); setNameError(null) }} onKeyDown={(e) => e.key === 'Enter' && rename()} />
        <FieldError>{nameError}</FieldError>
      </Dialog>
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={`Delete “${project.name}”?`}
        body={project.status === 'live' ? 'This project has a live deployment. You can undo for 10 seconds, or restore it within 30 days.' : 'You can undo for 10 seconds, or restore it within 30 days.'}
        confirmLabel="Delete project" onConfirm={remove} loading={busy} />
    </li>
  )
}
