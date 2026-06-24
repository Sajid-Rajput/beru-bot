import type { WatchPayload } from '#root/buy-detector/watched-feature-cache.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import type { NotificationJob } from '#root/queue/types.js'
import type { Logger } from '#root/utils/logger.js'

/**
 * MarketCapMonitorWorker — pure processor (issue #23, ARCHITECTURE §6.5).
 *
 * Polls market-cap data for active Project Features and drives the watch-state
 * FSM: activate `pending → watching` when MCAP reaches the per-feature target,
 * pause `watching → pending` when it drops below the hysteresis floor. State
 * changes are pushed to the worker's WatchedFeatureCache via Redis pub/sub
 * (`watch:add` / `watch:remove`) and surfaced to the user via a `feature.state`
 * Notification job. No QuickNode KV / Stream control (deleted in ADR-0001).
 *
 * This module is a pure function over injected seams — the BullMQ + adapter
 * wiring lives in `market-cap-monitor.worker.ts`.
 */

// ── Domain types ─────────────────────────────────────────────────────────────

export type FeatureStatus =
  | 'idle'
  | 'pending'
  | 'watching'
  | 'executing'
  | 'completed'
  | 'stopped'
  | 'error'

/**
 * A Project Feature projected with everything the monitor needs to evaluate a
 * transition AND render the pinned-status notification without a second DB hit.
 */
export interface MonitorFeature {
  featureId: string
  projectId: string
  userId: string
  mint: string
  status: FeatureStatus
  isWatching: boolean
  config: ShadowSellConfig
  tokenName: string
  tokenSymbol: string
  totalSellCount: number
  totalSolReceived: string
  totalSoldAmount: string
  pinnedMessageId: number | null
}

// ── Seam interfaces (one per collaborator) ───────────────────────────────────

export interface LockSeam {
  /** `SET NX` with a TTL. Resolves true when the lock was acquired. */
  acquire: (key: string, ttlSeconds: number) => Promise<boolean>
  release: (key: string) => Promise<void>
}

export interface FeatureRepoSeam {
  /** Features in an active status (`pending`, `watching`, `executing`). */
  findActive: () => Promise<MonitorFeature[]>
  /** Features with `is_watching = true` (cold-loop safety net). */
  findWatching: () => Promise<MonitorFeature[]>
  setWatching: (featureId: string, watching: boolean) => Promise<void>
  updateStatus: (featureId: string, status: FeatureStatus) => Promise<void>
  updateLastMarketCap: (featureId: string, mcapUsd: number) => Promise<void>
}

export interface MarketCapSeam {
  /** Current fully-diluted market cap in USD, or null when unavailable. */
  getMarketCapUsd: (mint: string) => Promise<number | null>
}

export interface WatchEventSeam {
  publishWatchAdd: (payload: WatchPayload) => Promise<boolean>
  publishWatchRemove: (payload: WatchPayload) => Promise<boolean>
}

export interface NotificationSeam {
  enqueue: (job: NotificationJob) => Promise<void>
}

export interface MonitorDeps {
  lock: LockSeam
  features: FeatureRepoSeam
  marketCap: MarketCapSeam
  watchEvents: WatchEventSeam
  notifications: NotificationSeam
  logger: Logger
}

export interface MonitorConfig {
  /** Redis single-flight lock key (invariant 17). */
  lockKey: string
  lockTtlSeconds: number
}

export interface HotCycleResult {
  /** False when the lock was already held (cycle skipped). */
  ranCycle: boolean
  evaluated: number
  activated: number
  paused: number
}

// ── Transition decision (pure) ───────────────────────────────────────────────

export type Transition = 'activate' | 'pause' | 'none'

/**
 * Decide the watch-state transition for one feature given its freshly-polled
 * market cap. Activation fires at `mcap >= target`; pausing only fires once
 * MCAP drops below `target × (1 - hysteresis%)`, leaving a sticky band between
 * the two that prevents flapping (G12 / §6.5). `target <= 0` disables the gate.
 */
export function evaluateTransition(feature: MonitorFeature, mcapUsd: number): Transition {
  const target = feature.config.targetMarketCapUsd
  if (target <= 0)
    return 'none'
  if (feature.status === 'pending' && mcapUsd >= target)
    return 'activate'
  if (feature.status === 'watching' && mcapUsd < target * (1 - feature.config.hysteresisPercentage / 100))
    return 'pause'
  return 'none'
}

// ── Hot cycle ────────────────────────────────────────────────────────────────

