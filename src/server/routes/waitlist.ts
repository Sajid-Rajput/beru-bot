import type { Env } from '#root/server/environment.js'
import type { Context } from 'hono'
import { redisKeys, WAITLIST_COUNT_RATE_MAX, WAITLIST_COUNT_TTL } from '#root/utils/constants.js'
import { getConnInfo } from '@hono/node-server/conninfo'
import { Hono } from 'hono'

/** The waitlist repository slice this route needs (count is total signups, #14). */
export interface WaitlistCountRepo {
  getCount: () => Promise<number>
}

/** Minimal ioredis surface the route uses — kept narrow for testability. */
export interface RedisSeam {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, mode: 'EX', ttlSeconds: number) => Promise<unknown>
  incr: (key: string) => Promise<number>
  expire: (key: string, ttlSeconds: number) => Promise<unknown>
}

export interface WaitlistRoutesDeps {
  repo: WaitlistCountRepo
  redis: RedisSeam
}

interface CountPayload {
  count: number
  lastUpdated: string
}

/**
 * Client IP for rate limiting. Behind Caddy the real client address arrives in
 * `X-Forwarded-For` (left-most entry); Caddy strips spoofed values by default.
 * Only when that header is absent do we fall back to the raw socket address
 * (lazily — `getConnInfo` needs a live node-server request).
 */
function clientIp(c: Context<Env>): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded)
    return forwarded
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  }
  catch {
    return 'unknown'
  }
}

/**
 * Public waitlist endpoints (issue #14 / strategy §7.8). Mounted at
 * `/api/waitlist`, so the count route is `GET /api/waitlist/count`.
 *
 * The repo + redis are injected so the route is unit-testable with fakes and so
 * production wiring keeps owning the singletons (createServer).
 */
export function createWaitlistRoutes({ repo, redis }: WaitlistRoutesDeps) {
  const app = new Hono<Env>()

  app.get('/count', async (c) => {
    // Per-IP rate limit: WAITLIST_COUNT_RATE_MAX requests / 60s sliding window.
    const rateKey = redisKeys.apiRate('waitlist-count', clientIp(c))
    const hits = await redis.incr(rateKey)
    if (hits === 1)
      await redis.expire(rateKey, 60)
    if (hits > WAITLIST_COUNT_RATE_MAX)
      return c.json({ error: 'Too many requests' }, 429)

    // Serve from the 5-minute Redis cache when warm.
    const cached = await redis.get(redisKeys.waitlistCount())
    if (cached)
      return c.json(JSON.parse(cached) as CountPayload)

    const payload: CountPayload = {
      count: await repo.getCount(),
      lastUpdated: new Date().toISOString(),
    }
    await redis.set(redisKeys.waitlistCount(), JSON.stringify(payload), 'EX', WAITLIST_COUNT_TTL)
    return c.json(payload)
  })

  return app
}
