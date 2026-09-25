import 'server-only'
import { PLANS } from '@/lib/core/plans'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import type { MemberRole, PlanTier } from '@/lib/contracts/common'
import { getProjectAccess, type ProjectAccess } from '@/lib/core/access'
import type { ProjectRow } from '@/lib/db/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils'

/* =============================================================================
 * Deploy service — deployments, preflight, rollback, secrets, custom domains and
 * runtime settings (docs/specs/deploy.md). Infrastructure is simulated in the
 * prototype: a deploy walks queued → building → releasing → health → live
 * synchronously and records realistic deployment_events.
 *
 * deployments, deployment_events, secrets, domains, project_settings and
 * audit_logs are server-owned (no client writes under RLS): every write uses the
 * service-role client, and only after getProjectAccess() authorised the action.
 * ========================================================================== */

// -----------------------------------------------------------------------------
// Contracts
// -----------------------------------------------------------------------------

export const DeployEnvironment = z.enum(['preview', 'production'])
export type DeployEnvironment = z.infer<typeof DeployEnvironment>
export const SecretEnvironment = z.enum(['development', 'preview', 'production'])
export type SecretEnvironment = z.infer<typeof SecretEnvironment>
export const REGIONS = ['iad', 'sjc', 'fra', 'bom', 'sin'] as const
export const Region = z.enum(REGIONS)

export const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/
export const SecretName = z.string().regex(SECRET_NAME_RE, 'Use UPPER_SNAKE_CASE: a capital letter, then capitals, digits or _ (max 64)')

export const CreateDeploymentBody = z.object({
  environment: DeployEnvironment,
  commitSha: z.string().regex(/^[0-9a-f]{40}$/, 'commitSha must be a 40-character hex SHA').optional(),
})
export const PreflightBody = z.object({ environment: DeployEnvironment })
export const ListDeploymentsQuery = z.object({
  environment: DeployEnvironment.optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export const UpsertSecretBody = z.object({
  environment: SecretEnvironment,
  name: SecretName,
  value: z.string().min(1, 'Enter a value').max(32768, 'Values are limited to 32,768 characters'),
})
export const SecretListQuery = z.object({ environment: SecretEnvironment.optional() })
export const DeleteSecretQuery = z.object({ environment: SecretEnvironment })

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
export const AddDomainBody = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .transform((h) => h.replace(/\.$/, ''))
    .refine((h) => HOSTNAME_RE.test(h), 'Enter a domain like app.example.com')
    .refine((h) => h !== 'architect.app' && !h.endsWith('.architect.app'), 'Architect subdomains are assigned automatically — use your own domain'),
  environment: DeployEnvironment.default('production'),
})

export const CronTrigger = z.object({
  cron: z.string().trim().regex(/^(\S+\s+){4}\S+$/, 'Use a 5-field cron expression'),
  agentKey: z.string().trim().min(1).max(64),
  input: z.record(z.unknown()).default({}),
})
export const UpdateSettingsBody = z
  .object({
    evalGateThreshold: z.number().min(0).max(100).nullable().optional(),
    blockProdOnEvalFail: z.boolean().optional(),
    region: Region.optional(),
    minInstances: z.number().int().min(0).max(10).optional(),
    maxInstances: z.number().int().min(1).max(20).optional(),
    timeoutS: z.number().int().min(5).max(900).optional(),
    cronTriggers: z.array(CronTrigger).max(10).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'No changes')
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsBody>

export type DeployStatus = 'queued' | 'building' | 'releasing' | 'live' | 'failed' | 'rolled_back' | 'superseded'
export type CheckStatus = 'pass' | 'warn' | 'fail'
export type FixActionType = 'open_secrets' | 'open_evals' | 'run_build' | 'open_security'
export type PreflightCheck = { key: string; status: CheckStatus; message: string; blocking: boolean; fixAction?: { type: FixActionType; label: string } }
export type PreflightResult = { environment: DeployEnvironment; checks: PreflightCheck[]; canDeploy: boolean }

export type DeploymentDto = {
  id: string
  environment: DeployEnvironment
  version: number
  status: DeployStatus
  source: 'manual' | 'pr' | 'rollback' | 'auto'
  commitSha: string | null
  imageRef: string | null
  url: string | null
  createdAt: string
  liveAt: string | null
  finishedAt: string | null
  rolledBackFrom: string | null
  createdBy: { id: string; name: string | null } | null
}
export type DeploymentEventDto = { seq: number; type: 'status' | 'log' | 'check'; message: string; createdAt: string }
export type EnvironmentSummary = { environment: DeployEnvironment; url: string; current: DeploymentDto | null; latest: DeploymentDto | null }
export type DeployOverview = {
  environments: Record<DeployEnvironment, EnvironmentSummary>
  prodDeployRole: MemberRole
  plan: PlanTier
  serviceConfigured: boolean
}
export type SecretDto = { name: string; environment: SecretEnvironment; last4: string; updatedAt: string; updatedBy: { id: string; name: string | null } | null }
export type DnsRecord = { type: 'CNAME' | 'TXT'; name: string; value: string }
export type DomainDto = {
  id: string
  hostname: string
  environment: DeployEnvironment
  status: 'pending' | 'verified' | 'active' | 'error'
  certExpiresAt: string | null
  createdAt: string
  updatedAt: string
  dnsRecords: DnsRecord[]
}
export type RuntimeSettingsDto = {
  evalGateThreshold: number | null
  blockProdOnEvalFail: boolean
  region: (typeof REGIONS)[number]
  minInstances: number
  maxInstances: number
  timeoutS: number
  cronTriggers: z.infer<typeof CronTrigger>[]
  maxInstancesCap: number
  updatedAt: string | null
}

export type RequestMeta = { ip: string | null; userAgent: string | null }

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const ACTIVE_STATUSES: DeployStatus[] = ['queued', 'building', 'releasing']
const STALE_DEPLOY_MS = 10 * 60 * 1000
const DOMAIN_VERIFY_DELAY_MS = 10_000
const MAX_INSTANCES_CAP: Record<PlanTier, number> = { free: 3, pro: 10, team: 20, enterprise: 20 }

type Admin = SupabaseClient

function requireAdmin(): Admin {
  const admin = createAdminClient()
  if (!admin) throw new AppError('PRECONDITION_FAILED', 'Needs SUPABASE_SERVICE_ROLE_KEY — deployments, secrets, domains and runtime settings are written by the server. Add the key to .env.local and restart.')
  return admin
}

type PgError = { code?: string; message?: string }
/** Undefined table / column or function missing from the PostgREST schema cache. */
function isMissingRelation(err: PgError | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || err.code === '42703' || err.code === 'PGRST202' || err.code === '42883' || err.code === 'PGRST204'
}

function appsBaseDomain(): string {
  return (process.env.APPS_BASE_DOMAIN || 'architect.app').replace(/^\.+|\.+$/g, '')
}

export function appSlug(project: Pick<ProjectRow, 'name'>): string {
  return slugify(project.name, 30) || 'app'
}

export function environmentHost(project: Pick<ProjectRow, 'name'>, environment: DeployEnvironment): string {
  const slug = appSlug(project)
  return environment === 'production' ? `${slug}.${appsBaseDomain()}` : `${slug}-preview.${appsBaseDomain()}`
}

function environmentUrl(project: Pick<ProjectRow, 'name'>, environment: DeployEnvironment): string {
  return `https://${environmentHost(project, environment)}`
}

export function clientIp(req: { headers: Headers }): string | null {
  const raw = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '').split(',')[0]?.trim() ?? ''
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(raw) || /^[0-9a-f:]+$/i.test(raw)) return raw || null
  return null
}

