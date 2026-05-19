import type { db as DrizzleDb } from '#root/db/index.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import type {
  CacheChannel,
  ChannelPayloadMap,
  ProjectFeatureConfig,
  ReferralChangedPayload,
  ReferralSnapshot,
  WatchChannel,
  WatchedFeatureCacheDeps,
  WatchPayload,
} from './watched-feature-cache.js'

import { projectFeatures, projects, referrals, wallets } from '#root/db/schema/index.js'
import { REFERRAL_TIER1_PCT, REFERRAL_TIER2_PCT } from '#root/utils/constants.js'
import { createLogger } from '#root/utils/logger.js'
import { and, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

const log = createLogger('WatchedFeatureCache.adapter')

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
 * Builds the `subscribe` seam that `WatchedFeatureCache` expects, on top of an
 * ioredis subscriber connection. Responsibilities:
 *   - Issue Redis SUBSCRIBE for the channel.
 *   - Parse incoming messages as JSON; drop messages with bad shape (logged).
 *   - Return an unsubscribe fn that detaches the listener and UNSUBSCRIBEs.
 */
export function createWatchPubSubSubscriber(
  subscriber: RedisSubscriber,
): WatchedFeatureCacheDeps['subscribe'] {
  return async <C extends CacheChannel>(
    channel: C,
    handler: (payload: ChannelPayloadMap[C]) => Promise<void> | void,
  ) => {
    await subscriber.subscribe(channel)

    const listener = (incomingChannel: string, raw: string) => {
      if (incomingChannel !== channel)
        return
      const payload = parsePayload(channel, raw)
      if (!payload) {
        log.warn({ channel, raw }, 'discarded malformed pub/sub payload')
        return
      }
      try {
        const result = handler(payload as ChannelPayloadMap[C])
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

function parsePayload(channel: CacheChannel, raw: string): ChannelPayloadMap[CacheChannel] | null {
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
  if (channel === 'referral:changed')
    return parseReferralChanged(obj)
  return parseWatch(obj)
}

function parseWatch(obj: Record<string, unknown>): WatchPayload | null {
  if (typeof obj.mint !== 'string' || typeof obj.featureId !== 'string')
    return null
  return { mint: obj.mint, featureId: obj.featureId }
}

function parseReferralChanged(obj: Record<string, unknown>): ReferralChangedPayload | null {
  if (typeof obj.userId !== 'string')
    return null
  return { userId: obj.userId }
}

// ── DB seams ─────────────────────────────────────────────────────────────────

type Db = typeof DrizzleDb

interface FeatureRow {
  featureId: string
  projectId: string
  userId: string
  mint: string
  mainWalletPubkey: string
  config: unknown
  tier1ReferrerId: string | null
  tier2ReferrerId: string | null
}

function buildReferralSnapshot(row: Pick<FeatureRow, 'tier1ReferrerId' | 'tier2ReferrerId'>): ReferralSnapshot {
  return {
    tier1: row.tier1ReferrerId === null
      ? null
      : { userId: row.tier1ReferrerId, sharePct: REFERRAL_TIER1_PCT },
    tier2: row.tier2ReferrerId === null
      ? null
      : { userId: row.tier2ReferrerId, sharePct: REFERRAL_TIER2_PCT },
  }
}

function mapRow(row: FeatureRow): ProjectFeatureConfig {
  return {
    featureId: row.featureId,
    projectId: row.projectId,
    userId: row.userId,
    mint: row.mint,
    mainWalletPubkey: row.mainWalletPubkey,
    config: row.config as ShadowSellConfig,
    referralSnapshot: buildReferralSnapshot(row),
  }
}

/**
 * Loader for the cache — returns every currently-watched Project Feature
 * joined to its owning Project plus the owner's tier-1/tier-2 referrer chain.
 * The referrer columns can be null (LEFT JOIN); the mapper turns nulls into
 * `tier1: null` / `tier2: null` on the snapshot.
 */
export function createWatchedFeatureLoader(
  db: Db,
): () => Promise<ProjectFeatureConfig[]> {
  return async () => {
    const tier1Ref = alias(referrals, 'tier1_ref')
    const tier2Ref = alias(referrals, 'tier2_ref')

    const rows = await db
      .select({
        featureId: projectFeatures.id,
        projectId: projectFeatures.projectId,
        userId: projects.userId,
        mint: projects.tokenMint,
        mainWalletPubkey: wallets.publicKey,
        config: projectFeatures.config,
        tier1ReferrerId: tier1Ref.referrerId,
        tier2ReferrerId: tier2Ref.referrerId,
      })
      .from(projectFeatures)
      .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
      .innerJoin(wallets, eq(wallets.id, projects.walletId))
      .leftJoin(tier1Ref, and(eq(tier1Ref.referredId, projects.userId), eq(tier1Ref.tier, 1)))
      .leftJoin(tier2Ref, and(eq(tier2Ref.referredId, projects.userId), eq(tier2Ref.tier, 2)))
      .where(and(eq(projectFeatures.isWatchingTransactions, true), isNull(projects.deletedAt)))

    return rows.map(mapRow)
  }
}

/**
 * Single-row fetcher — invoked by the cache on `watch:add` to materialise a
 * feature that the loader has not yet observed. Returns the same widened shape
 * as the loader so cache entries are interchangeable regardless of provenance.
 */
export function createWatchedFeatureFetcher(
  db: Db,
): (featureId: string) => Promise<ProjectFeatureConfig | undefined> {
  return async (featureId) => {
    const tier1Ref = alias(referrals, 'tier1_ref')
    const tier2Ref = alias(referrals, 'tier2_ref')

    const [row] = await db
      .select({
        featureId: projectFeatures.id,
        projectId: projectFeatures.projectId,
        userId: projects.userId,
        mint: projects.tokenMint,
        mainWalletPubkey: wallets.publicKey,
        config: projectFeatures.config,
        tier1ReferrerId: tier1Ref.referrerId,
        tier2ReferrerId: tier2Ref.referrerId,
      })
      .from(projectFeatures)
      .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
      .innerJoin(wallets, eq(wallets.id, projects.walletId))
      .leftJoin(tier1Ref, and(eq(tier1Ref.referredId, projects.userId), eq(tier1Ref.tier, 1)))
      .leftJoin(tier2Ref, and(eq(tier2Ref.referredId, projects.userId), eq(tier2Ref.tier, 2)))
      .where(and(eq(projectFeatures.id, featureId), isNull(projects.deletedAt)))
      .limit(1)

    if (!row)
      return undefined

    return mapRow(row)
  }
}

// Re-export the channel union for convenience at the wiring layer.
export type { WatchChannel }
