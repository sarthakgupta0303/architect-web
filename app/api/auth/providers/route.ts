import { NextResponse } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/env'

export const dynamic = 'force-dynamic'

type Settings = { external?: Record<string, boolean> }
let cache: { at: number; value: { github: boolean } } | null = null

/** Which OAuth providers are enabled in the Supabase project (cached 60 s). Public, no secrets. */
export async function GET() {
  if (cache && Date.now() - cache.at < 60_000) return NextResponse.json(cache.value)
  let value = { github: false }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY }, cache: 'no-store', signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const s = (await res.json()) as Settings
      value = { github: !!s.external?.github }
    }
  } catch {
    value = { github: false }
  }
  cache = { at: Date.now(), value }
  return NextResponse.json(value, { headers: { 'Cache-Control': 'public, max-age=60' } })
}
