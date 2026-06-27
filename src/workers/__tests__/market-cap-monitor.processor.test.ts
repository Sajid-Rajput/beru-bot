import type { WatchPayload } from '#root/buy-detector/watched-feature-cache.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import type { NotificationJob } from '#root/queue/types.js'
import type { Logger } from '#root/utils/logger.js'
import type {
  FeatureRepoSeam,
  LockSeam,
  MarketCapSeam,
  MonitorConfig,
  MonitorDeps,
  MonitorFeature,
  NotificationSeam,
  WatchEventSeam,
} from '#root/workers/market-cap-monitor.processor.js'

import { runColdCycle, runHotCycle } from '#root/workers/market-cap-monitor.processor.js'
import { describe, expect, it } from 'vitest'

// ── Test constants ───────────────────────────────────────────────────────────

const MINT = 'MintAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const CONFIG: MonitorConfig = { lockKey: 'monitor:lock', lockTtlSeconds: 60 }
const ACTIVE = new Set(['pending', 'watching', 'executing'])

// ── Fixtures ─────────────────────────────────────────────────────────────────

function cfg(overrides: Partial<ShadowSellConfig> = {}): ShadowSellConfig {
  return {
    minSellPercentage: 10,
    maxSellPercentage: 50,
    targetMarketCapUsd: 100_000,
    minBuyAmountSol: 1,
    hysteresisPercentage: 5,
    ...overrides,
  }
}

function makeFeature(overrides: Partial<MonitorFeature> = {}): MonitorFeature {
  return {
    featureId: 'feat-1',
    projectId: 'proj-1',
    telegramId: '1000',
    mint: MINT,
    status: 'pending',
    isWatching: false,
    config: cfg(),
    tokenName: 'Bonk',
    tokenSymbol: 'BONK',
    totalSellCount: 0,
    totalSolReceived: '0',
    totalSoldAmount: '0',
    pinnedMessageId: 555,
    ...overrides,
  }
}

// ── Fake seams ───────────────────────────────────────────────────────────────

function makeFakeLock(acquired = true) {
  const acquireCalls: Array<{ key: string, ttl: number }> = []
  const releaseCalls: string[] = []
  const lock: LockSeam = {
    async acquire(key, ttl) {
      acquireCalls.push({ key, ttl })
      return acquired
    },
    async release(key) {
      releaseCalls.push(key)
    },
  }
  return Object.assign(lock, { acquireCalls, releaseCalls })
}

function makeFakeFeatureRepo(initial: MonitorFeature[]) {
  const features = new Map(initial.map(f => [f.featureId, { ...f }]))
  const statusUpdates: Array<{ id: string, status: string }> = []
  const watchingUpdates: Array<{ id: string, watching: boolean }> = []
  const mcapUpdates: Array<{ id: string, mcap: number }> = []
  const calls = { findActive: 0, findWatching: 0 }

  const repo: FeatureRepoSeam = {
    async findActive() {
      calls.findActive++
      return [...features.values()].filter(f => ACTIVE.has(f.status)).map(f => ({ ...f }))
    },
    async findWatching() {
      calls.findWatching++
      return [...features.values()].filter(f => f.isWatching).map(f => ({ ...f }))
    },
    async setWatching(id, watching) {
      watchingUpdates.push({ id, watching })
      const f = features.get(id)
      if (f)
        f.isWatching = watching
    },
    async updateStatus(id, status) {
      statusUpdates.push({ id, status })
      const f = features.get(id)
      if (f)
        f.status = status
    },
    async updateLastMarketCap(id, mcap) {
      mcapUpdates.push({ id, mcap })
    },
  }
  return Object.assign(repo, { features, statusUpdates, watchingUpdates, mcapUpdates, calls })
}

function makeFakeMarketCap(prices: Record<string, number | null>, throwForMints: string[] = []) {
  const calls: string[] = []
  const throwing = new Set(throwForMints)
  const seam: MarketCapSeam = {
    async getMarketCapUsd(mint) {
      calls.push(mint)
      if (throwing.has(mint))
        throw new Error(`dexscreener boom for ${mint}`)
      return mint in prices ? prices[mint] : null
    },
  }
  return Object.assign(seam, { calls })
}

function makeFakeWatchEvents() {
  const adds: WatchPayload[] = []
  const removes: WatchPayload[] = []
  const seam: WatchEventSeam = {
    async publishWatchAdd(p) {
      adds.push(p)
      return true
    },
    async publishWatchRemove(p) {
      removes.push(p)
      return true
    },
  }
  return Object.assign(seam, { adds, removes })
}

