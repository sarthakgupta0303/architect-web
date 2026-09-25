'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Copy, ExternalLink, Globe, KeyRound, Lock, Plus, RotateCcw, Rocket, ScrollText, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Badge, StatusPill, type StatusKey } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { FieldError, FieldHint, Input, Label, Select } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { Alert, EmptyState, ErrorState } from '@/components/ui/States'
import { DemoBadge } from '@/components/shared/DemoBadge'
import { ApiError, apiFetch } from '@/lib/api/client'
import type {
  DeployEnvironment, DeploymentDto, DeploymentEventDto, DeployStatus, DnsRecord, DomainDto, EnvironmentSummary, RuntimeSettingsDto, SecretDto, SecretEnvironment,
} from '@/lib/core/services/deploy-service'
import type { Paginated } from '@/lib/contracts/common'
import { cn } from '@/lib/utils'
import { deployOverviewKey, LogView, useDeployOverview, useDeployPermissions } from '../components/DeployModal'
import { useProject } from '../context'

type Perms = ReturnType<typeof useDeployPermissions>

const ENV_LABEL: Record<string, string> = { development: 'Development', preview: 'Preview', production: 'Production' }
const STATUS_PILL: Record<DeployStatus, { key: StatusKey; label: string }> = {
  queued: { key: 'queued', label: 'Queued' },
  building: { key: 'building', label: 'Building' },
  releasing: { key: 'running', label: 'Releasing' },
  live: { key: 'live', label: 'Live' },
  failed: { key: 'failed', label: 'Failed' },
  rolled_back: { key: 'archived', label: 'Rolled back' },
  superseded: { key: 'archived', label: 'Superseded' },
}
const REGION_LABELS: Record<RuntimeSettingsDto['region'], string> = {
  iad: 'Ashburn, US East (iad)', sjc: 'San Jose, US West (sjc)', fra: 'Frankfurt, EU (fra)', bom: 'Mumbai, India (bom)', sin: 'Singapore (sin)',
}

function ago(iso: string | null | undefined) {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '—'
}
function duration(d: DeploymentDto) {
  if (!d.finishedAt) return '—'
  const ms = Date.parse(d.finishedAt) - Date.parse(d.createdAt)
  if (ms < 0) return '—'
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}
function errMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback
}
function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error('Could not copy — select the text instead'))
}

export function DeployPanel({ onDeploy }: { onDeploy: () => void }) {
  const { project } = useProject()
  const overview = useDeployOverview(project.id)
  const perms = useDeployPermissions(overview.data?.prodDeployRole)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Deploy</h1><p className="text-sm text-muted">Environments, history, secrets, domains and runtime</p></div>
          <div className="flex items-center gap-2">
            <DemoBadge />
            <Button onClick={onDeploy} disabled={!perms.preview} title={perms.preview ? undefined : 'Editors and above can deploy'}><Rocket className="size-4" aria-hidden />Deploy</Button>
          </div>
        </div>

        {overview.data && !overview.data.serviceConfigured && (
          <Alert tone="warning">Deployments, secrets, domains and runtime settings are saved by the server. Add SUPABASE_SERVICE_ROLE_KEY to enable them.</Alert>
        )}

        <section aria-labelledby="env-heading">
          <h2 id="env-heading" className="sr-only">Environments</h2>
          {overview.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-36 rounded-xl" /></div>
          ) : overview.isError ? (
            <Card><ErrorState message={errMessage(overview.error, 'Could not load environments')} onRetry={() => overview.refetch()} className="py-6" /></Card>
          ) : overview.data ? (
            <div className="grid gap-4 md:grid-cols-2">
              <EnvironmentCard summary={overview.data.environments.preview} />
              <EnvironmentCard summary={overview.data.environments.production} />
            </div>
          ) : null}
        </section>

        <HistoryCard projectId={project.id} perms={perms} />
        <SecretsCard projectId={project.id} perms={perms} />
        <DomainsCard projectId={project.id} perms={perms} />
        <RuntimeCard projectId={project.id} perms={perms} />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Environment cards
// -----------------------------------------------------------------------------

