import type { ErrorCode } from '@/lib/contracts/common'

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, EXPIRED: 410, PRECONDITION_FAILED: 412,
  LOCKED: 423, VALIDATION_FAILED: 422, INSUFFICIENT_CREDITS: 402, PLAN_LIMIT: 402, TOO_LARGE: 413,
  RATE_LIMITED: 429, UPSTREAM_ERROR: 502, SANDBOX_UNAVAILABLE: 503, PROMPT_INJECTION: 400, INTERNAL: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS[code]
    this.details = details
  }
}

type PgLikeError = { code?: string; message?: string; details?: string | null; hint?: string | null }

const RPC_WORDS: Partial<Record<string, ErrorCode>> = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  EXPIRED: 'EXPIRED',
  ALREADY_ONBOARDED: 'CONFLICT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
}

/** Maps a Postgres / PostgREST error to an AppError (docs/specs/api-conventions.md §3). */
export function fromPostgrest(err: PgLikeError, fallbackMessage = 'Something went wrong'): AppError {
  const message = err.message ?? fallbackMessage
  const word = message.split(/[:\s]/)[0]?.toUpperCase() ?? ''
  const rpc = RPC_WORDS[word]
  if (rpc) {
    const human = message.includes(':') ? message.slice(message.indexOf(':') + 1).trim() : humanize(word)
    return new AppError(rpc, human)
  }
  switch (err.code) {
    case '23505': return new AppError('CONFLICT', 'That already exists')
    case '23503':
    case '23514':
    case '22023':
    case '22P02': return new AppError('VALIDATION_FAILED', 'Some values are invalid')
    case '42501': return new AppError('FORBIDDEN', 'You do not have access to do that')
    case 'P0002':
    case 'PGRST116': return new AppError('NOT_FOUND', 'Not found')
    case '28000': return new AppError('UNAUTHENTICATED', 'Please sign in')
    default: return new AppError('INTERNAL', fallbackMessage)
  }
}

function humanize(word: string): string {
  switch (word) {
    case 'ALREADY_ONBOARDED': return 'You have already completed onboarding'
    case 'EXPIRED': return 'This link has expired'
    case 'NOT_FOUND': return 'Not found'
    case 'FORBIDDEN': return 'You do not have access to do that'
    default: return 'Please sign in'
  }
}
