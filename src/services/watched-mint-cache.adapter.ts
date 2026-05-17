import type { db as DrizzleDb } from '#root/db/index.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import type {
  ProjectFeatureConfig,
  WatchChannel,
  WatchedMintCacheDeps,
  WatchPayload,
} from './watched-mint-cache.js'

import { projectFeatures, projects } from '#root/db/schema/index.js'
import { createLogger } from '#root/utils/logger.js'
import { and, eq, isNull } from 'drizzle-orm'

const log = createLogger('WatchedMintCache.adapter')

// ── Pub/sub seam ─────────────────────────────────────────────────────────────

/**
 * The slice of ioredis the subscriber wrapper consumes. Keeping the surface
 * tiny lets us unit-test with a fake EventEmitter and avoid an integration
 * dep on a real Redis in CI.
 */
export interface RedisSubscriber {
  subscribe: (channel: string) => Promise<unknown>
  unsubscribe: (channel: string) => Promise<unknown>
  on: (event: 'message', listener: (channel: string, message: string) => void) => unknown
  off?: (event: 'message', listener: (channel: string, message: string) => void) => unknown
}

/**
 * Builds the `subscribe` seam that `WatchedMintCache` expects, on top of an
 * ioredis subscriber connection. Responsibilities:
 *   - Issue Redis SUBSCRIBE for the channel.
 *   - Parse incoming messages as JSON; drop messages with bad shape (logged).
 *   - Return an unsubscribe fn that detaches the listener and UNSUBSCRIBEs.
 */
export function createWatchPubSubSubscriber(
  subscriber: RedisSubscriber,
): WatchedMintCacheDeps['subscribe'] {
  return async (channel, handler) => {
    await subscriber.subscribe(channel)

    const listener = (incomingChannel: string, raw: string) => {
      if (incomingChannel !== channel)
        return
      const payload = parsePayload(raw)
      if (!payload) {
        log.warn({ channel, raw }, 'discarded malformed pub/sub payload')
        return
      }
      try {
        const result = handler(payload)
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).catch(err =>
            log.error({ err, channel, payload }, 'handler rejected on pub/sub message'),
          )
        }
      }
      catch (err) {
        log.error({ err, channel, payload }, 'handler threw on pub/sub message')
      }
    }

    subscriber.on('message', listener)

    return async () => {
      subscriber.off?.('message', listener)
      await subscriber.unsubscribe(channel)
    }
  }
}

function parsePayload(raw: string): WatchPayload | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (typeof value !== 'object' || value === null)
    return null
  const obj = value as Record<string, unknown>
  if (typeof obj.mint !== 'string' || typeof obj.featureId !== 'string')
    return null
  return { mint: obj.mint, featureId: obj.featureId }
}

// ── DB seams ─────────────────────────────────────────────────────────────────

type Db = typeof DrizzleDb

/**
 * Loader for the cache — returns every currently-watched Project Feature
 * joined to its owning Project so the cache value carries projectId + userId.
 */
export function createWatchedFeatureLoader(
  db: Db,
): () => Promise<ProjectFeatureConfig[]> {
  return async () => {
    const rows = await db
      .select({
        featureId: projectFeatures.id,
        projectId: projectFeatures.projectId,
        userId: projects.userId,
        mint: projects.tokenMint,
        config: projectFeatures.config,
      })
      .from(projectFeatures)
      .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
      .where(and(eq(projectFeatures.isWatchingTransactions, true), isNull(projects.deletedAt)))

    return rows.map(r => ({
      featureId: r.featureId,
      projectId: r.projectId,
      userId: r.userId,
      mint: r.mint,
      config: r.config as ShadowSellConfig,
    }))
  }
}

/**
 * Single-row fetcher — invoked by the cache on `watch:add` to materialise a
 * feature that the loader has not yet observed.
 */
export function createWatchedFeatureFetcher(
  db: Db,
): (featureId: string) => Promise<ProjectFeatureConfig | undefined> {
  return async (featureId) => {
    const [row] = await db
      .select({
        featureId: projectFeatures.id,
        projectId: projectFeatures.projectId,
        userId: projects.userId,
        mint: projects.tokenMint,
        config: projectFeatures.config,
      })
      .from(projectFeatures)
      .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
      .where(and(eq(projectFeatures.id, featureId), isNull(projects.deletedAt)))
      .limit(1)

    if (!row)
      return undefined

    return {
      featureId: row.featureId,
      projectId: row.projectId,
      userId: row.userId,
      mint: row.mint,
      config: row.config as ShadowSellConfig,
    }
  }
}

// Re-export the channel union for convenience at the wiring layer.
export type { WatchChannel }
