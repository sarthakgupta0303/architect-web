import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** Opens the project in the user's preferred mode for it (profiles.mode_prefs → project default). */
export default async function ProjectIndex({ params }: { params: { ws: string; projectId: string } }) {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  const [{ data: profile }, { data: project }] = await Promise.all([
    supabase.from('profiles').select('mode_prefs').eq('id', auth.user?.id ?? '').maybeSingle(),
    supabase.from('projects').select('mode_default').eq('id', params.projectId).maybeSingle(),
  ])
  const prefs = (profile?.mode_prefs ?? {}) as Record<string, 'build' | 'code'>
  const mode = prefs[params.projectId] ?? project?.mode_default ?? 'build'
  redirect(`/w/${params.ws}/p/${params.projectId}/${mode}`)
}
