import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type AuthResult = { ok: true; user: User; supabase: SupabaseClient } | { ok: false; response: NextResponse }

/**
 * Verifies the Supabase session server-side (getUser() validates the JWT with Supabase —
 * never trust getSession() alone on the server). Returns the user or a 401 response.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } }, { status: 401 }) }
  }
  return { ok: true, user: data.user, supabase }
}
