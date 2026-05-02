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
 * - If `ctx.session.user` is cached, re-verifies the row still exists (one
 *   cheap indexed lookup) — protects against dangling session pointers
 *   after a DB reset / row deletion.
 * - Otherwise fetches the user by telegramId; creates one on first encounter.
 * - Stores the lightweight `{ id, telegramId }` reference in session.
 *
 * Should be registered after the session middleware in the middleware chain.
 */
export const userResolution: MiddlewareFn<Context> = async (ctx, next) => {
  // Channel posts (and other updates without a sender) have no from.
  // Service messages (e.g. pinned_message) carry the bot itself as `from` —
  // never create a DB user for a bot account.
  if (!ctx.from || ctx.from.is_bot) {
    await next()
    return
  }

  const telegramId = ctx.from.id

  try {
    // Verify cached reference still resolves; fall through to re-create on
    // miss (stale session after DB reset, manual row deletion, etc.).
    if (ctx.session.user) {
      const cached = await userRepo.findById(ctx.session.user.id)
      if (cached) {
        await next()
        return
      }
      log.warn(
        { telegramId, staleUserId: ctx.session.user.id },
        'Cached session user not found in DB — re-resolving',
      )
      ctx.session.user = undefined
    }

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
      ctx.isNewUser = true
      log.info({ telegramId, userId: user.id }, 'New user created')
    }

    // Cache in session — cache is re-verified on each request via findById
    ctx.session.user = { id: user.id, telegramId: user.telegramId }
  }
  catch (err) {
    // Log but do not block the update — graceful degradation
    log.error({ err, telegramId }, 'User resolution failed')
  }

  await next()
}
