import { z } from 'zod'
import { createHandler } from '@/lib/api/handler'
import { listMessages, sendMessage } from '@/lib/core/services/chat-service'
import { LIMITS } from '@/lib/security/tokenLimiter'

const Params = z.object({ id: z.string().uuid() })

export const GET = createHandler({
  params: Params,
  handler: ({ supabase, user, params }) => listMessages(supabase, user.id, params.id),
})

export const POST = createHandler({
  params: Params,
  body: z.object({ content: z.string().trim().min(1, 'Type a message').max(LIMITS.MAX_MESSAGE_LENGTH, `Messages can be at most ${LIMITS.MAX_MESSAGE_LENGTH} characters`), mode: z.enum(['plan', 'build']).default('build') }),
  rate: 'chat',
  status: 201,
  handler: ({ supabase, user, params, body }) => sendMessage(supabase, user.id, params.id, body.content, body.mode),
})
