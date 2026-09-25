import { NextResponse, type NextRequest } from 'next/server'
import { SignupSchema } from '@/lib/contracts/auth'
import { errorResponse, zodToAppError } from '@/lib/api/handler'
import { AppError } from '@/lib/api/errors'
import { anonymousSubject, checkRateLimit } from '@/lib/security/rateLimiter'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Server-side sign-up.
 * - Default (AUTH_EMAIL_CONFIRMATION != 'required' and a service key is configured): the account is created
 *   already confirmed and the user is signed in immediately. This avoids Supabase's built-in email sender,
 *   which only delivers to project team members and is limited to a few emails per hour.
 * - AUTH_EMAIL_CONFIRMATION=required (or no service key): standard Supabase sign-up that emails a confirmation code.
 * Rate limited per IP + email. Duplicate accounts return a generic message.
 */
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()
  try {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))) {
      throw new AppError('FORBIDDEN', 'Cross-origin request blocked')
    }
    const body = await req.json().catch(() => null)
    const parsed = SignupSchema.safeParse(body)
    if (!parsed.success) throw zodToAppError(parsed.error)
    const { email, password, fullName } = parsed.data
    const next = typeof body?.next === 'string' && body.next.startsWith('/') && !body.next.startsWith('//') ? body.next : '/app'

    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || req.ip || 'unknown'
    const rl = await checkRateLimit('auth', { key: anonymousSubject(ip, email) })
    if (!rl.ok) {
      const res = errorResponse(new AppError('RATE_LIMITED', `Too many attempts — try again in ${rl.retryAfterSeconds}s`), requestId)
      res.headers.set('Retry-After', String(rl.retryAfterSeconds))
      return res
    }

    const supabase = createClient()
    const admin = createAdminClient()
    const requireConfirmation = process.env.AUTH_EMAIL_CONFIRMATION === 'required' || !admin

    if (!requireConfirmation && admin) {
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
      if (!error) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw new AppError('UPSTREAM_ERROR', 'Account created — please log in')
        return NextResponse.json({ status: 'signed_in', next })
      }
      if (/already|exists|registered/i.test(error.message)) {
        throw new AppError('CONFLICT', 'An account with this email already exists — log in instead', { fieldErrors: { email: ['Already registered'] } })
      }
      // Misconfigured service key (e.g. "Invalid API key"): fall back to the standard sign-up below
      // so new users are never blocked by a server setting.
      console.error('[signup] admin createUser failed, falling back to public sign-up:', error.message)
    }

    const callback = `${req.nextUrl.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: callback } })
    if (error) {
      if (/rate limit/i.test(error.message)) throw new AppError('RATE_LIMITED', 'Supabase’s email limit was reached. Try again later, or add SUPABASE_SERVICE_ROLE_KEY so accounts can be created without email.')
      if (/already|exists|registered/i.test(error.message)) throw new AppError('CONFLICT', 'An account with this email already exists — log in instead', { fieldErrors: { email: ['Already registered'] } })
      throw new AppError('UPSTREAM_ERROR', error.message)
    }
    if (data.user && data.user.identities?.length === 0) {
      throw new AppError('CONFLICT', 'An account with this email already exists — log in instead', { fieldErrors: { email: ['Already registered'] } })
    }
    return NextResponse.json({ status: data.session ? 'signed_in' : 'verify', next })
  } catch (e) {
    return errorResponse(e, requestId)
  }
}
