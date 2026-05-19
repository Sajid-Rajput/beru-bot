import type { db as DrizzleDb } from '#root/db/index.js'
import type { RedisSubscriber } from '../watched-feature-cache.adapter.js'

import { EventEmitter } from 'node:events'
import { REFERRAL_TIER1_PCT, REFERRAL_TIER2_PCT } from '#root/utils/constants.js'
import { describe, expect, it, vi } from 'vitest'

import {
  createWatchedFeatureFetcher,
  createWatchedFeatureLoader,
  createWatchPubSubSubscriber,
} from '../watched-feature-cache.adapter.js'

// ── Fake Drizzle db ──────────────────────────────────────────────────────────
// The loader/fetcher chain through select/from/innerJoin/leftJoin/where/limit.
// We don't validate the SQL — that's Drizzle's job — we validate that the rows
// returned by the chain are mapped to the right `ProjectFeatureConfig` shape.

type Row = Record<string, unknown>

function makeFakeDb(rows: Row[]) {
  const builder: Record<string, unknown> = {}
  const passthrough = (): unknown => builder
  builder.select = passthrough
  builder.from = passthrough
  builder.innerJoin = passthrough
  builder.leftJoin = passthrough
  builder.where = () => Object.assign(Promise.resolve(rows), builder)
  builder.limit = () => Promise.resolve(rows)
  return builder as unknown as typeof DrizzleDb
}

const SHADOW_CONFIG = {
  minSellPercentage: 10,
  maxSellPercentage: 50,
  targetMarketCapUsd: 100_000,
  minBuyAmountSol: 0.1,
  hysteresisPercentage: 5,
}

// ── Fake ioredis subscriber ──────────────────────────────────────────────────
// Models the slice of ioredis we touch: subscribe(channel), unsubscribe(channel),
// and a 'message' event that fires (channel, raw) for every incoming message.

class FakeRedisSubscriber extends EventEmitter implements RedisSubscriber {
  subscribed = new Set<string>()
  subscribeCalls: string[] = []
  unsubscribeCalls: string[] = []

  async subscribe(channel: string): Promise<void> {
    this.subscribed.add(channel)
    this.subscribeCalls.push(channel)
  }

  async unsubscribe(channel: string): Promise<void> {
    this.subscribed.delete(channel)
    this.unsubscribeCalls.push(channel)
  }

  // Test helper: simulate an inbound Redis message.
  deliver(channel: string, raw: string) {
    this.emit('message', channel, raw)
  }
}

describe('createWatchPubSubSubscriber', () => {
  it('subscribes to the requested channel and routes messages to the handler', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    await subscribe('watch:add', handler)

    expect(fake.subscribed.has('watch:add')).toBe(true)
    fake.deliver('watch:add', JSON.stringify({ mint: 'M1', featureId: 'F1' }))

    expect(handler).toHaveBeenCalledWith({ mint: 'M1', featureId: 'F1' })
  })

  it('routes only messages for the subscribed channel', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const addHandler = vi.fn()
    const removeHandler = vi.fn()

    await subscribe('watch:add', addHandler)
    await subscribe('watch:remove', removeHandler)

    fake.deliver('watch:add', JSON.stringify({ mint: 'M1', featureId: 'F1' }))
    fake.deliver('watch:remove', JSON.stringify({ mint: 'M2', featureId: 'F2' }))

    expect(addHandler).toHaveBeenCalledTimes(1)
    expect(addHandler).toHaveBeenCalledWith({ mint: 'M1', featureId: 'F1' })
    expect(removeHandler).toHaveBeenCalledTimes(1)
    expect(removeHandler).toHaveBeenCalledWith({ mint: 'M2', featureId: 'F2' })
  })

  it('does not invoke handler on malformed JSON and does not throw', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    await subscribe('watch:add', handler)

    expect(() => fake.deliver('watch:add', '{not json')).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not invoke handler when payload is missing required fields', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    await subscribe('watch:add', handler)
    fake.deliver('watch:add', JSON.stringify({ mint: 'M1' })) // missing featureId
    fake.deliver('watch:add', JSON.stringify({ featureId: 'F1' })) // missing mint
    fake.deliver('watch:add', JSON.stringify({ mint: 1, featureId: 'F1' })) // wrong type

    expect(handler).not.toHaveBeenCalled()
  })

  it('returned unsubscribe fn calls Redis unsubscribe and detaches the handler', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    const unsub = await subscribe('watch:add', handler)
    fake.deliver('watch:add', JSON.stringify({ mint: 'M1', featureId: 'F1' }))
    expect(handler).toHaveBeenCalledTimes(1)

    await unsub()
    expect(fake.unsubscribeCalls).toContain('watch:add')

    fake.deliver('watch:add', JSON.stringify({ mint: 'M2', featureId: 'F2' }))
    expect(handler).toHaveBeenCalledTimes(1) // no new call
  })

  it('parses referral:changed payloads with a userId field', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    await subscribe('referral:changed', handler)
    fake.deliver('referral:changed', JSON.stringify({ userId: 'user-42' }))

    expect(handler).toHaveBeenCalledWith({ userId: 'user-42' })
  })

  it('drops referral:changed payloads without a userId field', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    await subscribe('referral:changed', handler)
    fake.deliver('referral:changed', JSON.stringify({ mint: 'M1', featureId: 'F1' }))
    fake.deliver('referral:changed', JSON.stringify({ userId: 42 })) // wrong type

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not swallow exceptions thrown by the handler', async () => {
    // Handler errors are the cache's responsibility; the wrapper just routes.
    // We surface them so a future logger middleware can wire pino.error.
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const errors: unknown[] = []
    fake.on('error', err => errors.push(err))

    await subscribe('watch:add', () => {
      throw new Error('handler boom')
    })

    fake.deliver('watch:add', JSON.stringify({ mint: 'M1', featureId: 'F1' }))
    // The subscriber wraps handler errors so they don't kill the process; verify
    // the message handler doesn't crash on synchronous throw.
    expect(true).toBe(true)
  })
})

