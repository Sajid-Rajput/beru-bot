import type { ProjectFeatureConfig, WatchedFeatureCacheDeps } from '../watched-feature-cache.js'

import { describe, expect, it, vi } from 'vitest'

import { WatchedFeatureCache } from '../watched-feature-cache.js'

// ── Test fixtures ────────────────────────────────────────────────────────────

const MINT_A = 'MintAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const MINT_B = 'MintBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function makeConfig(overrides: Partial<ProjectFeatureConfig> = {}): ProjectFeatureConfig {
  return {
    featureId: 'feat-1',
    projectId: 'proj-1',
    userId: 'user-1',
    mint: MINT_A,
    mainWalletPubkey: 'WalletAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    config: {
      minSellPercentage: 10,
      maxSellPercentage: 50,
      targetMarketCapUsd: 100_000,
      minBuyAmountSol: 0.1,
      hysteresisPercentage: 5,
    },
    referralSnapshot: { tier1: null, tier2: null },
    ...overrides,
  }
}

// ── Fakes for the constructor seams ──────────────────────────────────────────

interface FakeRepo {
  setAll: (rows: ProjectFeatureConfig[]) => void
  loader: WatchedFeatureCacheDeps['loader']
  fetchById: WatchedFeatureCacheDeps['fetchById']
}

function makeFakeRepo(initial: ProjectFeatureConfig[] = []): FakeRepo {
  const rows = new Map(initial.map(r => [r.featureId, r]))
  return {
    setAll(next) {
      rows.clear()
      for (const r of next)
        rows.set(r.featureId, r)
    },
    loader: async () => [...rows.values()],
    fetchById: async id => rows.get(id),
  }
}

interface FakePubSub {
  subscribe: WatchedFeatureCacheDeps['subscribe']
  publishWatch: (channel: 'watch:add' | 'watch:remove', payload: { mint: string, featureId: string }) => Promise<void>
  publishReferralChanged: (payload: { userId: string }) => Promise<void>
  subscriberCount: () => number
}

function makeFakePubSub(): FakePubSub {
  const handlers = new Map<string, (m: any) => Promise<void> | void>()
  return {
    subscribe: async (channel, handler) => {
      handlers.set(channel, handler as (m: any) => Promise<void> | void)
      return async () => {
        handlers.delete(channel)
      }
    },
    publishWatch: async (channel, payload) => {
      const handler = handlers.get(channel)
      if (handler)
        await handler(payload)
    },
    publishReferralChanged: async (payload) => {
      const handler = handlers.get('referral:changed')
      if (handler)
        await handler(payload)
    },
    subscriberCount: () => handlers.size,
  }
}

