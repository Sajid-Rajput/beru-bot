import { Redis } from 'ioredis'

import { config } from '#root/config.js'
import { createLogger } from '#root/utils/logger.js'

const log = createLogger('Redis')

/**
 * Creates a new ioredis connection from the config Redis URL.
 *
 * The two options below are required by BullMQ:
 *   - maxRetriesPerRequest: null  — lets BullMQ manage its own retry logic
 *   - enableReadyCheck: false     — avoids connection-check overhead in workers
 *
 * @param enableOfflineQueue  Set to `false` for BullMQ worker connections
 *                            (commands should not queue while disconnected).
 */
export function createRedisClient(enableOfflineQueue = true): Redis {
  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue,
    lazyConnect: false,
  })

  client.on('connect', () => log.debug('Redis connected'))
  client.on('ready', () => log.info('Redis ready'))
  client.on('reconnecting', (delay: number) =>
    log.warn({ delay }, 'Redis reconnecting'))
  client.on('error', (err: Error) =>
    log.error({ err }, 'Redis error'))
  client.on('close', () => log.debug('Redis connection closed'))

  return client
}

// ── Singleton instances ───────────────────────────────────────────────────────
// The app process uses these for rate-limiting, debounce, dedup, and nonce.
// BullMQ queues create their own dedicated connections internally.

/** General-purpose singleton for non-queue Redis operations */
export const redis = createRedisClient()

/**
 * Gracefully closes the singleton connection.
 * Call in SIGTERM/SIGINT handlers.
 */
export async function closeRedis(): Promise<void> {
  await redis.quit()
}