export function requestMeta(req: { headers: Headers }): RequestMeta {
  return { ip: clientIp(req), userAgent: req.headers.get('user-agent')?.slice(0, 400) ?? null }
}

async function audit(admin: Admin, workspaceId: string, actorId: string, action: string, target: Record<string, unknown>, meta: RequestMeta) {
  const { error } = await admin.from('audit_logs').insert({ workspace_id: workspaceId, actor_id: actorId, action, target, ip: meta.ip, user_agent: meta.userAgent })
  if (error) console.error(`[audit] could not record ${action}`, error.code)
}

function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ c: createdAt, i: id })).toString('base64url')
}
function decodeCursor(cursor: string): { c: string; i: string } {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { c?: unknown; i?: unknown }
    if (typeof v.c === 'string' && typeof v.i === 'string' && !Number.isNaN(Date.parse(v.c)) && /^[0-9a-f-]{36}$/i.test(v.i)) return { c: v.c, i: v.i }
  } catch {
    // fall through
  }
  throw new AppError('VALIDATION_FAILED', 'Invalid cursor')
}

// -----------------------------------------------------------------------------
// Secrets encryption (AES-256-GCM, ciphertext = iv(12) || tag(16) || data)
// -----------------------------------------------------------------------------

const IV_BYTES = 12
const TAG_BYTES = 16

export function loadEncryptionKey(raw: string | undefined = process.env.SECRETS_ENCRYPTION_KEY): Buffer {
  const trimmed = raw?.trim()
  if (!trimmed) throw new AppError('PRECONDITION_FAILED', 'Needs SECRETS_ENCRYPTION_KEY — set a 32-byte base64 key (openssl rand -base64 32) in .env.local and restart.')
  const key = Buffer.from(trimmed, 'base64')
  if (key.length !== 32) throw new AppError('PRECONDITION_FAILED', 'SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes (generate one with: openssl rand -base64 32).')
  return key
}

/** Stable, non-reversible identifier of the key that encrypted a value (for rotation). */
export function keyId(key: Buffer): string {
  return `local-aes256gcm:${createHash('sha256').update(key).digest('hex').slice(0, 12)}`
}

/** Encrypts a plaintext; returns base64 of iv || tag || ciphertext. */
export function encryptSecret(plaintext: string, key: Buffer, aad?: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, data]).toString('base64')
}

