'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { KeyRound, Search, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DemoBadge } from '@/components/shared/DemoBadge'
import { PageContainer, PageHeader } from '@/components/shared/PageHeader'
import { StatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Chips } from '@/components/ui/Chips'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { FieldError, FieldHint, Input, Label } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Alert, EmptyState, ErrorState } from '@/components/ui/States'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import { can } from '@/lib/authz'
import { CATALOG, INTEGRATION_CATEGORIES, PROVIDER_TINT, type CatalogEntry, type IntegrationCategory } from '@/lib/core/integrations/catalog'
import { cn } from '@/lib/utils'

type Connection = { id: string; provider: string; status: 'connected' | 'error' | 'revoked'; scope: 'workspace' | 'project'; connectedBy: string | null; createdAt: string }

export function IntegrationsPage() {
  const { workspace, role, isDeveloper } = useWorkspace()
  const membership = { role, isDeveloper, codeModeRestricted: workspace.codeModeRestricted, prodDeployRole: 'admin' as const }
  const canConnect = can(membership, 'integrations:connect')
  const canRevoke = can(membership, 'integrations:revoke')

  const [category, setCategory] = useState<IntegrationCategory | null>(null)
  const [q, setQ] = useState('')
  const [connecting, setConnecting] = useState<CatalogEntry | null>(null)
  const [managing, setManaging] = useState<CatalogEntry | null>(null)

  const connections = useQuery({
    queryKey: ['integrations', workspace.slug],
    queryFn: () => apiFetch<{ items: Connection[] }>(`/api/workspaces/${workspace.slug}/integrations`),
  })
  const byProvider = useMemo(() => new Map((connections.data?.items ?? []).map((c) => [c.provider, c])), [connections.data])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return CATALOG.filter((c) => (!category || c.category === category) && (!needle || `${c.name} ${c.description}`.toLowerCase().includes(needle)))
  }, [category, q])
  const connectedCount = connections.data?.items.filter((c) => c.status === 'connected').length ?? 0

  return (
    <PageContainer>
      <PageHeader title="Integrations"
        description={connections.isSuccess ? `${connectedCount} of ${CATALOG.length} connected — connected tools become available to every agent in ${workspace.name}.` : 'Connect the tools your agents use.'}
        actions={<DemoBadge />} />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Chips label="Category" value={category} onChange={setCategory} options={INTEGRATION_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search integrations" placeholder="Search integrations" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>

      {!canConnect && <Alert tone="info" className="mt-4">You have view access. Ask an editor or admin to connect integrations.</Alert>}

      <div className="mt-6">
        {connections.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
        ) : connections.isError ? (
          <ErrorState message={connections.error instanceof ApiError ? connections.error.message : 'Could not load integrations'} onRetry={() => connections.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title="No integrations match" body="Try another search or category."
            action={<Button variant="secondary" onClick={() => { setQ(''); setCategory(null) }}>Clear filters</Button>} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const conn = byProvider.get(c.provider)
              return (
                <li key={c.provider} className="flex flex-col rounded-xl border border-border bg-surface p-5">
                  <div className="flex items-start gap-3">
                    <Monogram entry={c} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="truncate font-medium">{c.name}</h2>
                        {conn?.status === 'connected' ? <StatusPill status="connected" /> : conn?.status === 'error' ? <StatusPill status="error" /> : null}
                      </div>
                      <p className="text-xs text-muted">{c.category} · {c.tools.length} tool{c.tools.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-sm text-muted">{c.description}</p>
                  <div className="mt-4 flex gap-2">
                    {conn ? (
                      <Button variant="secondary" size="sm" onClick={() => setManaging(c)}>Manage</Button>
                    ) : (
                      <Button size="sm" onClick={() => setConnecting(c)} disabled={!canConnect}>Connect</Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="mt-8 text-xs text-muted">
        MCP servers are added per project from the agent inspector, so each app only sees the tools it needs.
      </p>

      <ConnectDialog entry={connecting} onClose={() => setConnecting(null)} />
      <ManageDialog entry={managing} connection={managing ? byProvider.get(managing.provider) ?? null : null} canRevoke={canRevoke} onClose={() => setManaging(null)} />
    </PageContainer>
  )
}

function Monogram({ entry, size = 'md' }: { entry: CatalogEntry; size?: 'md' | 'lg' }) {
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-xl font-semibold', PROVIDER_TINT[entry.category], size === 'lg' ? 'size-12 text-base' : 'size-10 text-sm')}>
      {entry.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}
    </span>
  )
}

function ConnectDialog({ entry, onClose }: { entry: CatalogEntry | null; onClose: () => void }) {
  const { workspace } = useWorkspace()
  const qc = useQueryClient()
  const [credential, setCredential] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const needsKey = entry?.authType === 'api_key' || entry?.authType === 'connection_string'

  const connect = useMutation({
    mutationFn: () => apiFetch<{ integration: Connection }>(`/api/integrations/${entry!.provider}/connect`, {
      body: {
        workspaceId: workspace.id,
        ...(entry!.authType === 'api_key' ? { apiKey: credential.trim() } : {}),
        ...(entry!.authType === 'connection_string' ? { connectionString: credential.trim() } : {}),
      },
    }),
    onSuccess: () => {
      toast.success(`${entry!.name} connected`)
      qc.invalidateQueries({ queryKey: ['integrations', workspace.slug] })
      close()
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        const fe = e.fieldErrors()
        const first = fe.apiKey?.[0] ?? fe.connectionString?.[0]
        if (first) setFieldError(first)
        else setError(e.message)
      } else setError('Could not connect')
    },
  })

  function close() {
    setCredential('')
    setFieldError(null)
    setError(null)
    onClose()
  }

  function submit() {
    setError(null)
    if (needsKey && !credential.trim()) {
      setFieldError('Required')
      return
    }
    connect.mutate()
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && close()} title={entry ? `Connect ${entry.name}` : ''}
      description={entry && (needsKey ? 'Paste a credential. It is checked, then used only by your agents.' : 'You’ll be asked to approve access in a secure pop-up.')}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={submit} loading={connect.isPending}>{needsKey ? 'Test & save' : 'Connect'}</Button></>}>
      {entry && (
        <div className="grid gap-4">
          {error && <Alert>{error}</Alert>}
          {needsKey ? (
            <div>
              <Label htmlFor="credential">{entry.authType === 'api_key' ? 'API key' : 'Connection string'}</Label>
              <Input id="credential" type="password" autoComplete="off" spellCheck={false} value={credential} maxLength={1000} invalid={!!fieldError}
                onChange={(e) => { setCredential(e.target.value); setFieldError(null) }} onKeyDown={(e) => e.key === 'Enter' && submit()} className="font-mono" />
              {fieldError ? <FieldError>{fieldError}</FieldError> : <FieldHint>{entry.credentialHint}</FieldHint>}
            </div>
          ) : (
            <div className="rounded-xl bg-surface-2 p-4 text-sm">
              <p className="font-medium">{entry.name} will be able to:</p>
              <ul className="mt-2 space-y-1 text-muted">{entry.tools.map((t) => <li key={t.name}>· {t.description}</li>)}</ul>
            </div>
          )}
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
            In this prototype the connection is simulated: nothing is sent to {entry.name} and no credential is stored.
          </p>
        </div>
      )}
    </Dialog>
  )
}

function ManageDialog({ entry, connection, canRevoke, onClose }: { entry: CatalogEntry | null; connection: Connection | null; canRevoke: boolean; onClose: () => void }) {
  const { workspace } = useWorkspace()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const revoke = useMutation({
    mutationFn: () => apiFetch<void>(`/api/integrations/${connection!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(`${entry!.name} disconnected`)
      qc.invalidateQueries({ queryKey: ['integrations', workspace.slug] })
      setConfirm(false)
      onClose()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not disconnect'),
  })

  return (
    <>
      <Dialog open={!!entry && !confirm} onOpenChange={(o) => !o && onClose()} title={entry?.name ?? ''} size="lg"
        footer={<>
          {canRevoke && <Button variant="danger" onClick={() => setConfirm(true)}>Disconnect</Button>}
          <Button variant="secondary" onClick={onClose}>Done</Button>
        </>}>
        {entry && connection && (
          <div className="grid gap-5">
            <div className="flex items-center gap-3">
              <Monogram entry={entry} size="lg" />
              <div>
                <StatusPill status={connection.status === 'connected' ? 'connected' : 'error'} />
                <p className="mt-1 text-xs text-muted">
                  Connected {formatDistanceToNow(new Date(connection.createdAt), { addSuffix: true })}{connection.connectedBy ? ` by ${connection.connectedBy}` : ''} · workspace-wide
                </p>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Tools available to agents</h3>
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                {entry.tools.map((t) => (
                  <li key={t.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="font-mono text-xs">{t.name}</span>
                    <span className="text-right text-xs text-muted">{t.description}</span>
                  </li>
                ))}
              </ul>
            </div>
            {entry.authType !== 'oauth' && entry.authType !== 'none' && (
              <p className="flex items-center gap-2 text-xs text-muted"><KeyRound className="size-3.5" aria-hidden /> To rotate the credential, disconnect and connect again.</p>
            )}
            {!canRevoke && <p className="text-xs text-muted">Only admins can disconnect integrations.</p>}
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Disconnect ${entry?.name ?? ''}?`}
        body="Agents using its tools will stop being able to call them until it is connected again." confirmLabel="Disconnect"
        loading={revoke.isPending} onConfirm={() => revoke.mutate()} />
    </>
  )
}

