import type { NotificationJobData, SellJobData } from './types.js'

import { config } from '#root/config.js'
import {
  QUEUE_FEE_PAYOUT,
  QUEUE_MARKET_CAP_MONITOR,
  QUEUE_NOTIFICATION,
  QUEUE_RECOVERY,
  QUEUE_SELL_EXECUTION,
} from '#root/utils/constants.js'
import { createLogger } from '#root/utils/logger.js'
import { Queue } from 'bullmq'

const log = createLogger('Queues')

// ── Shared connection options (BullMQ Queue instances) ────────────────────────
// BullMQ creates a dedicated ioredis connection per Queue — we pass the URL
// so each Queue manages its own connection lifecycle.
const connection = { url: config.redisUrl }

// ── Queue instances ────────────────────────────────────────────────────────────

/**
 * Sell execution queue.
 * Workers consume this with concurrency 5 and rate limit 10/min.
 * Jobs MUST have attempts: 1 (invariant 16 — no auto-retry).
 */
export const sellExecutionQueue = new Queue<SellJobData>(QUEUE_SELL_EXECUTION, {
  connection,
  defaultJobOptions: {
    attempts: 1, // Invariant 16: failed sells go to recovery flow, not retry
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
})

/** Market cap poll queue — repeatable job every 30s, managed by MonitorWorker */
export const marketCapMonitorQueue = new Queue<Record<string, never>>(QUEUE_MARKET_CAP_MONITOR, {
  connection,
  defaultJobOptions: { removeOnComplete: 1, removeOnFail: 10 },
})

/** Recovery queue — repeatable job every 5min, managed by RecoveryWorker */
export const recoveryQueue = new Queue<Record<string, never>>(QUEUE_RECOVERY, {
  connection,
  defaultJobOptions: { removeOnComplete: 1, removeOnFail: 10 },
})

/** Fee payout queue — weekly cron, managed by FeePayoutWorker */
export const feePayoutQueue = new Queue<Record<string, never>>(QUEUE_FEE_PAYOUT, {
  connection,
  defaultJobOptions: { removeOnComplete: 1, removeOnFail: 10 },
})

/** Notification queue — consumed by NotificationService (concurrency 10) */
export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NOTIFICATION, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 1000 },
  },
})

// ── Producer helpers ──────────────────────────────────────────────────────────

/**
 * Enqueue a sell job.
 * `featureId` is used as the job ID to prevent duplicate queuing for the same
 * feature (BullMQ dedup: if a job with the same ID exists and is waiting,
 * the new enqueue is a no-op).
 */
export async function enqueueSellJob(data: SellJobData): Promise<void> {
  await sellExecutionQueue.add(
    `sell:${data.triggerTxSignature}`,
    data,
    { jobId: `sell:${data.triggerTxSignature}` }, // dedup by tx signature
  )
  log.debug(
    { tokenMint: data.tokenMint, featureId: data.projectFeatureId },
    'Sell job enqueued',
  )
}

/**
 * Enqueue a notification.
 * Non-critical: log but don't throw if queue is unavailable.
 */
export async function enqueueNotification(data: NotificationJobData): Promise<void> {
  try {
    await notificationQueue.add(`notify:${data.telegramId}:${data.type}`, data)
  }
  catch (err) {
    log.warn({ err, data }, 'Failed to enqueue notification')
  }
}

/**
 * Close all queue connections gracefully.
 * Call in SIGTERM/SIGINT handlers after workers have stopped.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    sellExecutionQueue.close(),
    marketCapMonitorQueue.close(),
    recoveryQueue.close(),
    feePayoutQueue.close(),
    notificationQueue.close(),
  ])
}