/** Reverses encryptSecret; throws if the key, AAD or bytes do not match. */
export function decryptSecret(payloadB64: string, key: Buffer, aad?: string): string {
  const buf = Buffer.from(payloadB64, 'base64')
  if (buf.length < IV_BYTES + TAG_BYTES) throw new Error('Ciphertext is too short')
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const data = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** Display hint: last 4 chars, or fully masked for short values so the hint never reveals most of a secret. */
export function secretLast4(value: string): string {
  return value.length >= 8 ? value.slice(-4) : '****'
}

/** Postgres bytea literal for PostgREST writes. */
function toByteaHex(b64: string): string {
  return `\\x${Buffer.from(b64, 'base64').toString('hex')}`
}

function secretAad(projectId: string, environment: string, name: string) {
  return `${projectId}:${environment}:${name}`
}

// -----------------------------------------------------------------------------
// Deployments — mapping
// -----------------------------------------------------------------------------

const DEPLOYMENT_COLS =
  'id, project_id, environment, version, status, source, commit_sha, image_ref, url, preflight, rolled_back_from, created_by, created_at, live_at, finished_at, creator:profiles!deployments_created_by_fkey(id, full_name)'
const DEPLOYMENT_COLS_PLAIN =
  'id, project_id, environment, version, status, source, commit_sha, image_ref, url, preflight, rolled_back_from, created_by, created_at, live_at, finished_at'

type DeploymentRow = {
  id: string
  project_id: string
  environment: string
  version: number
  status: DeployStatus
  source: DeploymentDto['source']
  commit_sha: string | null
  image_ref: string | null
  url: string | null
  rolled_back_from: string | null
  created_by: string | null
  created_at: string
  live_at: string | null
  finished_at: string | null
  creator?: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null
}

function toDeploymentDto(r: DeploymentRow): DeploymentDto {
  const creator = Array.isArray(r.creator) ? r.creator[0] : r.creator
  return {
    id: r.id,
    environment: r.environment === 'production' ? 'production' : 'preview',
    version: r.version,
    status: r.status,
    source: r.source,
    commitSha: r.commit_sha?.trim() || null,
    imageRef: r.image_ref,
    url: r.url,
    createdAt: r.created_at,
    liveAt: r.live_at,
    finishedAt: r.finished_at,
    rolledBackFrom: r.rolled_back_from,
    createdBy: creator ? { id: creator.id, name: creator.full_name } : r.created_by ? { id: r.created_by, name: null } : null,
  }
}

type EventRow = { seq: number; type: DeploymentEventDto['type']; message: string; created_at: string }
function toEventDto(r: EventRow): DeploymentEventDto {
  return { seq: r.seq, type: r.type, message: r.message, createdAt: r.created_at }
}

// -----------------------------------------------------------------------------
// Preflight
// -----------------------------------------------------------------------------

async function runPreflight(supabase: SupabaseClient, access: ProjectAccess, environment: DeployEnvironment): Promise<PreflightResult> {
  const { project, workspace } = access
  const admin = createAdminClient()
  const checks: PreflightCheck[] = []

  // 1. Build
  const { data: lastBuild, error: buildErr } = await supabase
    .from('builds').select('status, finished_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (buildErr && !isMissingRelation(buildErr)) throw fromPostgrest(buildErr, 'Could not check the latest build')
  if (!project.preview_url) {
    checks.push({ key: 'build', status: 'fail', blocking: true, message: 'The app has not been built yet', fixAction: { type: 'run_build', label: 'Build now' } })
  } else if (lastBuild?.status === 'failed') {
    checks.push({ key: 'build', status: 'warn', blocking: false, message: 'The latest build failed — the last successful build will be deployed', fixAction: { type: 'run_build', label: 'Rebuild' } })
  } else if (lastBuild && (lastBuild.status === 'queued' || lastBuild.status === 'running')) {
    checks.push({ key: 'build', status: 'warn', blocking: false, message: 'A build is still running — the last successful build will be deployed' })
  } else {
    checks.push({ key: 'build', status: 'pass', blocking: false, message: 'Latest build succeeded' })
  }

  // 2. Required secrets (project_env_vars.required vs secrets for the environment)
  const { data: envVars, error: envErr } = await supabase.from('project_env_vars').select('name, required').eq('project_id', project.id)
  if (envErr && !isMissingRelation(envErr)) throw fromPostgrest(envErr, 'Could not load required environment variables')
  const required = (envVars ?? []).filter((v) => v.required).map((v) => v.name as string)
  if (envErr || required.length === 0) {
    checks.push({ key: 'secrets', status: 'pass', blocking: false, message: 'No required secrets are declared for this app' })
  } else if (!admin) {
    checks.push({ key: 'secrets', status: 'warn', blocking: false, message: `Could not verify ${required.length} required secret${required.length === 1 ? '' : 's'} — the server key is not configured` })
  } else {
    const { data: present, error: secErr } = await admin
      .from('secrets').select('name').eq('project_id', project.id).eq('kind', 'env').eq('environment', environment).in('name', required)
    if (secErr) throw fromPostgrest(secErr, 'Could not check secrets')
    const have = new Set((present ?? []).map((s) => s.name as string))
    const missing = required.filter((n) => !have.has(n))
    checks.push(missing.length === 0
      ? { key: 'secrets', status: 'pass', blocking: false, message: `All ${required.length} required secret${required.length === 1 ? ' is' : 's are'} set for ${environment}` }
      : { key: 'secrets', status: 'fail', blocking: true, message: `Missing ${missing.length === 1 ? 'secret' : 'secrets'} for ${environment}: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}`, fixAction: { type: 'open_secrets', label: 'Add secrets' } })
  }

  // 3. Eval gate
  const { data: settings, error: settingsErr } = await supabase
    .from('project_settings').select('eval_gate_threshold, block_prod_on_eval_fail').eq('project_id', project.id).maybeSingle()
  if (settingsErr && !isMissingRelation(settingsErr)) throw fromPostgrest(settingsErr, 'Could not load project settings')
  const threshold = settings?.eval_gate_threshold == null ? null : Number(settings.eval_gate_threshold)
  if (threshold === null) {
    checks.push({ key: 'evals', status: 'pass', blocking: false, message: 'No eval gate is configured' })
  } else {
    const gateBlocks = environment === 'production' && !!settings?.block_prod_on_eval_fail
    const { data: run, error: runErr } = await supabase
      .from('eval_runs').select('score, status, created_at').eq('project_id', project.id).eq('status', 'succeeded').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (runErr && !isMissingRelation(runErr)) throw fromPostgrest(runErr, 'Could not load eval runs')
    const score = run?.score == null ? null : Number(run.score)
    if (score === null) {
      checks.push({ key: 'evals', status: gateBlocks ? 'fail' : 'warn', blocking: gateBlocks, message: `Eval gate is ${threshold}% but no eval run has finished yet`, fixAction: { type: 'open_evals', label: 'Run evals' } })
    } else if (score < threshold) {
      checks.push({ key: 'evals', status: gateBlocks ? 'fail' : 'warn', blocking: gateBlocks, message: `Latest eval score ${score}% is below the ${threshold}% gate`, fixAction: { type: 'open_evals', label: 'Open evals' } })
    } else {
      checks.push({ key: 'evals', status: 'pass', blocking: false, message: `Latest eval score ${score}% meets the ${threshold}% gate` })
    }
  }

  // 4. Integrations referenced by agent tools
  const { data: agents, error: agentsErr } = await supabase.from('agents').select('id').eq('project_id', project.id)
  if (agentsErr && !isMissingRelation(agentsErr)) throw fromPostgrest(agentsErr, 'Could not load agents')
  const agentIds = (agents ?? []).map((a) => a.id as string)
  if (agentIds.length > 0) {
    const { data: tools, error: toolsErr } = await supabase
      .from('agent_tools').select('name, integration:integrations(provider, status)').in('agent_id', agentIds).eq('tool_type', 'integration')
    if (toolsErr && !isMissingRelation(toolsErr)) throw fromPostgrest(toolsErr, 'Could not load agent tools')
    const broken = new Set<string>()
    for (const t of (tools ?? []) as { name: string; integration: { provider: string; status: string } | { provider: string; status: string }[] | null }[]) {
      const integ = Array.isArray(t.integration) ? t.integration[0] : t.integration
      if (!integ || integ.status !== 'connected') broken.add(integ?.provider ?? t.name)
    }
    checks.push(broken.size === 0
      ? { key: 'integrations', status: 'pass', blocking: false, message: 'All integrations used by agents are connected' }
      : { key: 'integrations', status: 'warn', blocking: false, message: `Not connected: ${[...broken].slice(0, 4).join(', ')} — agent tools that use ${broken.size === 1 ? 'it' : 'them'} will fail` })
  }

  // 5. Plan limit — live production apps per plan (lib/core/plans.ts)
  const liveLimit = PLANS[workspace.plan].maxLiveApps
  if (environment === 'production' && liveLimit !== null) {
    const { count, error: liveErr } = await supabase
      .from('projects').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id).eq('status', 'live').is('deleted_at', null).neq('id', project.id)
    if (liveErr) throw fromPostgrest(liveErr, 'Could not check plan limits')
    checks.push((count ?? 0) >= liveLimit
      ? { key: 'plan', status: 'fail', blocking: true, message: `The ${PLANS[workspace.plan].label} plan includes ${liveLimit} live apps — unpublish one or upgrade to publish another` }
      : { key: 'plan', status: 'pass', blocking: false, message: 'Within your plan’s production app limit' })
  }

  return { environment, checks, canDeploy: !checks.some((c) => c.status === 'fail') }
}

export async function preflight(supabase: SupabaseClient, userId: string, projectId: string, environment: DeployEnvironment): Promise<PreflightResult> {
  // Spec §4: preflight needs deploy:preview for either target; the deploy itself re-checks deploy:production.
  const access = await getProjectAccess(supabase, projectId, userId, 'deploy:preview')
  return runPreflight(supabase, access, environment)
}

// -----------------------------------------------------------------------------
// Deploy (simulated pipeline)
// -----------------------------------------------------------------------------

async function assertNoActiveDeploy(admin: Admin, projectId: string, environment: DeployEnvironment) {
  const { data, error } = await admin
    .from('deployments').select('id, version, created_at').eq('project_id', projectId).eq('environment', environment).in('status', ACTIVE_STATUSES)
  if (error) throw fromPostgrest(error, 'Could not check running deployments')
  const now = Date.now()
  for (const d of data ?? []) {
    if (now - Date.parse(d.created_at as string) > STALE_DEPLOY_MS) {
      // A deploy that never finished (process crashed mid-way) must not block forever.
      await admin.from('deployments').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', d.id)
      await admin.from('deployment_events').insert({ deployment_id: d.id, seq: 10_000, type: 'status', message: 'failed' })
      continue
    }
    throw new AppError('CONFLICT', `Deployment v${d.version} to ${environment} is still in progress — wait for it to finish`, { reason: 'DEPLOY_RUNNING', deploymentId: d.id })
  }
}

async function nextVersion(admin: Admin, projectId: string, environment: DeployEnvironment): Promise<number> {
  const { data, error } = await admin
    .from('deployments').select('version').eq('project_id', projectId).eq('environment', environment).order('version', { ascending: false }).limit(1).maybeSingle()
  if (error) throw fromPostgrest(error, 'Could not determine the next version')
  return ((data?.version as number | undefined) ?? 0) + 1
}

class EventWriter {
  private seq = 0
  private rows: { deployment_id: string; seq: number; type: DeploymentEventDto['type']; message: string }[] = []
  constructor(private admin: Admin, private deploymentId: string) {}
  add(type: DeploymentEventDto['type'], message: string) {
    this.seq += 1
    this.rows.push({ deployment_id: this.deploymentId, seq: this.seq, type, message: message.slice(0, 2000) })
  }
  async flush() {
    if (this.rows.length === 0) return
    const batch = this.rows
    this.rows = []
    const { error } = await this.admin.from('deployment_events').insert(batch)
    if (error) throw fromPostgrest(error, 'Could not record deployment logs')
  }
}

async function setStatus(admin: Admin, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from('deployments').update(patch).eq('id', id)
  if (error) throw fromPostgrest(error, 'Could not update the deployment')
}

async function loadRuntime(admin: Admin, projectId: string) {
  const { data, error } = await admin.from('project_settings').select('region, min_instances, max_instances, timeout_s').eq('project_id', projectId).maybeSingle()
  if (error && !isMissingRelation(error)) throw fromPostgrest(error, 'Could not load runtime settings')
  return {
    region: (data?.region as string | undefined) ?? 'iad',
    min: (data?.min_instances as number | undefined) ?? 0,
    max: (data?.max_instances as number | undefined) ?? 3,
    timeout: (data?.timeout_s as number | undefined) ?? 60,
  }
}

async function countSecrets(admin: Admin, projectId: string, environment: DeployEnvironment): Promise<number> {
  const { count, error } = await admin.from('secrets').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('kind', 'env').eq('environment', environment)
  if (error) return 0
  return count ?? 0
}

async function agentKeys(admin: Admin, projectId: string): Promise<string[]> {
  const { data } = await admin.from('agents').select('key').eq('project_id', projectId).order('created_at', { ascending: true })
  return (data ?? []).map((a) => a.key as string).filter(Boolean)
}

async function loadDeploymentForResponse(admin: Admin, id: string): Promise<{ deployment: DeploymentDto; events: DeploymentEventDto[] }> {
  const [{ data: d, error: dErr }, { data: ev, error: evErr }] = await Promise.all([
    admin.from('deployments').select(DEPLOYMENT_COLS).eq('id', id).single(),
    admin.from('deployment_events').select('seq, type, message, created_at').eq('deployment_id', id).order('seq', { ascending: true }),
  ])
  if (dErr) {
    const { data: plain, error: plainErr } = await admin.from('deployments').select(DEPLOYMENT_COLS_PLAIN).eq('id', id).single()
    if (plainErr) throw fromPostgrest(plainErr, 'Could not load the deployment')
    if (evErr) throw fromPostgrest(evErr, 'Could not load deployment logs')
    return { deployment: toDeploymentDto(plain as DeploymentRow), events: (ev ?? []).map((e) => toEventDto(e as EventRow)) }
  }
  if (evErr) throw fromPostgrest(evErr, 'Could not load deployment logs')
  return { deployment: toDeploymentDto(d as unknown as DeploymentRow), events: (ev ?? []).map((e) => toEventDto(e as EventRow)) }
}

/** Swap the live pointer for an environment: previous live → `previousStatus`, then `id` → live. */
async function promote(admin: Admin, projectId: string, environment: DeployEnvironment, id: string, previousStatus: 'superseded' | 'rolled_back', patch: Record<string, unknown>): Promise<string | null> {
  const { data: prev, error: prevErr } = await admin
    .from('deployments').select('id').eq('project_id', projectId).eq('environment', environment).eq('status', 'live').neq('id', id).maybeSingle()
  if (prevErr) throw fromPostgrest(prevErr, 'Could not load the live deployment')
  if (prev) await setStatus(admin, prev.id as string, { status: previousStatus })
  const now = new Date().toISOString()
  const { error } = await admin.from('deployments').update({ ...patch, status: 'live', live_at: now, finished_at: now }).eq('id', id)
  if (error) {
    // Keep the previous version serving if the cutover failed.
    if (prev) await admin.from('deployments').update({ status: 'live' }).eq('id', prev.id)
    throw fromPostgrest(error, 'Could not promote the deployment')
  }
  return (prev?.id as string | undefined) ?? null
}

async function markProjectLive(admin: Admin, project: ProjectRow, environment: DeployEnvironment, url: string) {
  if (environment !== 'production') return
  const { error } = await admin.from('projects').update({ status: 'live', live_url: url }).eq('id', project.id)
  if (error) throw fromPostgrest(error, 'Could not update the project')
}

export async function createDeployment(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  input: z.infer<typeof CreateDeploymentBody>,
) {
  const { environment } = input
  const access = await getProjectAccess(supabase, projectId, userId, environment === 'production' ? 'deploy:production' : 'deploy:preview')
  const { project } = access
  const admin = requireAdmin()

  const pre = await runPreflight(supabase, access, environment)
  const failing = pre.checks.filter((c) => c.status === 'fail')
  if (failing.some((c) => c.key === 'plan')) throw new AppError('PLAN_LIMIT', failing.find((c) => c.key === 'plan')!.message, { checks: pre.checks })
  if (failing.length > 0) throw new AppError('PRECONDITION_FAILED', `Fix ${failing.length === 1 ? 'this check' : 'these checks'} before deploying: ${failing.map((c) => c.message).join('; ')}`, { checks: pre.checks })

  await assertNoActiveDeploy(admin, projectId, environment)
  const version = await nextVersion(admin, projectId, environment)
  const url = environmentUrl(project, environment)
  const sha = input.commitSha ?? null
  const sha7 = (sha ?? randomBytes(4).toString('hex')).slice(0, 7)
  const app = `arch-${projectId.slice(0, 8)}-${environment}`
  const imageRef = `${process.env.FLY_REGISTRY || 'registry.fly.io'}/${app}:${version}-${sha7}`

  const { data: row, error: insErr } = await admin
    .from('deployments')
    .insert({ project_id: projectId, environment, version, status: 'queued', source: 'manual', commit_sha: sha, preflight: pre.checks, created_by: userId })
    .select('id')
    .single()
  if (insErr) {
    if (insErr.code === '23505') throw new AppError('CONFLICT', 'Another deployment just started for this environment — try again in a moment', { reason: 'DEPLOY_RUNNING' })
    throw fromPostgrest(insErr, 'Could not start the deployment')
  }
  const id = row.id as string
  const ev = new EventWriter(admin, id)

  try {
    ev.add('status', 'queued')
    ev.add('log', `Deployment v${version} queued for ${environment} by the deploy worker`)
    for (const c of pre.checks) ev.add('check', `${c.status.toUpperCase()} ${c.key}: ${c.message}`)
    await ev.flush()

    const [runtime, secretCount, agents] = await Promise.all([loadRuntime(admin, projectId), countSecrets(admin, projectId, environment), agentKeys(admin, projectId)])
    const python = project.language !== 'typescript'

    await setStatus(admin, id, { status: 'building' })
    ev.add('status', 'building')
    ev.add('log', `Resolving source: branch ${project.working_branch}${sha ? ` @ ${sha7}` : ' (head)'}`)
    ev.add('log', `Detected ${python ? 'Python 3.12' : 'Node.js 20'} app from architect.json — using the Nixpacks ${python ? 'python' : 'node'} provider`)
    ev.add('log', python ? 'Installing dependencies from requirements.txt (cached layers reused)' : 'Installing dependencies with pnpm install --frozen-lockfile (cached layers reused)')
    ev.add('log', agents.length > 0 ? `Bundling ${agents.length} agent${agents.length === 1 ? '' : 's'}: ${agents.slice(0, 6).join(', ')}${agents.length > 6 ? ', …' : ''}` : 'Bundling agent runtime')
    ev.add('log', 'Building web UI (production bundle)')
    ev.add('log', `Pushed image ${imageRef}`)
    await ev.flush()

    await setStatus(admin, id, { status: 'releasing', image_ref: imageRef })
    ev.add('status', 'releasing')
    ev.add('log', `Releasing ${app} in region ${runtime.region}`)
    ev.add('log', `Injecting ${secretCount} encrypted secret${secretCount === 1 ? '' : 's'} and ARCHITECT_* runtime variables`)
    ev.add('log', `Starting machines: min ${runtime.min}, max ${runtime.max}, request timeout ${runtime.timeout}s`)
    ev.add('log', 'Services: web :3000 (HTTP), agent runtime :8000 (internal)')
    await ev.flush()

    ev.add('status', 'health')
    for (let i = 1; i <= 3; i++) ev.add('log', `Health check ${i}/3: GET /health → 200 (runtime) · GET / → 200 (web)`)
    await ev.flush()

    await promote(admin, projectId, environment, id, 'superseded', { url, image_ref: imageRef })
    await markProjectLive(admin, project, environment, url)
    ev.add('status', 'live')
    ev.add('log', `v${version} is live at ${url}`)
    await ev.flush()
  } catch (err) {
    ev.add('status', 'failed')
    ev.add('log', err instanceof AppError ? `Deployment failed: ${err.message}` : 'Deployment failed: unexpected error — the previous version stays live')
    await ev.flush().catch(() => undefined)
    await admin.from('deployments').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', id).neq('status', 'live')
    throw err
  }

  const result = await loadDeploymentForResponse(admin, id)
  return { deploymentId: id, realtimeChannel: `deploy:${id}`, ...result }
}

// -----------------------------------------------------------------------------
// History, detail, overview
// -----------------------------------------------------------------------------

export async function listDeployments(supabase: SupabaseClient, userId: string, projectId: string, q: z.infer<typeof ListDeploymentsQuery>) {
  await getProjectAccess(supabase, projectId, userId, 'project:read')
  const run = async (cols: string) => {
    let query = supabase.from('deployments').select(cols).eq('project_id', projectId)
    if (q.environment) query = query.eq('environment', q.environment)
    if (q.cursor) {
      const { c, i } = decodeCursor(q.cursor)
      query = query.or(`created_at.lt."${c}",and(created_at.eq."${c}",id.lt.${i})`)
    }
    return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(q.limit + 1)
  }
  let { data, error } = await run(DEPLOYMENT_COLS)
  if (error && (error.code === 'PGRST200' || error.code === 'PGRST201')) ({ data, error } = await run(DEPLOYMENT_COLS_PLAIN))
  if (error) {
    if (isMissingRelation(error)) return { items: [] as DeploymentDto[], nextCursor: null }
    throw fromPostgrest(error, 'Could not load deployments')
  }
  const rows = (data ?? []) as unknown as DeploymentRow[]
  const page = rows.slice(0, q.limit)
  const last = page[page.length - 1]
  return { items: page.map(toDeploymentDto), nextCursor: rows.length > q.limit && last ? encodeCursor(last.created_at, last.id) : null }
}

async function loadVisibleDeployment(supabase: SupabaseClient, deploymentId: string): Promise<DeploymentRow> {
  const { data, error } = await supabase.from('deployments').select(DEPLOYMENT_COLS_PLAIN).eq('id', deploymentId).maybeSingle()
  if (error && !isMissingRelation(error)) throw fromPostgrest(error, 'Could not load the deployment')
  if (!data) throw new AppError('NOT_FOUND', 'Deployment not found')
  return data as unknown as DeploymentRow
}

export async function getDeployment(supabase: SupabaseClient, userId: string, deploymentId: string) {
  const row = await loadVisibleDeployment(supabase, deploymentId)
  await getProjectAccess(supabase, row.project_id, userId, 'project:read')
  const [{ data: withCreator }, { data: events, error: evErr }] = await Promise.all([
    supabase.from('deployments').select(DEPLOYMENT_COLS).eq('id', deploymentId).maybeSingle(),
    supabase.from('deployment_events').select('seq, type, message, created_at').eq('deployment_id', deploymentId).order('seq', { ascending: true }).limit(1000),
  ])
  if (evErr) throw fromPostgrest(evErr, 'Could not load deployment logs')
  return {
    deployment: toDeploymentDto((withCreator as unknown as DeploymentRow | null) ?? row),
    events: (events ?? []).map((e) => toEventDto(e as EventRow)),
  }
}

export async function deployOverview(supabase: SupabaseClient, userId: string, projectId: string): Promise<DeployOverview> {
  const { project, workspace } = await getProjectAccess(supabase, projectId, userId, 'project:read')
  const envs: DeployEnvironment[] = ['preview', 'production']
  const summaries = await Promise.all(envs.map(async (environment): Promise<EnvironmentSummary> => {
    const [live, latest] = await Promise.all([
      supabase.from('deployments').select(DEPLOYMENT_COLS_PLAIN).eq('project_id', projectId).eq('environment', environment).eq('status', 'live').maybeSingle(),
      supabase.from('deployments').select(DEPLOYMENT_COLS_PLAIN).eq('project_id', projectId).eq('environment', environment).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    for (const r of [live, latest]) if (r.error && !isMissingRelation(r.error)) throw fromPostgrest(r.error, 'Could not load deployments')
    return {
      environment,
      url: environmentUrl(project, environment),
      current: live.data ? toDeploymentDto(live.data as unknown as DeploymentRow) : null,
      latest: latest.data ? toDeploymentDto(latest.data as unknown as DeploymentRow) : null,
    }
  }))
  return {
    environments: { preview: summaries[0]!, production: summaries[1]! },
    prodDeployRole: workspace.prod_deploy_role,
    plan: workspace.plan,
    serviceConfigured: createAdminClient() !== null,
  }
}

// -----------------------------------------------------------------------------
// Rollback
// -----------------------------------------------------------------------------

export async function rollbackDeployment(supabase: SupabaseClient, userId: string, deploymentId: string, meta: RequestMeta) {
  const target = await loadVisibleDeployment(supabase, deploymentId)
  const { project, workspace } = await getProjectAccess(supabase, target.project_id, userId, 'deploy:rollback')
  const admin = requireAdmin()
  const environment: DeployEnvironment = target.environment === 'production' ? 'production' : 'preview'

  if (target.status === 'live') throw new AppError('CONFLICT', `v${target.version} is already live`)
  if (!target.live_at || !target.image_ref) throw new AppError('CONFLICT', `v${target.version} was never live, so it cannot be restored`)
  await assertNoActiveDeploy(admin, target.project_id, environment)

  const { data: current, error: curErr } = await admin
    .from('deployments').select('id, version').eq('project_id', target.project_id).eq('environment', environment).eq('status', 'live').maybeSingle()
  if (curErr) throw fromPostgrest(curErr, 'Could not load the live deployment')

  const version = await nextVersion(admin, target.project_id, environment)
  const { data: row, error: insErr } = await admin
    .from('deployments')
    .insert({
      project_id: target.project_id, environment, version, status: 'releasing', source: 'rollback',
      commit_sha: target.commit_sha, image_ref: target.image_ref, url: target.url ?? environmentUrl(project, environment),
      rolled_back_from: (current?.id as string | undefined) ?? null, created_by: userId,
    })
    .select('id')
    .single()
  if (insErr) {
    if (insErr.code === '23505') throw new AppError('CONFLICT', 'Another deployment just started for this environment — try again in a moment', { reason: 'DEPLOY_RUNNING' })
    throw fromPostgrest(insErr, 'Could not start the rollback')
  }
  const id = row.id as string
  const ev = new EventWriter(admin, id)
  const url = target.url ?? environmentUrl(project, environment)
  try {
    ev.add('status', 'releasing')
    ev.add('log', `Rolling back ${environment}${current ? ` from v${current.version}` : ''} to the image of v${target.version}`)
    ev.add('log', `Re-pointing machines to ${target.image_ref} (no rebuild needed)`)
    ev.add('status', 'health')
    for (let i = 1; i <= 3; i++) ev.add('log', `Health check ${i}/3: GET /health → 200 (runtime) · GET / → 200 (web)`)
    await ev.flush()
    await promote(admin, target.project_id, environment, id, 'rolled_back', { url })
    await markProjectLive(admin, project, environment, url)
    ev.add('status', 'live')
    ev.add('log', `v${version} (restored v${target.version}) is live at ${url}`)
    await ev.flush()
  } catch (err) {
    ev.add('status', 'failed')
    ev.add('log', 'Rollback failed — the current version stays live')
    await ev.flush().catch(() => undefined)
    await admin.from('deployments').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', id).neq('status', 'live')
    throw err
  }
  await audit(admin, workspace.id, userId, 'deployment.rollback', { projectId: target.project_id, environment, toVersion: target.version, deploymentId: id }, meta)
  const result = await loadDeploymentForResponse(admin, id)
  return { deploymentId: id, realtimeChannel: `deploy:${id}`, ...result }
}

// -----------------------------------------------------------------------------
// Secrets
// -----------------------------------------------------------------------------

type MaskedSecretRow = { name: string; environment: SecretEnvironment | null; kind: string; last4: string; updated_at: string; updated_by: string | null }

async function profileNames(client: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data } = await client.from('profiles').select('id, full_name').in('id', unique)
  return new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]))
}

