import type { Logger } from '#root/utils/logger.js'
import type { ConnectionOptions } from 'bullmq'
import type { RecoveryConfig, RecoveryDeps } from './recovery.processor.js'

import { config } from '#root/config.js'
import { db } from '#root/db/index.js'
import { notificationQueue, recoveryQueue, sellExecutionQueue } from '#root/queue/queues.js'
import {
  MAX_RECOVERY_ATTEMPTS,
  QUEUE_RECOVERY,
  RECOVERY_INTERVAL,
  RECOVERY_SCAN_LIMIT,
} from '#root/utils/constants.js'
import { Worker } from 'bullmq'

import {
  createNotificationSeam,
  createRecoveryRepoSeam,
  createSellQueueSeam,
} from './recovery.adapter.js'
import { runRecoveryCycle } from './recovery.processor.js'

// Repeatable job name — the scanner fires on a single recurring trigger.
const SCAN_JOB = 'scan'

export interface RecoveryWorkerOptions {
  connection: ConnectionOptions
  logger: Logger
}

/**
 * Registers the RecoveryWorker (issue #41, ADR-0002 §4 / R-3). One BullMQ Worker
 * drains the `recovery` queue; a single repeatable job fires `runRecoveryCycle`
 * every `RECOVERY_INTERVAL` (5 min) to re-enqueue `SellJob`s for transactions
 * stuck in `recovery_needed`. Concurrency is 1; double-processing across worker
 * instances is harmless because the executor is idempotent on the transactions
 * row and each re-enqueue carries a per-attempt jobId.
 *
 * `ensureScheduled()` registers the repeatable job and must be awaited at boot.
 * `upsertJobScheduler` dedups by scheduler id, so it is idempotent across restarts.
 */
export function registerRecoveryWorker(opts: RecoveryWorkerOptions): {
  worker: Worker<Record<string, never>>
  ensureScheduled: () => Promise<void>
  stop: () => Promise<void>
} {
  const log = opts.logger.child({ worker: 'recovery' })

  const deps: RecoveryDeps = {
    repo: createRecoveryRepoSeam(db),
    sellQueue: createSellQueueSeam(sellExecutionQueue),
    notifications: createNotificationSeam(notificationQueue),
    clock: () => new Date(),
    logger: log,
  }

  const recoveryConfig: RecoveryConfig = {
    cooldownMs: RECOVERY_INTERVAL,
    scanLimit: RECOVERY_SCAN_LIMIT,
    maxRecoveryAttempts: MAX_RECOVERY_ATTEMPTS,
    adminUserIds: config.botAdmins.map(String),
  }

  const worker = new Worker<Record<string, never>>(
    QUEUE_RECOVERY,
    async () => {
      const result = await runRecoveryCycle(deps, recoveryConfig)
      log.debug(result, 'recovery cycle complete')
    },
    {
      connection: opts.connection,
      concurrency: 1,
    },
  )

  worker.on('failed', (job, err) => {
    log.error({ err, jobId: job?.id }, 'recovery job failed')
  })

  return {
    worker,
    ensureScheduled: async () => {
      // upsertJobScheduler is idempotent by scheduler id — safe on every boot.
      await recoveryQueue.upsertJobScheduler('recovery-scan', { every: RECOVERY_INTERVAL }, { name: SCAN_JOB })
    },
    stop: async () => {
      await worker.close()
    },
  }
}
