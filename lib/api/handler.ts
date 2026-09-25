import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { ZodError, type ZodType } from 'zod'
import type { ErrorEnvelope } from '@/lib/contracts/common'
import { createClient } from '@/lib/supabase/server'
import { AppError } from './errors'
import { checkRateLimit, type RateAction } from '@/lib/security/rateLimiter'

export type RateTier = RateAction

export type HandlerContext<TBody, TQuery, TParams> = {
  req: NextRequest
  user: User
  supabase: SupabaseClient
  body: TBody
  query: TQuery
  params: TParams
  requestId: string
}

type Options<TBody, TQuery, TParams> = {
  body?: ZodType<TBody, any, any>
  query?: ZodType<TQuery, any, any>
  params?: ZodType<TParams, any, any>
  rate?: RateTier
  handler: (ctx: HandlerContext<TBody, TQuery, TParams>) => Promise<Response | unknown>
  status?: number
}

const MAX_BODY_BYTES = 1_000_000

/**
 * Request pipeline (docs/specs/api-conventions.md §2):
 * requestId → auth → CSRF origin check → rate limit → validation → handler → error mapper.
 * Authorization is performed inside handlers via services (they know the resource).
 */
export function createHandler<TBody = undefined, TQuery = undefined, TParams = undefined>(opts: Options<TBody, TQuery, TParams>) {
  return async (req: NextRequest, route: { params?: Record<string, string> } = {}) => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req)

      const supabase = createClient()
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) throw new AppError('UNAUTHENTICATED', 'Please sign in')
      const user = data.user

      const tier: RateTier = opts.rate ?? (req.method === 'GET' ? 'read' : 'write')
      const rl = await checkRateLimit(tier, { userId: user.id })
      if (!rl.ok) {
        const res = errorResponse(new AppError('RATE_LIMITED', `Too many requests — try again in ${rl.retryAfterSeconds}s`, { retryAfterSeconds: rl.retryAfterSeconds }), requestId)
        res.headers.set('Retry-After', String(rl.retryAfterSeconds))
        return res
      }

      const params = opts.params ? parseOrThrow(opts.params, route.params ?? {}) : (undefined as TParams)
      const query = opts.query ? parseOrThrow(opts.query, Object.fromEntries(req.nextUrl.searchParams)) : (undefined as TQuery)
      let body = undefined as TBody
      if (opts.body) {
        const text = await req.text()
        if (text.length > MAX_BODY_BYTES) throw new AppError('TOO_LARGE', 'Request body is too large')
        let json: unknown
        try {
          json = text ? JSON.parse(text) : {}
        } catch {
          throw new AppError('VALIDATION_FAILED', 'Body must be valid JSON')
        }
        body = parseOrThrow(opts.body, json)
      }

      const result = await opts.handler({ req, user, supabase, body, query, params, requestId })
      if (result instanceof Response) {
        result.headers.set('x-request-id', requestId)
        return result
      }
      if (result === undefined || result === null) return new NextResponse(null, { status: 204, headers: { 'x-request-id': requestId } })
      return NextResponse.json(result, { status: opts.status ?? 200, headers: { 'x-request-id': requestId } })
    } catch (err) {
      return errorResponse(err, requestId)
    }
  }
}

function parseOrThrow<T>(schema: ZodType<T, any, any>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw zodToAppError(parsed.error)
  return parsed.data
}

export function zodToAppError(error: ZodError): AppError {
  const flat = error.flatten()
  const first = error.issues[0]
  return new AppError('VALIDATION_FAILED', first?.message ?? 'Some values are invalid', {
    fieldErrors: flat.fieldErrors,
    formErrors: flat.formErrors,
  })
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!origin) return // non-browser clients (CLI) authenticate with bearer tokens / cookies are SameSite=Lax
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  try {
    if (new URL(origin).host !== host) throw new AppError('FORBIDDEN', 'Cross-origin request blocked')
  } catch (e) {
    if (e instanceof AppError) throw e
    throw new AppError('FORBIDDEN', 'Cross-origin request blocked')
  }
}

export function errorResponse(err: unknown, requestId: string) {
  const appErr = err instanceof AppError ? err : err instanceof ZodError ? zodToAppError(err) : null
  if (!appErr) console.error(`[api] ${requestId}`, err)
  const e = appErr ?? new AppError('INTERNAL', 'Something went wrong — please try again')
  const body: ErrorEnvelope = { error: { code: e.code, message: e.message, details: e.details, requestId } }
  return NextResponse.json(body, { status: e.status, headers: { 'x-request-id': requestId } })
}
