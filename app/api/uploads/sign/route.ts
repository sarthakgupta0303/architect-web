import { randomUUID } from 'node:crypto'
import { createHandler } from '@/lib/api/handler'
import { AppError, fromPostgrest } from '@/lib/api/errors'
import { getProjectAccess, getWorkspaceAccess } from '@/lib/core/access'
import { UploadRequestSchema, validateFileUpload } from '@/lib/security/inputValidator'

/**
 * Issues a signed upload URL for a PRIVATE bucket after validating extension, MIME type and size.
 * Paths are server-generated (never user-controlled) and scoped by project/workspace so storage
 * RLS policies apply. Download URLs are signed for 1 hour via GET /api/uploads/sign?path=.
 */
export const POST = createHandler({
  body: UploadRequestSchema,
  rate: 'upload',
  status: 201,
  handler: async ({ supabase, user, body }) => {
    const check = validateFileUpload({ name: body.filename, type: body.contentType, size: body.size }, body.kind)
    if (!check.ok) throw new AppError(check.code === 'TOO_LARGE' ? 'TOO_LARGE' : 'VALIDATION_FAILED', check.message, { reason: check.code })

    let bucket: string
    let path: string
    if (body.kind === 'attachment') {
      await getProjectAccess(supabase, body.projectId!, user.id, 'prompt:write')
      bucket = 'project-attachments'
      path = `${body.projectId}/${randomUUID()}.${check.extension}`
    } else {
      const { workspace } = await getWorkspaceAccess(supabase, body.workspaceId!, user.id, 'project:create')
      bucket = 'imports'
      path = `${workspace.id}/${randomUUID()}.zip`
    }
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)
    if (error || !data) throw fromPostgrest({ message: error?.message }, 'Could not prepare the upload')
    return { bucket, path, token: data.token, signedUrl: data.signedUrl }
  },
})
