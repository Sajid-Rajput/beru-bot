import type { db as DrizzleDb } from '#root/db/index.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import type { NotificationJob } from '#root/queue/types.js'
import type { DexscreenerService } from '#root/services/dexscreener.service.js'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type {
  FeatureRepoSeam,
  FeatureStatus,
  LockSeam,
  MarketCapSeam,
  MonitorFeature,
  NotificationSeam,
} from './market-cap-monitor.processor.js'

import { projectFeatures, projects, users } from '#root/db/schema/index.js'
import { and, eq, inArray, isNull } from 'drizzle-orm'

type Db = typeof DrizzleDb

/** Statuses the hot loop evaluates — mirrors the partial index in the schema. */
const ACTIVE_STATUSES: FeatureStatus[] = ['pending', 'watching', 'executing']

/**
 * Shared SELECT projection: a Project Feature widened with the parent Project's
 * token identity, so the monitor can both evaluate transitions and build the
 * `feature.state` notification's fat payload without a second query.
 */
const MONITOR_COLUMNS = {
  featureId: projectFeatures.id,
  projectId: projectFeatures.projectId,
  telegramId: users.telegramId,
  mint: projects.tokenMint,
  status: projectFeatures.status,
  isWatching: projectFeatures.isWatchingTransactions,
  config: projectFeatures.config,
  tokenName: projects.tokenName,
  tokenSymbol: projects.tokenSymbol,
  totalSellCount: projectFeatures.totalSellCount,
  totalSolReceived: projectFeatures.totalSolReceived,
  totalSoldAmount: projectFeatures.totalSoldAmount,
  pinnedMessageId: projectFeatures.pinnedMessageId,
} as const

interface MonitorRow {
  featureId: string
  projectId: string
  telegramId: number
  mint: string
  status: FeatureStatus
  isWatching: boolean
  config: unknown
  tokenName: string | null
  tokenSymbol: string | null
  totalSellCount: number
  totalSolReceived: string
  totalSoldAmount: string
  pinnedMessageId: number | null
}

function mapRow(row: MonitorRow): MonitorFeature {
  return {
    featureId: row.featureId,
    projectId: row.projectId,
    telegramId: String(row.telegramId),
    mint: row.mint,
    status: row.status,
    isWatching: row.isWatching,
    config: row.config as ShadowSellConfig,
    tokenName: row.tokenName ?? row.mint,
    tokenSymbol: row.tokenSymbol ?? '',
    totalSellCount: row.totalSellCount,
    totalSolReceived: row.totalSolReceived,
    totalSoldAmount: row.totalSoldAmount,
    pinnedMessageId: row.pinnedMessageId,
  }
}

export function createFeatureRepoSeam(db: Db): FeatureRepoSeam {
  return {
    async findActive() {
      const rows = await db
        .select(MONITOR_COLUMNS)
        .from(projectFeatures)
        .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
        .innerJoin(users, eq(projects.userId, users.id))
        .where(and(inArray(projectFeatures.status, ACTIVE_STATUSES), isNull(projects.deletedAt)))
      return rows.map(mapRow)
    },
    async findWatching() {
      const rows = await db
        .select(MONITOR_COLUMNS)
        .from(projectFeatures)
        .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
        .innerJoin(users, eq(projects.userId, users.id))
        .where(and(eq(projectFeatures.isWatchingTransactions, true), isNull(projects.deletedAt)))
      return rows.map(mapRow)
    },
    async setWatching(featureId, watching) {
      await db
        .update(projectFeatures)
        .set({ isWatchingTransactions: watching, updatedAt: new Date() })
        .where(eq(projectFeatures.id, featureId))
    },
    async updateStatus(featureId, status) {
      const now = new Date()
      await db
        .update(projectFeatures)
        .set({
          status,
          updatedAt: now,
          ...(status === 'watching' ? { startedAt: now } : {}),
        })
        .where(eq(projectFeatures.id, featureId))
    },
    async updateLastMarketCap(featureId, mcapUsd) {
      await db
        .update(projectFeatures)
        .set({ lastMarketCapUsd: mcapUsd.toFixed(2), updatedAt: new Date() })
        .where(eq(projectFeatures.id, featureId))
    },
  }
}

export function createMarketCapSeam(dexscreener: DexscreenerService): MarketCapSeam {
  return {
    async getMarketCapUsd(mint) {
      const info = await dexscreener.getTokenInfo(mint)
      return info?.marketCapUsd ?? null
    },
  }
}

export function createLockSeam(redis: Redis): LockSeam {
  return {
    async acquire(key, ttlSeconds) {
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX')
      return result === 'OK'
    },
    async release(key) {
      await redis.del(key)
    },
  }
}

export function createNotificationSeam(queue: Pick<Queue<NotificationJob>, 'add'>): NotificationSeam {
  return {
    async enqueue(job) {
      await queue.add(`${job.kind}:${job.userId}:${Date.now()}`, job)
    },
  }
}
