'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, Rocket, ScrollText, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Alert } from '@/components/ui/States'
import { DemoBadge } from '@/components/shared/DemoBadge'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import { can, type MembershipContext } from '@/lib/authz'
import type { DeployEnvironment, DeployOverview, DeploymentDto, DeploymentEventDto, FixActionType, PreflightCheck, PreflightResult } from '@/lib/core/services/deploy-service'
import { cn, scrollToEnd } from '@/lib/utils'
import { useProject } from '../context'

type Phase = 'checks' | 'deploying' | 'done' | 'failed'
type DeployResponse = { deploymentId: string; realtimeChannel: string; deployment: DeploymentDto; events: DeploymentEventDto[] }

const STAGES = [
  { key: 'building', label: 'Building image' },
  { key: 'releasing', label: 'Releasing' },
  { key: 'health', label: 'Checking health' },
] as const

const FIX_TAB: Record<FixActionType, string> = { open_secrets: 'deploy', open_evals: 'evals', run_build: 'preview', open_security: 'settings' }

export function deployOverviewKey(projectId: string) { return ['deploy-overview', projectId] as const }

/** Shared overview query (environment cards + workspace prod-deploy role). */
export function useDeployOverview(projectId: string, enabled = true) {
  return useQuery({
    queryKey: deployOverviewKey(projectId),
    queryFn: () => apiFetch<DeployOverview>(`/api/projects/${projectId}/deployments/overview`),
    enabled,
    staleTime: 10_000,
  })
}

