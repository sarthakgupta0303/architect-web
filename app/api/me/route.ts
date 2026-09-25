import { createHandler } from '@/lib/api/handler'
import { fromPostgrest } from '@/lib/api/errors'
import { UpdateMeSchema } from '@/lib/contracts/onboarding'

export const GET = createHandler({
  handler: async ({ supabase, user }) => {
    const [profile, memberships] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, avatar_url, default_mode, theme, mode_prefs, onboarded_at').eq('id', user.id).single(),
      supabase.from('workspace_members').select('role, is_developer, workspaces(id, slug, name, plan)').eq('user_id', user.id),
    ])
    if (profile.error) throw fromPostgrest(profile.error)
    if (memberships.error) throw fromPostgrest(memberships.error)
    return {
      user: { id: user.id, email: user.email },
      profile: profile.data,
      workspaces: (memberships.data as unknown as { role: string; is_developer: boolean; workspaces: { id: string; slug: string; name: string; plan: string } }[])
        .filter((m) => m.workspaces)
        .map((m) => ({ ...m.workspaces, role: m.role, isDeveloper: m.is_developer })),
    }
  },
})

export const PATCH = createHandler({
  body: UpdateMeSchema,
  handler: async ({ supabase, user, body }) => {
    const patch: Record<string, unknown> = {}
    if (body.fullName !== undefined) patch.full_name = body.fullName
    if (body.defaultMode !== undefined) patch.default_mode = body.defaultMode
    if (body.theme !== undefined) patch.theme = body.theme
    if (body.modePref) {
      const { data } = await supabase.from('profiles').select('mode_prefs').eq('id', user.id).single()
      patch.mode_prefs = { ...((data?.mode_prefs as Record<string, string>) ?? {}), [body.modePref.projectId]: body.modePref.mode }
    }
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select('id, full_name, default_mode, theme, mode_prefs').single()
    if (error) throw fromPostgrest(error)
    return { profile: data }
  },
})
