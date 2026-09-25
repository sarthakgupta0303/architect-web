import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/api/errors'
import { getProjectAccess } from '@/lib/core/access'

/**
 * Chat access checks (Architect adaptation of contract/session ownership):
 *  - the project must exist, not be deleted, and the caller must be a member (else 404 — never 403,
 *    so project ids cannot be probed);
 *  - posting requires editor rights (viewers can read the conversation only);
 *  - archived projects are read-only.
 */
export async function verifyProjectChatAccess(supabase: SupabaseClient, projectId: string, userId: string, intent: 'read' | 'write') {
  try {
    const access = await getProjectAccess(supabase, projectId, userId, intent === 'write' ? 'prompt:write' : 'project:read')
    if (intent === 'write' && access.project.status === 'archived') throw new AppError('CONFLICT', 'This project is archived — chat is read-only')
    return access
  } catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      throw new AppError(intent === 'write' ? 'FORBIDDEN' : 'NOT_FOUND', intent === 'write' ? 'You have view-only access to this project' : 'Project not found')
    }
    throw e
  }
}

/** A message belongs to the project and (for edits/deletes) to the caller. */
export async function verifyMessageOwnership(supabase: SupabaseClient, projectId: string, messageId: string, userId: string) {
  const { data, error } = await supabase.from('chat_messages').select('id, author_id, project_id').eq('id', messageId).eq('project_id', projectId).maybeSingle()
  if (error || !data || data.author_id !== userId) throw new AppError('NOT_FOUND', 'Message not found')
  return data
}
