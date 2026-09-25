import 'server-only'
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import { getWorkspaceAccess } from '@/lib/core/access'
import { hashToken } from '@/lib/core/services/onboarding-service'
import { atLeast } from '@/lib/authz'
import type { MemberRole } from '@/lib/contracts/common'

export type InviteInput = { email: string; role: Exclude<MemberRole, 'owner'>; isDeveloper: boolean }

/** Creates a 7-day invitation and returns a one-time link (only its sha256 hash is stored). */
export async function inviteMember(supabase: SupabaseClient, userId: string, ws: string, input: InviteInput, origin: string) {
  const { workspace, membership } = await getWorkspaceAccess(supabase, ws, userId, 'invitations:manage')
  if (input.role === 'admin' && !atLeast(membership.role, 'admin')) throw new AppError('FORBIDDEN', 'Only admins can invite admins')
  const email = input.email.toLowerCase()

  const { data: members, error: mErr } = await supabase
    .from('workspace_members').select('profiles(email)').eq('workspace_id', workspace.id)
  if (mErr) throw fromPostgrest(mErr)
  const existing = (members as unknown as { profiles: { email: string | null } | null }[]).some((m) => m.profiles?.email?.toLowerCase() === email)
  if (existing) throw new AppError('CONFLICT', `${email} is already a member`, { fieldErrors: { email: ['Already a member'] } })

  // Replace any pending invite for the same address so only the newest link works.
  const { error: dErr } = await supabase.from('invitations').delete().eq('workspace_id', workspace.id).eq('email', email).is('accepted_at', null)
  if (dErr) throw fromPostgrest(dErr)

  const token = randomBytes(32).toString('base64url')
  const { data, error } = await supabase.from('invitations')
    .insert({ workspace_id: workspace.id, email, role: input.role, is_developer: input.isDeveloper, invited_by: userId, token_hash: hashToken(token) })
    .select('id, email, role, expires_at').single()
  if (error) throw fromPostgrest(error, 'Could not create invitation')
  return {
    invitation: { id: data.id, email: data.email, role: data.role, expiresAt: data.expires_at },
    inviteUrl: `${origin}/invite/${token}`,
  }
}

export async function revokeInvitation(supabase: SupabaseClient, userId: string, ws: string, id: string) {
  const { workspace } = await getWorkspaceAccess(supabase, ws, userId, 'invitations:manage')
  const { data, error } = await supabase.from('invitations').delete().eq('id', id).eq('workspace_id', workspace.id).select('id')
  if (error) throw fromPostgrest(error)
  if (!data?.length) throw new AppError('NOT_FOUND', 'Invitation not found')
}

async function targetMember(supabase: SupabaseClient, workspaceId: string, targetId: string) {
  const { data, error } = await supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', targetId).maybeSingle()
  if (error) throw fromPostgrest(error)
  if (!data) throw new AppError('NOT_FOUND', 'Member not found')
  return data.role as MemberRole
}

export async function updateMember(supabase: SupabaseClient, userId: string, ws: string, targetId: string, patch: { role?: Exclude<MemberRole, 'owner'>; isDeveloper?: boolean }) {
  const { workspace } = await getWorkspaceAccess(supabase, ws, userId, 'members:manage')
  const role = await targetMember(supabase, workspace.id, targetId)
  if (role === 'owner') throw new AppError('FORBIDDEN', 'The owner’s role can’t be changed')
  const values: Record<string, unknown> = {}
  if (patch.role) values.role = patch.role
  if (patch.isDeveloper !== undefined) values.is_developer = patch.isDeveloper
  const { error } = await supabase.from('workspace_members').update(values).eq('workspace_id', workspace.id).eq('user_id', targetId)
  if (error) throw fromPostgrest(error, 'Could not update member')
  return { member: { userId: targetId, role: patch.role ?? role, isDeveloper: patch.isDeveloper } }
}

/** Admins remove others; anyone except the owner can leave. */
export async function removeMember(supabase: SupabaseClient, userId: string, ws: string, targetId: string) {
  const { workspace } = await getWorkspaceAccess(supabase, ws, userId, targetId === userId ? 'workspace:read' : 'members:manage')
  const role = await targetMember(supabase, workspace.id, targetId)
  if (role === 'owner') throw new AppError('FORBIDDEN', 'The owner can’t leave or be removed — delete the workspace instead')
  const { error } = await supabase.from('workspace_members').delete().eq('workspace_id', workspace.id).eq('user_id', targetId)
  if (error) throw fromPostgrest(error, 'Could not remove member')
}

export async function workspaceUsage(supabase: SupabaseClient, userId: string, ws: string) {
  const { workspace } = await getWorkspaceAccess(supabase, ws, userId, 'workspace:update')
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await supabase.from('usage_events')
    .select('id, action, credits, created_at, project_id, projects(name)')
    .eq('workspace_id', workspace.id).gte('created_at', since).order('created_at', { ascending: false }).limit(500)
  if (error) throw fromPostgrest(error, 'Could not load usage')
  const rows = (data ?? []) as unknown as { id: number; action: string; credits: number | string; created_at: string; projects: { name: string } | null }[]
  const byAction = new Map<string, number>()
  let spent = 0
  for (const r of rows) {
    const c = Number(r.credits)
    if (c > 0) { spent += c; byAction.set(r.action, (byAction.get(r.action) ?? 0) + c) }
  }
  return {
    plan: workspace.plan,
    balance: Number(workspace.credits_balance),
    spent30d: Math.round(spent * 100) / 100,
    byAction: [...byAction.entries()].map(([action, credits]) => ({ action, credits: Math.round(credits * 100) / 100 })).sort((a, b) => b.credits - a.credits),
    events: rows.slice(0, 50).map((r) => ({ id: r.id, action: r.action, credits: Number(r.credits), createdAt: r.created_at, project: r.projects?.name ?? null })),
  }
}

export async function deleteWorkspace(supabase: SupabaseClient, userId: string, ws: string, confirmName: string) {
  const { workspace } = await getWorkspaceAccess(supabase, ws, userId, 'workspace:delete')
  if (confirmName.trim() !== workspace.name) throw new AppError('VALIDATION_FAILED', 'Type the workspace name exactly to confirm', { fieldErrors: { confirmName: ['Name does not match'] } })
  const { count } = await supabase.from('workspace_members').select('workspace_id', { count: 'exact', head: true }).eq('user_id', userId)
  if ((count ?? 0) <= 1) throw new AppError('PRECONDITION_FAILED', 'This is your only workspace — create another one before deleting it')
  const { error } = await supabase.from('workspaces').delete().eq('id', workspace.id)
  if (error) throw fromPostgrest(error, 'Could not delete workspace')
}
