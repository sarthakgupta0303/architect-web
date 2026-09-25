import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNext } from '@/lib/utils'

/** OAuth / magic-link / recovery callback: exchanges the code for a session cookie. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))
  const providerError = url.searchParams.get('error_description')
  if (providerError || !code) {
    return NextResponse.redirect(new URL(`/login?error=oauth`, url.origin))
  }
  const supabase = createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL(`/login?error=oauth`, url.origin))
  return NextResponse.redirect(new URL(next, url.origin))
}
