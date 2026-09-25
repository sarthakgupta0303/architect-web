import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './env'

let admin: SupabaseClient | null | undefined

/**
 * Service-role client. The ONLY place SUPABASE_SERVICE_ROLE_KEY is read.
 * Bypasses RLS — use only for: rate-limit counters, assistant chat rows, webhooks,
 * and lookups that must happen before a membership exists. Returns null when the key
 * is not configured so callers can degrade safely (never fall back to broader access).
 */
export function createAdminClient(): SupabaseClient | null {
  if (admin !== undefined) return admin
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  admin = SUPABASE_URL && key ? createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
  return admin
}
