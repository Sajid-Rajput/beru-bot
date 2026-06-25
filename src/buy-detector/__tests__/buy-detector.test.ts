import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'

import type { ProjectFeatureConfig } from '../watched-feature-cache.js'

import { LAMPORTS_PER_SOL } from '#root/utils/constants.js'
import { DEX_PROGRAM_IDS, DexProgramId } from '#root/utils/dex-programs.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BuyDetector } from '../index.js'
import { WatchedFeatureCache } from '../watched-feature-cache.js'

// ── Fakes ────────────────────────────────────────────────────────────────────

const MINT_WATCHED = 'MintWaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const MINT_UNKNOWN = 'MintUnknownXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

function makeFeature(overrides: Partial<ProjectFeatureConfig> = {}): ProjectFeatureConfig {
  return {
    featureId: 'feat-1',
    projectId: 'proj-1',
    userId: 'user-1',
    mint: MINT_WATCHED,
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
  }
}

function makeCache(initial: ProjectFeatureConfig[] = []): WatchedFeatureCache {
  return new WatchedFeatureCache({
    loader: async () => initial,
    fetchById: async () => undefined,
    subscribe: async () => async () => {},
    reconcileIntervalMs: 0,
  })
}

// Keeps one listener per subscribed on-chain program id, so a test can emit on
// a specific DEX subscription and assert per-program routing. `emit` is keyed
// by the on-chain program string the SubscriptionManager subscribes with
// (`DEX_PROGRAM_IDS[program]`), mirroring the subscription-manager test fake.
function makeWsFactory() {
  const listeners = new Map<string, (logs: Logs) => void>()
  let closeCalls = 0
  const factory = () => ({
    subscribeLogs: async (programId: string, onLogs: (logs: Logs) => void) => {
      listeners.set(programId, onLogs)
      return {
        close: async () => {
          closeCalls += 1
          listeners.delete(programId)
        },
      }
    },
  })
  return {
    factory,
    emit: (programId: string, logs: Logs) => listeners.get(programId)?.(logs),
    closeCalls: () => closeCalls,
    subscribedPrograms: () => [...listeners.keys()],
  }
}

function makeFakeQueue() {
  const added: any[] = []
  return {
    added,
    add: async (job: any) => { added.push(job) },
  }
}

function makeFakeRedis() {
  const seen = new Set<string>()
  return {
    set: vi.fn(async (key: string, _v: string, _ex: string, _ttl: number, _nx: string) => {
      if (seen.has(key))
        return null
      seen.add(key)
      return 'OK'
    }),
  }
}

const STUB_PARSED_TX = { meta: {}, slot: 1, transaction: {} } as unknown as ParsedTransactionWithMeta