/** Membership for client-side permission hints; the API re-checks every action. */
export function useDeployPermissions(prodDeployRole: DeployOverview['prodDeployRole'] | undefined) {
  const { role, isDeveloper, workspace } = useWorkspace()
  return useMemo(() => {
    const m: MembershipContext = { role, isDeveloper, codeModeRestricted: workspace.codeModeRestricted, prodDeployRole: prodDeployRole ?? 'owner' }
    return {
      loaded: !!prodDeployRole,
      preview: can(m, 'deploy:preview'),
      production: !!prodDeployRole && can(m, 'deploy:production'),
      rollback: !!prodDeployRole && can(m, 'deploy:rollback'),
      secretsRead: can(m, 'secrets:read'),
      secretsWrite: can(m, 'secrets:write'),
      domainsWrite: can(m, 'domains:write'),
      settingsRuntime: can(m, 'settings:runtime'),
    }
  }, [role, isDeveloper, workspace.codeModeRestricted, prodDeployRole])
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function DeployModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { project, refresh } = useProject()
  const { workspace } = useWorkspace()
  const router = useRouter()
  const qc = useQueryClient()
  const overview = useDeployOverview(project.id, open)
  const perms = useDeployPermissions(overview.data?.prodDeployRole)

  const [env, setEnv] = useState<DeployEnvironment>('preview')
  const [phase, setPhase] = useState<Phase>('checks')
  const [shown, setShown] = useState<DeploymentEventDto[]>([])
  const [result, setResult] = useState<DeploymentDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const runId = useRef(0)
  const logRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    if (open) {
      setPhase('checks'); setShown([]); setResult(null); setError(null); setShowLogs(false)
    } else {
      runId.current += 1 // cancel any running animation
    }
  }, [open])

  // Default to production once we know the user may publish there.
  useEffect(() => {
    if (open && perms.loaded) setEnv(perms.production ? 'production' : 'preview')
  }, [open, perms.loaded, perms.production])

  const envAllowed = env === 'production' ? perms.production : perms.preview
  const preflight = useQuery({
    queryKey: ['deploy-preflight', project.id, env],
    queryFn: () => apiFetch<PreflightResult>(`/api/projects/${project.id}/deployments/preflight`, { body: { environment: env } }),
    enabled: open && phase === 'checks' && perms.loaded && envAllowed,
    staleTime: 0,
    retry: false,
  })

  useEffect(() => { scrollToEnd(logRef.current?.lastElementChild as HTMLElement | null, false) }, [shown.length, showLogs])

  const deploy = useMutation({
    mutationFn: () => apiFetch<DeployResponse>(`/api/projects/${project.id}/deployments`, { body: { environment: env } }),
    onMutate: () => { setPhase('deploying'); setShown([]); setError(null); setResult(null) },
    onSuccess: async (res) => {
      const id = ++runId.current
      const fast = prefersReducedMotion()
      for (const e of res.events) {
        if (runId.current !== id) return
        setShown((prev) => [...prev, e])
        await new Promise((r) => setTimeout(r, fast ? 40 : e.type === 'status' ? 700 : e.type === 'check' ? 120 : 260))
      }
      if (runId.current !== id) return
      setResult(res.deployment)
      if (res.deployment.status === 'live') {
        setPhase('done')
      } else {
        setError('The deployment did not finish — the previous version is still live.')
        setPhase('failed')
      }
      qc.invalidateQueries({ queryKey: deployOverviewKey(project.id) })
      qc.invalidateQueries({ queryKey: ['deployments', project.id] })
      refresh()
    },
    onError: (e) => {
      const err = e instanceof ApiError ? e : null
      if (err?.code === 'PRECONDITION_FAILED' && Array.isArray(err.details?.checks)) {
        qc.setQueryData(['deploy-preflight', project.id, env], { environment: env, checks: err.details.checks as PreflightCheck[], canDeploy: false })
        setPhase('checks')
        toast.error(err.message)
        return
      }
      setError(err?.message ?? 'Deploy failed — please try again')
      setPhase('failed')
      qc.invalidateQueries({ queryKey: ['deployments', project.id] })
    },
  })

  const base = `/w/${workspace.slug}/p/${project.id}/build`
  function goToTab(tab: string, anchor?: string) {
    onOpenChange(false)
    router.replace(`${base}?tab=${tab}`, { scroll: false })
    if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }

  const statusEvents = shown.filter((e) => e.type === 'status').map((e) => e.message)
  const lastStatus = statusEvents[statusEvents.length - 1]
  const stageIndex = STAGES.findIndex((s) => s.key === lastStatus)
  const reachedLive = lastStatus === 'live'
  const logLines = shown.filter((e) => e.type !== 'status')
  const checks = preflight.data?.checks ?? []
  const canPublish = envAllowed && !!preflight.data?.canDeploy && !deploy.isPending
  const url = result?.url ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg"
      title={phase === 'done' ? 'Your app is live' : phase === 'failed' ? 'Deploy failed' : phase === 'deploying' ? `Deploying to ${env}` : 'Deploy'}
      description={phase === 'checks' ? 'We run a few checks before publishing.' : undefined}>
      <div className="mb-4 flex justify-end"><DemoBadge /></div>

      {phase === 'checks' && (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Environment" value={env} onChange={setEnv} options={[
              { value: 'preview', label: 'Preview', disabled: !perms.preview, title: perms.preview ? undefined : 'Editors and above can deploy previews' },
              { value: 'production', label: 'Production', disabled: !perms.production, title: perms.production ? undefined : 'Your role cannot publish to production in this workspace' },
            ]} />
            <span className="truncate font-mono text-xs text-muted">{overview.data?.environments[env].url}</span>
          </div>

          {!perms.loaded && overview.isLoading && <ChecklistSkeleton />}
          {overview.isError && <Alert>{overview.error instanceof ApiError ? overview.error.message : 'Could not load deploy settings'}</Alert>}
          {perms.loaded && !envAllowed && (
            <Alert tone="warning">
              {env === 'production' ? 'Your role cannot publish to production in this workspace. Ask an admin, or deploy a preview.' : 'Only editors and above can deploy. Ask a workspace admin for access.'}
            </Alert>
          )}
          {perms.loaded && envAllowed && preflight.isLoading && <ChecklistSkeleton />}
          {preflight.isError && (
            <div className="flex items-center justify-between gap-3">
              <Alert className="flex-1">{preflight.error instanceof ApiError ? preflight.error.message : 'Could not run preflight checks'}</Alert>
              <Button variant="secondary" size="sm" onClick={() => preflight.refetch()}>Try again</Button>
            </div>
          )}
          {preflight.data && (
            <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Preflight checks">
              {checks.map((c) => (
                <li key={c.key} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <CheckIcon status={c.status} />
                  <span className="flex-1">{c.message}</span>
                  {c.fixAction && c.status !== 'pass' && (
                    <Button variant="secondary" size="sm" onClick={() => goToTab(FIX_TAB[c.fixAction!.type], c.fixAction!.type === 'open_secrets' ? 'deploy-secrets' : undefined)}>
                      {c.fixAction.label}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => deploy.mutate()} disabled={!canPublish} loading={deploy.isPending}>
              <Rocket className="size-4" aria-hidden /> Publish to {env}
            </Button>
          </div>
        </div>
      )}

      {phase === 'deploying' && (
        <div className="grid gap-4">
          <ol className="grid gap-3 py-2" aria-live="polite" aria-label="Deploy progress">
            {STAGES.map((s, i) => {
              const done = reachedLive || i < stageIndex
              const active = !reachedLive && i === stageIndex
              return (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  {done ? <CheckCircle2 className="size-5 text-success" aria-hidden />
                    : active || (stageIndex === -1 && i === 0) ? <Loader2 className="size-5 animate-spin text-info motion-reduce:animate-none" aria-hidden />
                      : <span className="size-5 rounded-full border border-border" aria-hidden />}
                  <span className={cn(!done && !active && 'text-muted')}>{s.label}</span>
                  <span className="sr-only">{done ? 'done' : active ? 'in progress' : 'pending'}</span>
                </li>
              )
            })}
          </ol>
          <LogToggle show={showLogs} onToggle={() => setShowLogs((v) => !v)} />
          {showLogs && <LogView lines={logLines} listRef={logRef} />}
        </div>
      )}

      {phase === 'done' && url && (
        <div className="grid gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
            <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
            <span className="flex-1 truncate font-mono text-sm">{url}</span>
            <Button variant="ghost" size="icon" aria-label="Copy URL"
              onClick={() => { navigator.clipboard.writeText(url).then(() => toast.success('URL copied'), () => toast.error('Could not copy — select the URL instead')) }}>
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-sm text-muted">
            v{result?.version} is live on {result?.environment}. Hosting is simulated in the prototype, so the URL does not serve traffic yet — test your agents in the Preview tab.
          </p>
          <LogToggle show={showLogs} onToggle={() => setShowLogs((v) => !v)} />
          {showLogs && <LogView lines={logLines} listRef={logRef} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="secondary"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" aria-hidden /> Open</a></Button>
            <Button onClick={() => goToTab('studio')}>View in Studio</Button>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="grid gap-4">
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <XCircle className="size-5 shrink-0" aria-hidden />{error}
          </div>
          {logLines.length > 0 && <LogToggle show={showLogs} onToggle={() => setShowLogs((v) => !v)} />}
          {showLogs && <LogView lines={logLines} listRef={logRef} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={() => { setPhase('checks'); preflight.refetch() }}>Try again</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function CheckIcon({ status }: { status: PreflightCheck['status'] }) {
  if (status === 'pass') return <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Passed" />
  if (status === 'warn') return <AlertTriangle className="size-5 shrink-0 text-warning" aria-label="Warning" />
  return <XCircle className="size-5 shrink-0 text-danger" aria-label="Failed" />
}

function ChecklistSkeleton() {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Running preflight checks">
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
    </div>
  )
}

function LogToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="justify-self-start" aria-expanded={show} onClick={onToggle}>
      <ScrollText className="size-3.5" aria-hidden />{show ? 'Hide logs' : 'View logs'}
    </Button>
  )
}

export function LogView({ lines, listRef }: { lines: DeploymentEventDto[]; listRef?: Ref<HTMLOListElement> }) {
  if (lines.length === 0) return <p className="rounded-xl bg-surface-2 p-3 font-mono text-xs text-muted">Waiting for logs…</p>
  return (
    <ol ref={listRef} className="max-h-60 overflow-y-auto rounded-xl bg-surface-2 p-3 font-mono text-xs leading-5" aria-label="Deploy logs">
      {lines.map((l) => (
        <li key={l.seq} className={cn('whitespace-pre-wrap break-words', l.type === 'check' ? 'text-muted' : 'text-fg')}>
          <span className="select-none text-muted">{new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} </span>
          {l.message}
        </li>
      ))}
    </ol>
  )
}