function EnvironmentCard({ summary }: { summary: EnvironmentSummary }) {
  const { current, latest } = summary
  const inProgress = latest && ['queued', 'building', 'releasing'].includes(latest.status) ? latest : null
  const lastFailed = latest?.status === 'failed' ? latest : null
  const pill = inProgress ? STATUS_PILL[inProgress.status] : current ? STATUS_PILL.live : lastFailed ? STATUS_PILL.failed : { key: 'draft' as StatusKey, label: 'Not deployed' }
  const shown = current ?? latest
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{ENV_LABEL[summary.environment]}</h3>
        <StatusPill status={pill.key} label={pill.label} />
      </div>
      {current?.url ? (
        <div className="mt-2 flex items-center gap-1">
          <a href={current.url} target="_blank" rel="noopener noreferrer" className="truncate font-mono text-xs text-primary-text hover:underline">{current.url}</a>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Copy ${ENV_LABEL[summary.environment]} URL`} onClick={() => copy(current.url!, 'URL')}><Copy className="size-3.5" /></Button>
        </div>
      ) : (
        <p className="mt-2 truncate font-mono text-xs text-muted">{summary.url}</p>
      )}
      <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div><dt className="text-muted">Version</dt><dd className="mt-0.5 font-medium tabular-nums">{current ? `v${current.version}` : '—'}</dd></div>
        <div><dt className="text-muted">Last deploy</dt><dd className="mt-0.5 font-medium">{ago(shown?.createdAt)}</dd></div>
        <div><dt className="text-muted">By</dt><dd className="mt-0.5 truncate font-medium">{shown?.createdBy?.name ?? (shown ? 'A teammate' : '—')}</dd></div>
      </dl>
      {lastFailed && current && <p className="mt-3 text-xs text-warning">v{lastFailed.version} failed — v{current.version} is still serving traffic.</p>}
    </Card>
  )
}

// -----------------------------------------------------------------------------
// History
// -----------------------------------------------------------------------------

function HistoryCard({ projectId, perms }: { projectId: string; perms: Perms }) {
  const qc = useQueryClient()
  const { refresh } = useProject()
  const [env, setEnv] = useState<'all' | DeployEnvironment>('all')
  const [confirm, setConfirm] = useState<DeploymentDto | null>(null)
  const [logsFor, setLogsFor] = useState<DeploymentDto | null>(null)

  const history = useInfiniteQuery({
    queryKey: ['deployments', projectId, env],
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ limit: '20' })
      if (env !== 'all') sp.set('environment', env)
      if (pageParam) sp.set('cursor', pageParam)
      return apiFetch<Paginated<DeploymentDto>>(`/api/projects/${projectId}/deployments?${sp.toString()}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })

  const rollback = useMutation({
    mutationFn: (d: DeploymentDto) => apiFetch<{ deploymentId: string; deployment: DeploymentDto }>(`/api/deployments/${d.id}/rollback`, { method: 'POST' }),
    onSuccess: (res, d) => {
      toast.success(`Restored v${d.version} on ${ENV_LABEL[d.environment]?.toLowerCase()} as v${res.deployment.version}`)
      setConfirm(null)
      qc.invalidateQueries({ queryKey: ['deployments', projectId] })
      qc.invalidateQueries({ queryKey: deployOverviewKey(projectId) })
      refresh()
    },
    onError: (e) => toast.error(errMessage(e, 'Rollback failed')),
  })

  const items = history.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Deploy history</h2>
        <Segmented size="sm" label="Filter by environment" value={env} onChange={setEnv}
          options={[{ value: 'all', label: 'All' }, { value: 'production', label: 'Production' }, { value: 'preview', label: 'Preview' }]} />
      </div>
      {history.isLoading ? (
        <div className="mt-4 grid gap-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : history.isError ? (
        <ErrorState message={errMessage(history.error, 'Could not load deploy history')} onRetry={() => history.refetch()} className="py-6" />
      ) : items.length === 0 ? (
        <EmptyState icon={Rocket} title="No deployments yet" body="Publish your app to create the first version. Every deploy is kept here so you can roll back." className="py-8" />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Version</th>
                <th scope="col" className="py-2 pr-3 font-medium">Environment</th>
                <th scope="col" className="py-2 pr-3 font-medium">Commit</th>
                <th scope="col" className="py-2 pr-3 font-medium">Author</th>
                <th scope="col" className="py-2 pr-3 font-medium">Time</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Duration</th>
                <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => {
                const canRestore = perms.rollback && !!d.liveAt && (d.status === 'superseded' || d.status === 'rolled_back')
                const pill = STATUS_PILL[d.status]
                return (
                  <tr key={d.id} className="h-12 border-b border-border hover:bg-surface-2">
                    <td className="pr-3 font-medium tabular-nums">v{d.version}{d.source === 'rollback' && <Badge className="ml-2">rollback</Badge>}</td>
                    <td className="pr-3">{ENV_LABEL[d.environment]}</td>
                    <td className="pr-3 font-mono text-xs text-muted">{d.commitSha ? d.commitSha.slice(0, 7) : 'head'}</td>
                    <td className="max-w-[140px] truncate pr-3">{d.createdBy?.name ?? '—'}</td>
                    <td className="whitespace-nowrap pr-3 text-muted"><time dateTime={d.createdAt} title={new Date(d.createdAt).toLocaleString()}>{ago(d.createdAt)}</time></td>
                    <td className="pr-3"><StatusPill status={pill.key} label={pill.label} /></td>
                    <td className="pr-3 text-right tabular-nums text-muted">{duration(d)}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" onClick={() => setLogsFor(d)} aria-label={`View logs for v${d.version}`}><ScrollText className="size-3.5" aria-hidden />Logs</Button>
                      {canRestore && (
                        <Button variant="ghost" size="sm" onClick={() => setConfirm(d)} aria-label={`Roll back to v${d.version}`}><RotateCcw className="size-3.5" aria-hidden />Rollback</Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {history.hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" size="sm" loading={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>Load more</Button>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} destructive={false}
        title={confirm ? `Roll back to v${confirm.version}?` : 'Roll back'}
        body={confirm ? `${ENV_LABEL[confirm.environment]} will serve the image from v${confirm.version} again. The current live version is kept in history and can be restored later.` : ''}
        confirmLabel="Roll back" loading={rollback.isPending} onConfirm={() => confirm && rollback.mutate(confirm)} />
      <DeploymentLogsDialog deployment={logsFor} onClose={() => setLogsFor(null)} />
    </Card>
  )
}

function DeploymentLogsDialog({ deployment, onClose }: { deployment: DeploymentDto | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['deployment', deployment?.id],
    queryFn: () => apiFetch<{ deployment: DeploymentDto; events: DeploymentEventDto[] }>(`/api/deployments/${deployment!.id}`),
    enabled: !!deployment,
  })
  return (
    <Dialog open={!!deployment} onOpenChange={(o) => !o && onClose()} size="lg"
      title={deployment ? `v${deployment.version} · ${ENV_LABEL[deployment.environment]}` : 'Deployment logs'}
      description={deployment?.imageRef ? <span className="font-mono text-xs">{deployment.imageRef}</span> : undefined}>
      {q.isLoading ? <Skeleton className="h-40 w-full rounded-xl" />
        : q.isError ? <ErrorState message={errMessage(q.error, 'Could not load logs')} onRetry={() => q.refetch()} className="py-6" />
          : <LogView lines={(q.data?.events ?? []).filter((e) => e.type !== 'status')} />}
    </Dialog>
  )
}

// -----------------------------------------------------------------------------
// Secrets
// -----------------------------------------------------------------------------

function SecretsCard({ projectId, perms }: { projectId: string; perms: Perms }) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | SecretEnvironment>('all')
  const [editing, setEditing] = useState<{ name: string; environment: SecretEnvironment; replace: boolean } | null>(null)
  const [deleting, setDeleting] = useState<SecretDto | null>(null)

  const secrets = useQuery({
    queryKey: ['secrets', projectId],
    queryFn: () => apiFetch<{ items: SecretDto[] }>(`/api/projects/${projectId}/secrets`),
    enabled: perms.secretsRead,
  })
  const remove = useMutation({
    mutationFn: (s: SecretDto) => apiFetch<void>(`/api/projects/${projectId}/secrets/${encodeURIComponent(s.name)}?environment=${s.environment}`, { method: 'DELETE' }),
    onSuccess: (_r, s) => {
      toast.success(`${s.name} removed from ${ENV_LABEL[s.environment]?.toLowerCase()}`)
      setDeleting(null)
      qc.invalidateQueries({ queryKey: ['secrets', projectId] })
      qc.invalidateQueries({ queryKey: ['deploy-preflight', projectId] })
    },
    onError: (e) => toast.error(errMessage(e, 'Could not delete the secret')),
  })

  const items = (secrets.data?.items ?? []).filter((s) => filter === 'all' || s.environment === filter)

  return (
    <Card id="deploy-secrets" className="scroll-mt-6">
      <SectionHeader icon={KeyRound} title="Secrets" subtitle="Encrypted at rest with AES-256-GCM. Values can be replaced but are never shown again."
        action={perms.secretsWrite ? <Button variant="secondary" size="sm" onClick={() => setEditing({ name: '', environment: 'production', replace: false })}><Plus className="size-3.5" aria-hidden />Add secret</Button> : null} />
      {!perms.secretsRead ? (
        <ReadOnlyNotice>Only developers can view and manage secrets. Ask a workspace admin if you need access.</ReadOnlyNotice>
      ) : secrets.isLoading ? (
        <div className="mt-4 grid gap-2" aria-busy="true">{[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : secrets.isError ? (
        <ErrorState message={errMessage(secrets.error, 'Could not load secrets')} onRetry={() => secrets.refetch()} className="py-6" />
      ) : (secrets.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={KeyRound} title="No secrets yet" body="Add API keys and tokens your agents need. They are injected as environment variables at deploy time." className="py-8" />
      ) : (
        <>
          <div className="mt-4">
            <Segmented size="sm" label="Filter secrets by environment" value={filter} onChange={setFilter}
              options={[{ value: 'all', label: 'All' }, { value: 'production', label: 'Production' }, { value: 'preview', label: 'Preview' }, { value: 'development', label: 'Development' }]} />
          </div>
          {items.length === 0 ? <p className="mt-3 text-sm text-muted">No secrets for {ENV_LABEL[filter]?.toLowerCase()}.</p> : (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
              {items.map((s) => (
                <li key={`${s.environment}:${s.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{s.name}</span>
                  <Badge>{ENV_LABEL[s.environment]}</Badge>
                  <span className="font-mono text-xs text-muted" aria-label={s.last4 === '****' ? 'Value hidden' : `Value ending in ${s.last4}`}>••••{s.last4 === '****' ? '' : s.last4}</span>
                  <span className="w-40 truncate text-right text-xs text-muted">{ago(s.updatedAt)}{s.updatedBy?.name ? ` · ${s.updatedBy.name}` : ''}</span>
                  {perms.secretsWrite && (
                    <span className="flex">
                      <Button variant="ghost" size="sm" onClick={() => setEditing({ name: s.name, environment: s.environment, replace: true })}>Replace</Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${s.name} (${s.environment})`} onClick={() => setDeleting(s)}><Trash2 className="size-4" /></Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <SecretDialog projectId={projectId} target={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete secret'}
        body={deleting ? `The ${ENV_LABEL[deleting.environment]?.toLowerCase()} value will be erased. Running apps keep it until the next deploy; deploys that require it will be blocked.` : ''}
        confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting)} />
    </Card>
  )
}

function SecretDialog({ projectId, target, onClose }: { projectId: string; target: { name: string; environment: SecretEnvironment; replace: boolean } | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState<SecretEnvironment>('production')
  const [value, setValue] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (target) { setName(target.name); setEnvironment(target.environment); setValue(''); setErrors({}); setFormError(null) }
  }, [target])

  const save = useMutation({
    mutationFn: () => apiFetch<{ name: string; last4: string }>(`/api/projects/${projectId}/secrets`, { method: 'PUT', body: { name, environment, value } }),
    onSuccess: (res) => {
      setValue('')
      toast.success(`${res.name} saved and encrypted`)
      qc.invalidateQueries({ queryKey: ['secrets', projectId] })
      qc.invalidateQueries({ queryKey: ['deploy-preflight', projectId] })
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') setErrors(e.fieldErrors())
      setFormError(errMessage(e, 'Could not save the secret'))
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string[]> = {}
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) next.name = ['Use UPPER_SNAKE_CASE: a capital letter, then capitals, digits or _ (max 64)']
    if (value.length < 1) next.value = ['Enter a value']
    if (value.length > 32768) next.value = ['Values are limited to 32,768 characters']
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length === 0) save.mutate()
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setValue(''); onClose() } }}
      title={target?.replace ? `Replace ${target.name}` : 'Add a secret'}
      description="The value is encrypted before it is stored and can never be viewed again.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div>
          <Label htmlFor="secret-name">Name</Label>
          <Input id="secret-name" value={name} readOnly={target?.replace} className="font-mono" placeholder="OPENAI_API_KEY" autoComplete="off" spellCheck={false}
            invalid={!!errors.name} aria-describedby={errors.name ? 'secret-name-err' : 'secret-name-hint'}
            onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} />
          {errors.name ? <FieldError id="secret-name-err">{errors.name[0]}</FieldError> : <FieldHint id="secret-name-hint">Uppercase letters, digits and underscores</FieldHint>}
        </div>
        <div>
          <Label htmlFor="secret-env">Environment</Label>
          <Select id="secret-env" value={environment} disabled={target?.replace} onChange={(e) => setEnvironment(e.target.value as SecretEnvironment)}>
            <option value="production">Production</option>
            <option value="preview">Preview</option>
            <option value="development">Development</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="secret-value">Value</Label>
          <Input id="secret-value" type="password" value={value} autoComplete="new-password" spellCheck={false} placeholder={target?.replace ? 'New value' : 'Paste the value'}
            invalid={!!errors.value} aria-describedby={errors.value ? 'secret-value-err' : undefined} onChange={(e) => setValue(e.target.value)} />
          <FieldError id="secret-value-err">{errors.value?.[0]}</FieldError>
        </div>
        {formError && !errors.name && !errors.value && <Alert>{formError}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => { setValue(''); onClose() }}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{target?.replace ? 'Replace secret' : 'Save secret'}</Button>
        </div>
      </form>
    </Dialog>
  )
}

// -----------------------------------------------------------------------------
// Domains
// -----------------------------------------------------------------------------

function DomainsCard({ projectId, perms }: { projectId: string; perms: Perms }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<DomainDto | null>(null)

  const domains = useQuery({
    queryKey: ['domains', projectId],
    queryFn: () => apiFetch<{ items: DomainDto[] }>(`/api/projects/${projectId}/domains`),
  })
  const verify = useMutation({
    mutationFn: (d: DomainDto) => apiFetch<{ domain: DomainDto; message: string }>(`/api/domains/${d.id}/verify`, { method: 'POST' }),
    onSuccess: (res) => {
      if (res.domain.status === 'active') toast.success(`${res.domain.hostname}: ${res.message}`)
      else toast.info(res.message)
      qc.invalidateQueries({ queryKey: ['domains', projectId] })
    },
    onError: (e) => toast.error(errMessage(e, 'Could not verify the domain')),
  })
  const remove = useMutation({
    mutationFn: (d: DomainDto) => apiFetch<void>(`/api/domains/${d.id}`, { method: 'DELETE' }),
    onSuccess: (_r, d) => { toast.success(`${d.hostname} removed`); setRemoving(null); qc.invalidateQueries({ queryKey: ['domains', projectId] }) },
    onError: (e) => toast.error(errMessage(e, 'Could not remove the domain')),
  })

  return (
    <Card>
      <SectionHeader icon={Globe} title="Custom domains" subtitle="Serve your app from your own domain with automatic SSL."
        action={perms.domainsWrite ? <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="size-3.5" aria-hidden />Add domain</Button> : null} />
      {!perms.domainsWrite && <ReadOnlyNotice>Only workspace admins can add or change domains.</ReadOnlyNotice>}
      {domains.isLoading ? (
        <div className="mt-4 grid gap-2" aria-busy="true"><Skeleton className="h-20 w-full" /></div>
      ) : domains.isError ? (
        <ErrorState message={errMessage(domains.error, 'Could not load domains')} onRetry={() => domains.refetch()} className="py-6" />
      ) : (domains.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={Globe} title="No custom domains" body="Add a domain like support.example.com — we'll give you the DNS records to set at your provider." className="py-8" />
      ) : (
        <ul className="mt-4 grid gap-3">
          {domains.data!.items.map((d) => (
            <li key={d.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-2 font-mono text-[13px]"><Globe className="size-4 shrink-0 text-muted" aria-hidden /><span className="truncate">{d.hostname}</span></span>
                <Badge>{ENV_LABEL[d.environment]}</Badge>
                <DomainStatus domain={d} />
                {perms.domainsWrite && d.status !== 'active' && (
                  <Button variant="secondary" size="sm" loading={verify.isPending && verify.variables?.id === d.id} onClick={() => verify.mutate(d)}><ShieldCheck className="size-3.5" aria-hidden />Verify</Button>
                )}
                {d.status === 'active' && (
                  <Button asChild variant="ghost" size="sm"><a href={`https://${d.hostname}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" aria-hidden />Open</a></Button>
                )}
                {perms.domainsWrite && (
                  <Button variant="ghost" size="icon" aria-label={`Remove ${d.hostname}`} onClick={() => setRemoving(d)}><Trash2 className="size-4" /></Button>
                )}
              </div>
              {d.status !== 'active' ? (
                <>
                  <p className="mt-3 text-xs text-muted">Add these records at your DNS provider, then select Verify. Changes can take a few minutes to propagate.</p>
                  <DnsTable records={d.dnsRecords} />
                </>
              ) : (
                <p className="mt-2 text-xs text-muted">SSL certificate active{d.certExpiresAt ? ` · renews ${ago(d.certExpiresAt)}` : ''}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <AddDomainDialog projectId={projectId} open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Remove ${removing.hostname}?` : 'Remove domain'}
        body="Traffic to this domain will stop reaching your app. You can add it again later, but you will need to re-verify DNS."
        confirmLabel="Remove" loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing)} />
    </Card>
  )
}

function DomainStatus({ domain }: { domain: DomainDto }) {
  if (domain.status === 'active') return <StatusPill status="live" label="Active" />
  if (domain.status === 'verified') return <StatusPill status="running" label="Issuing SSL" />
  if (domain.status === 'error') return <StatusPill status="error" label="DNS error" />
  return <StatusPill status="attention" label="Pending DNS" />
}

function DnsTable({ records }: { records: DnsRecord[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs">
        <thead>
          <tr className="border-b border-border text-left font-medium uppercase tracking-wide text-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">Type</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Name</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Value</th>
            <th scope="col" className="py-1.5"><span className="sr-only">Copy</span></th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.type}:${r.name}`} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3 font-mono">{r.type}</td>
              <td className="max-w-[220px] truncate py-1.5 pr-3 font-mono" title={r.name}>{r.name}</td>
              <td className="max-w-[260px] truncate py-1.5 pr-3 font-mono" title={r.value}>{r.value}</td>
              <td className="py-1.5 text-right">
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Copy ${r.type} value`} onClick={() => copy(r.value, `${r.type} value`)}><Copy className="size-3.5" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AddDomainDialog({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [hostname, setHostname] = useState('')
  const [environment, setEnvironment] = useState<DeployEnvironment>('production')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (open) { setHostname(''); setEnvironment('production'); setError(null) } }, [open])

  const add = useMutation({
    mutationFn: (host: string) => apiFetch<{ domain: DomainDto }>(`/api/projects/${projectId}/domains`, { body: { hostname: host, environment } }),
    onSuccess: (res) => {
      toast.success(`${res.domain.hostname} added — set the DNS records to verify it`)
      qc.invalidateQueries({ queryKey: ['domains', projectId] })
      onClose()
    },
    onError: (e) => setError(e instanceof ApiError ? (e.fieldErrors().hostname?.[0] ?? e.message) : 'Could not add the domain'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const host = hostname.trim().toLowerCase().replace(/\.$/, '')
    if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return setError('Enter a domain like app.example.com')
    if (host === 'architect.app' || host.endsWith('.architect.app')) return setError('Architect subdomains are assigned automatically — use your own domain')
    add.mutate(host)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Add a custom domain" description="We'll give you the DNS records to add at your provider.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div>
          <Label htmlFor="domain-host">Domain</Label>
          <Input id="domain-host" placeholder="support.example.com" value={hostname} autoComplete="off" spellCheck={false} invalid={!!error}
            aria-describedby={error ? 'domain-host-err' : undefined} onChange={(e) => { setHostname(e.target.value); setError(null) }} />
          <FieldError id="domain-host-err">{error}</FieldError>
        </div>
        <div>
          <Label htmlFor="domain-env">Points to</Label>
          <Select id="domain-env" value={environment} onChange={(e) => setEnvironment(e.target.value as DeployEnvironment)}>
            <option value="production">Production</option>
            <option value="preview">Preview</option>
          </Select>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={add.isPending}>Add domain</Button>
        </div>
      </form>
    </Dialog>
  )
}

// -----------------------------------------------------------------------------
// Runtime settings
// -----------------------------------------------------------------------------

type RuntimeForm = { region: RuntimeSettingsDto['region']; minInstances: string; maxInstances: string; timeoutS: string; evalGateThreshold: string; blockProdOnEvalFail: boolean }

function toForm(s: RuntimeSettingsDto): RuntimeForm {
  return {
    region: s.region, minInstances: String(s.minInstances), maxInstances: String(s.maxInstances), timeoutS: String(s.timeoutS),
    evalGateThreshold: s.evalGateThreshold == null ? '' : String(s.evalGateThreshold), blockProdOnEvalFail: s.blockProdOnEvalFail,
  }
}

function RuntimeCard({ projectId, perms }: { projectId: string; perms: Perms }) {
  const qc = useQueryClient()
  const settings = useQuery({
    queryKey: ['project-settings', projectId],
    queryFn: () => apiFetch<{ settings: RuntimeSettingsDto }>(`/api/projects/${projectId}/settings`).then((r) => r.settings),
  })
  const [form, setForm] = useState<RuntimeForm | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  useEffect(() => { if (settings.data) setForm(toForm(settings.data)) }, [settings.data])

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch<{ settings: RuntimeSettingsDto }>(`/api/projects/${projectId}/settings`, { method: 'PATCH', body }),
    onSuccess: (res) => {
      qc.setQueryData(['project-settings', projectId], res.settings)
      qc.invalidateQueries({ queryKey: ['deploy-preflight', projectId] })
      toast.success('Runtime settings saved — they apply on the next deploy')
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors())
      toast.error(errMessage(e, 'Could not save settings'))
    },
  })

  const readOnly = !perms.settingsRuntime
  const cap = settings.data?.maxInstancesCap ?? 20

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const min = Number(form.minInstances), max = Number(form.maxInstances), timeout = Number(form.timeoutS)
    const gate = form.evalGateThreshold.trim() === '' ? null : Number(form.evalGateThreshold)
    const next: Record<string, string[]> = {}
    if (!Number.isInteger(min) || min < 0 || min > 10) next.minInstances = ['Whole number from 0 to 10']
    if (!Number.isInteger(max) || max < 1 || max > cap) next.maxInstances = [`Whole number from 1 to ${cap}`]
    if (!next.minInstances && !next.maxInstances && min > max) next.minInstances = ['Must be ≤ max instances']
    if (!Number.isInteger(timeout) || timeout < 5 || timeout > 900) next.timeoutS = ['Whole number of seconds from 5 to 900']
    if (gate !== null && (Number.isNaN(gate) || gate < 0 || gate > 100)) next.evalGateThreshold = ['Percentage from 0 to 100, or leave empty']
    setErrors(next)
    if (Object.keys(next).length > 0) return
    save.mutate({ region: form.region, minInstances: min, maxInstances: max, timeoutS: timeout, evalGateThreshold: gate, blockProdOnEvalFail: form.blockProdOnEvalFail })
  }

  const dirty = !!form && !!settings.data && JSON.stringify(form) !== JSON.stringify(toForm(settings.data))

  return (
    <Card>
      <SectionHeader icon={Rocket} title="Runtime" subtitle="Where and how your deployed app runs. Changes apply on the next deploy." />
      {readOnly && <ReadOnlyNotice>Only developers can change runtime settings.</ReadOnlyNotice>}
      {settings.isLoading || (!form && !settings.isError) ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : settings.isError ? (
        <ErrorState message={errMessage(settings.error, 'Could not load runtime settings')} onRetry={() => settings.refetch()} className="py-6" />
      ) : form ? (
        <form onSubmit={submit} className="mt-4 grid gap-4" noValidate>
          <fieldset disabled={readOnly || save.isPending} className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Runtime settings</legend>
            <div>
              <Label htmlFor="rt-region">Region</Label>
              <Select id="rt-region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value as RuntimeForm['region'] })}>
                {Object.entries(REGION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
            <NumberField id="rt-timeout" label="Request timeout (seconds)" value={form.timeoutS} error={errors.timeoutS?.[0]} hint="5–900" min={5} max={900}
              onChange={(v) => setForm({ ...form, timeoutS: v })} />
            <NumberField id="rt-min" label="Minimum instances" value={form.minInstances} error={errors.minInstances?.[0]} hint="0 scales to zero when idle" min={0} max={10}
              onChange={(v) => setForm({ ...form, minInstances: v })} />
            <NumberField id="rt-max" label="Maximum instances" value={form.maxInstances} error={errors.maxInstances?.[0]} hint={`Up to ${cap} on your plan`} min={1} max={cap}
              onChange={(v) => setForm({ ...form, maxInstances: v })} />
            <NumberField id="rt-gate" label="Eval gate (minimum score %)" value={form.evalGateThreshold} error={errors.evalGateThreshold?.[0]} hint="Leave empty to disable" min={0} max={100}
              onChange={(v) => setForm({ ...form, evalGateThreshold: v })} />
            <div className="flex items-center justify-between gap-3 self-center rounded-xl border border-border px-4 py-3">
              <label htmlFor="rt-block" className="text-sm">Block production deploys below the gate</label>
              <Switch id="rt-block" checked={form.blockProdOnEvalFail} disabled={readOnly || form.evalGateThreshold.trim() === ''} onCheckedChange={(v) => setForm({ ...form, blockProdOnEvalFail: v })} />
            </div>
          </fieldset>
          {!readOnly && (
            <div className="flex items-center justify-end gap-2">
              {dirty && <Button type="button" variant="ghost" onClick={() => { setForm(toForm(settings.data!)); setErrors({}) }}>Discard</Button>}
              <Button type="submit" disabled={!dirty} loading={save.isPending}>Save runtime settings</Button>
            </div>
          )}
        </form>
      ) : null}
    </Card>
  )
}

function NumberField({ id, label, value, onChange, error, hint, min, max }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; min: number; max: number }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} invalid={!!error}
        aria-describedby={`${id}-${error ? 'err' : 'hint'}`} onChange={(e) => onChange(e.target.value)} />
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : hint ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Shared bits
// -----------------------------------------------------------------------------

function SectionHeader({ icon: Icon, title, subtitle, action }: { icon: typeof Globe; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 text-muted" aria-hidden />
        <div><h2 className="text-base font-semibold">{title}</h2><p className="mt-0.5 text-xs text-muted">{subtitle}</p></div>
      </div>
      {action}
    </div>
  )
}

function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <p className={cn('mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted')}>
      <Lock className="size-4 shrink-0" aria-hidden />{children}
    </p>
  )
}