export async function listSecrets(supabase: SupabaseClient, userId: string, projectId: string, environment?: SecretEnvironment): Promise<{ items: SecretDto[] }> {
  await getProjectAccess(supabase, projectId, userId, 'secrets:read')
  let rows: MaskedSecretRow[]
  const { data, error } = await supabase.rpc('list_secrets_masked', { p_project_id: projectId })
  if (error) {
    if (!isMissingRelation(error)) throw fromPostgrest(error, 'Could not load secrets')
    // RPC not installed — read masked columns only with the service role (access already checked).
    const admin = requireAdmin()
    const { data: adminRows, error: adminErr } = await admin
      .from('secrets').select('name, environment, kind, last4, updated_at, updated_by').eq('project_id', projectId).order('name')
    if (adminErr) throw fromPostgrest(adminErr, 'Could not load secrets')
    rows = (adminRows ?? []) as MaskedSecretRow[]
  } else {
    rows = (data ?? []) as MaskedSecretRow[]
  }
  const envRows = rows.filter((r) => r.kind === 'env' && r.environment && (!environment || r.environment === environment))
  const names = await profileNames(supabase, envRows.map((r) => r.updated_by).filter((x): x is string => !!x))
  return {
    items: envRows.map((r) => ({
      name: r.name,
      environment: r.environment as SecretEnvironment,
      last4: r.last4.trim(),
      updatedAt: r.updated_at,
      updatedBy: r.updated_by ? { id: r.updated_by, name: names.get(r.updated_by) ?? null } : null,
    })),
  }
}

