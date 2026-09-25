import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { fromPostgrest } from '@/lib/api/errors'
import { getWorkspaceAccess } from '@/lib/core/access'
import { atLeast } from '@/lib/authz'
import { inviteMember } from '@/lib/core/services/member-service'

export const GET = createHandler({
  params: z.object({ ws: z.string().min(3).max(40) }),
  handler: async ({ supabase, user, params }) => {
    const { workspace, membership } = await getWorkspaceAccess(supabase, params.ws, user.id, 'workspace:read')
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, is_developer, created_at, profiles(full_name, email, avatar_url)')
      .eq('workspace_id', workspace.id)
      .order('created_at')
    if (error) throw fromPostgrest(error)
    let invitations: unknown[] = []
    if (atLeast(membership.role, 'admin')) {
      const inv = await supabase.from('invitations').select('id, email, role, expires_at, accepted_at').eq('workspace_id', workspace.id).is('accepted_at', null).order('created_at', { ascending: false })
      invitations = (inv.data ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expires_at }))
    }
    return {
      items: (data as unknown as { user_id: string; role: string; is_developer: boolean; profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null }[]).map((m) => ({
        userId: m.user_id, role: m.role, isDeveloper: m.is_developer,
        name: m.profiles?.full_name ?? null, email: m.profiles?.email ?? null, avatarUrl: m.profiles?.avatar_url ?? null,
      })),
      invitations,
    }
  },
})

export const POST = createHandler({
  params: z.object({ ws: z.string().min(3).max(40) }),
  body: z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(['viewer', 'editor', 'admin']).default('editor'),
    isDeveloper: z.boolean().default(false),
  }),
  status: 201,
  handler: ({ req, supabase, user, params, body }) => inviteMember(supabase, user.id, params.ws, body, req.nextUrl.origin),
})
