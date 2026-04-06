import type { Context } from '#root/bot/context.js'
import type { MiddlewareFn } from 'grammy'
import { redis } from '#root/queue/redis.js'
import { BUTTON_DEBOUNCE, redisKeys } from '#root/utils/constants.js'
import { createLogger } from '#root/utils/logger.js'

const log = createLogger('Debounce')

/** TTL in seconds for the debounce key (derived from BUTTON_DEBOUNCE ms) */
const DEBOUNCE_TTL_S = Math.ceil(BUTTON_DEBOUNCE / 1000)

/**
 * Button-click debounce: prevents the same callback_query from firing twice
 * within BUTTON_DEBOUNCE (1 000 ms).
 *
 * Uses `SET NX EX` on `debounce:{telegramId}:{callbackData}`.
 * If the key already exists, the callback is answered silently and dropped.
 */
export const debounce: MiddlewareFn<Context> = async (ctx, next) => {
  // Only debounce callback queries (inline button presses)
  if (!ctx.callbackQuery?.data || !ctx.from) {
    await next()
    return
  }

  const key = redisKeys.debounce(ctx.from.id, ctx.callbackQuery.data)

  try {
    // SET NX — returns 'OK' if the key was set (first click), null if it exists (duplicate)
    const result = await redis.set(key, '1', 'EX', DEBOUNCE_TTL_S, 'NX')

    if (result === null) {
      // Duplicate click — answer the callback to clear the loading spinner
      await ctx.answerCallbackQuery().catch(() => {})
      return // drop the update
    }
  }
  catch (err) {
    // Redis failure should not block — log and continue
    log.error({ err, telegramId: ctx.from.id }, 'Debounce Redis error')
  }

  await next()
}