function makeFakeNotifications() {
  const jobs: NotificationJob[] = []
  const seam: NotificationSeam = {
    async enqueue(job) {
      jobs.push(job)
    },
  }
  return Object.assign(seam, { jobs })
}

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child: () => noopLogger,
} as unknown as Logger

function makeDeps(
  features: MonitorFeature[],
  prices: Record<string, number | null>,
  opts: { lockAcquired?: boolean, throwForMints?: string[] } = {},
) {
  const lock = makeFakeLock(opts.lockAcquired ?? true)
  const repo = makeFakeFeatureRepo(features)
  const marketCap = makeFakeMarketCap(prices, opts.throwForMints)
  const watchEvents = makeFakeWatchEvents()
  const notifications = makeFakeNotifications()
  const deps: MonitorDeps = {
    lock,
    features: repo,
    marketCap,
    watchEvents,
    notifications,
    logger: noopLogger,
  }
  return { deps, lock, repo, marketCap, watchEvents, notifications }
}

// ── Behaviour ────────────────────────────────────────────────────────────────

describe('runHotCycle — activation (pending → watching)', () => {
  it('activates a pending feature once market cap reaches the target', async () => {
    const feature = makeFeature({ status: 'pending', isWatching: false, config: cfg({ targetMarketCapUsd: 100_000 }) })
    const { deps, repo, watchEvents, notifications } = makeDeps([feature], { [MINT]: 150_000 })

    const result = await runHotCycle(deps, CONFIG)

    // DB is the durable truth: is_watching flips on, status flips to 'watching'.
    expect(repo.watchingUpdates).toContainEqual({ id: 'feat-1', watching: true })
    expect(repo.statusUpdates).toContainEqual({ id: 'feat-1', status: 'watching' })
    // The watched-mint cache is told to start watching this mint.
    expect(watchEvents.adds).toContainEqual({ mint: MINT, featureId: 'feat-1' })
    // A single feature.state notification announces the watching state.
    expect(notifications.jobs).toHaveLength(1)
    expect(notifications.jobs[0]).toMatchObject({
      kind: 'feature.state',
      userId: '1000',
      context: { newState: 'watching' },
    })
    // The freshly-polled market cap is persisted.
    expect(repo.mcapUpdates).toContainEqual({ id: 'feat-1', mcap: 150_000 })
    expect(result).toMatchObject({ ranCycle: true, activated: 1 })
  })
})

describe('runHotCycle — pause (watching → pending)', () => {
  it('pauses a watching feature when market cap falls below the hysteresis floor', async () => {
    // target 100k, hysteresis 5% → floor is 95k. 90k is below the floor.
    const feature = makeFeature({
      status: 'watching',
      isWatching: true,
      config: cfg({ targetMarketCapUsd: 100_000, hysteresisPercentage: 5 }),
    })
    const { deps, repo, watchEvents, notifications } = makeDeps([feature], { [MINT]: 90_000 })

    const result = await runHotCycle(deps, CONFIG)

    // is_watching flips off, status reverts to 'pending' (the "paused" state).
    expect(repo.watchingUpdates).toContainEqual({ id: 'feat-1', watching: false })
    expect(repo.statusUpdates).toContainEqual({ id: 'feat-1', status: 'pending' })
    // The watched-mint cache is told to drop this mint.
    expect(watchEvents.removes).toContainEqual({ mint: MINT, featureId: 'feat-1' })
    expect(watchEvents.adds).toHaveLength(0)
    // A feature.state notification announces the paused state.
    expect(notifications.jobs).toHaveLength(1)
    expect(notifications.jobs[0]).toMatchObject({
      kind: 'feature.state',
      userId: '1000',
      context: { newState: 'paused' },
    })
    expect(repo.mcapUpdates).toContainEqual({ id: 'feat-1', mcap: 90_000 })
    expect(result).toMatchObject({ ranCycle: true, paused: 1 })
  })
})

