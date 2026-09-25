import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { UpdateSettingsBody, getSettings, requestMeta, updateSettings } from '@/lib/core/services/deploy-service'

const Params = z.object({ id: z.string().uuid() })

/** Runtime settings (project:read) — defaults when no row exists yet. */
export const GET = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => getSettings(supabase, user.id, params.id),
})

/** Update runtime settings (settings:runtime) → { settings }. */
export const PATCH = createHandler({
  params: Params, body: UpdateSettingsBody,
  handler: ({ req, supabase, user, params, body }) => updateSettings(supabase, user.id, params.id, body, requestMeta(req)),
})
