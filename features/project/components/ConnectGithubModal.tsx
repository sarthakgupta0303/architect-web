'use client'

import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2, GitBranch, GitCommitHorizontal, Github, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DemoBadge } from '@/components/shared/DemoBadge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { FieldError, FieldHint, Input, Label } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { Alert } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { useGraph } from '@/features/canvas/hooks/use-graph'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { ProjectDto } from '@/lib/contracts/projects'
import { seededRandom, sleep, slugify } from '@/lib/utils'
import { useProject } from '../context'

const NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/

export function ConnectGithubModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { project } = useProject()
  const connected = project.repoProvider === 'github' && !!project.repoOwner && !!project.repoName
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={connected ? 'GitHub' : 'Connect GitHub'} size="lg"
      description={connected ? 'Every accepted change is committed here, and pushes from your IDE sync back.' : 'Own your code: Architect commits every change to your repository and stays in two-way sync.'}>
      <div className="mb-4 flex justify-end"><DemoBadge /></div>
      {connected ? <Connected onClose={() => onOpenChange(false)} /> : <ConnectFlow open={open} />}
    </Dialog>
  )
}

function ConnectFlow({ open }: { open: boolean }) {
  const { project, setProject, canEdit, isDeveloper } = useProject()
  const [step, setStep] = useState<'install' | 'repo'>('install')
  const [mode, setMode] = useState<'create' | 'link'>('create')
  const [owner, setOwner] = useState('')
  const [repoName, setRepoName] = useState(slugify(project.name))
  const [existing, setExisting] = useState('')
  const [branch, setBranch] = useState('main')
  const [isPrivate, setIsPrivate] = useState(true)
  const [autoCommit, setAutoCommit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setStep('install'); setRepoName(slugify(project.name)); setErrors({}); setError(null) }
  }, [open, project.name])

  async function install() {
    setBusy(true)
    await sleep(900)
    setBusy(false)
    setStep('repo')
  }

  async function connect() {
    const e: Record<string, string> = {}
    let o = owner.trim(), n = repoName.trim()
    if (mode === 'link') {
      const [a, b] = existing.trim().split('/')
      o = a ?? ''; n = b ?? ''
      if (!o || !n || !NAME_RE.test(o) || !NAME_RE.test(n)) e.existing = 'Use the form owner/repository'
    } else {
      if (!NAME_RE.test(o)) e.owner = 'Enter your GitHub username or organization'
      if (!NAME_RE.test(n)) e.repoName = 'Letters, numbers, dots, dashes and underscores'
    }
    if (!/^[A-Za-z0-9._/-]{1,100}$/.test(branch) || branch.includes('..')) e.branch = 'Invalid branch name'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setError(null)
    try {
      const { project: p } = await apiFetch<{ project: ProjectDto }>(`/api/projects/${project.id}/github`, { body: { owner: o, name: n, branch, autoCommit } })
      setProject(p)
      toast.success(`Connected to ${o}/${n}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not connect the repository')
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit || !isDeveloper) {
    return <Alert tone="info">Only developers and admins can connect a repository. Ask an admin to turn on developer access for you in Settings → Members.</Alert>
  }

  if (step === 'install') {
    return (
      <div className="grid gap-5 text-sm">
        <ol className="grid gap-3">
          {['Install the Architect GitHub App on your account or organization.', 'Create a new repository or link an existing one.', 'Pick a branch and whether accepted changes are committed automatically.'].map((t, i) => (
            <li key={t} className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-text">{i + 1}</span><span className="pt-0.5 text-muted">{t}</span></li>
          ))}
        </ol>
        <div className="flex justify-end"><Button onClick={install} loading={busy}><Github className="size-4" aria-hidden /> Install GitHub App</Button></div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error && <Alert>{error}</Alert>}
      <Segmented label="Repository" value={mode} onChange={setMode} options={[{ value: 'create', label: 'Create new' }, { value: 'link', label: 'Link existing' }]} />
      {mode === 'create' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="gh-owner">Owner</Label><Input id="gh-owner" placeholder="your-username" value={owner} maxLength={39} invalid={!!errors.owner} onChange={(e) => setOwner(e.target.value.trim())} /><FieldError>{errors.owner}</FieldError></div>
          <div><Label htmlFor="gh-name">Repository name</Label><Input id="gh-name" value={repoName} maxLength={100} invalid={!!errors.repoName} onChange={(e) => setRepoName(slugify(e.target.value, 100))} /><FieldError>{errors.repoName}</FieldError></div>
        </div>
      ) : (
        <div><Label htmlFor="gh-link">Repository</Label><Input id="gh-link" placeholder="owner/repository" value={existing} maxLength={140} invalid={!!errors.existing} onChange={(e) => setExisting(e.target.value.trim())} />
          {errors.existing ? <FieldError>{errors.existing}</FieldError> : <FieldHint>Architect detects the framework and keeps your folder structure.</FieldHint>}</div>
      )}
      <div><Label htmlFor="gh-branch">Branch</Label><Input id="gh-branch" value={branch} maxLength={100} invalid={!!errors.branch} onChange={(e) => setBranch(e.target.value.trim())} className="font-mono" /><FieldError>{errors.branch}</FieldError></div>
      <div className="grid gap-3 rounded-xl bg-surface-2 p-4 text-sm">
        {mode === 'create' && <label className="flex items-center justify-between gap-3">Private repository<Switch checked={isPrivate} onCheckedChange={setIsPrivate} label="Private repository" /></label>}
        <label className="flex items-center justify-between gap-3">Commit every accepted change automatically<Switch checked={autoCommit} onCheckedChange={setAutoCommit} label="Auto-commit" /></label>
        <p className="text-xs text-muted">Protected branches get a pull request instead of a direct push.</p>
      </div>
      <div className="flex justify-end"><Button onClick={connect} loading={busy}>Connect repository</Button></div>
    </div>
  )
}

function Connected({ onClose }: { onClose: () => void }) {
  const { project, setProject, isDeveloper } = useProject()
  const graph = useGraph(project.id)
  const [syncing, setSyncing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)

  const commits = useMemo(() => {
    const rand = seededRandom(project.id)
    const agents = graph.data?.agents ?? []
    const msgs = [
      'Build: generate app scaffold and UI',
      ...agents.slice(0, 4).map((a) => `Agents: add ${a.name}`),
      'PRD: capture requirements v1',
      'Initial commit from Architect',
    ]
    let t = Date.parse(project.updatedAt)
    return msgs.map((m) => {
      const sha = Math.floor(rand() * 0xfffffff).toString(16).padStart(7, '0')
      const at = t
      t -= Math.floor(rand() * 3_600_000) + 300_000
      return { sha, message: m, at }
    })
  }, [graph.data, project.id, project.updatedAt])

  async function pull() {
    setSyncing(true)
    await sleep(1000)
    setSyncing(false)
    toast.success('Already up to date')
  }

  async function disconnect() {
    setRemoving(true)
    try {
      const { project: p } = await apiFetch<{ project: ProjectDto }>(`/api/projects/${project.id}/github`, { method: 'DELETE' })
      setProject(p)
      setConfirm(false)
      toast.success('Repository disconnected')
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not disconnect')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="grid gap-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
        <span className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" aria-hidden /><span className="font-mono">{project.repoOwner}/{project.repoName}</span></span>
        <span className="flex items-center gap-1 font-mono text-xs text-muted"><GitBranch className="size-3.5" aria-hidden />{project.workingBranch} · {project.autoCommit ? 'auto-commit on' : 'manual commits'}</span>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Recent commits</h3>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
          {commits.map((c) => (
            <li key={c.sha} className="flex items-center gap-3 px-4 py-2.5">
              <GitCommitHorizontal className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{c.message}</span>
              <span className="font-mono text-xs text-primary-text">{c.sha}</span>
              <span className="hidden w-24 text-right text-xs text-muted sm:inline">{formatDistanceToNow(c.at, { addSuffix: true })}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        {isDeveloper ? <Button variant="danger" onClick={() => setConfirm(true)}>Disconnect</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={pull} loading={syncing}><RefreshCw className="size-4" aria-hidden /> Pull latest</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Disconnect repository?" body="Your code stays on GitHub. Architect stops committing to it until you connect again."
        confirmLabel="Disconnect" loading={removing} onConfirm={disconnect} />
    </div>
  )
}
