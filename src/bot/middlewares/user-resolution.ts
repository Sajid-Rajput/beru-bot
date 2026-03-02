import type { Context } from '#root/bot/context.js'
import type { MiddlewareFn } from 'grammy'
import crypto from 'node:crypto'
import { UserRepository } from '#root/db/repositories/user.repository.js'
import { createLogger } from '#root/utils/logger.js'

const log = createLogger('UserResolution')
const userRepo = new UserRepository()

/**
 * Ensures a Telegram user record exists in the database on every interaction.
 *
 * - If `ctx.session.user` is already populated (cached), skips the DB lookup.
 * - Otherwise fetches the user by telegramId; creates one on first encounter.
 * - Stores the lightweight `{ id, telegramId }` reference in session.
 *
 * Should be registered after the session middleware in the middleware chain.
 */
export const userResolution: MiddlewareFn<Context> = async (ctx, next) => {
  // Channel posts (and other updates without a sender) have no from
  if (!ctx.from) {
    await next()
    return
  }

  // Fast path: already resolved this session
  if (ctx.session.user) {
    await next()
    return
  }

  const telegramId = ctx.from.id

  try {
    let user = await userRepo.findByTelegramId(telegramId)

    if (!user) {
      // First encounter — create a new user record
      const referralCode = crypto.randomBytes(5).toString('hex').toUpperCase()
      user = await userRepo.create({
        telegramId,
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        referralCode,
      })
      log.info({ telegramId, userId: user.id }, 'New user created')
    }

    // Cache in session — avoids a DB round-trip for subsequent handlers
    ctx.session.user = { id: user.id, telegramId: user.telegramId }
  }
  catch (err) {
    // Log but do not block the update — graceful degradation
    log.error({ err, telegramId }, 'User resolution failed')
  }

  await next()
}
