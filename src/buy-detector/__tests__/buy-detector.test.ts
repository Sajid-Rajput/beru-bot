import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'

import type { ProjectFeatureConfig } from '../watched-feature-cache.js'

import { LAMPORTS_PER_SOL } from '#root/utils/constants.js'
import { DEX_PROGRAM_IDS, DexProgramId } from '#root/utils/dex-programs.js'
import { describe, expect, it, vi } from 'vitest'

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

interface FakeWs {
  emit: (logs: Logs) => void
  closeCalls: number
}

function makeWsFactory() {
  let current: FakeWs | null = null
  const factory = () => {
    const state = { closeCalls: 0 } as FakeWs
    let listener: ((logs: Logs) => void) | null = null
    state.emit = (logs) => {
      listener?.(logs)
    }
    current = state
    return {
      subscribeLogs: async (_pid: string, onLogs: (logs: Logs) => void) => {
        listener = onLogs
        return {
          close: async () => {
            state.closeCalls += 1
            listener = null
          },
        }
      },
    }
  }
  return { factory, ws: () => current! }
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buyDetector', () => {
  it('drops a log notification silently when no watched mint is mentioned', async () => {
    const cache = makeCache([makeFeature()]) // watched: MINT_WATCHED
    const { factory, ws } = makeWsFactory()
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
    ws().emit({
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
    const { factory, ws } = makeWsFactory()
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
    ws().emit({
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
    const { factory, ws } = makeWsFactory()
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
    ws().emit({
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
    const { factory, ws } = makeWsFactory()

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

    expect(ws().closeCalls).toBe(1)
    expect(stopSpy).toHaveBeenCalled()
  })

  // Touch DEX_PROGRAM_IDS so the linter knows the helper is used at runtime
  void DEX_PROGRAM_IDS
})
