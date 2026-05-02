import type { Context } from '#root/bot/context.js'
import type { Config } from '#root/config.js'
import type { Logger } from '#root/logger.js'
import type { BotConfig } from 'grammy'
import { adminFeature } from '#root/bot/features/admin.js'
import { languageFeature } from '#root/bot/features/language.js'
import { unhandledFeature } from '#root/bot/features/unhandled.js'
import { configScreensHandler } from '#root/bot/handlers/config-screens.js'
import { dashboardHandler } from '#root/bot/handlers/dashboard.js'
import { deleteProjectHandler } from '#root/bot/handlers/delete-project.js'
import { errorHandler } from '#root/bot/handlers/error.js'
import { homeHandler } from '#root/bot/handlers/home.js'
import { myProjectsHandler } from '#root/bot/handlers/my-projects.js'
import { newProjectHandler } from '#root/bot/handlers/new-project.js'
import { quickSetupHandler } from '#root/bot/handlers/quick-setup.js'
import { referralsHandler } from '#root/bot/handlers/referrals.js'
import { shadowSellHandler } from '#root/bot/handlers/shadow-sell.js'
import { startHandler } from '#root/bot/handlers/start.js'
import { walletsHandler } from '#root/bot/handlers/wallets.js'
import { whitelistHandler } from '#root/bot/handlers/whitelist.js'
import { i18n, isMultipleLocales } from '#root/bot/i18n.js'
import { debounce } from '#root/bot/middlewares/debounce.js'
import { messageManagement } from '#root/bot/middlewares/message-management.js'
import { rateLimit } from '#root/bot/middlewares/rate-limit.js'
import { session } from '#root/bot/middlewares/session.js'
import { smartDetection } from '#root/bot/middlewares/smart-detection.js'
import { updateLogger } from '#root/bot/middlewares/update-logger.js'
import { userResolution } from '#root/bot/middlewares/user-resolution.js'
import { redis } from '#root/queue/redis.js'
import { autoChatAction } from '@grammyjs/auto-chat-action'
import { conversations } from '@grammyjs/conversations'
import { hydrate } from '@grammyjs/hydrate'
import { hydrateReply, parseMode } from '@grammyjs/parse-mode'
import { sequentialize } from '@grammyjs/runner'
import { RedisAdapter } from '@grammyjs/storage-redis'
import { Bot as TelegramBot } from 'grammy'

interface Dependencies {
  config: Config
  logger: Logger
}

/**
 * Per-user session key — this is a private DM-only bot so from.id
 * is the canonical identifier. Consistent with the conversations storage key.
 */
function getSessionKey(ctx: Omit<Context, 'session'>) {
  return ctx.from?.id.toString()
}

export function createBot(token: string, dependencies: Dependencies, botConfig?: BotConfig<Context>) {
  const {
    config,
    logger,
  } = dependencies

  const bot = new TelegramBot<Context>(token, botConfig)

  bot.use(async (ctx, next) => {
    ctx.config = config
    ctx.logger = logger.child({
      update_id: ctx.update.update_id,
    })

    await next()
  })

  const protectedBot = bot.errorBoundary(errorHandler)

  // Middlewares
  bot.api.config.use(parseMode('HTML'))

  if (config.isPollingMode)
    protectedBot.use(sequentialize(getSessionKey))
  if (config.isDebug)
    protectedBot.use(updateLogger())
  protectedBot.use(autoChatAction(bot.api))
  protectedBot.use(hydrateReply)
  protectedBot.use(hydrate())
  // Session — Redis-backed, per-user key, persists across restarts
  protectedBot.use(session({
    getSessionKey,
    storage: new RedisAdapter({ instance: redis }),
  }))

  // Conversations plugin — must come directly after session
  // Namespaced via 'convo:' prefix in getStorageKey to avoid colliding
  // with session keys (which are plain userId strings)
  protectedBot.use(conversations({
    storage: {
      type: 'key',
      version: 1,
      adapter: new RedisAdapter({ instance: redis }),
      getStorageKey: (ctx: Omit<Context, 'session'>) =>
        ctx.from ? `convo:${ctx.from.id}` : undefined,
    },
  }))
  protectedBot.use(i18n)

  // Beru middleware chain (order is critical)
  protectedBot.use(rateLimit) // 1. Drop updates >30/min per user
  protectedBot.use(debounce) // 2. Dedup rapid callback_query clicks
  protectedBot.use(userResolution) // 3. Ensure user exists in DB, cache in session
  protectedBot.use(messageManagement) // 4. Delete-nav + sendNavMsg helpers on ctx

  // Handlers
  protectedBot.use(startHandler)
  protectedBot.use(homeHandler)
  protectedBot.use(shadowSellHandler)
  protectedBot.use(myProjectsHandler)
  protectedBot.use(dashboardHandler)
  protectedBot.use(configScreensHandler)
  protectedBot.use(whitelistHandler)
  protectedBot.use(deleteProjectHandler)
  protectedBot.use(walletsHandler)
  protectedBot.use(referralsHandler)
  protectedBot.use(quickSetupHandler)
  protectedBot.use(newProjectHandler)
  protectedBot.use(smartDetection) // Must come after explicit handlers, before unhandled
  protectedBot.use(adminFeature)
  if (isMultipleLocales)
    protectedBot.use(languageFeature)

  // must be the last handler
  protectedBot.use(unhandledFeature)

  return bot
}

export type Bot = ReturnType<typeof createBot>
