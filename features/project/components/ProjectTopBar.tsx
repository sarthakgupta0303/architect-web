'use client'

import { ChevronRight, GitBranch, Github, Home, Rocket, Share2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Tooltip } from '@/components/ui/Tooltip'
import { Avatar } from '@/components/ui/Avatar'
import { LogoMark } from '@/components/shared/Logo'
import { CreditsMeter } from '@/components/shared/CreditsMeter'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { ProjectDto } from '@/lib/contracts/projects'
import { useProject } from '../context'
import { ConnectGithubModal } from './ConnectGithubModal'
import { DeployModal } from './DeployModal'
import { ShareDialog } from './ShareDialog'

export function ProjectTopBar() {
  const { workspace, user } = useWorkspace()
  const { project, setProject, canEdit, isDeveloper } = useProject()
  const pathname = usePathname()
  const router = useRouter()
  const mode: 'build' | 'code' = pathname.endsWith('/code') ? 'code' : 'build'
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [deployOpen, setDeployOpen] = useState(false)
  const [githubOpen, setGithubOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  async function saveName() {
    setEditing(false)
    const next = name.trim()
    if (!next || next === project.name) { setName(project.name); return }
    const prev = project
    setProject({ ...project, name: next })
    try {
      const { project: p } = await apiFetch<{ project: ProjectDto }>(`/api/projects/${project.id}`, { method: 'PATCH', body: { name: next } })
      setProject(p)
    } catch (e) {
      setProject(prev)
      setName(prev.name)
      toast.error(e instanceof ApiError ? e.message : 'Could not rename project')
    }
  }

  function switchMode(m: 'build' | 'code') {
    if (m === mode) return
    apiFetch('/api/me', { method: 'PATCH', body: { modePref: { projectId: project.id, mode: m } } }).catch(() => undefined)
    router.push(`/w/${workspace.slug}/p/${project.id}/${m}`)
  }

  const githubConnected = project.repoProvider === 'github'

  return (
    <header className="flex h-13 shrink-0 items-center gap-3 border-b border-border bg-surface px-3" style={{ height: 52 }}>
      <Link href={`/w/${workspace.slug}`} aria-label="Back to dashboard" className="rounded-lg p-1.5 hover:bg-surface-2"><LogoMark /></Link>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
        <Link href={`/w/${workspace.slug}`} className="hidden truncate text-muted hover:text-fg md:inline"><Home className="mr-1 inline size-3.5" aria-hidden />{workspace.name}</Link>
        <ChevronRight className="hidden size-4 text-muted md:inline" aria-hidden />
        {editing ? (
          <input autoFocus value={name} maxLength={80} aria-label="Project name" onChange={(e) => setName(e.target.value)} onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(project.name); setEditing(false) } }}
            className="h-8 w-56 rounded-lg border border-primary bg-surface px-2 text-sm font-semibold focus:outline-none" />
        ) : (
          <button onClick={() => canEdit && setEditing(true)} className="truncate rounded-lg px-1.5 py-1 font-semibold hover:bg-surface-2" title={canEdit ? 'Rename project' : project.name}>{project.name}</button>
        )}
      </nav>

      <div className="mx-auto">
        <Segmented label="Mode" value={mode} onChange={switchMode} size="sm"
          options={[{ value: 'build', label: 'Build' }, { value: 'code', label: 'Code', disabled: !isDeveloper, title: isDeveloper ? undefined : 'Code mode is limited to developers in this workspace' }]} />
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1 rounded-lg border border-border px-2 py-1 font-mono text-xs text-muted lg:inline-flex"><GitBranch className="size-3.5" aria-hidden />{project.workingBranch}</span>
        <Tooltip content={githubConnected ? `Synced with ${project.repoOwner}/${project.repoName}` : 'Connect GitHub'}>
          <Button variant="ghost" size="icon" aria-label="GitHub" onClick={() => setGithubOpen(true)} className="relative">
            <Github className="size-4" />
            <span className={`absolute right-1.5 top-1.5 size-2 rounded-full ${githubConnected ? 'bg-success' : 'bg-muted'}`} aria-hidden />
          </Button>
        </Tooltip>
        <div className="hidden lg:block"><Avatar name={user.name ?? user.email} src={user.avatarUrl} size={26} /></div>
        <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}><Share2 className="size-4" aria-hidden /><span className="hidden sm:inline">Share</span></Button>
        <div className="hidden xl:block"><CreditsMeter compact /></div>
        <Button size="sm" onClick={() => setDeployOpen(true)} disabled={!canEdit}><Rocket className="size-4" aria-hidden /> Deploy</Button>
      </div>

      <DeployModal open={deployOpen} onOpenChange={setDeployOpen} />
      <ConnectGithubModal open={githubOpen} onOpenChange={setGithubOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </header>
  )
}
