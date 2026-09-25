import 'server-only'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from './env'

/** Server Supabase client for RSC and route handlers. RLS applies as the signed-in user. */
export function createClient(): SupabaseClient {
  assertSupabaseEnv()
  const cookieStore = cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Components cannot set cookies; middleware refreshes the session instead.
        }
      },
    },
  })
}