function featureStateNotification(
  feature: MonitorFeature,
  newState: 'watching' | 'paused',
): NotificationJob {
  return {
    userId: feature.userId,
    kind: 'feature.state',
    context: {
      newState,
      pinnedMessageId: feature.pinnedMessageId,
      projectId: feature.projectId,
      tokenName: feature.tokenName,
      tokenSymbol: feature.tokenSymbol,
      tokenMint: feature.mint,
      config: {
        minSellPercentage: feature.config.minSellPercentage,
        maxSellPercentage: feature.config.maxSellPercentage,
        targetMarketCapUsd: feature.config.targetMarketCapUsd,
        minBuyAmountSol: feature.config.minBuyAmountSol,
      },
      totalSellCount: feature.totalSellCount,
      totalSolReceived: feature.totalSolReceived,
      totalSoldAmount: feature.totalSoldAmount,
    },
  }
}

async function activate(deps: MonitorDeps, feature: MonitorFeature): Promise<void> {
  // DB is the durable truth; flip it before publishing the fast pub/sub notify.
  await deps.features.setWatching(feature.featureId, true)
  await deps.features.updateStatus(feature.featureId, 'watching')
  await deps.watchEvents.publishWatchAdd({ mint: feature.mint, featureId: feature.featureId })
  await deps.notifications.enqueue(featureStateNotification(feature, 'watching'))
}

async function pause(deps: MonitorDeps, feature: MonitorFeature): Promise<void> {
  await deps.features.setWatching(feature.featureId, false)
  await deps.features.updateStatus(feature.featureId, 'pending')
  await deps.watchEvents.publishWatchRemove({ mint: feature.mint, featureId: feature.featureId })
  await deps.notifications.enqueue(featureStateNotification(feature, 'paused'))
}

/**
 * One hot-loop pass (every 30s): poll MCAP for every active feature and apply
 * any state transition. Guarded by a Redis single-flight lock (invariant 17).
 */
export async function runHotCycle(deps: MonitorDeps, config: MonitorConfig): Promise<HotCycleResult> {
  const acquired = await deps.lock.acquire(config.lockKey, config.lockTtlSeconds)
  if (!acquired)
    return { ranCycle: false, evaluated: 0, activated: 0, paused: 0 }

  let activated = 0
  let paused = 0
  let evaluated = 0
  try {
    const features = await deps.features.findActive()
    evaluated = features.length
    for (const feature of features) {
      // Isolate per-feature failures: a single bad mint (DB hiccup, unexpected
      // throw) must not starve the rest of the cycle. DexScreener's own errors
      // already surface as a null MCAP and are handled below.
      try {
        const mcapUsd = await deps.marketCap.getMarketCapUsd(feature.mint)
        if (mcapUsd === null)
          continue

        const transition = evaluateTransition(feature, mcapUsd)
        if (transition === 'activate') {
          await activate(deps, feature)
          activated++
        }
        else if (transition === 'pause') {
          await pause(deps, feature)
          paused++
        }

        await deps.features.updateLastMarketCap(feature.featureId, mcapUsd)
      }
      catch (err) {
        deps.logger.warn({ err, featureId: feature.featureId, mint: feature.mint }, 'monitor: feature evaluation failed; skipping')
      }
    }
  }
  finally {
    await deps.lock.release(config.lockKey)
  }

  return { ranCycle: true, evaluated, activated, paused }
}

// ── Cold cycle ───────────────────────────────────────────────────────────────

export interface ColdCycleResult {
  ranCycle: boolean
  republished: number
}

/**
 * One cold-loop pass (every 5 min): re-broadcast `watch:add` for the full set
 * of `is_watching = true` features. With QuickNode KV gone (ADR-0001) the cold
 * loop is purely a safety net against a lost `watch:add` pub/sub message — the
 * worker's WatchedFeatureCache reconciles drift independently every 60s, so
 * re-publishing is idempotent (the cache dedups by featureId). Shares the same
 * single-flight lock as the hot loop so the two never overlap (invariant 17).
 */
export async function runColdCycle(deps: MonitorDeps, config: MonitorConfig): Promise<ColdCycleResult> {
  const acquired = await deps.lock.acquire(config.lockKey, config.lockTtlSeconds)
  if (!acquired)
    return { ranCycle: false, republished: 0 }

  let republished = 0
  try {
    const watching = await deps.features.findWatching()
    for (const feature of watching) {
      await deps.watchEvents.publishWatchAdd({ mint: feature.mint, featureId: feature.featureId })
      republished++
    }
  }
  finally {
    await deps.lock.release(config.lockKey)
  }

  return { ranCycle: true, republished }
}
