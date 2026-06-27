import type { Context } from '#root/bot/context.js'
import { CB_WAITLIST_CHECK, CB_WAITLIST_JOIN } from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import {
  buildWaitlistJoinedText,
  buildWaitlistPositionText,
  buildWaitlistWelcomeText,
} from '#root/bot/helpers/message-builder.js'
import {
  buildWaitlistJoinedKeyboard,
  buildWaitlistKeyboard,
} from '#root/bot/keyboards/waitlist.keyboard.js'
import { config } from '#root/config.js'
import { WaitlistRepository } from '#root/db/repositories/waitlist.repository.js'
import { enqueueNotification } from '#root/queue/queues.js'
import { WaitlistService } from '#root/services/waitlist.service.js'
import { Composer } from 'grammy'

const waitlistService = new WaitlistService({
  repo: new WaitlistRepository(),
  enqueueNotification,
  botUsername: config.botUsername,
})

const composer = new Composer<Context>()
const feature = composer.chatType('private')

// Join Waitlist — inserts the member (idempotently) and credits any referrer
// captured from a `wl_` deep link before they tapped Join.
feature.callbackQuery(CB_WAITLIST_JOIN, logHandle('cb-waitlist-join'), async (ctx) => {
  await ctx.answerCallbackQuery()
  if (!ctx.from)
    return

  const referredByTelegramId = ctx.session.pendingWaitlistReferrer
  const result = await waitlistService.join({
    telegramId: ctx.from.id,
    username: ctx.from.username ?? null,
    firstName: ctx.from.first_name ?? null,
    referredByTelegramId,
  })
  // One-shot: consume the pending referrer so re-taps don't re-attribute.
  ctx.session.pendingWaitlistReferrer = undefined

  const status = await waitlistService.getStatus(ctx.from.id)
  await ctx.sendNavigationMessage(
    buildWaitlistJoinedText({
      position: result.position,
      total: status?.total ?? result.position,
      referralLink: result.referralLink,
    }),
    { reply_markup: buildWaitlistJoinedKeyboard(ctx.config) },
  )
})

// Check My Position — shows current standing, or the welcome screen if the
// user hasn't actually joined yet.
feature.callbackQuery(CB_WAITLIST_CHECK, logHandle('cb-waitlist-check'), async (ctx) => {
  await ctx.answerCallbackQuery()
  if (!ctx.from)
    return

  const status = await waitlistService.getStatus(ctx.from.id)
  if (!status) {
    await ctx.sendNavigationMessage(buildWaitlistWelcomeText(), {
      reply_markup: buildWaitlistKeyboard(ctx.config),
    })
    return
  }

  await ctx.sendNavigationMessage(
    buildWaitlistPositionText({
      position: status.position,
      total: status.total,
      referralCount: status.referralCount,
      referralLink: status.referralLink,
    }),
    { reply_markup: buildWaitlistJoinedKeyboard(ctx.config) },
  )
})

export { composer as waitlistHandler }
