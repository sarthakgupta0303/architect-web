import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

/** Refreshes the Supabase session cookie and returns the response plus the current user id. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { response, userId: null as string | null }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  return { response, userId: data.user?.id ?? null }
}
