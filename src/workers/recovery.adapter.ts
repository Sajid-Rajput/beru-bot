import type { db as DrizzleDb } from '#root/db/index.js'
import type { NotificationJob, SellJobData } from '#root/queue/types.js'
import type { Queue } from 'bullmq'
import type {
  NotificationSeam,
  RecoveryRepoSeam,
  SellQueueSeam,
} from './recovery.processor.js'

import { transactions } from '#root/db/schema/index.js'
import { and, asc, eq, lt } from 'drizzle-orm'

type Db = typeof DrizzleDb

/**
 * Production seams for the RecoveryWorker (issue #41). Inline Drizzle + BullMQ
 * wiring, mirroring `market-cap-monitor.adapter.ts`. The pure scan/enqueue logic
 * lives in `recovery.processor.ts`.
 */

export function createRecoveryRepoSeam(db: Db): RecoveryRepoSeam {
  return {
    async findStuck(cutoff, limit) {
      // Backed by `idx_transactions_recovery` (partial index on
      // status = 'recovery_needed'). Oldest attempts first so the most-stuck
      // rows recover before newer ones. Rows with a NULL last_attempt_at are
      // excluded by `lt` — the executor always stamps it on a recovery_needed
      // transition, so a NULL here means the attempt hasn't stalled yet.
      const rows = await db
        .select({
          id: transactions.id,
          jobSnapshot: transactions.jobSnapshot,
          recoveryAttempts: transactions.recoveryAttempts,
        })
        .from(transactions)
        .where(and(
          eq(transactions.status, 'recovery_needed'),
          lt(transactions.lastAttemptAt, cutoff),
        ))
        .orderBy(asc(transactions.lastAttemptAt))
        .limit(limit)
      return rows.map(r => ({
        id: r.id,
        jobSnapshot: r.jobSnapshot,
        recoveryAttempts: r.recoveryAttempts,
      }))
    },
    async markRecovering(id, attempts, at) {
      await db
        .update(transactions)
        .set({ recoveryAttempts: attempts, lastAttemptAt: at })
        .where(eq(transactions.id, id))
    },
    async markFailed(id, errorDetails) {
      await db
        .update(transactions)
        .set({ status: 'failed', errorDetails: errorDetails as object, completedAt: new Date() })
        .where(eq(transactions.id, id))
    },
  }
}

export function createSellQueueSeam(queue: Pick<Queue<SellJobData>, 'add'>): SellQueueSeam {
  return {
    async enqueue(job, dedupeKey) {
      // The dedupeKey makes the jobId unique per recovery attempt. The original
      // failed job keeps the bare `sell:<feature>:<trigger>` id in Redis
      // (`removeOnFail`), and BullMQ ignores an add() whose jobId already exists.
      //
      // BullMQ only accepts a colon-bearing custom id if it splits into exactly
      // 3 parts, so the dedupe suffix is folded into the third segment with a
      // `-` (UUID + base58 signature never contain `-`/`:` ambiguously) rather
      // than appended as a 4th colon segment.
      const jobId = `sell:${job.featureId}:${job.triggerSignature}-${dedupeKey}`
      await queue.add(jobId, job, { jobId })
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
