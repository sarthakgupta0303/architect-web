'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Check, Copy, Mail, UserPlus, Users } from 'lucide-react'
import { useTheme } from 'next-themes'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageContainer, PageHeader } from '@/components/shared/PageHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { FieldError, FieldHint, Input, Label, Select } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { Alert, EmptyState, ErrorState } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { useWorkspace } from '@/features/workspace/context'
import { ApiError, apiFetch } from '@/lib/api/client'
import { atLeast } from '@/lib/authz'
import type { MemberRole } from '@/lib/contracts/common'
import { PLANS } from '@/lib/core/plans'
import { formatCredits } from '@/lib/utils'

type Tab = 'general' | 'members' | 'usage' | 'profile'
const TABS: { value: Tab; label: string }[] = [
  { value: 'general', label: 'General' }, { value: 'members', label: 'Members' }, { value: 'usage', label: 'Usage & plan' }, { value: 'profile', label: 'Profile' },
]

export function WorkspaceSettings() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const initial = TABS.find((t) => t.value === params.get('tab'))?.value ?? 'general'
  const [tab, setTab] = useState<Tab>(initial)

  function select(t: Tab) {
    setTab(t)
    router.replace(`${pathname}?tab=${t}`, { scroll: false })
  }

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Workspace, people, usage and your profile." />
      <div className="mt-6 overflow-x-auto"><Segmented label="Settings section" value={tab} onChange={select} options={TABS} /></div>
      <div className="mt-6 max-w-4xl">
        {tab === 'general' && <GeneralSection />}
        {tab === 'members' && <MembersSection />}
        {tab === 'usage' && <UsageSection />}
        {tab === 'profile' && <ProfileSection />}
      </div>
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ General */

type WsDetail = { workspace: { id: string; slug: string; name: string; codeModeRestricted: boolean; prodDeployRole: MemberRole }; role: MemberRole }

