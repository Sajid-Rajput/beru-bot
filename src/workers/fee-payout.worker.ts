import type { SolanaRpcService } from '#root/services/solana-rpc.service.js'
import type { Logger } from '#root/utils/logger.js'
import type { ConnectionOptions } from 'bullmq'
import type { FeePayoutConfig, FeePayoutDeps } from './fee-payout.processor.js'

import { config } from '#root/config.js'
import { db } from '#root/db/index.js'
import { feePayoutQueue, notificationQueue } from '#root/queue/queues.js'
import { FEE_PAYOUT_SCHEDULER_ID, QUEUE_FEE_PAYOUT } from '#root/utils/constants.js'
import { Worker } from 'bullmq'

import {
  createEarningsSeam,
  createNotificationSeam,
  createPayoutRepoSeam,
  createTransferSeam,
  loadPlatformKeypair,
} from './fee-payout.adapter.js'
import { runPayoutCycle } from './fee-payout.processor.js'

// Repeatable job name — the single worker drains this.
const PAYOUT_JOB = 'weekly-payout'

export interface FeePayoutWorkerOptions {
  connection: ConnectionOptions
  rpc: SolanaRpcService
  logger: Logger
}

/**
 * Registers the FeePayoutWorker (issue #21, T6.3). One BullMQ Worker drains the
 * `fee-payout` queue running `runPayoutCycle`; concurrency is 1.
 *
 * `ensureScheduled()` registers a weekly cron — Sunday at `REFERRAL_PAYOUT_CRON_HOUR`
 * UTC — and must be awaited at boot. `upsertJobScheduler` dedups by scheduler id,
 * so it is idempotent across restarts. If the platform fee wallet key is not
 * configured, scheduling is skipped (with a warning) so an unconfigured
 * environment never moves funds.
 */
export function registerFeePayoutWorker(opts: FeePayoutWorkerOptions): {
  worker: Worker<Record<string, never>>
  ensureScheduled: () => Promise<void>
  stop: () => Promise<void>
} {
  const log = opts.logger.child({ worker: 'fee-payout' })

  const platformKeypair = loadPlatformKeypair(config.platformFeeWalletPrivateKey)

  const deps: FeePayoutDeps = {
    earnings: createEarningsSeam(db),
    payouts: createPayoutRepoSeam(db),
    transfer: createTransferSeam(opts.rpc, platformKeypair),
    notifications: createNotificationSeam(notificationQueue),
    clock: () => new Date(),
    logger: log,
  }

  const payoutConfig: FeePayoutConfig = { minPayoutSol: config.referralMinPayoutSol }

  const worker = new Worker<Record<string, never>>(
    QUEUE_FEE_PAYOUT,
    async () => {
      const result = await runPayoutCycle(deps, payoutConfig)
      log.info(result, 'fee payout cycle complete')
    },
    {
      connection: opts.connection,
      concurrency: 1,
    },
  )

  worker.on('failed', (job, err) => {
    log.error({ err, jobId: job?.id }, 'fee payout job failed')
  })

  return {
    worker,
    ensureScheduled: async () => {
      if (platformKeypair === null) {
        log.warn('PLATFORM_FEE_WALLET_PRIVATE_KEY not set — fee payout cron NOT scheduled')
        return
      }
      // Cron: minute 0, hour H, any day-of-month/month, day-of-week 0 (Sunday), UTC.
      const pattern = `0 ${config.referralPayoutCronHour} * * 0`
      await feePayoutQueue.upsertJobScheduler(
        FEE_PAYOUT_SCHEDULER_ID,
        { pattern, tz: 'UTC' },
        { name: PAYOUT_JOB },
      )
    },
    stop: async () => {
      await worker.close()
    },
  }
}