function makeCache(opts: {
  repo: FakeRepo
  pubsub: FakePubSub
  reconcileIntervalMs?: number
}): WatchedFeatureCache {
  return new WatchedFeatureCache({
    loader: opts.repo.loader,
    fetchById: opts.repo.fetchById,
    subscribe: opts.pubsub.subscribe,
    reconcileIntervalMs: opts.reconcileIntervalMs ?? 0,
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('watchedFeatureCache', () => {
  describe('start() boot load', () => {
    it('loads all watched features into the cache', async () => {
      const featA = makeConfig({ featureId: 'feat-a', mint: MINT_A })
      const featB = makeConfig({ featureId: 'feat-b', mint: MINT_B })
      const repo = makeFakeRepo([featA, featB])
      const cache = makeCache({ repo, pubsub: makeFakePubSub() })

      await cache.start()

      expect(cache.has(MINT_A)).toBe(true)
      expect(cache.has(MINT_B)).toBe(true)
      expect(cache.get(MINT_A)).toEqual([featA])
      expect(cache.get(MINT_B)).toEqual([featB])
      expect(cache.getAllMints().sort()).toEqual([MINT_A, MINT_B].sort())
    })

    it('returns undefined for unknown mints and false from has()', async () => {
      const repo = makeFakeRepo([])
      const cache = makeCache({ repo, pubsub: makeFakePubSub() })

      await cache.start()

      expect(cache.get('UnknownMint')).toBeUndefined()
      expect(cache.has('UnknownMint')).toBe(false)
      expect(cache.getAllMints()).toEqual([])
    })
  })

  describe('watch:add', () => {
    it('inserts a feature into the cache when watch:add is published', async () => {
      const newFeat = makeConfig({ featureId: 'feat-new', mint: MINT_A })
      const repo = makeFakeRepo([]) // empty at boot
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      expect(cache.has(MINT_A)).toBe(false)

      // Simulate: handler updates DB, publishes watch:add. Our fetchById
      // returns the new feature, so populate the repo first.
      repo.setAll([newFeat])
      await pubsub.publishWatch('watch:add', { mint: MINT_A, featureId: 'feat-new' })

      expect(cache.has(MINT_A)).toBe(true)
      expect(cache.get(MINT_A)).toEqual([newFeat])
    })

    it('ignores watch:add when fetchById returns undefined (stale event)', async () => {
      const repo = makeFakeRepo([])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      await pubsub.publishWatch('watch:add', { mint: MINT_A, featureId: 'ghost' })

      expect(cache.has(MINT_A)).toBe(false)
    })
  })

  describe('watch:remove', () => {
    it('removes a feature by featureId and drops the mint key when empty', async () => {
      const feat = makeConfig({ featureId: 'feat-x', mint: MINT_A })
      const repo = makeFakeRepo([feat])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      expect(cache.has(MINT_A)).toBe(true)

      await pubsub.publishWatch('watch:remove', { mint: MINT_A, featureId: 'feat-x' })

      expect(cache.has(MINT_A)).toBe(false)
      expect(cache.get(MINT_A)).toBeUndefined()
    })

    it('is a no-op when removing an unknown featureId on a known mint', async () => {
      const feat = makeConfig({ featureId: 'feat-x', mint: MINT_A })
      const repo = makeFakeRepo([feat])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      await pubsub.publishWatch('watch:remove', { mint: MINT_A, featureId: 'ghost' })

      expect(cache.get(MINT_A)).toEqual([feat])
    })
  })

  describe('multi-feature accumulation', () => {
    it('keeps multiple features for the same mint in the array', async () => {
      const featA = makeConfig({ featureId: 'feat-a', userId: 'user-1', mint: MINT_A })
      const featB = makeConfig({ featureId: 'feat-b', userId: 'user-2', mint: MINT_A })
      const repo = makeFakeRepo([featA])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      expect(cache.get(MINT_A)).toEqual([featA])

      repo.setAll([featA, featB])
      await pubsub.publishWatch('watch:add', { mint: MINT_A, featureId: 'feat-b' })

      const entries = cache.get(MINT_A)
      expect(entries).toHaveLength(2)
      expect(entries).toEqual(expect.arrayContaining([featA, featB]))
    })

    it('removes only the specified feature when others share the mint', async () => {
      const featA = makeConfig({ featureId: 'feat-a', userId: 'user-1', mint: MINT_A })
      const featB = makeConfig({ featureId: 'feat-b', userId: 'user-2', mint: MINT_A })
      const repo = makeFakeRepo([featA, featB])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      await pubsub.publishWatch('watch:remove', { mint: MINT_A, featureId: 'feat-a' })

      expect(cache.get(MINT_A)).toEqual([featB])
    })
  })

  describe('reconcile()', () => {
    it('adds features present in the loader but missing from the cache', async () => {
      const seedFeat = makeConfig({ featureId: 'feat-seed', mint: MINT_A })
      const driftFeat = makeConfig({ featureId: 'feat-drift', mint: MINT_B })
      const repo = makeFakeRepo([seedFeat])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      expect(cache.has(MINT_B)).toBe(false)

      // The bot's Start handler updated the DB but the watch:add event was dropped.
      repo.setAll([seedFeat, driftFeat])
      await cache.reconcile()

      expect(cache.has(MINT_B)).toBe(true)
      expect(cache.get(MINT_B)).toEqual([driftFeat])
      expect(cache.get(MINT_A)).toEqual([seedFeat])
    })

    it('removes features present in the cache but no longer in the loader', async () => {
      const featA = makeConfig({ featureId: 'feat-a', mint: MINT_A })
      const featB = makeConfig({ featureId: 'feat-b', mint: MINT_B })
      const repo = makeFakeRepo([featA, featB])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      expect(cache.getAllMints().sort()).toEqual([MINT_A, MINT_B].sort())

      // featB was stopped in the DB but the watch:remove event was dropped.
      repo.setAll([featA])
      await cache.reconcile()

      expect(cache.has(MINT_A)).toBe(true)
      expect(cache.has(MINT_B)).toBe(false)
    })

    it('removes a single orphan feature while keeping siblings on the same mint', async () => {
      const featA = makeConfig({ featureId: 'feat-a', userId: 'user-1', mint: MINT_A })
      const featB = makeConfig({ featureId: 'feat-b', userId: 'user-2', mint: MINT_A })
      const repo = makeFakeRepo([featA, featB])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      expect(cache.get(MINT_A)).toHaveLength(2)

      repo.setAll([featA])
      await cache.reconcile()

      expect(cache.get(MINT_A)).toEqual([featA])
    })
  })

  describe('periodic reconcile timer', () => {
    it('runs reconcile() automatically when reconcileIntervalMs > 0', async () => {
      const featA = makeConfig({ featureId: 'feat-a', mint: MINT_A })
      const featB = makeConfig({ featureId: 'feat-b', mint: MINT_B })
      const repo = makeFakeRepo([featA])
      const pubsub = makeFakePubSub()
      const cache = new WatchedFeatureCache({
        loader: repo.loader,
        fetchById: repo.fetchById,
        subscribe: pubsub.subscribe,
        reconcileIntervalMs: 5,
      })

      await cache.start()
      // Drop the watch:add event so only the timer can repair the drift.
      repo.setAll([featA, featB])

      // Wait for at least one reconcile tick.
      await new Promise<void>(resolve => setTimeout(resolve, 20))
      await cache.stop()

      expect(cache.has(MINT_B)).toBe(true)
    })
  })

  describe('stop()', () => {
    it('unsubscribes from both channels so further deltas are ignored', async () => {
      const feat = makeConfig({ featureId: 'feat-x', mint: MINT_A })
      const repo = makeFakeRepo([feat])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      expect(pubsub.subscriberCount()).toBe(3)

      await cache.stop()
      expect(pubsub.subscriberCount()).toBe(0)

      // Publishing after stop() has no effect — handlers are detached.
      await pubsub.publishWatch('watch:remove', { mint: MINT_A, featureId: 'feat-x' })
      expect(cache.get(MINT_A)).toEqual([feat])
    })
  })

  describe('referral:changed', () => {
    it('refreshes every entry whose userId matches the published userId', async () => {
      const before = makeConfig({
        featureId: 'feat-1',
        userId: 'user-1',
        mint: MINT_A,
        referralSnapshot: { tier1: null, tier2: null },
      })
      const after = makeConfig({
        featureId: 'feat-1',
        userId: 'user-1',
        mint: MINT_A,
        referralSnapshot: {
          tier1: { userId: 'new-tier1', sharePct: 0.35 },
          tier2: null,
        },
      })
      const repo = makeFakeRepo([before])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      expect(cache.get(MINT_A)?.[0].referralSnapshot).toEqual({ tier1: null, tier2: null })

      // The bot recorded a new referrer for user-1 and published referral:changed.
      repo.setAll([after])
      await pubsub.publishReferralChanged({ userId: 'user-1' })

      expect(cache.get(MINT_A)?.[0].referralSnapshot).toEqual({
        tier1: { userId: 'new-tier1', sharePct: 0.35 },
        tier2: null,
      })
    })

    it('refreshes only the entries owned by the targeted userId', async () => {
      const featOwnedByUser1 = makeConfig({
        featureId: 'feat-1',
        userId: 'user-1',
        mint: MINT_A,
        referralSnapshot: { tier1: null, tier2: null },
      })
      const featOwnedByUser2 = makeConfig({
        featureId: 'feat-2',
        userId: 'user-2',
        mint: MINT_B,
        referralSnapshot: { tier1: null, tier2: null },
      })
      const repo = makeFakeRepo([featOwnedByUser1, featOwnedByUser2])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()

      // user-1 gets a new referrer; user-2's entries should be untouched.
      repo.setAll([
        { ...featOwnedByUser1, referralSnapshot: { tier1: { userId: 'ref-1', sharePct: 0.35 }, tier2: null } },
        featOwnedByUser2,
      ])
      await pubsub.publishReferralChanged({ userId: 'user-1' })

      expect(cache.get(MINT_A)?.[0].referralSnapshot.tier1).toEqual({ userId: 'ref-1', sharePct: 0.35 })
      expect(cache.get(MINT_B)?.[0].referralSnapshot).toEqual({ tier1: null, tier2: null })
    })

    it('is a no-op when no cached entry matches the published userId', async () => {
      const feat = makeConfig({ featureId: 'feat-1', userId: 'user-1', mint: MINT_A })
      const repo = makeFakeRepo([feat])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start()
      const fetcherSpy = vi.spyOn(repo, 'fetchById')

      await pubsub.publishReferralChanged({ userId: 'user-stranger' })

      expect(fetcherSpy).not.toHaveBeenCalled()
      expect(cache.get(MINT_A)).toEqual([feat])
    })
  })

  describe('entry shape', () => {
    it('preserves referralSnapshot from the loader on cache entries', async () => {
      const featWithRefs = makeConfig({
        featureId: 'feat-refs',
        mint: MINT_A,
        referralSnapshot: {
          tier1: { userId: 'referrer-tier1', sharePct: 0.35 },
          tier2: { userId: 'referrer-tier2', sharePct: 0.05 },
        },
      })
      const repo = makeFakeRepo([featWithRefs])
      const cache = makeCache({ repo, pubsub: makeFakePubSub() })

      await cache.start()

      expect(cache.get(MINT_A)).toEqual([featWithRefs])
      expect(cache.get(MINT_A)?.[0].referralSnapshot).toEqual({
        tier1: { userId: 'referrer-tier1', sharePct: 0.35 },
        tier2: { userId: 'referrer-tier2', sharePct: 0.05 },
      })
    })
  })

  describe('idempotency', () => {
    it('does not duplicate when watch:add fires twice for the same featureId', async () => {
      const feat = makeConfig({ featureId: 'feat-x', mint: MINT_A })
      const repo = makeFakeRepo([feat])
      const pubsub = makeFakePubSub()
      const cache = makeCache({ repo, pubsub })

      await cache.start() // boot already inserts feat
      await pubsub.publishWatch('watch:add', { mint: MINT_A, featureId: 'feat-x' })
      await pubsub.publishWatch('watch:add', { mint: MINT_A, featureId: 'feat-x' })

      expect(cache.get(MINT_A)).toEqual([feat])
      expect(cache.get(MINT_A)?.length).toBe(1)
    })
  })
})
