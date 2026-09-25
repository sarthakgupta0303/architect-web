import { NextResponse, type NextRequest } from 'next/server'
import { LoginSchema } from '@/lib/contracts/auth'
import { errorResponse, zodToAppError } from '@/lib/api/handler'
import { AppError } from '@/lib/api/errors'
import { anonymousSubject, checkRateLimit } from '@/lib/security/rateLimiter'
import { createClient } from '@/lib/supabase/server'

/**
 * Server-side password sign-in so session cookies are set by the server (HttpOnly).
 * Rate limited per IP + email (10/min). Error messages never reveal whether an account exists.
 */
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()
  try {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))) {
      throw new AppError('FORBIDDEN', 'Cross-origin request blocked')
    }
    const body = await req.json().catch(() => null)
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) throw zodToAppError(parsed.error)

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || req.ip || 'unknown'
    const rl = await checkRateLimit('auth', { key: anonymousSubject(ip, parsed.data.email) })
    if (!rl.ok) {
      const res = errorResponse(new AppError('RATE_LIMITED', `Too many sign-in attempts — try again in ${rl.retryAfterSeconds}s`), requestId)
      res.headers.set('Retry-After', String(rl.retryAfterSeconds))
      return res
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) {
      if (/not confirmed/i.test(error.message)) {
        await supabase.auth.resend({ type: 'signup', email: parsed.data.email })
        return NextResponse.json({ error: { code: 'PRECONDITION_FAILED', message: 'Verify your email first — we sent a new code.', details: { verify: true }, requestId } }, { status: 412 })
      }
      throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect')
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e, requestId)
  }
}
