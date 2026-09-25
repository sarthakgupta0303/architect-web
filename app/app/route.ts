import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Home resolver: onboarding → last workspace → first membership. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.redirect(new URL('/login', origin))

  const { data: profile } = await supabase.from('profiles').select('onboarded_at, last_workspace_id').eq('id', auth.user.id).maybeSingle()
  if (!profile?.onboarded_at) return NextResponse.redirect(new URL('/onboarding', origin))

  let slug: string | null = null
  if (profile.last_workspace_id) {
    const { data } = await supabase.from('workspaces').select('slug').eq('id', profile.last_workspace_id).maybeSingle()
    slug = data?.slug ?? null
  }
  if (!slug) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspaces(slug)')
      .eq('user_id', auth.user.id)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    const ws = (data as unknown as { workspaces: { slug: string } | null } | null)?.workspaces
    slug = ws?.slug ?? null
  }
  await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', auth.user.id)
  return NextResponse.redirect(new URL(slug ? `/w/${slug}` : '/onboarding', origin))
}
