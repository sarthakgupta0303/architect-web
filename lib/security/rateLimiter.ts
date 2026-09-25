import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Sliding-window rate limiting backed by Supabase (`rate_limit_events`, service role only).
 * Users cannot read or change their own counters (no RLS policies on the table).
 * When SUPABASE_SERVICE_ROLE_KEY is absent (local development) a per-process memory
 * window is used instead and a warning is logged once.
 */
export type RateAction = 'auth' | 'chat' | 'generation' | 'processing' | 'upload' | 'write' | 'read'

export const RATE_LIMITS: Record<RateAction, { limit: number; windowSeconds: number }> = {
  auth: { limit: 10, windowSeconds: 60 },
  chat: { limit: 30, windowSeconds: 60 },
  generation: { limit: 30, windowSeconds: 60 },
  processing: { limit: 10, windowSeconds: 3600 },
  upload: { limit: 20, windowSeconds: 86400 },
  write: { limit: 120, windowSeconds: 60 },
  read: { limit: 600, windowSeconds: 60 },
}

export type RateResult = { ok: boolean; remaining: number; retryAfterSeconds: number }

const memory = new Map<string, number[]>()
let warned = false

/** Stable, non-reversible key for anonymous subjects (e.g. IP + email on login). */
export function anonymousSubject(...parts: string[]): string {
  return `anon:${createHash('sha256').update(parts.join('|').toLowerCase()).digest('hex').slice(0, 32)}`
}

export async function checkRateLimit(action: RateAction, subject: { userId?: string | null; key?: string }): Promise<RateResult> {
  const { limit, windowSeconds } = RATE_LIMITS[action]
  const subjectKey = subject.userId ?? subject.key ?? 'unknown'
  const since = new Date(Date.now() - windowSeconds * 1000)
  const admin = createAdminClient()

  if (admin) {
    let q = admin.from('rate_limit_events').select('created_at', { count: 'exact' }).eq('action', action).gte('created_at', since.toISOString()).order('created_at', { ascending: true }).limit(1)
    q = subject.userId ? q.eq('user_id', subject.userId) : q.eq('subject', subjectKey)
    const { count, data, error } = await q
    if (!error) {
      const used = count ?? 0
      if (used >= limit) {
        const oldest = data?.[0]?.created_at ? Date.parse(data[0].created_at) : Date.now()
        return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowSeconds * 1000 - Date.now()) / 1000)) }
      }
      const { error: insErr } = await admin.from('rate_limit_events').insert({ user_id: subject.userId ?? null, subject: subjectKey, action })
      if (!insErr) return { ok: true, remaining: limit - used - 1, retryAfterSeconds: 0 }
    }
    console.error('[rate-limit] Supabase limiter unavailable, using memory window:', error?.message ?? 'insert failed')
  } else if (!warned) {
    warned = true
    console.warn('[rate-limit] SUPABASE_SERVICE_ROLE_KEY not set — using per-process memory limits (development only).')
  }

  const key = `${action}:${subjectKey}`
  const now = Date.now()
  const hits = (memory.get(key) ?? []).filter((t) => t > now - windowSeconds * 1000)
  if (hits.length >= limit) {
    memory.set(key, hits)
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + windowSeconds * 1000 - now) / 1000)) }
  }
  hits.push(now)
  memory.set(key, hits)
  if (memory.size > 10_000) memory.forEach((v, k) => { if (!v.some((t) => t > now - 86_400_000)) memory.delete(k) })
  return { ok: true, remaining: limit - hits.length, retryAfterSeconds: 0 }
}
