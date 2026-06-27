import type { RedisSeam, WaitlistCountRepo } from '#root/server/routes/waitlist.js'
import { createWaitlistRoutes } from '#root/server/routes/waitlist.js'
import { describe, expect, it, vi } from 'vitest'

/** Minimal in-memory ioredis stand-in covering get/set(EX)/incr/expire. */
function makeFakeRedis() {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _mode: 'EX', _ttl: number) => {
      store.set(key, value)
      return 'OK'
    }),
    incr: vi.fn(async (key: string) => {
      const next = Number(store.get(key) ?? '0') + 1
      store.set(key, String(next))
      return next
    }),
    expire: vi.fn(async (_key: string, _ttl: number) => 1),
  } satisfies RedisSeam & { store: Map<string, string> }
}

function makeRepo(count: number): WaitlistCountRepo {
  return { getCount: vi.fn(async () => count) }
}

function get(app: ReturnType<typeof createWaitlistRoutes>, ip = '1.2.3.4') {
  return app.request('/count', { headers: { 'x-forwarded-for': ip } })
}

describe('gET /api/waitlist/count', () => {
  it('serves the cached payload without hitting the database', async () => {
    const redis = makeFakeRedis()
    redis.store.set('waitlist:count', JSON.stringify({ count: 1247, lastUpdated: '2026-06-01T00:00:00.000Z' }))
    const repo = makeRepo(9999)
    const app = createWaitlistRoutes({ repo, redis })

    const res = await get(app)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 1247, lastUpdated: '2026-06-01T00:00:00.000Z' })
    expect(repo.getCount).not.toHaveBeenCalled()
  })

  it('on a cache miss queries the count, returns {count,lastUpdated}, and caches it for 5 minutes', async () => {
    const redis = makeFakeRedis()
    const repo = makeRepo(42)
    const app = createWaitlistRoutes({ repo, redis })

    const res = await get(app)

    expect(res.status).toBe(200)
    const body = await res.json() as { count: number, lastUpdated: string }
    expect(body.count).toBe(42)
    expect(typeof body.lastUpdated).toBe('string')
    expect(Number.isNaN(Date.parse(body.lastUpdated))).toBe(false)
    expect(repo.getCount).toHaveBeenCalledTimes(1)
    // Cached under waitlist:count with a 300s TTL.
    expect(redis.set).toHaveBeenCalledWith('waitlist:count', JSON.stringify(body), 'EX', 300)
  })

  it('rate-limits a single IP to 60 requests per minute, then returns 429', async () => {
    const redis = makeFakeRedis()
    const app = createWaitlistRoutes({ repo: makeRepo(1), redis })

    const statuses: number[] = []
    for (let i = 0; i < 61; i++)
      statuses.push((await get(app, '9.9.9.9')).status)

    expect(statuses.slice(0, 60).every(s => s === 200)).toBe(true)
    expect(statuses[60]).toBe(429)
    // A 60s expiry is armed on the first hit of the window.
    expect(redis.expire).toHaveBeenCalledWith('rate:api:waitlist-count:9.9.9.9', 60)
  })

  it('counts rate-limit buckets per IP independently', async () => {
    const redis = makeFakeRedis()
    const app = createWaitlistRoutes({ repo: makeRepo(1), redis })

    for (let i = 0; i < 60; i++)
      await get(app, '1.1.1.1')

    // A different IP is unaffected by the first IP's exhausted budget.
    expect((await get(app, '2.2.2.2')).status).toBe(200)
  })
})
