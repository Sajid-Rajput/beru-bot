#!/usr/bin/env tsx
/* eslint-disable antfu/no-top-level-await */

import type { PollingConfig, WebhookConfig } from '#root/config.js'
import type { BotApiHandle } from '#root/workers/notification.consumer.js'
import type { RunnerHandle } from '@grammyjs/runner'
import process from 'node:process'
import { createBot } from '#root/bot/index.js'
import { config } from '#root/config.js'
import { closeDb } from '#root/db/index.js'
import { closeRedis } from '#root/queue/redis.js'
import { createServer, createServerManager } from '#root/server/index.js'
import { logger } from '#root/utils/logger.js'
import { registerNotificationWorker } from '#root/workers/notification.consumer.js'
import { autoRetry } from '@grammyjs/auto-retry'
import { run } from '@grammyjs/runner'

/**
 * Wires the notification consumer into the bot process (ADR-0002 N-2).
 * Also installs the auto-retry plugin so Telegram 429s are handled transparently.
 */
function startNotificationConsumer(bot: BotApiHandle) {
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }))
  const { stop } = registerNotificationWorker(bot, {
    connection: { url: config.redisUrl },
    logger,
  })
  logger.info({ queue: 'notification-queue', concurrency: 10 }, 'NotificationConsumer started')
  return async () => {
    await stop().catch(err => logger.warn({ err }, 'notification worker stop failed'))
  }
}

async function startPolling(config: PollingConfig) {
  const bot = createBot(config.botToken, {
    config,
    logger,
  })
  let runner: undefined | RunnerHandle
  const stopNotificationConsumer = startNotificationConsumer(bot)

  // graceful shutdown
  onShutdown(async () => {
    logger.info('Shutdown')
    await runner?.stop()
    await stopNotificationConsumer()
    await closeRedis().catch(err => logger.warn({ err }, 'closeRedis failed'))
    await closeDb().catch(err => logger.warn({ err }, 'closeDb failed'))
  })

  await Promise.all([
    bot.init(),
    bot.api.deleteWebhook(),
  ])

  // start bot
  runner = run(bot, {
    runner: {
      fetch: {
        allowed_updates: config.botAllowedUpdates,
      },
    },
  })

  logger.info({
    msg: 'Bot running...',
    username: bot.botInfo.username,
  })
}

async function startWebhook(config: WebhookConfig) {
  const bot = createBot(config.botToken, {
    config,
    logger,
  })
  const server = createServer({
    bot,
    config,
    logger,
  })
  const serverManager = createServerManager(server, {
    host: config.serverHost,
    port: config.serverPort,
  })
  const stopNotificationConsumer = startNotificationConsumer(bot)

  // graceful shutdown
  onShutdown(async () => {
    logger.info('Shutdown')
    await serverManager.stop()
    await stopNotificationConsumer()
    await closeRedis().catch(err => logger.warn({ err }, 'closeRedis failed'))
    await closeDb().catch(err => logger.warn({ err }, 'closeDb failed'))
  })

  // to prevent receiving updates before the bot is ready
  await bot.init()

  // start server
  const info = await serverManager.start()
  logger.info({
    msg: 'Server started',
    url: info.url,
  })

  // set webhook
  await bot.api.setWebhook(config.botWebhook, {
    allowed_updates: config.botAllowedUpdates,
    secret_token: config.botWebhookSecret,
  })
  logger.info({
    msg: 'Webhook was set',
    url: config.botWebhook,
  })
}

try {
  if (config.isWebhookMode)
    await startWebhook(config)
  else if (config.isPollingMode)
    await startPolling(config)
}
catch (error) {
  logger.error(error)
  process.exit(1)
}

// Utils

function onShutdown(cleanUp: () => Promise<void>) {
  let isShuttingDown = false
  const handleShutdown = async () => {
    if (isShuttingDown)
      return
    isShuttingDown = true
    await cleanUp()
  }
  process.on('SIGINT', handleShutdown)
  process.on('SIGTERM', handleShutdown)
}