function makeBuy(dexProgram: DexProgramId, signature: string) {
  return {
    signature,
    mint: MINT_WATCHED,
    buyer: 'BuyerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    solIn: BigInt(3 * LAMPORTS_PER_SOL),
    slot: 1,
    dexProgram,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buyDetector', () => {
  it('drops a log notification silently when no watched mint is mentioned', async () => {
    const cache = makeCache([makeFeature()]) // watched: MINT_WATCHED
    const { factory, emit } = makeWsFactory()
    const queue = makeFakeQueue()
    const fetchTx = vi.fn()

    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, () => null]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx,
      redis: makeFakeRedis(),
      sellQueue: queue,
    })

    await bd.start()
    emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], {
      err: null,
      logs: [`Program log: bought ${MINT_UNKNOWN}`],
      signature: 'sig-other',
    })
    // allow any microtasks to drain
    await new Promise(r => setImmediate(r))

    expect(fetchTx).not.toHaveBeenCalled()
    expect(queue.added).toEqual([])

    await bd.stop()
  })

  it('on a watched-mint log: fetches tx, parses, matches, and enqueues a SellJob', async () => {
    const cache = makeCache([makeFeature()])
    const { factory, emit } = makeWsFactory()
    const queue = makeFakeQueue()

    const fetchTx = vi.fn().mockResolvedValue(STUB_PARSED_TX)
    const parser = vi.fn().mockReturnValue({
      signature: 'sig-buy',
      mint: MINT_WATCHED,
      buyer: 'BuyerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      solIn: BigInt(3 * LAMPORTS_PER_SOL),
      slot: 1,
      dexProgram: DexProgramId.PUMP_FUN_BC,
    })

    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, parser]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx,
      redis: makeFakeRedis(),
      sellQueue: queue,
    })

    await bd.start()
    emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], {
      err: null,
      logs: [`Program log: contains ${MINT_WATCHED} reference`],
      signature: 'sig-buy',
    })

    // drain async dispatch
    await vi.waitFor(() => expect(queue.added).toHaveLength(1))

    expect(fetchTx).toHaveBeenCalledWith('sig-buy')
    expect(parser).toHaveBeenCalled()
    expect(queue.added[0]).toMatchObject({
      schemaVersion: 1,
      featureId: 'feat-1',
      triggerSignature: 'sig-buy',
      mint: MINT_WATCHED,
      mainWalletPubkey: 'WalletAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      buyAmountSol: 3,
      sellPercentage: 30,
    })

    await bd.stop()
  })

  it('drops silently when the parser returns null (not a buy)', async () => {
    const cache = makeCache([makeFeature()])
    const { factory, emit } = makeWsFactory()
    const queue = makeFakeQueue()
    const fetchTx = vi.fn().mockResolvedValue(STUB_PARSED_TX)
    const parser = vi.fn().mockReturnValue(null)

    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, parser]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx,
      redis: makeFakeRedis(),
      sellQueue: queue,
    })

    await bd.start()
    emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], {
      err: null,
      logs: [`Program log: ${MINT_WATCHED}`],
      signature: 'sig-not-buy',
    })
    await new Promise(r => setImmediate(r))

    expect(parser).toHaveBeenCalled()
    expect(queue.added).toEqual([])

    await bd.stop()
  })

  it('getStatus() reports the open subscriptions and the lastLogAtMs map', async () => {
    const cache = makeCache([])
    const { factory } = makeWsFactory()
    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, () => null]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx: async () => null,
      redis: makeFakeRedis(),
      sellQueue: makeFakeQueue(),
    })

    await bd.start()
    const status = bd.getStatus()

    expect(status.subscriptions).toContain(DexProgramId.PUMP_FUN_BC)
    expect(status.lastLogAtMs[DexProgramId.PUMP_FUN_BC]).toBeNull()
    expect(status.mode).toBe('primary')

    await bd.stop()
  })

  it('stop() closes WS subscriptions and stops the cache', async () => {
    const cache = makeCache([])
    const stopSpy = vi.spyOn(cache, 'stop')
    const { factory, closeCalls } = makeWsFactory()

    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, () => null]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx: async () => null,
      redis: makeFakeRedis(),
      sellQueue: makeFakeQueue(),
    })

    await bd.start()
    await bd.stop()

    expect(closeCalls()).toBe(1)
    expect(stopSpy).toHaveBeenCalled()
  })

  // ── Multi-DEX routing (#38) ──────────────────────────────────────────────

  function makeThreeDexDetector(deps: {
    parsers: { pumpFun: any, pumpSwap: any, raydium: any }
    factory: any
    queue: ReturnType<typeof makeFakeQueue>
  }) {
    return new BuyDetector({
      cache: makeCache([makeFeature()]),
      parsers: [
        [DexProgramId.PUMP_FUN_BC, deps.parsers.pumpFun],
        [DexProgramId.PUMP_SWAP, deps.parsers.pumpSwap],
        [DexProgramId.RAYDIUM_AMM_V4, deps.parsers.raydium],
      ],
      programs: [DexProgramId.PUMP_FUN_BC, DexProgramId.PUMP_SWAP, DexProgramId.RAYDIUM_AMM_V4],
      wsClientFactory: deps.factory,
      wsUrl: 'wss://x',
      fetchTx: vi.fn().mockResolvedValue(STUB_PARSED_TX),
      redis: makeFakeRedis(),
      sellQueue: deps.queue,
    })
  }

  it('routes a PumpSwap-subscription log to the PumpSwap parser only, then enqueues a SellJob', async () => {
    const { factory, emit } = makeWsFactory()
    const queue = makeFakeQueue()
    const parsers = {
      pumpFun: vi.fn().mockReturnValue(null),
      pumpSwap: vi.fn().mockReturnValue(makeBuy(DexProgramId.PUMP_SWAP, 'sig-ps')),
      raydium: vi.fn().mockReturnValue(null),
    }
    const bd = makeThreeDexDetector({ parsers, factory, queue })

    await bd.start()
    emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_SWAP], {
      err: null,
      logs: [`Program log: ${MINT_WATCHED}`],
      signature: 'sig-ps',
    })

    await vi.waitFor(() => expect(queue.added).toHaveLength(1))
    expect(parsers.pumpSwap).toHaveBeenCalled()
    expect(parsers.pumpFun).not.toHaveBeenCalled()
    expect(parsers.raydium).not.toHaveBeenCalled()
    expect(queue.added[0]).toMatchObject({ triggerSignature: 'sig-ps', mint: MINT_WATCHED })

    await bd.stop()
  })

  it('routes a Raydium AMM v4-subscription log to the Raydium parser only, then enqueues a SellJob', async () => {
    const { factory, emit } = makeWsFactory()
    const queue = makeFakeQueue()
    const parsers = {
      pumpFun: vi.fn().mockReturnValue(null),
      pumpSwap: vi.fn().mockReturnValue(null),
      raydium: vi.fn().mockReturnValue(makeBuy(DexProgramId.RAYDIUM_AMM_V4, 'sig-ray')),
    }
    const bd = makeThreeDexDetector({ parsers, factory, queue })

    await bd.start()
    emit(DEX_PROGRAM_IDS[DexProgramId.RAYDIUM_AMM_V4], {
      err: null,
      logs: [`Program log: ${MINT_WATCHED}`],
      signature: 'sig-ray',
    })

    await vi.waitFor(() => expect(queue.added).toHaveLength(1))
    expect(parsers.raydium).toHaveBeenCalled()
    expect(parsers.pumpFun).not.toHaveBeenCalled()
    expect(parsers.pumpSwap).not.toHaveBeenCalled()
    expect(queue.added[0]).toMatchObject({ triggerSignature: 'sig-ray', mint: MINT_WATCHED })

    await bd.stop()
  })

  it('getStatus() lists all three DEX subscriptions with an independent lastLogAtMs per program', async () => {
    let clock = 1_000
    const cache = makeCache([])
    const { factory, emit } = makeWsFactory()
    const bd = new BuyDetector({
      cache,
      parsers: [
        [DexProgramId.PUMP_FUN_BC, () => null],
        [DexProgramId.PUMP_SWAP, () => null],
        [DexProgramId.RAYDIUM_AMM_V4, () => null],
      ],
      programs: [DexProgramId.PUMP_FUN_BC, DexProgramId.PUMP_SWAP, DexProgramId.RAYDIUM_AMM_V4],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx: async () => null,
      redis: makeFakeRedis(),
      sellQueue: makeFakeQueue(),
      now: () => clock,
    })

    await bd.start()
    expect(bd.getStatus().subscriptions).toEqual([
      DexProgramId.PUMP_FUN_BC,
      DexProgramId.PUMP_SWAP,
      DexProgramId.RAYDIUM_AMM_V4,
    ])
    expect(bd.getStatus().lastLogAtMs).toEqual({
      [DexProgramId.PUMP_FUN_BC]: null,
      [DexProgramId.PUMP_SWAP]: null,
      [DexProgramId.RAYDIUM_AMM_V4]: null,
    })

    clock = 5_000
    emit(DEX_PROGRAM_IDS[DexProgramId.RAYDIUM_AMM_V4], {
      err: null,
      logs: [],
      signature: 'sig-heartbeat',
    })

    expect(bd.getStatus().lastLogAtMs).toEqual({
      [DexProgramId.PUMP_FUN_BC]: null,
      [DexProgramId.PUMP_SWAP]: null,
      [DexProgramId.RAYDIUM_AMM_V4]: 5_000,
    })

    await bd.stop()
  })

  // Touch DEX_PROGRAM_IDS so the linter knows the helper is used at runtime
  void DEX_PROGRAM_IDS
})

