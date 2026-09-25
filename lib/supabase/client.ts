import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from './env'

let browserClient: SupabaseClient | null = null

/** Browser Supabase client (singleton). Used for auth calls and Realtime only — data writes go through /api. */
export function createClient(): SupabaseClient {
  if (browserClient) return browserClient
  assertSupabaseEnv()
  browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return browserClient
}
