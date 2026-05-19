import type { SellJobData } from '#root/queue/types.js'

import type { Match } from './matcher.js'

/**
 * Dedup seam — `claim(key)` returns `true` the first time it's invoked for a
 * given key and `false` on every subsequent call for the dedup window. In
 * production this is a Redis `SET NX dedup:{signature} EX 300`.
 */
export interface DedupStore {
  claim: (key: string) => Promise<boolean>
}

/** Queue seam — production wires the BullMQ sell-execution queue here. */
export interface SellQueue {
  add: (job: SellJobData) => Promise<void>
}

/**
 * Metrics seam — production wires a Prometheus histogram here. Stays a tiny
 * dependency-free interface so tests can record observations in a plain array.
 */
export interface MetricsRecorder {
  observeDetectionToEnqueueMs: (ms: number) => void
}

export interface EnqueuerDeps {
  dedup: DedupStore
  queue: SellQueue
  metrics?: MetricsRecorder
  now?: () => number
}

/** Slice of ioredis the production dedup wrapper needs. */
export interface RedisSetExClient {
  set: (key: string, value: string, mode: 'EX', ttl: number, flag: 'NX') => Promise<unknown>
}

/**
 * Builds a `DedupStore` backed by `SET NX dedup:{key} EX 300`.
 * ttlSeconds defaults to 300 (5 min) per ADR-0001.
 */
export function createRedisDedupStore(
  redis: RedisSetExClient,
  ttlSeconds = 300,
): DedupStore {
  return {
    async claim(key) {
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX')
      return result === 'OK'
    },
  }
}

export interface EnqueueInput {
  triggerSignature: string
  matches: Match[]
  /**
   * Wall-clock timestamp (ms) when the underlying log notification was
   * received. Used to record the `detection_to_enqueue_ms` histogram.
   */
  detectionStartedAtMs?: number
}

/**
 * One enqueuer instance per BuyDetector. Given a list of matches for one
 * trigger signature, dedupes once per signature and emits a fully-resolved
 * `SellJob` per match.
 *
 * See ADR-0002 decision 1 (Shape A) — the payload carries everything the
 * executor needs; no downstream cache reads.
 */
export function makeEnqueuer(deps: EnqueuerDeps) {
  const now = deps.now ?? (() => Date.now())
  return async function enqueue(input: EnqueueInput): Promise<void> {
    if (input.matches.length === 0)
      return

    const fresh = await deps.dedup.claim(`dedup:${input.triggerSignature}`)
    if (!fresh)
      return

    for (const match of input.matches) {
      const job: SellJobData = {
        schemaVersion: 1,
        featureId: match.feature.featureId,
        triggerSignature: input.triggerSignature,
        mint: match.feature.mint,
        mainWalletPubkey: match.feature.mainWalletPubkey,
        sellPercentage: match.sellPercentage,
        configSnapshot: match.feature.config,
        buyAmountSol: match.buyAmountSol,
        referralSnapshot: match.feature.referralSnapshot,
      }
      await deps.queue.add(job)
      if (deps.metrics && input.detectionStartedAtMs !== undefined)
        deps.metrics.observeDetectionToEnqueueMs(now() - input.detectionStartedAtMs)
    }
  }
}
