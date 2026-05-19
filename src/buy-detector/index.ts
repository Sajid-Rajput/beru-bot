import type { DexProgramId } from '#root/utils/dex-programs.js'

import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'
import type { DedupStore, MetricsRecorder, RedisSetExClient, SellQueue } from './enqueuer.js'
import type { Parser } from './parsers/index.js'
import type { WsClientFactory } from './subscription-manager.js'

import type { WatchedFeatureCache } from './watched-feature-cache.js'
import { createLogger } from '#root/utils/logger.js'

import { createRedisDedupStore, makeEnqueuer } from './enqueuer.js'
import { matchBuy } from './matcher.js'
import { ParserRegistry } from './parsers/index.js'
import { SubscriptionManager } from './subscription-manager.js'

const log = createLogger('BuyDetector')

/**
 * RPC seam — the BuyDetector calls this on every log notification that
 * mentions a watched mint, to materialise the matching parsed transaction
 * for the per-DEX parser. Returns `null` when the tx cannot be fetched (the
 * notification is then dropped silently — recovery is a sibling concern).
 */
export type FetchParsedTransaction = (
  signature: string,
) => Promise<ParsedTransactionWithMeta | null>

export interface BuyDetectorDeps {
  cache: WatchedFeatureCache
  parsers: ReadonlyArray<readonly [DexProgramId, Parser]>
  programs: DexProgramId[]
  wsClientFactory: WsClientFactory
  wsUrl: string
  fetchTx: FetchParsedTransaction
  redis: RedisSetExClient
  sellQueue: SellQueue
  metrics?: MetricsRecorder
  now?: () => number
  /** Overrides the default Redis-backed dedup store. Test-only. */
  dedup?: DedupStore
}

export type BuyDetectorMode = 'primary'

export interface BuyDetectorStatus {
  mode: BuyDetectorMode
  subscriptions: DexProgramId[]
  lastLogAtMs: Record<string, number | null>
}

/**
 * The Buy Detector facade.
 *
 * Wires the parser registry, WS subscription manager, the per-program log
 * dispatcher, the matcher, and the enqueuer behind a single small surface:
 * `start()`, `stop()`, `getStatus()`. Internal collaborators are not
 * exported (ADR-0003 decision 1).
 *
 * Hot path on a log notification:
 *   1. `SubscriptionManager` stamps `lastLogAtMs` and forwards to dispatch.
 *   2. Dispatch returns early if no watched mint substring appears in the log.
 *   3. Otherwise `fetchTx(signature)` materialises the parsed transaction.
 *   4. `ParserRegistry.get(programId)` returns the per-DEX parser; `null`
 *      results are dropped silently.
 *   5. `matchBuy(buy, cache.get(mint))` produces matches with resolved
 *      `sellPercentage`s.
 *   6. The enqueuer dedupes by `triggerSignature` and pushes a fully
 *      resolved `SellJob` to the sell queue.
 */
export class BuyDetector {
  private readonly registry = new ParserRegistry()
  private readonly subscriptionManager: SubscriptionManager
  private readonly enqueue: ReturnType<typeof makeEnqueuer>
  private readonly now: () => number

  constructor(private readonly deps: BuyDetectorDeps) {
    for (const [programId, parser] of deps.parsers)
      this.registry.register(programId, parser)

    this.now = deps.now ?? (() => Date.now())

    this.enqueue = makeEnqueuer({
      dedup: deps.dedup ?? createRedisDedupStore(deps.redis),
      queue: deps.sellQueue,
      metrics: deps.metrics,
      now: this.now,
    })

    this.subscriptionManager = new SubscriptionManager({
      url: deps.wsUrl,
      wsClientFactory: deps.wsClientFactory,
      onLogs: (programId, logs) => this.dispatch(programId, logs),
      now: this.now,
    })
  }

  async start(): Promise<void> {
    await this.deps.cache.start()
    await this.subscriptionManager.start(this.deps.programs)
  }

  async stop(): Promise<void> {
    await this.subscriptionManager.stop()
    await this.deps.cache.stop()
  }

  getStatus(): BuyDetectorStatus {
    return {
      mode: 'primary',
      subscriptions: [...this.deps.programs],
      lastLogAtMs: this.subscriptionManager.getStatus().lastLogAtMs,
    }
  }

  private dispatch(programId: DexProgramId, logs: Logs): void {
    const detectionStartedAtMs = this.now()
    if (!this.touchesWatchedMint(logs))
      return

    void this.handleLogs(programId, logs, detectionStartedAtMs).catch((err) => {
      log.error({ err, signature: logs.signature, programId }, 'dispatch failed')
    })
  }

  private touchesWatchedMint(logs: Logs): boolean {
    const mints = this.deps.cache.getAllMints()
    if (mints.length === 0)
      return false
    for (const line of logs.logs) {
      for (const mint of mints) {
        if (line.includes(mint))
          return true
      }
    }
    return false
  }

  private async handleLogs(
    programId: DexProgramId,
    logs: Logs,
    detectionStartedAtMs: number,
  ): Promise<void> {
    const parser = this.registry.get(programId)
    if (!parser)
      return

    const tx = await this.deps.fetchTx(logs.signature)
    if (!tx)
      return

    const buy = parser(logs, tx)
    if (!buy)
      return

    const entries = this.deps.cache.get(buy.mint)
    if (!entries || entries.length === 0)
      return

    const matches = matchBuy(buy, entries)
    if (matches.length === 0)
      return

    await this.enqueue({
      triggerSignature: buy.signature,
      matches,
      detectionStartedAtMs,
    })
  }
}

export type { Parser } from './parsers/index.js'
export { ParserRegistry } from './parsers/index.js'
