import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Server-side sign-out: revokes the refresh token and clears session cookies. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (origin && new URL(origin).host !== (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Cross-origin request blocked' } }, { status: 403 })
  }
  const supabase = createClient()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
