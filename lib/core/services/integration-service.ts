import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import { getWorkspaceAccess } from '@/lib/core/access'
import { CATALOG, catalogEntry, type IntegrationCategory } from '@/lib/core/integrations/catalog'
import { createAdminClient } from '@/lib/supabase/admin'

export type IntegrationDto = {
  id: string
  provider: string
  status: 'connected' | 'error' | 'revoked'
  scope: 'workspace' | 'project'
  connectedBy: string | null
  createdAt: string
}

type Row = {
  id: string; provider: string; status: IntegrationDto['status']; project_id: string | null; created_at: string
  connector: { full_name: string | null; email: string | null } | null
}

const COLS = 'id, provider, status, project_id, created_at, connector:profiles!integrations_connected_by_fkey(full_name, email)'

function toDto(r: Row): IntegrationDto {
  return {
    id: r.id, provider: r.provider, status: r.status, scope: r.project_id ? 'project' : 'workspace',
    connectedBy: r.connector?.full_name ?? r.connector?.email ?? null, createdAt: r.created_at,
  }
}

export function listCatalog(filter: { category?: IntegrationCategory; q?: string }) {
  const q = filter.q?.trim().toLowerCase()
  return {
    items: CATALOG.filter((c) => (!filter.category || c.category === filter.category) && (!q || `${c.name} ${c.description} ${c.provider}`.toLowerCase().includes(q))),
  }
}

export async function listConnections(supabase: SupabaseClient, userId: string, ws: string) {
  const { workspace } = await getWorkspaceAccess(supabase, ws, userId, 'workspace:read')
  const { data, error } = await supabase.from('integrations').select(COLS).eq('workspace_id', workspace.id).is('project_id', null).order('created_at')
  if (error) throw fromPostgrest(error, 'Could not load integrations')
  return { items: ((data ?? []) as unknown as Row[]).map(toDto) }
}

const STRIPE_KEY = /^(rk|sk)_(live|test)_[A-Za-z0-9]{16,247}$/

/** Format validation only. Credentials are never persisted in demo mode (no KMS configured). */
function validateCredential(authType: string, input: { apiKey?: string; connectionString?: string }) {
  if (authType === 'api_key') {
    if (!input.apiKey || !STRIPE_KEY.test(input.apiKey)) {
      throw new AppError('VALIDATION_FAILED', 'That doesn’t look like a Stripe key', { fieldErrors: { apiKey: ['Expected rk_live_…, rk_test_…, sk_live_… or sk_test_…'] } })
    }
  }
  if (authType === 'connection_string') {
    let url: URL | null = null
    try { url = input.connectionString ? new URL(input.connectionString) : null } catch { url = null }
    if (!url || !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new AppError('VALIDATION_FAILED', 'That doesn’t look like a Postgres connection string', { fieldErrors: { connectionString: ['Expected postgres://user:password@host:5432/database'] } })
    }
  }
}

function requireAdmin() {
  const admin = createAdminClient()
  if (!admin) throw new AppError('PRECONDITION_FAILED', 'Integrations need SUPABASE_SERVICE_ROLE_KEY on the server. Add it to .env.local and restart.')
  return admin
}

export async function connectIntegration(
  supabase: SupabaseClient, userId: string, provider: string,
  input: { workspaceId: string; apiKey?: string; connectionString?: string },
) {
  const entry = catalogEntry(provider)
  if (!entry) throw new AppError('NOT_FOUND', 'Unknown integration')
  const { workspace } = await getWorkspaceAccess(supabase, input.workspaceId, userId, 'integrations:connect')
  validateCredential(entry.authType, input)

  const admin = requireAdmin()
  const { data: existing, error: exErr } = await admin.from('integrations').select('id')
    .eq('workspace_id', workspace.id).is('project_id', null).eq('provider', provider).maybeSingle()
  if (exErr) throw fromPostgrest(exErr, 'Could not connect')

  const values = { status: 'connected', connected_by: userId, scopes: entry.tools.map((t) => t.name), updated_at: new Date().toISOString() }
  const res = existing
    ? await admin.from('integrations').update(values).eq('id', existing.id).select(COLS).single()
    : await admin.from('integrations').insert({ ...values, workspace_id: workspace.id, project_id: null, provider }).select(COLS).single()
  if (res.error) throw fromPostgrest(res.error, 'Could not connect')

  await admin.from('audit_logs').insert({ workspace_id: workspace.id, actor_id: userId, action: 'integration.connect', target: { provider } })
  return { integration: toDto(res.data as unknown as Row) }
}

export async function disconnectIntegration(supabase: SupabaseClient, userId: string, id: string) {
  // RLS: members can read their workspace's rows; invisible rows → 404.
  const { data, error } = await supabase.from('integrations').select('id, workspace_id, provider').eq('id', id).maybeSingle()
  if (error) throw fromPostgrest(error)
  if (!data) throw new AppError('NOT_FOUND', 'Integration not found')
  await getWorkspaceAccess(supabase, data.workspace_id as string, userId, 'integrations:revoke')

  const admin = requireAdmin()
  const { error: delErr } = await admin.from('integrations').delete().eq('id', id)
  if (delErr) throw fromPostgrest(delErr, 'Could not disconnect')
  await admin.from('audit_logs').insert({ workspace_id: data.workspace_id, actor_id: userId, action: 'integration.revoke', target: { provider: data.provider } })
}
