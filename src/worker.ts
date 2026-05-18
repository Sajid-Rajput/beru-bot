#!/usr/bin/env tsx
/* eslint-disable antfu/no-top-level-await */

/**
 * worker.ts — long-lived background process for Beru Bot.
 *
 * Today this process owns the WatchedFeatureCache (T5.3b) only. BullMQ workers
 * (sell-execution, market-cap-monitor, recovery, fee-payout, notification)
 * and the BuyDetectorService (T5.3c) are registered here in upcoming sprints.
 */

import process from 'node:process'
import {
  createWatchedFeatureFetcher,
  createWatchedFeatureLoader,
  createWatchPubSubSubscriber,
} from '#root/buy-detector/watched-feature-cache.adapter.js'
import { WatchedFeatureCache } from '#root/buy-detector/watched-feature-cache.js'
import { closeDb, db } from '#root/db/index.js'
import { createRedisClient } from '#root/queue/redis.js'
import { logger } from '#root/utils/logger.js'

const log = logger.child({ proc: 'worker' })

// Dedicated subscriber connection — ioredis requires this for pub/sub.
// Other Redis operations continue to use the shared `redis` singleton.
const subscriberRedis = createRedisClient(false)

const watchedFeatureCache = new WatchedFeatureCache({
  loader: createWatchedFeatureLoader(db),
  fetchById: createWatchedFeatureFetcher(db),
  subscribe: createWatchPubSubSubscriber(subscriberRedis),
})

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log.info({ signal }, 'worker shutdown')
  await watchedFeatureCache.stop().catch(err => log.warn({ err }, 'cache stop failed'))
  await subscriberRedis.quit().catch(err => log.warn({ err }, 'subscriber quit failed'))
  await closeDb().catch(err => log.warn({ err }, 'closeDb failed'))
}

let shuttingDown = false
function onSignal(signal: NodeJS.Signals) {
  if (shuttingDown)
    return
  shuttingDown = true
  void shutdown(signal).finally(() => process.exit(0))
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

try {
  await watchedFeatureCache.start()
  log.info({ watchedMints: watchedFeatureCache.getAllMints().length }, 'WatchedFeatureCache started')
}
catch (err) {
  log.error({ err }, 'worker failed to start')
  process.exit(1)
}
