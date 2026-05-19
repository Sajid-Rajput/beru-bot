import type { SellJobData } from '#root/queue/types.js'

import type { DedupStore, SellQueue } from '../enqueuer.js'
import type { Match } from '../matcher.js'

import { describe, expect, it, vi } from 'vitest'

import { createRedisDedupStore, makeEnqueuer } from '../enqueuer.js'

const MINT = 'MintAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function makeMatch(overrides: Partial<Match['feature']> = {}, matchOverrides: Partial<Omit<Match, 'feature'>> = {}): Match {
  return {
    feature: {
      featureId: 'feat-1',
      projectId: 'proj-1',
      userId: 'user-1',
      mint: MINT,
      mainWalletPubkey: 'WalletAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      config: {
        minSellPercentage: 10,
        maxSellPercentage: 50,
        targetMarketCapUsd: 100_000,
        minBuyAmountSol: 1,
        hysteresisPercentage: 5,
      },
      referralSnapshot: { tier1: null, tier2: null },
      ...overrides,
    },
    sellPercentage: 30,
    buyAmountSol: 3,
    ...matchOverrides,
  }
}

function makeFakeDedup(): DedupStore & { keys: string[] } {
  const seen = new Set<string>()
  return {
    keys: [] as string[],
    async claim(key) {
      this.keys.push(key)
      if (seen.has(key))
        return false
      seen.add(key)
      return true
    },
  } as DedupStore & { keys: string[] }
}

function makeFakeQueue(): SellQueue & { added: SellJobData[] } {
  const added: SellJobData[] = []
  return {
    added,
    async add(job: SellJobData) {
      added.push(job)
    },
  } as SellQueue & { added: SellJobData[] }
}

describe('enqueuer', () => {
  it('claims the dedup slot using the dedup:{signature} key format', async () => {
    const dedup = makeFakeDedup()
    const queue = makeFakeQueue()
    const enqueue = makeEnqueuer({ dedup, queue })

    await enqueue({ triggerSignature: 'sig-abc', matches: [makeMatch()] })

    expect(dedup.keys).toEqual(['dedup:sig-abc'])
  })

  it('skips the second enqueue for the same triggerSignature', async () => {
    const dedup = makeFakeDedup()
    const queue = makeFakeQueue()
    const enqueue = makeEnqueuer({ dedup, queue })

    await enqueue({ triggerSignature: 'sig-dup', matches: [makeMatch()] })
    await enqueue({ triggerSignature: 'sig-dup', matches: [makeMatch()] })

    expect(queue.added).toHaveLength(1)
  })

  it('does nothing when there are no matches', async () => {
    const dedup = makeFakeDedup()
    const queue = makeFakeQueue()
    const enqueue = makeEnqueuer({ dedup, queue })

    await enqueue({ triggerSignature: 'sig-zero', matches: [] })

    expect(queue.added).toEqual([])
    expect(dedup.keys).toEqual([])
  })

  it('emits one SellJob per match (multi-feature fan-out) under a single dedup claim', async () => {
    const dedup = makeFakeDedup()
    const queue = makeFakeQueue()
    const enqueue = makeEnqueuer({ dedup, queue })

    const matchA = makeMatch({ featureId: 'feat-a' })
    const matchB = makeMatch({ featureId: 'feat-b' })

    await enqueue({ triggerSignature: 'sig-fanout', matches: [matchA, matchB] })

    expect(queue.added.map(j => j.featureId)).toEqual(['feat-a', 'feat-b'])
    expect(dedup.keys).toEqual(['dedup:sig-fanout'])
  })

  it('bakes the cache-supplied referralSnapshot into the emitted SellJob', async () => {
    const dedup = makeFakeDedup()
    const queue = makeFakeQueue()
    const enqueue = makeEnqueuer({ dedup, queue })

    const match = makeMatch({
      referralSnapshot: {
        tier1: { userId: 'ref-1', sharePct: 0.35 },
        tier2: { userId: 'ref-2', sharePct: 0.05 },
      },
    })

    await enqueue({ triggerSignature: 'sig-refs', matches: [match] })

    expect(queue.added[0].referralSnapshot).toEqual({
      tier1: { userId: 'ref-1', sharePct: 0.35 },
      tier2: { userId: 'ref-2', sharePct: 0.05 },
    })
  })

  it('enqueues a SellJob with the ADR-0002 shape on first observation', async () => {
    const dedup = makeFakeDedup()
    const queue = makeFakeQueue()
    const enqueue = makeEnqueuer({ dedup, queue })

    await enqueue({
      triggerSignature: 'sig-abc',
      matches: [makeMatch()],
    })

    expect(queue.added).toHaveLength(1)
    expect(queue.added[0]).toEqual({
      schemaVersion: 1,
      featureId: 'feat-1',
      triggerSignature: 'sig-abc',
      mint: MINT,
      mainWalletPubkey: 'WalletAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sellPercentage: 30,
      configSnapshot: {
        minSellPercentage: 10,
        maxSellPercentage: 50,
        targetMarketCapUsd: 100_000,
        minBuyAmountSol: 1,
        hysteresisPercentage: 5,
      },
      buyAmountSol: 3,
      referralSnapshot: { tier1: null, tier2: null },
    })
  })
})

describe('detection_to_enqueue_ms metric', () => {
  it('records one histogram observation per enqueued SellJob', async () => {
    const dedup = makeFakeDedup()
    const queue = makeFakeQueue()
    const observations: number[] = []
    const enqueue = makeEnqueuer({
      dedup,
      queue,
      metrics: { observeDetectionToEnqueueMs: ms => observations.push(ms) },
    })

    await enqueue({
      triggerSignature: 'sig-metric',
      matches: [makeMatch()],
      detectionStartedAtMs: 0,
    })

    expect(observations).toHaveLength(1)
    expect(observations[0]).toBeGreaterThanOrEqual(0)
  })

  it('does not observe the metric when dedup short-circuits a duplicate', async () => {
    const dedup = makeFakeDedup()
    const queue = makeFakeQueue()
    const observations: number[] = []
    const enqueue = makeEnqueuer({
      dedup,
      queue,
      metrics: { observeDetectionToEnqueueMs: ms => observations.push(ms) },
    })

    await enqueue({ triggerSignature: 'sig-dup-m', matches: [makeMatch()], detectionStartedAtMs: 0 })
    await enqueue({ triggerSignature: 'sig-dup-m', matches: [makeMatch()], detectionStartedAtMs: 0 })

    expect(observations).toHaveLength(1)
  })
})

describe('createRedisDedupStore', () => {
  it('issues SET NX with the 300-second default TTL and reports the slot fresh on "OK"', async () => {
    const set = vi.fn().mockResolvedValue('OK')
    const dedup = createRedisDedupStore({ set })

    const fresh = await dedup.claim('dedup:sig-1')

    expect(set).toHaveBeenCalledWith('dedup:sig-1', '1', 'EX', 300, 'NX')
    expect(fresh).toBe(true)
  })

  it('reports the slot stale when Redis returns null (NX collision)', async () => {
    const set = vi.fn().mockResolvedValue(null)
    const dedup = createRedisDedupStore({ set })

    expect(await dedup.claim('dedup:sig-2')).toBe(false)
  })
})
