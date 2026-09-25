import 'server-only'

type Result = { ok: boolean; remaining: number; resetSeconds: number }

const WINDOW_SECONDS = 60
const memory = new Map<string, { count: number; resetAt: number }>()

/**
 * Fixed-window rate limiter. Uses Upstash Redis REST when configured (shared across
 * instances); otherwise falls back to per-instance memory (local development).
 */
export async function rateLimit(key: string, limit: number): Promise<Result> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / WINDOW_SECONDS)}`

  if (url && token) {
    try {
      const res = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([['INCR', bucket], ['EXPIRE', bucket, String(WINDOW_SECONDS)]]),
        cache: 'no-store',
      })
      if (res.ok) {
        const data = (await res.json()) as { result: number }[]
        const count = Number(data[0]?.result ?? 0)
        return { ok: count <= limit, remaining: Math.max(0, limit - count), resetSeconds: secondsToWindowEnd() }
      }
    } catch {
      // Fall through to memory limiter if Redis is unreachable.
    }
  }

  const now = Date.now()
  const entry = memory.get(bucket)
  if (!entry || entry.resetAt < now) {
    memory.set(bucket, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 })
    if (memory.size > 10_000) {
      memory.forEach((v, k) => { if (v.resetAt < now) memory.delete(k) })
    }
    return { ok: true, remaining: limit - 1, resetSeconds: WINDOW_SECONDS }
  }
  entry.count += 1
  return { ok: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetSeconds: Math.ceil((entry.resetAt - now) / 1000) }
}

function secondsToWindowEnd() {
  const s = Math.floor(Date.now() / 1000)
  return WINDOW_SECONDS - (s % WINDOW_SECONDS)
}
