#!/usr/bin/env tsx
/* eslint-disable antfu/no-top-level-await */

/**
 * worker.ts — long-lived background process for Beru Bot.
 *
 * Owns the WatchedFeatureCache (T5.3b) and the BuyDetector (#37). BullMQ
 * workers (sell-execution, market-cap-monitor, recovery, fee-payout) land in
 * the upcoming slices.
 */

import process from 'node:process'

import {
  createFetchParsedTransaction,
  createSolanaWsClientFactory,
} from '#root/buy-detector/buy-detector.adapter.js'
import { BuyDetector } from '#root/buy-detector/index.js'
import { parseBuy as parsePumpFunBuy } from '#root/buy-detector/parsers/pump-fun-bc.parser.js'
import {
  createWatchedFeatureFetcher,
  createWatchedFeatureLoader,
  createWatchPubSubSubscriber,
} from '#root/buy-detector/watched-feature-cache.adapter.js'
import { WatchedFeatureCache } from '#root/buy-detector/watched-feature-cache.js'
import { config } from '#root/config.js'
import { closeDb, db } from '#root/db/index.js'
import { sellExecutionQueue } from '#root/queue/queues.js'
import { createRedisClient, redis } from '#root/queue/redis.js'
import { SolanaRpcService } from '#root/services/solana-rpc.service.js'
import { DexProgramId } from '#root/utils/dex-programs.js'
import { logger } from '#root/utils/logger.js'
import { registerSellExecutionWorker } from '#root/workers/sell-execution.worker.js'

const log = logger.child({ proc: 'worker' })

// Dedicated subscriber connection — ioredis requires this for pub/sub.
// Other Redis operations continue to use the shared `redis` singleton.
const subscriberRedis = createRedisClient(false)

const watchedFeatureCache = new WatchedFeatureCache({
  loader: createWatchedFeatureLoader(db),
  fetchById: createWatchedFeatureFetcher(db),
  subscribe: createWatchPubSubSubscriber(subscriberRedis),
})

const rpc = new SolanaRpcService()

const buyDetector = new BuyDetector({
  cache: watchedFeatureCache,
  parsers: [[DexProgramId.PUMP_FUN_BC, parsePumpFunBuy]],
  programs: [DexProgramId.PUMP_FUN_BC],
  wsClientFactory: createSolanaWsClientFactory(),
  wsUrl: config.solanaPrimaryWsUrl,
  fetchTx: createFetchParsedTransaction(rpc),
  redis,
  sellQueue: {
    add: async job => sellExecutionQueue
      .add(`sell:${job.featureId}:${job.triggerSignature}`, job, {
        jobId: `sell:${job.featureId}:${job.triggerSignature}`,
      })
      .then(() => undefined),
  },
})

const sellExecutionWorker = registerSellExecutionWorker({
  connection: { url: config.redisUrl },
  redis,
  rpc,
  logger: log,
})

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  log.info({ signal }, 'worker shutdown')
  await buyDetector.stop().catch(err => log.warn({ err }, 'BuyDetector stop failed'))
  await sellExecutionWorker.stop().catch(err => log.warn({ err }, 'sell-execution worker stop failed'))
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
  if (!config.solanaPrimaryWsUrl) {
    log.warn('SOLANA_PRIMARY_WS_URL is not set — BuyDetector will not open WS subscriptions')
    await watchedFeatureCache.start()
    log.info({ watchedMints: watchedFeatureCache.getAllMints().length }, 'WatchedFeatureCache started without BuyDetector')
  }
  else {
    await buyDetector.start()
    log.info({
      watchedMints: watchedFeatureCache.getAllMints().length,
      subscriptions: buyDetector.getStatus().subscriptions,
    }, 'BuyDetector started')
  }
}
catch (err) {
  log.error({ err }, 'worker failed to start')
  process.exit(1)
}
