import type { ErrorCode, ErrorEnvelope } from '@/lib/contracts/common'

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>
  constructor(code: ErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
  fieldErrors(): Record<string, string[]> {
    return (this.details?.fieldErrors as Record<string, string[]> | undefined) ?? {}
  }
}

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal }

/** Typed fetch for /api routes; throws ApiError with the envelope's code and message. */
export async function apiFetch<T>(path: string, opts: Options = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError('INTERNAL', 'Network error — check your connection and try again', 0)
  }
  if (res.status === 204) return undefined as T
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const env = data as ErrorEnvelope | null
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.assign(`/login?next=${next}`)
    }
    throw new ApiError(env?.error?.code ?? 'INTERNAL', env?.error?.message ?? 'Something went wrong', res.status, env?.error?.details)
  }
  return data as T
}
