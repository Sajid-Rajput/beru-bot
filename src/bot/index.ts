import type { Context } from '#root/bot/context.js'
import type { Config } from '#root/config.js'
import type { Logger } from '#root/logger.js'
import type { BotConfig } from 'grammy'
import { adminFeature } from '#root/bot/features/admin.js'
import { languageFeature } from '#root/bot/features/language.js'
import { unhandledFeature } from '#root/bot/features/unhandled.js'
import { welcomeFeature } from '#root/bot/features/welcome.js'
import { errorHandler } from '#root/bot/handlers/error.js'
import { i18n, isMultipleLocales } from '#root/bot/i18n.js'
import { debounce } from '#root/bot/middlewares/debounce.js'
import { messageManagement } from '#root/bot/middlewares/message-management.js'
import { rateLimit } from '#root/bot/middlewares/rate-limit.js'
import { session } from '#root/bot/middlewares/session.js'
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
  protectedBot.use(welcomeFeature)
  protectedBot.use(adminFeature)
  if (isMultipleLocales)
    protectedBot.use(languageFeature)

  // must be the last handler
  protectedBot.use(unhandledFeature)

  return bot
}

export type Bot = ReturnType<typeof createBot>