export async function upsertSecret(supabase: SupabaseClient, userId: string, projectId: string, input: z.infer<typeof UpsertSecretBody>, meta: RequestMeta) {
  const { project } = await getProjectAccess(supabase, projectId, userId, 'secrets:write')
  const key = loadEncryptionKey()
  const admin = requireAdmin()
  const payload = {
    ciphertext: toByteaHex(encryptSecret(input.value, key, secretAad(projectId, input.environment, input.name))),
    key_id: keyId(key),
    last4: secretLast4(input.value),
    updated_by: userId,
  }
  const existing = await admin
    .from('secrets').select('id').eq('project_id', projectId).eq('environment', input.environment).eq('kind', 'env').eq('name', input.name).maybeSingle()
  if (existing.error) throw fromPostgrest(existing.error, 'Could not save the secret')
  let created = false
  if (existing.data) {
    const { error } = await admin.from('secrets').update(payload).eq('id', existing.data.id)
    if (error) throw fromPostgrest(error, 'Could not save the secret')
  } else {
    const { error } = await admin.from('secrets').insert({
      ...payload, workspace_id: project.workspace_id, project_id: projectId, environment: input.environment, kind: 'env', name: input.name, created_by: userId,
    })
    if (error) throw fromPostgrest(error, 'Could not save the secret')
    created = true
  }
  await audit(admin, project.workspace_id, userId, 'secret.upsert', { projectId, name: input.name, environment: input.environment, created }, meta)
  return { name: input.name, environment: input.environment, last4: payload.last4 }
}