describe('runHotCycle — no transition (sticky band & guards)', () => {
  function expectNoTransition(repo: ReturnType<typeof makeFakeFeatureRepo>, watchEvents: ReturnType<typeof makeFakeWatchEvents>, notifications: ReturnType<typeof makeFakeNotifications>) {
    expect(repo.statusUpdates).toHaveLength(0)
    expect(repo.watchingUpdates).toHaveLength(0)
    expect(watchEvents.adds).toHaveLength(0)
    expect(watchEvents.removes).toHaveLength(0)
    expect(notifications.jobs).toHaveLength(0)
  }

  it('leaves a watching feature untouched inside the hysteresis band', async () => {
    // floor = 95k, target = 100k. 97k sits in the band: not below floor, so sticky.
    const feature = makeFeature({ status: 'watching', isWatching: true, config: cfg({ targetMarketCapUsd: 100_000, hysteresisPercentage: 5 }) })
    const { deps, repo, watchEvents, notifications } = makeDeps([feature], { [MINT]: 97_000 })

    const result = await runHotCycle(deps, CONFIG)

    expectNoTransition(repo, watchEvents, notifications)
    // Market cap is still persisted every cycle, transition or not.
    expect(repo.mcapUpdates).toContainEqual({ id: 'feat-1', mcap: 97_000 })
    expect(result).toMatchObject({ ranCycle: true, activated: 0, paused: 0 })
  })

  it('leaves a pending feature pending while market cap is below target', async () => {
    const feature = makeFeature({ status: 'pending', isWatching: false, config: cfg({ targetMarketCapUsd: 100_000 }) })
    const { deps, repo, watchEvents, notifications } = makeDeps([feature], { [MINT]: 80_000 })

    await runHotCycle(deps, CONFIG)

    expectNoTransition(repo, watchEvents, notifications)
    expect(repo.mcapUpdates).toContainEqual({ id: 'feat-1', mcap: 80_000 })
  })

  it('never transitions when the MCAP gate is disabled (target = 0)', async () => {
    const feature = makeFeature({ status: 'pending', isWatching: false, config: cfg({ targetMarketCapUsd: 0 }) })
    const { deps, repo, watchEvents, notifications } = makeDeps([feature], { [MINT]: 1 })

    await runHotCycle(deps, CONFIG)

    expectNoTransition(repo, watchEvents, notifications)
  })

  it('never pauses a feature that is mid-sell (executing)', async () => {
    const feature = makeFeature({ status: 'executing', isWatching: true, config: cfg({ targetMarketCapUsd: 100_000, hysteresisPercentage: 5 }) })
    const { deps, repo, watchEvents, notifications } = makeDeps([feature], { [MINT]: 10_000 })

    await runHotCycle(deps, CONFIG)

    expectNoTransition(repo, watchEvents, notifications)
    expect(repo.mcapUpdates).toContainEqual({ id: 'feat-1', mcap: 10_000 })
  })
})

describe('runHotCycle — single-flight lock (invariant 17)', () => {
  it('acquires monitor:lock with the configured TTL before doing any work', async () => {
    const feature = makeFeature({ status: 'pending', config: cfg({ targetMarketCapUsd: 100_000 }) })
    const { deps, lock } = makeDeps([feature], { [MINT]: 150_000 })

    await runHotCycle(deps, CONFIG)

    expect(lock.acquireCalls).toContainEqual({ key: 'monitor:lock', ttl: 60 })
    expect(lock.releaseCalls).toContain('monitor:lock')
  })

  it('skips the whole cycle (no DB reads, no MCAP polls) when the lock is held', async () => {
    const feature = makeFeature({ status: 'pending', config: cfg({ targetMarketCapUsd: 100_000 }) })
    const { deps, repo, marketCap, lock } = makeDeps([feature], { [MINT]: 150_000 }, { lockAcquired: false })

    const result = await runHotCycle(deps, CONFIG)

    expect(result.ranCycle).toBe(false)
    expect(repo.calls.findActive).toBe(0)
    expect(marketCap.calls).toHaveLength(0)
    expect(repo.statusUpdates).toHaveLength(0)
    // Never release a lock we didn't take.
    expect(lock.releaseCalls).toHaveLength(0)
  })
})

describe('runHotCycle — resilience', () => {
  it('skips a feature whose market cap is unavailable, leaving its state intact', async () => {
    // No price for MINT → getMarketCapUsd returns null (DexScreener degraded).
    const feature = makeFeature({ status: 'watching', isWatching: true, config: cfg({ targetMarketCapUsd: 100_000, hysteresisPercentage: 5 }) })
    const { deps, repo, watchEvents } = makeDeps([feature], {})

    await runHotCycle(deps, CONFIG)

    expect(repo.statusUpdates).toHaveLength(0)
    expect(watchEvents.removes).toHaveLength(0)
    // No price means nothing to persist.
    expect(repo.mcapUpdates).toHaveLength(0)
  })

  it('isolates a thrown error to one feature and still processes the rest + releases the lock', async () => {
    const MINT_B = 'MintBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const featureA = makeFeature({ featureId: 'feat-a', mint: MINT, status: 'pending', config: cfg({ targetMarketCapUsd: 100_000 }) })
    const featureB = makeFeature({ featureId: 'feat-b', mint: MINT_B, status: 'pending', config: cfg({ targetMarketCapUsd: 100_000 }) })
    const { deps, repo, watchEvents, lock } = makeDeps(
      [featureA, featureB],
      { [MINT_B]: 150_000 },
      { throwForMints: [MINT] },
    )

    const result = await runHotCycle(deps, CONFIG)

    // feature-a blew up, feature-b still activated.
    expect(repo.statusUpdates).toContainEqual({ id: 'feat-b', status: 'watching' })
    expect(watchEvents.adds).toContainEqual({ mint: MINT_B, featureId: 'feat-b' })
    expect(result).toMatchObject({ ranCycle: true, activated: 1 })
    // Lock is always released.
    expect(lock.releaseCalls).toContain('monitor:lock')
  })
})