// ── Degraded-mode polling (#39) ──────────────────────────────────────────────
//
// Drives the silence heartbeat with fake timers. The WS factory never emits, so
// the subscription falls silent and the detector folds into degraded polling,
// running the SAME parse → match → enqueue pipeline off `getSignaturesForAddress`
// results instead of WS notifications.

function makeDegradedTx(logMessages: string[] = [`Program log: ${MINT_WATCHED}`]): ParsedTransactionWithMeta {
  return { ...STUB_PARSED_TX, slot: 1, meta: { ...(STUB_PARSED_TX.meta ?? {}), logMessages, err: null } } as ParsedTransactionWithMeta
}

describe('buyDetector — degraded mode (#39)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('degraded poll: polls each watched mint with until=lastSeenSig, parses new signatures oldest→newest, and enqueues SellJobs', async () => {
    vi.useFakeTimers()
    const cache = makeCache([makeFeature()]) // watched: MINT_WATCHED
    const { factory } = makeWsFactory()
    const queue = makeFakeQueue()

    // getSignaturesForAddress returns newest → oldest.
    const fetchSignaturesForMint = vi.fn().mockResolvedValue([
      { signature: 'sig-new-2', err: null },
      { signature: 'sig-new-1', err: null },
    ])
    const fetchTx = vi.fn().mockResolvedValue(makeDegradedTx())
    const parser = vi.fn().mockImplementation((logs: Logs) => makeBuy(DexProgramId.PUMP_FUN_BC, logs.signature))

    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, parser]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx,
      fetchSignaturesForMint,
      redis: makeFakeRedis(),
      sellQueue: queue,
    })

    await bd.start()
    await vi.advanceTimersByTimeAsync(36_000) // WS silent → degraded → first poll

    // First poll has no cursor yet for this mint.
    expect(fetchSignaturesForMint).toHaveBeenCalledWith(MINT_WATCHED, { until: undefined })
    // Processed oldest → newest (the page is reversed before the pipeline runs).
    expect(queue.added.map((j: any) => j.triggerSignature)).toEqual(['sig-new-1', 'sig-new-2'])

    await bd.stop()
  })

  it('skips failed signatures and re-uses the same parser→matcher→enqueuer pipeline', async () => {
    vi.useFakeTimers()
    const cache = makeCache([makeFeature()])
    const { factory } = makeWsFactory()
    const queue = makeFakeQueue()

    const fetchSignaturesForMint = vi.fn().mockResolvedValue([
      { signature: 'sig-ok', err: null },
      { signature: 'sig-failed', err: { InstructionError: [0, 'Custom'] } },
    ])
    const fetchTx = vi.fn().mockResolvedValue(makeDegradedTx())
    const parser = vi.fn().mockImplementation((logs: Logs) => makeBuy(DexProgramId.PUMP_FUN_BC, logs.signature))

    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, parser]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx,
      fetchSignaturesForMint,
      redis: makeFakeRedis(),
      sellQueue: queue,
    })

    await bd.start()
    await vi.advanceTimersByTimeAsync(36_000)

    // The failed signature is never fetched or enqueued.
    expect(fetchTx).toHaveBeenCalledTimes(1)
    expect(fetchTx).toHaveBeenCalledWith('sig-ok')
    expect(queue.added.map((j: any) => j.triggerSignature)).toEqual(['sig-ok'])

    await bd.stop()
  })

  it('does not re-enqueue a signature already emitted in primary mode (cross-mode dedup)', async () => {
    vi.useFakeTimers()
    const cache = makeCache([makeFeature()])
    const { factory, emit } = makeWsFactory()
    const queue = makeFakeQueue()
    const redis = makeFakeRedis() // one dedup store spans both modes

    const parser = vi.fn().mockImplementation((logs: Logs) => makeBuy(DexProgramId.PUMP_FUN_BC, logs.signature))
    const fetchTx = vi.fn().mockResolvedValue(makeDegradedTx())
    // Degraded poll surfaces the very signature primary mode already handled.
    const fetchSignaturesForMint = vi.fn().mockResolvedValue([{ signature: 'sig-overlap', err: null }])

    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, parser]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx,
      fetchSignaturesForMint,
      redis,
      sellQueue: queue,
    })

    await bd.start()

    // Primary mode handles sig-overlap once.
    emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], {
      err: null,
      logs: [`Program log: ${MINT_WATCHED}`],
      signature: 'sig-overlap',
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(queue.added).toHaveLength(1)

    // Fall silent → degraded poll re-surfaces sig-overlap → dedup short-circuits.
    await vi.advanceTimersByTimeAsync(36_000)
    expect(queue.added).toHaveLength(1)

    await bd.stop()
  })

  it('getStatus().mode flips primary→degraded→primary and emits the buy-detector.mode gauge', async () => {
    vi.useFakeTimers()
    const cache = makeCache([])
    const { factory, emit } = makeWsFactory()
    const modes: Array<'primary' | 'degraded' | 'stopped'> = []

    const bd = new BuyDetector({
      cache,
      parsers: [[DexProgramId.PUMP_FUN_BC, () => null]],
      programs: [DexProgramId.PUMP_FUN_BC],
      wsClientFactory: factory,
      wsUrl: 'wss://x',
      fetchTx: async () => null,
      fetchSignaturesForMint: async () => [],
      redis: makeFakeRedis(),
      sellQueue: makeFakeQueue(),
      metrics: { observeDetectionToEnqueueMs: () => {}, setMode: m => modes.push(m) },
    })

    await bd.start()
    expect(bd.getStatus().mode).toBe('primary')

    await vi.advanceTimersByTimeAsync(36_000)
    expect(bd.getStatus().mode).toBe('degraded')

    emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], { err: null, logs: [], signature: 'sig-back' })
    await vi.advanceTimersByTimeAsync(0)
    expect(bd.getStatus().mode).toBe('primary')

    expect(modes).toEqual(['degraded', 'primary'])

    await bd.stop()
    expect(bd.getStatus().mode).toBe('stopped')
  })
})
