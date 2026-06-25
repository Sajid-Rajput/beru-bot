import type { DexProgramId } from '#root/utils/dex-programs.js'

import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'
import type { DedupStore, MetricsRecorder, RedisSetExClient, SellQueue } from './enqueuer.js'
import type { BuyEvent, Parser } from './parsers/index.js'
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

/** Minimal projection of `ConfirmedSignatureInfo` the degraded poll consumes. */
export interface PolledSignatureInfo {
  signature: string
  err: unknown | null
}

/**
 * Degraded-mode RPC seam (#39) — wraps `SolanaRpcService.getSignaturesForAddress`.
 * Returns the mint's signatures newest→oldest; `until` is the last signature the
 * detector has already processed for that mint, so each poll only pulls the new
 * tail. Bounded to ~30–60 s of missed slots per ADR-0001.
 */
export type FetchSignaturesForMint = (
  mint: string,
  options: { until?: string },
) => Promise<PolledSignatureInfo[]>

export interface BuyDetectorDeps {
  cache: WatchedFeatureCache
  parsers: ReadonlyArray<readonly [DexProgramId, Parser]>
  programs: DexProgramId[]
  wsClientFactory: WsClientFactory
  wsUrl: string
  fetchTx: FetchParsedTransaction
  /** Degraded-mode signature poll. Defaults to a no-op (no backfill). */
  fetchSignaturesForMint?: FetchSignaturesForMint
  redis: RedisSetExClient
  sellQueue: SellQueue
  metrics?: MetricsRecorder
  now?: () => number
  /** Overrides the default Redis-backed dedup store. Test-only. */
  dedup?: DedupStore
}

export type BuyDetectorMode = 'primary' | 'degraded' | 'stopped'

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
  /** Newest signature already processed per mint — the degraded poll's `until` cursor. */
  private readonly lastSeenSig = new Map<string, string>()

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
      degradedPoll: () => this.degradedPoll(),
      onModeChange: mode => deps.metrics?.setMode?.(mode),
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
    const { mode, lastLogAtMs } = this.subscriptionManager.getStatus()
    return {
      mode,
      subscriptions: [...this.deps.programs],
      lastLogAtMs,
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

    // Record the cursor the degraded poll will resume from if the WS dies.
    this.lastSeenSig.set(buy.mint, buy.signature)
    await this.processBuy(buy, detectionStartedAtMs)
  }

  /**
   * Degraded-mode poll cycle (#39), driven by the SubscriptionManager when the
   * WS falls silent. For each Watched Mint, pulls the new signature tail via
   * `getSignaturesForAddress({ until })` and replays it through the SAME
   * parse → match → enqueue pipeline as primary mode. The Redis `SET NX` dedup
   * absorbs any overlap with WS notifications across the mode boundary.
   */
  private async degradedPoll(): Promise<void> {
    const fetchSignatures = this.deps.fetchSignaturesForMint
    if (!fetchSignatures)
      return

    for (const mint of this.deps.cache.getAllMints()) {
      const until = this.lastSeenSig.get(mint)
      const sigs = await fetchSignatures(mint, { until })
      if (sigs.length === 0)
        continue

      // getSignaturesForAddress returns newest → oldest; replay oldest → newest
      // so the pipeline sees buys in chain order, then advance the cursor.
      for (let i = sigs.length - 1; i >= 0; i--) {
        if (sigs[i].err != null)
          continue
        await this.pollOne(sigs[i].signature)
      }
      this.lastSeenSig.set(mint, sigs[0].signature)
    }
  }

  /**
   * Materialise one polled signature into the pipeline. The WS `Logs` object is
   * synthesised from the fetched transaction's `meta` (log lines + err), so the
   * existing per-DEX parsers run unchanged. Polling-by-mint loses the DEX, so
   * each registered parser is tried and the first non-null decode wins.
   */
  private async pollOne(signature: string): Promise<void> {
    const detectionStartedAtMs = this.now()
    const tx = await this.deps.fetchTx(signature)
    if (!tx)
      return

    const logs: Logs = {
      signature,
      err: tx.meta?.err ?? null,
      logs: tx.meta?.logMessages ?? [],
    }

    for (const [programId] of this.deps.parsers) {
      const buy = this.registry.get(programId)?.(logs, tx)
      if (buy) {
        await this.processBuy(buy, detectionStartedAtMs)
        return
      }
    }
  }

  /** Shared match → enqueue tail for both primary dispatch and degraded polling. */
  private async processBuy(buy: BuyEvent, detectionStartedAtMs: number): Promise<void> {
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