describe('runHotCycle — multiple features', () => {
  it('activates, pauses, and leaves features alone independently in one pass', async () => {
    const MINT_UP = 'MintUpaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const MINT_DOWN = 'MintDownaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const MINT_HOLD = 'MintHoldaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const up = makeFeature({ featureId: 'up', mint: MINT_UP, status: 'pending', isWatching: false, config: cfg({ targetMarketCapUsd: 100_000 }) })
    const down = makeFeature({ featureId: 'down', mint: MINT_DOWN, status: 'watching', isWatching: true, config: cfg({ targetMarketCapUsd: 100_000, hysteresisPercentage: 5 }) })
    const hold = makeFeature({ featureId: 'hold', mint: MINT_HOLD, status: 'watching', isWatching: true, config: cfg({ targetMarketCapUsd: 100_000, hysteresisPercentage: 5 }) })
    const { deps, repo, watchEvents } = makeDeps(
      [up, down, hold],
      { [MINT_UP]: 120_000, [MINT_DOWN]: 50_000, [MINT_HOLD]: 98_000 },
    )

    const result = await runHotCycle(deps, CONFIG)

    expect(repo.statusUpdates).toContainEqual({ id: 'up', status: 'watching' })
    expect(repo.statusUpdates).toContainEqual({ id: 'down', status: 'pending' })
    expect(watchEvents.adds).toContainEqual({ mint: MINT_UP, featureId: 'up' })
    expect(watchEvents.removes).toContainEqual({ mint: MINT_DOWN, featureId: 'down' })
    // 'hold' sits in the band — no status change for it.
    expect(repo.statusUpdates.find(u => u.id === 'hold')).toBeUndefined()
    expect(result).toMatchObject({ ranCycle: true, evaluated: 3, activated: 1, paused: 1 })
  })
})

describe('runColdCycle — pub/sub-loss safety net', () => {
  it('re-publishes watch:add for every is_watching feature, under the lock', async () => {
    const MINT_B = 'MintBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const watchingA = makeFeature({ featureId: 'a', mint: MINT, isWatching: true, status: 'watching' })
    const watchingB = makeFeature({ featureId: 'b', mint: MINT_B, isWatching: true, status: 'watching' })
    const idle = makeFeature({ featureId: 'c', mint: 'MintCccccccccccccccccccccccccccccccccccccccc', isWatching: false, status: 'pending' })
    const { deps, watchEvents, lock, marketCap } = makeDeps([watchingA, watchingB, idle], {})

    const result = await runColdCycle(deps, CONFIG)

    expect(lock.acquireCalls).toContainEqual({ key: 'monitor:lock', ttl: 60 })
    expect(watchEvents.adds).toContainEqual({ mint: MINT, featureId: 'a' })
    expect(watchEvents.adds).toContainEqual({ mint: MINT_B, featureId: 'b' })
    // Only the watched set is re-announced; idle features are skipped.
    expect(watchEvents.adds).toHaveLength(2)
    // The cold loop is a pure re-broadcast — it never polls DexScreener.
    expect(marketCap.calls).toHaveLength(0)
    expect(lock.releaseCalls).toContain('monitor:lock')
    expect(result).toMatchObject({ ranCycle: true, republished: 2 })
  })

  it('skips when the lock is held', async () => {
    const watching = makeFeature({ isWatching: true, status: 'watching' })
    const { deps, watchEvents, repo } = makeDeps([watching], {}, { lockAcquired: false })

    const result = await runColdCycle(deps, CONFIG)

    expect(result.ranCycle).toBe(false)
    expect(repo.calls.findWatching).toBe(0)
    expect(watchEvents.adds).toHaveLength(0)
  })
})
