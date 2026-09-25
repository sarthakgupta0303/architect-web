import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Form-post fallback for sign-out (same behaviour as POST /api/auth/logout). */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/', req.nextUrl.origin), { status: 303 })
}