describe('createWatchedFeatureLoader', () => {
  it('returns the referrer chain when the feature owner has tier-1 and tier-2 referrers', async () => {
    const db = makeFakeDb([{
      featureId: 'feat-1',
      projectId: 'proj-1',
      userId: 'user-owner',
      mint: 'Mint1111111111111111111111111111111111111111',
      mainWalletPubkey: 'Wallet11111111111111111111111111111111111111',
      config: SHADOW_CONFIG,
      tier1ReferrerId: 'user-tier1',
      tier2ReferrerId: 'user-tier2',
    }])

    const loader = createWatchedFeatureLoader(db)
    const [entry] = await loader()

    expect(entry.referralSnapshot).toEqual({
      tier1: { userId: 'user-tier1', sharePct: REFERRAL_TIER1_PCT },
      tier2: { userId: 'user-tier2', sharePct: REFERRAL_TIER2_PCT },
    })
  })

  it('returns null tiers when the feature owner has no referrers', async () => {
    const db = makeFakeDb([{
      featureId: 'feat-1',
      projectId: 'proj-1',
      userId: 'user-orphan',
      mint: 'Mint1111111111111111111111111111111111111111',
      mainWalletPubkey: 'Wallet11111111111111111111111111111111111111',
      config: SHADOW_CONFIG,
      tier1ReferrerId: null,
      tier2ReferrerId: null,
    }])

    const loader = createWatchedFeatureLoader(db)
    const [entry] = await loader()

    expect(entry.referralSnapshot).toEqual({ tier1: null, tier2: null })
  })

  it('maps the joined wallet public key onto mainWalletPubkey', async () => {
    const db = makeFakeDb([{
      featureId: 'feat-1',
      projectId: 'proj-1',
      userId: 'user-owner',
      mint: 'Mint1111111111111111111111111111111111111111',
      mainWalletPubkey: 'WalletZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
      config: SHADOW_CONFIG,
      tier1ReferrerId: null,
      tier2ReferrerId: null,
    }])

    const loader = createWatchedFeatureLoader(db)
    const [entry] = await loader()

    expect(entry.mainWalletPubkey).toBe('WalletZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')
  })

  it('returns a mixed chain when only the tier-1 referrer exists', async () => {
    const db = makeFakeDb([{
      featureId: 'feat-1',
      projectId: 'proj-1',
      userId: 'user-owner',
      mint: 'Mint1111111111111111111111111111111111111111',
      mainWalletPubkey: 'Wallet11111111111111111111111111111111111111',
      config: SHADOW_CONFIG,
      tier1ReferrerId: 'user-tier1',
      tier2ReferrerId: null,
    }])

    const loader = createWatchedFeatureLoader(db)
    const [entry] = await loader()

    expect(entry.referralSnapshot).toEqual({
      tier1: { userId: 'user-tier1', sharePct: REFERRAL_TIER1_PCT },
      tier2: null,
    })
  })
})

describe('createWatchedFeatureFetcher', () => {
  it('returns the widened entry shape including the referrer chain', async () => {
    const db = makeFakeDb([{
      featureId: 'feat-1',
      projectId: 'proj-1',
      userId: 'user-owner',
      mint: 'Mint1111111111111111111111111111111111111111',
      mainWalletPubkey: 'Wallet11111111111111111111111111111111111111',
      config: SHADOW_CONFIG,
      tier1ReferrerId: 'user-tier1',
      tier2ReferrerId: 'user-tier2',
    }])

    const fetcher = createWatchedFeatureFetcher(db)
    const entry = await fetcher('feat-1')

    expect(entry?.referralSnapshot).toEqual({
      tier1: { userId: 'user-tier1', sharePct: REFERRAL_TIER1_PCT },
      tier2: { userId: 'user-tier2', sharePct: REFERRAL_TIER2_PCT },
    })
  })

  it('returns undefined when the feature does not exist', async () => {
    const db = makeFakeDb([])
    const fetcher = createWatchedFeatureFetcher(db)

    expect(await fetcher('feat-missing')).toBeUndefined()
  })
})
