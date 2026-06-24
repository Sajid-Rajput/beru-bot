import type { DexscreenerService } from '#root/services/dexscreener.service.js'
import type { Logger } from '#root/utils/logger.js'
import type { ConnectionOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import type { MonitorConfig, MonitorDeps } from './market-cap-monitor.processor.js'

import { db } from '#root/db/index.js'
import { marketCapMonitorQueue, notificationQueue } from '#root/queue/queues.js'
import { dexscreenerService } from '#root/services/dexscreener.service.js'
import { WatchEventPublisher } from '#root/services/watch-event-publisher.js'
import {
  MCAP_POLL_INTERVAL,
  MONITOR_COLD_INTERVAL,
  MONITOR_LOCK_TTL,
  QUEUE_MARKET_CAP_MONITOR,
  redisKeys,
} from '#root/utils/constants.js'
import { Worker } from 'bullmq'

import {
  createFeatureRepoSeam,
  createLockSeam,
  createMarketCapSeam,
  createNotificationSeam,
} from './market-cap-monitor.adapter.js'
import { runColdCycle, runHotCycle } from './market-cap-monitor.processor.js'

// Repeatable job names — the single worker branches on these.
const HOT_JOB = 'hot'
const COLD_JOB = 'cold'

export interface MarketCapMonitorWorkerOptions {
  connection: ConnectionOptions
  redis: Redis
  logger: Logger
  /** Override DexScreener (defaults to the shared singleton). */
  dexscreener?: DexscreenerService
}

/**
 * Registers the MarketCapMonitorWorker (issue #23). One BullMQ Worker drains
 * the `market-cap-monitor` queue, branching on job name between the 30s hot
 * loop (`runHotCycle`) and the 5min cold loop (`runColdCycle`). Concurrency is
 * 1; the Redis `monitor:lock` is the real single-flight guard (invariant 17).
 *
 * `ensureScheduled()` registers the two repeatable jobs and must be awaited at
 * boot. BullMQ dedups repeatable jobs by name + interval, so it is idempotent
 * across restarts.
 */
export function registerMarketCapMonitorWorker(opts: MarketCapMonitorWorkerOptions): {
  worker: Worker<Record<string, never>>
  ensureScheduled: () => Promise<void>
  stop: () => Promise<void>
} {
  const log = opts.logger.child({ worker: 'market-cap-monitor' })
  const dexscreener = opts.dexscreener ?? dexscreenerService

  const watchPublisher = new WatchEventPublisher({
    publish: (channel, message) => opts.redis.publish(channel, message),
  })

  const deps: MonitorDeps = {
    lock: createLockSeam(opts.redis),
    features: createFeatureRepoSeam(db),
    marketCap: createMarketCapSeam(dexscreener),
    watchEvents: watchPublisher,
    notifications: createNotificationSeam(notificationQueue),
    logger: log,
  }

  const monitorConfig: MonitorConfig = {
    lockKey: redisKeys.monitorLock(),
    lockTtlSeconds: MONITOR_LOCK_TTL,
  }

  const worker = new Worker<Record<string, never>>(
    QUEUE_MARKET_CAP_MONITOR,
    async (job) => {
      if (job.name === COLD_JOB) {
        const result = await runColdCycle(deps, monitorConfig)
        log.debug(result, 'monitor cold cycle complete')
      }
      else {
        const result = await runHotCycle(deps, monitorConfig)
        log.debug(result, 'monitor hot cycle complete')
      }
    },
    {
      connection: opts.connection,
      concurrency: 1,
    },
  )

  worker.on('failed', (job, err) => {
    log.error({ err, jobId: job?.id, name: job?.name }, 'monitor job failed')
  })

  return {
    worker,
    ensureScheduled: async () => {
      // upsertJobScheduler is idempotent by scheduler id — safe on every boot.
      await marketCapMonitorQueue.upsertJobScheduler('monitor-hot', { every: MCAP_POLL_INTERVAL }, { name: HOT_JOB })
      await marketCapMonitorQueue.upsertJobScheduler('monitor-cold', { every: MONITOR_COLD_INTERVAL }, { name: COLD_JOB })
    },
    stop: async () => {
      await worker.close()
    },
  }
}