function GeneralSection() {
  const { workspace, role, workspaces } = useWorkspace()
  const router = useRouter()
  const qc = useQueryClient()
  const isAdmin = atLeast(role, 'admin')
  const detail = useQuery({ queryKey: ['workspace', workspace.slug], queryFn: () => apiFetch<WsDetail>(`/api/workspaces/${workspace.slug}`) })
  const [name, setName] = useState(workspace.name)
  const [nameError, setNameError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => setName(workspace.name), [workspace.name])

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch(`/api/workspaces/${workspace.slug}`, { method: 'PATCH', body }),
    onSuccess: () => {
      toast.success('Saved')
      qc.invalidateQueries({ queryKey: ['workspace', workspace.slug] })
      router.refresh()
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  })

  const del = useMutation({
    mutationFn: () => apiFetch(`/api/workspaces/${workspace.slug}`, { method: 'DELETE', body: { confirmName } }),
    onSuccess: () => {
      toast.success('Workspace deleted')
      const next = workspaces.find((w) => w.id !== workspace.id)
      router.push(next ? `/w/${next.slug}` : '/app')
      router.refresh()
    },
    onError: (e) => setDeleteError(e instanceof ApiError ? e.message : 'Could not delete workspace'),
  })

  function saveName() {
    const v = name.trim()
    if (!v) return setNameError('Name is required')
    if (v.length > 60) return setNameError('60 characters max')
    setNameError(null)
    patch.mutate({ name: v })
  }

  if (detail.isLoading) return <Skeleton className="h-64 rounded-xl" />
  if (detail.isError) return <ErrorState message="Could not load workspace settings" onRetry={() => detail.refetch()} />
  const ws = detail.data!.workspace

  return (
    <div className="space-y-6">
      {!isAdmin && <Alert tone="info">Only admins can change workspace settings.</Alert>}
      <Card>
        <h2 className="text-base font-semibold">Workspace</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="ws-name">Name</Label>
            <Input id="ws-name" value={name} maxLength={60} disabled={!isAdmin} invalid={!!nameError} onChange={(e) => { setName(e.target.value); setNameError(null) }} />
            {nameError ? <FieldError>{nameError}</FieldError> : <FieldHint>URL: /w/{ws.slug}</FieldHint>}
          </div>
          <Button onClick={saveName} disabled={!isAdmin || name.trim() === ws.name} loading={patch.isPending && patch.variables?.name !== undefined}>Save</Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold">Permissions</h2>
        <div className="mt-4 divide-y divide-border">
          <div className="flex items-start justify-between gap-6 py-3">
            <div>
              <p className="text-sm font-medium">Restrict Code mode to developers</p>
              <p className="text-sm text-muted">Editors without the developer flag stay in Build mode. Admins always have Code mode.</p>
            </div>
            <Switch label="Restrict Code mode" checked={ws.codeModeRestricted} disabled={!isAdmin || patch.isPending} onCheckedChange={(v) => patch.mutate({ codeModeRestricted: v })} />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-6 py-3">
            <div>
              <p className="text-sm font-medium">Who can deploy to production</p>
              <p className="text-sm text-muted">Everyone with edit access can always deploy previews.</p>
            </div>
            <Select aria-label="Minimum role for production deploys" className="w-40" value={ws.prodDeployRole} disabled={!isAdmin || patch.isPending}
              onChange={(e) => patch.mutate({ prodDeployRole: e.target.value })}>
              <option value="editor">Editors and up</option>
              <option value="admin">Admins and up</option>
              <option value="owner">Owner only</option>
            </Select>
          </div>
        </div>
      </Card>

      {role === 'owner' && (
        <Card className="border-danger/40">
          <h2 className="text-base font-semibold text-danger">Danger zone</h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">Delete this workspace, its projects, deployments and run history. This can’t be undone.</p>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete workspace</Button>
          </div>
        </Card>
      )}

      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) { setConfirmName(''); setDeleteError(null) } }} title="Delete workspace?"
        description={<>Type <span className="font-mono text-fg">{ws.name}</span> to confirm.</>}
        footer={<><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" disabled={confirmName.trim() !== ws.name} loading={del.isPending} onClick={() => del.mutate()}>Delete forever</Button></>}>
        <Label htmlFor="confirm-ws" className="sr-only">Workspace name</Label>
        <Input id="confirm-ws" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" invalid={!!deleteError} />
        <FieldError>{deleteError}</FieldError>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ Members */

type Member = { userId: string; role: MemberRole; isDeveloper: boolean; name: string | null; email: string | null; avatarUrl: string | null }
type Invitation = { id: string; email: string; role: MemberRole; expiresAt: string }

function MembersSection() {
  const { workspace, role, user, workspaces } = useWorkspace()
  const qc = useQueryClient()
  const router = useRouter()
  const isAdmin = atLeast(role, 'admin')
  const key = ['members', workspace.slug]
  const members = useQuery({ queryKey: key, queryFn: () => apiFetch<{ items: Member[]; invitations: Invitation[] }>(`/api/workspaces/${workspace.slug}/members`) })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removing, setRemoving] = useState<Member | null>(null)

  const update = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: Record<string, unknown> }) => apiFetch(`/api/workspaces/${workspace.slug}/members/${userId}`, { method: 'PATCH', body }),
    onSuccess: () => { toast.success('Member updated'); qc.invalidateQueries({ queryKey: key }) },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update member'),
  })
  const remove = useMutation({
    mutationFn: (userId: string) => apiFetch(`/api/workspaces/${workspace.slug}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: (_d, userId) => {
      setRemoving(null)
      if (userId === user.id) {
        toast.success(`You left ${workspace.name}`)
        const next = workspaces.find((w) => w.id !== workspace.id)
        router.push(next ? `/w/${next.slug}` : '/onboarding')
        router.refresh()
        return
      }
      toast.success('Member removed')
      qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove member'),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/workspaces/${workspace.slug}/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Invitation revoked'); qc.invalidateQueries({ queryKey: key }) },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not revoke invitation'),
  })

  if (members.isLoading) return <Skeleton className="h-72 rounded-xl" />
  if (members.isError) return <ErrorState message="Could not load members" onRetry={() => members.refetch()} />
  const { items, invitations } = members.data!

  return (
    <div className="space-y-6">
      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-base font-semibold">Members</h2>
            <p className="text-sm text-muted">{items.length} {items.length === 1 ? 'person' : 'people'} in {workspace.name}</p>
          </div>
          {isAdmin && <Button onClick={() => setInviteOpen(true)}><UserPlus className="size-4" aria-hidden /> Invite</Button>}
        </div>
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {items.map((m) => {
            const self = m.userId === user.id
            const editable = isAdmin && m.role !== 'owner' && !self
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.name ?? m.email} src={m.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name ?? m.email ?? 'Member'}{self && <span className="text-muted"> (you)</span>}</p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                {m.role !== 'owner' && m.role !== 'viewer' && (
                  <label className="flex items-center gap-2 text-xs text-muted">
                    Developer
                    <Switch label={`Developer access for ${m.name ?? m.email}`} checked={m.isDeveloper || m.role === 'admin'} disabled={!editable || m.role === 'admin' || update.isPending}
                      onCheckedChange={(v) => update.mutate({ userId: m.userId, body: { isDeveloper: v } })} />
                  </label>
                )}
                {editable ? (
                  <Select aria-label={`Role for ${m.name ?? m.email}`} className="w-32" value={m.role} disabled={update.isPending}
                    onChange={(e) => update.mutate({ userId: m.userId, body: { role: e.target.value } })}>
                    <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
                  </Select>
                ) : <Badge tone={m.role === 'owner' ? 'primary' : 'neutral'} className="capitalize">{m.role}</Badge>}
                {(editable || (self && m.role !== 'owner')) && (
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}>{self ? 'Leave' : 'Remove'}</Button>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      {isAdmin && (
        <Card>
          <h2 className="text-base font-semibold">Pending invitations</h2>
          {invitations.length === 0 ? (
            <EmptyState icon={Mail} className="py-6" title="No pending invitations" body="Invite teammates to build, review and deploy together."
              action={<Button variant="secondary" onClick={() => setInviteOpen(true)}>Invite someone</Button>} />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{i.email}</p>
                    <p className="text-xs text-muted"><span className="capitalize">{i.role}</span> · expires {formatDistanceToNow(new Date(i.expiresAt), { addSuffix: true })}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => revoke.mutate(i.id)} loading={revoke.isPending && revoke.variables === i.id}>Revoke</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <RoleGuide />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvited={() => qc.invalidateQueries({ queryKey: key })} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}
        title={removing?.userId === user.id ? `Leave ${workspace.name}?` : `Remove ${removing?.name ?? removing?.email ?? 'member'}?`}
        body={removing?.userId === user.id ? 'You’ll lose access to its projects until someone invites you again.' : 'They lose access to every project in this workspace immediately.'}
        confirmLabel={removing?.userId === user.id ? 'Leave' : 'Remove'} loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing.userId)} />
    </div>
  )
}

function RoleGuide() {
  const rows = [
    ['Viewer', 'Open projects, test apps, comment'],
    ['Editor', 'Build, edit agents, deploy previews, connect integrations'],
    ['Admin', 'Everything above, plus members, settings and production deploys'],
    ['Owner', 'Everything, plus billing and deleting the workspace'],
  ]
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold"><Users className="size-4 text-primary-text" aria-hidden /> What each role can do</h2>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[120px_1fr]">
        {rows.map(([r, d]) => <div key={r} className="contents"><dt className="font-medium">{r}</dt><dd className="text-muted">{d}</dd></div>)}
      </dl>
    </Card>
  )
}

function InviteDialog({ open, onOpenChange, onInvited }: { open: boolean; onOpenChange: (o: boolean) => void; onInvited: () => void }) {
  const { workspace } = useWorkspace()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'viewer' | 'editor' | 'admin'>('editor')
  const [isDeveloper, setIsDeveloper] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const invite = useMutation({
    mutationFn: () => apiFetch<{ inviteUrl: string }>(`/api/workspaces/${workspace.slug}/members`, { body: { email, role, isDeveloper } }),
    onSuccess: (d) => { setLink(d.inviteUrl); onInvited() },
    onError: (e) => {
      if (e instanceof ApiError) setError(e.fieldErrors().email?.[0] ?? e.message)
      else setError('Could not send the invitation')
    },
  })

  function reset(o: boolean) {
    if (!o) { setEmail(''); setRole('editor'); setIsDeveloper(false); setError(null); setLink(null); setCopied(false) }
    onOpenChange(o)
  }

  function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address')
    setError(null)
    invite.mutate()
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select the link and copy it manually')
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset} title={link ? 'Invitation ready' : `Invite to ${workspace.name}`}
      description={link ? `Send this link to ${email}. It works once, only for that address, and expires in 7 days.` : 'They’ll join with the role you choose.'}
      footer={link
        ? <><Button variant="secondary" onClick={() => { setLink(null); setEmail('') }}>Invite another</Button><Button onClick={() => reset(false)}>Done</Button></>
        : <><Button variant="secondary" onClick={() => reset(false)}>Cancel</Button><Button onClick={submit} loading={invite.isPending}>Create invite</Button></>}>
      {link ? (
        <div className="flex gap-2">
          <Input readOnly value={link} aria-label="Invitation link" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="secondary" onClick={copy} aria-label="Copy link">{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <div>
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" autoComplete="off" value={email} maxLength={254} invalid={!!error} autoFocus
              onChange={(e) => { setEmail(e.target.value); setError(null) }} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            <FieldError>{error}</FieldError>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
              </Select>
            </div>
            {role === 'editor' && (
              <div className="flex items-end justify-between gap-3 pb-2">
                <span className="text-sm">Developer (Code mode)</span>
                <Switch label="Developer access" checked={isDeveloper} onCheckedChange={setIsDeveloper} />
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ Usage */

type Usage = { plan: keyof typeof PLANS; balance: number; spent30d: number; byAction: { action: string; credits: number }[]; events: { id: number; action: string; credits: number; createdAt: string; project: string | null }[] }
const ACTION_LABELS: Record<string, string> = {
  clarify: 'Clarifying questions', prd: 'PRD generation', graph: 'Agent design', build: 'App builds', edit: 'Edits', eval: 'Evals',
  agent_run: 'Agent runs', deploy_minutes: 'Deploy minutes', topup: 'Top-up', grant: 'Monthly grant',
}

function UsageSection() {
  const { workspace, role } = useWorkspace()
  const isAdmin = atLeast(role, 'admin')
  const usage = useQuery({ queryKey: ['usage', workspace.slug], queryFn: () => apiFetch<Usage>(`/api/workspaces/${workspace.slug}/usage`), enabled: isAdmin })
  const plan = PLANS[workspace.plan]
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted">Current plan</p>
            <p className="mt-1 text-2xl font-semibold">{plan.label}</p>
            <p className="mt-1 text-sm text-muted">{formatCredits(workspace.creditsBalance)} credits left · {plan.monthlyCredits} granted monthly</p>
          </div>
          {role === 'owner' && workspace.plan !== 'enterprise' && <Button onClick={() => setUpgradeOpen(true)}>Change plan</Button>}
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">{plan.features.map((f) => <li key={f}><Badge>{f}</Badge></li>)}</ul>
      </Card>

      {!isAdmin ? (
        <Alert tone="info">Only admins can see detailed usage.</Alert>
      ) : usage.isLoading ? <Skeleton className="h-64 rounded-xl" /> : usage.isError ? (
        <ErrorState message="Could not load usage" onRetry={() => usage.refetch()} />
      ) : (
        <>
          <Card>
            <h2 className="text-base font-semibold">Last 30 days</h2>
            <p className="mt-1 text-sm text-muted">{formatCredits(usage.data!.spent30d)} credits used</p>
            {usage.data!.byAction.length === 0 ? <p className="mt-4 text-sm text-muted">No credits used yet.</p> : (
              <ul className="mt-4 space-y-3">
                {usage.data!.byAction.map((a) => {
                  const pct = usage.data!.spent30d ? (a.credits / usage.data!.spent30d) * 100 : 0
                  return (
                    <li key={a.action}>
                      <div className="flex justify-between text-sm"><span>{ACTION_LABELS[a.action] ?? a.action}</span><span className="tabular-nums text-muted">{formatCredits(a.credits)}</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <Card className="p-0">
            <h2 className="px-5 pt-5 text-base font-semibold">Activity</h2>
            {usage.data!.events.length === 0 ? <p className="px-5 pb-5 pt-2 text-sm text-muted">Nothing yet.</p> : (
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {usage.data!.events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0"><p className="truncate">{ACTION_LABELS[e.action] ?? e.action}{e.project && <span className="text-muted"> · {e.project}</span>}</p>
                      <p className="text-xs text-muted">{formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}</p></div>
                    <span className={`tabular-nums ${e.credits < 0 ? 'text-success' : ''}`}>{e.credits < 0 ? '+' : '−'}{formatCredits(Math.abs(e.credits))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen} title="Plans" size="lg"
        description="Billing isn’t connected in this prototype, so plan changes are shown but not charged."
        footer={<Button variant="secondary" onClick={() => setUpgradeOpen(false)}>Close</Button>}>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['free', 'pro', 'team'] as const).map((k) => (
            <div key={k} className={`rounded-xl border p-4 ${k === workspace.plan ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <p className="font-semibold">{PLANS[k].label}</p>
              <p className="mt-1 text-2xl font-semibold">${PLANS[k].priceMonthly}<span className="text-sm font-normal text-muted">/mo</span></p>
              <ul className="mt-3 space-y-1 text-xs text-muted">{PLANS[k].features.map((f) => <li key={f}>· {f}</li>)}</ul>
              {k === workspace.plan && <Badge tone="primary" className="mt-3">Current</Badge>}
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  )
}

/* ------------------------------------------------------------------ Profile */

function ProfileSection() {
  const { user } = useWorkspace()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [name, setName] = useState(user.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const me = useQuery({ queryKey: ['me'], queryFn: () => apiFetch<{ profile: { default_mode: 'build' | 'code' } }>('/api/me') })

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch('/api/me', { method: 'PATCH', body }),
    onSuccess: () => { toast.success('Profile saved'); router.refresh(); me.refetch() },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  })

  function saveName() {
    const v = name.trim()
    if (!v) return setError('Name is required')
    setError(null)
    save.mutate({ fullName: v })
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-base font-semibold">Your profile</h2>
        <div className="mt-4 flex items-center gap-4">
          <Avatar name={user.name ?? user.email} src={user.avatarUrl} size={48} />
          <p className="text-sm text-muted">{user.email}</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="full-name">Full name</Label>
            <Input id="full-name" value={name} maxLength={80} invalid={!!error} onChange={(e) => { setName(e.target.value); setError(null) }} />
            <FieldError>{error}</FieldError>
          </div>
          <Button onClick={saveName} disabled={name.trim() === (user.name ?? '')} loading={save.isPending}>Save</Button>
        </div>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">Preferences</h2>
        <div className="mt-4 divide-y divide-border">
          <div className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div><p className="text-sm font-medium">Default mode for new projects</p><p className="text-sm text-muted">Build is visual; Code opens the editor and terminal.</p></div>
            {me.isLoading ? <Skeleton className="h-9 w-40" /> : (
              <Segmented size="sm" label="Default mode" value={me.data?.profile.default_mode ?? 'build'} onChange={(v) => save.mutate({ defaultMode: v })}
                options={[{ value: 'build', label: 'Build' }, { value: 'code', label: 'Code' }]} />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div><p className="text-sm font-medium">Theme</p><p className="text-sm text-muted">Applies on this device and syncs to your profile.</p></div>
            <Segmented size="sm" label="Theme" value={(theme as 'light' | 'dark' | 'system') ?? 'system'} onChange={(v) => { setTheme(v); save.mutate({ theme: v }) }}
              options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
          </div>
        </div>
      </Card>
    </div>
  )
}
