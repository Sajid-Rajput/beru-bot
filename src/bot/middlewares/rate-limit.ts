import type { Context } from '#root/bot/context.js'
import type { MiddlewareFn } from 'grammy'
import { redis } from '#root/queue/redis.js'
import { RATE_LIMIT_MESSAGES, redisKeys } from '#root/utils/constants.js'
import { createLogger } from '#root/utils/logger.js'

const log = createLogger('RateLimit')

/**
 * Per-user rate limiter: max RATE_LIMIT_MESSAGES (30) updates per 60-second
 * sliding window.  Uses Redis INCR + EXPIRE to count.
 *
 * When the limit is exceeded the update is silently dropped (no `next()` call).
 * A single warning message is sent on the first excess within a window.
 */
export const rateLimit: MiddlewareFn<Context> = async (ctx, next) => {
  if (!ctx.from) {
    await next()
    return
  }

  const key = redisKeys.rate(ctx.from.id)

  try {
    const count = await redis.incr(key)

    // First increment — set 60s TTL
    if (count === 1) {
      await redis.expire(key, 60)
    }

    if (count > RATE_LIMIT_MESSAGES) {
      // Send a warning only on the first overshoot (count === RATE_LIMIT_MESSAGES + 1)
      if (count === RATE_LIMIT_MESSAGES + 1 && ctx.chat) {
        log.warn({ telegramId: ctx.from.id, count }, 'Rate limit exceeded')
        await ctx.reply('⚠️ Slow down — you are sending too many requests. Please wait a moment.', {
          parse_mode: 'HTML',
        }).catch(() => {})
      }
      return // drop the update
    }
  }
  catch (err) {
    // Redis failure should not block the user — log and continue
    log.error({ err, telegramId: ctx.from.id }, 'Rate-limit Redis error')
  }

  await next()
}