export async function deleteSecret(supabase: SupabaseClient, userId: string, projectId: string, name: string, environment: SecretEnvironment, meta: RequestMeta) {
  const { project } = await getProjectAccess(supabase, projectId, userId, 'secrets:write')
  const admin = requireAdmin()
  const { data, error } = await admin
    .from('secrets').delete().eq('project_id', projectId).eq('environment', environment).eq('kind', 'env').eq('name', name).select('id')
  if (error) throw fromPostgrest(error, 'Could not delete the secret')
  if (!data || data.length === 0) throw new AppError('NOT_FOUND', `${name} is not set for ${environment}`)
  await audit(admin, project.workspace_id, userId, 'secret.delete', { projectId, name, environment }, meta)
  return null
}

// -----------------------------------------------------------------------------
// Custom domains
// -----------------------------------------------------------------------------

type DomainRow = { id: string; project_id: string; hostname: string; environment: string; status: DomainDto['status']; verification_token: string; cert_expires_at: string | null; created_at: string; updated_at: string }
const DOMAIN_COLS = 'id, project_id, hostname, environment, status, verification_token, cert_expires_at, created_at, updated_at'

function toDomainDto(r: DomainRow, project: Pick<ProjectRow, 'name'>): DomainDto {
  const environment: DeployEnvironment = r.environment === 'preview' ? 'preview' : 'production'
  return {
    id: r.id,
    hostname: r.hostname,
    environment,
    status: r.status,
    certExpiresAt: r.cert_expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    dnsRecords: [
      { type: 'CNAME', name: r.hostname, value: environmentHost(project, environment) },
      { type: 'TXT', name: `_architect-verify.${r.hostname}`, value: r.verification_token },
    ],
  }
}

