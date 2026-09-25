import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import type { OnboardingInput } from '@/lib/contracts/onboarding'
import type { WorkspaceRow } from '@/lib/db/types'

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function completeOnboarding(supabase: SupabaseClient, userId: string, input: OnboardingInput) {
  const { data, error } = await supabase.rpc('complete_onboarding', {
    p_default_mode: input.defaultMode,
    p_use_case: input.useCase,
    p_workspace_name: input.workspaceName,
    p_preferred_framework: input.preferredFramework,
    p_preferred_language: input.preferredLanguage,
  })
  if (error) throw fromPostgrest(error, 'Could not finish onboarding')
  const workspace = data as WorkspaceRow
  if (!workspace?.id) throw new AppError('INTERNAL', 'Could not create workspace')

  if (input.isDeveloper && input.defaultMode === 'build') {
    await supabase.from('workspace_members').update({ is_developer: true }).eq('workspace_id', workspace.id).eq('user_id', userId)
  }

  if (input.invites.length) {
    const rows = input.invites.map((inv) => ({
      workspace_id: workspace.id,
      email: inv.email,
      role: inv.role,
      invited_by: userId,
      token_hash: hashToken(randomBytes(32).toString('base64url')),
    }))
    const { error: invErr } = await supabase.from('invitations').insert(rows)
    if (invErr) console.error('[onboarding] invitations', invErr.message)
  }

  return { workspaceId: workspace.id, workspaceSlug: workspace.slug }
}

export async function acceptInvitation(supabase: SupabaseClient, token: string) {
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
  if (error) throw fromPostgrest(error, 'Could not accept invitation')
  const ws = data as WorkspaceRow
  return { workspaceSlug: ws.slug }
}