export async function listDomains(supabase: SupabaseClient, userId: string, projectId: string): Promise<{ items: DomainDto[] }> {
  const { project } = await getProjectAccess(supabase, projectId, userId, 'project:read')
  const { data, error } = await supabase.from('domains').select(DOMAIN_COLS).eq('project_id', projectId).order('created_at', { ascending: true })
  if (error) {
    if (isMissingRelation(error)) return { items: [] }
    throw fromPostgrest(error, 'Could not load domains')
  }
  return { items: ((data ?? []) as DomainRow[]).map((r) => toDomainDto(r, project)) }
}

export async function addDomain(supabase: SupabaseClient, userId: string, projectId: string, input: z.infer<typeof AddDomainBody>, meta: RequestMeta) {
  const { project } = await getProjectAccess(supabase, projectId, userId, 'domains:write')
  const admin = requireAdmin()
  const { data, error } = await admin
    .from('domains')
    .insert({ project_id: projectId, hostname: input.hostname, environment: input.environment, verification_token: randomBytes(16).toString('hex') })
    .select(DOMAIN_COLS)
    .single()
  if (error) {
    if (error.code === '23505') throw new AppError('CONFLICT', `${input.hostname} is already connected to a project`)
    if (error.code === '23514') throw new AppError('VALIDATION_FAILED', 'Enter a valid domain you own, like app.example.com', { fieldErrors: { hostname: ['Invalid domain'] } })
    throw fromPostgrest(error, 'Could not add the domain')
  }
  await audit(admin, project.workspace_id, userId, 'domain.add', { projectId, hostname: input.hostname, environment: input.environment }, meta)
  const domain = toDomainDto(data as DomainRow, project)
  return { domain, dnsRecords: domain.dnsRecords }
}

async function loadVisibleDomain(supabase: SupabaseClient, domainId: string): Promise<DomainRow> {
  const { data, error } = await supabase.from('domains').select(DOMAIN_COLS).eq('id', domainId).maybeSingle()
  if (error && !isMissingRelation(error)) throw fromPostgrest(error, 'Could not load the domain')
  if (!data) throw new AppError('NOT_FOUND', 'Domain not found')
  return data as DomainRow
}

export async function verifyDomain(supabase: SupabaseClient, userId: string, domainId: string) {
  const row = await loadVisibleDomain(supabase, domainId)
  const { project } = await getProjectAccess(supabase, row.project_id, userId, 'domains:write')
  if (row.status === 'active') return { domain: toDomainDto(row, project), message: 'Domain is active with a valid certificate' }
  const ageMs = Date.now() - Date.parse(row.created_at)
  if (ageMs < DOMAIN_VERIFY_DELAY_MS) {
    const wait = Math.ceil((DOMAIN_VERIFY_DELAY_MS - ageMs) / 1000)
    return { domain: toDomainDto(row, project), message: `DNS records not found yet — changes can take a few minutes to propagate. Try again in ${wait}s.` }
  }
  const admin = requireAdmin()
  const certExpiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await admin.from('domains').update({ status: 'active', cert_expires_at: certExpiresAt }).eq('id', domainId).select(DOMAIN_COLS).single()
  if (error) throw fromPostgrest(error, 'Could not verify the domain')
  return { domain: toDomainDto(data as DomainRow, project), message: 'DNS verified and SSL certificate issued' }
}

export async function deleteDomain(supabase: SupabaseClient, userId: string, domainId: string, meta: RequestMeta) {
  const row = await loadVisibleDomain(supabase, domainId)
  const { project } = await getProjectAccess(supabase, row.project_id, userId, 'domains:write')
  const admin = requireAdmin()
  const { error } = await admin.from('domains').delete().eq('id', domainId)
  if (error) throw fromPostgrest(error, 'Could not remove the domain')
  await audit(admin, project.workspace_id, userId, 'domain.delete', { projectId: row.project_id, hostname: row.hostname }, meta)
  return null
}

// -----------------------------------------------------------------------------
// Runtime settings
// -----------------------------------------------------------------------------

type SettingsRow = {
  eval_gate_threshold: number | string | null
  block_prod_on_eval_fail: boolean
  region: string
  min_instances: number
  max_instances: number
  timeout_s: number
  cron_triggers: unknown
  updated_at: string
}
const SETTINGS_COLS = 'eval_gate_threshold, block_prod_on_eval_fail, region, min_instances, max_instances, timeout_s, cron_triggers, updated_at'

function toSettingsDto(r: SettingsRow | null, plan: PlanTier): RuntimeSettingsDto {
  const region = REGIONS.includes((r?.region ?? 'iad') as (typeof REGIONS)[number]) ? (r?.region as (typeof REGIONS)[number] | undefined) ?? 'iad' : 'iad'
  const cron = z.array(CronTrigger).safeParse(r?.cron_triggers ?? [])
  return {
    evalGateThreshold: r?.eval_gate_threshold == null ? null : Number(r.eval_gate_threshold),
    blockProdOnEvalFail: r?.block_prod_on_eval_fail ?? false,
    region,
    minInstances: r?.min_instances ?? 0,
    maxInstances: r?.max_instances ?? 3,
    timeoutS: r?.timeout_s ?? 60,
    cronTriggers: cron.success ? cron.data : [],
    maxInstancesCap: MAX_INSTANCES_CAP[plan],
    updatedAt: r?.updated_at ?? null,
  }
}

export async function getSettings(supabase: SupabaseClient, userId: string, projectId: string): Promise<{ settings: RuntimeSettingsDto }> {
  const { workspace } = await getProjectAccess(supabase, projectId, userId, 'project:read')
  const { data, error } = await supabase.from('project_settings').select(SETTINGS_COLS).eq('project_id', projectId).maybeSingle()
  if (error && !isMissingRelation(error)) throw fromPostgrest(error, 'Could not load settings')
  return { settings: toSettingsDto((data as SettingsRow | null) ?? null, workspace.plan) }
}

export async function updateSettings(supabase: SupabaseClient, userId: string, projectId: string, input: UpdateSettingsInput, meta: RequestMeta): Promise<{ settings: RuntimeSettingsDto }> {
  const { workspace } = await getProjectAccess(supabase, projectId, userId, 'settings:runtime')
  const admin = requireAdmin()
  const { data: currentRow, error: curErr } = await admin.from('project_settings').select(SETTINGS_COLS).eq('project_id', projectId).maybeSingle()
  if (curErr) {
    if (isMissingRelation(curErr)) throw new AppError('PRECONDITION_FAILED', 'The project_settings table is missing — apply docs/specs/supabase-schema.sql')
    throw fromPostgrest(curErr, 'Could not load settings')
  }
  const current = toSettingsDto((currentRow as SettingsRow | null) ?? null, workspace.plan)
  const next = {
    evalGateThreshold: input.evalGateThreshold !== undefined ? input.evalGateThreshold : current.evalGateThreshold,
    blockProdOnEvalFail: input.blockProdOnEvalFail ?? current.blockProdOnEvalFail,
    region: input.region ?? current.region,
    minInstances: input.minInstances ?? current.minInstances,
    maxInstances: input.maxInstances ?? current.maxInstances,
    timeoutS: input.timeoutS ?? current.timeoutS,
    cronTriggers: input.cronTriggers ?? current.cronTriggers,
  }
  const cap = MAX_INSTANCES_CAP[workspace.plan]
  if (next.maxInstances > cap) throw new AppError('PLAN_LIMIT', `Your plan allows up to ${cap} instances — upgrade for more`, { fieldErrors: { maxInstances: [`Max ${cap} on your plan`] } })
  if (next.minInstances > next.maxInstances) throw new AppError('VALIDATION_FAILED', 'Minimum instances cannot exceed maximum instances', { fieldErrors: { minInstances: ['Must be ≤ max instances'] } })

  const { data, error } = await admin
    .from('project_settings')
    .upsert({
      project_id: projectId,
      eval_gate_threshold: next.evalGateThreshold,
      block_prod_on_eval_fail: next.blockProdOnEvalFail,
      region: next.region,
      min_instances: next.minInstances,
      max_instances: next.maxInstances,
      timeout_s: next.timeoutS,
      cron_triggers: next.cronTriggers,
    }, { onConflict: 'project_id' })
    .select(SETTINGS_COLS)
    .single()
  if (error) throw fromPostgrest(error, 'Could not save settings')
  await audit(admin, workspace.id, userId, 'settings.runtime', { projectId, changed: Object.keys(input) }, meta)
  return { settings: toSettingsDto(data as SettingsRow, workspace.plan) }
}
