import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import {
  buildHomeText,
  buildWaitlistPositionText,
  buildWaitlistWelcomeText,
  buildWelcomeText,
} from '#root/bot/helpers/message-builder.js'
import { parseStartPayload } from '#root/bot/helpers/start-payload.js'
import { sendAnimation } from '#root/bot/helpers/video-sender.js'
import { buildHomeKeyboard } from '#root/bot/keyboards/home.keyboard.js'
import {
  buildWaitlistJoinedKeyboard,
  buildWaitlistKeyboard,
} from '#root/bot/keyboards/waitlist.keyboard.js'
import { config } from '#root/config.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { ReferralRepository } from '#root/db/repositories/referral.repository.js'
import { UserRepository } from '#root/db/repositories/user.repository.js'
import { WaitlistRepository } from '#root/db/repositories/waitlist.repository.js'
import { enqueueNotification } from '#root/queue/queues.js'
import { WaitlistService } from '#root/services/waitlist.service.js'
import { createLogger } from '#root/utils/logger.js'
import { Composer } from 'grammy'

const log = createLogger('StartHandler')
const userRepo = new UserRepository()
const referralRepo = new ReferralRepository()
const projectRepo = new ProjectRepository()
const featureRepo = new ProjectFeatureRepository()
const waitlistService = new WaitlistService({
  repo: new WaitlistRepository(),
  enqueueNotification,
  botUsername: config.botUsername,
})

const composer = new Composer<Context>()
const feature = composer.chatType('private')

feature.command('start', logHandle('command-start'), async (ctx) => {
  // 1. Delete prior navigation message
  if (ctx.session.lastNavMessageId) {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.session.lastNavMessageId).catch(() => {})
    ctx.session.lastNavMessageId = undefined
  }

  // 2. Delete the user's /start command message
  await ctx.deleteMessage().catch(() => {})

  // 3. Parse deep link payload
  const intent = parseStartPayload(typeof ctx.match === 'string' ? ctx.match : '')

  // 3a. Pre-launch mode (§7.5): show the waitlist instead of the normal app.
  //     A `wl_` link stashes the referrer until the user taps Join Waitlist.
  if (ctx.config.preLaunchMode) {
    if (intent.kind === 'waitlist' && intent.telegramId !== ctx.from.id)
      ctx.session.pendingWaitlistReferrer = intent.telegramId

    const status = await waitlistService.getStatus(ctx.from.id)
    if (status) {
      await ctx.sendNavigationMessage(
        buildWaitlistPositionText({
          position: status.position,
          total: status.total,
          referralCount: status.referralCount,
          referralLink: status.referralLink,
        }),
        { reply_markup: buildWaitlistJoinedKeyboard(ctx.config) },
      )
    }
    else {
      await ctx.sendNavigationMessage(buildWaitlistWelcomeText(), {
        reply_markup: buildWaitlistKeyboard(ctx.config),
      })
    }
    return
  }

  // 4. Handle referral deep link (only for brand-new users; skip self-referrals)
  if (ctx.isNewUser && intent.kind === 'referral' && intent.telegramId !== ctx.from.id) {
    const refTelegramId = intent.telegramId
    try {
      const referrer = await userRepo.findByTelegramId(refTelegramId)
      if (referrer && ctx.session.user) {
        // Tier 1 — direct referral
        await referralRepo.create({
          referrerId: referrer.id,
          referredId: ctx.session.user.id,
          tier: 1,
        })
        await userRepo.update(ctx.session.user.id, {
          referredByUserId: referrer.id,
          referralTier: 'supporter',
        })
        log.info(
          { referrerId: referrer.id, referredId: ctx.session.user.id },
          'Tier-1 referral created',
        )

        // Tier 2 — indirect referral (referrer's referrer)
        const grandReferral = await referralRepo.findReferrer(referrer.id)
        if (grandReferral) {
          await referralRepo.create({
            referrerId: grandReferral.referrerId,
            referredId: ctx.session.user.id,
            tier: 2,
          })
          log.info(
            { grandReferrerId: grandReferral.referrerId, referredId: ctx.session.user.id },
            'Tier-2 referral created',
          )
        }
      }
    }
    catch (err) {
      log.error({ err, refTelegramId }, 'Referral creation failed')
    }
  }

  // 5. Render screen — gated on whether the user has actually onboarded
  // (≥1 project), not on whether this is their first /start. A returning
  // user who never created a project still gets the welcome card so HOME
  // is never shown with all-zero stats.
  let msg
  const userId = ctx.session.user?.id
  const firstName = ctx.from.first_name ?? 'Monarch'

  // Brand-new users always have 0 projects — skip the DB hit
  const projectCount = ctx.isNewUser
    ? 0
    : userId ? await projectRepo.countByUserId(userId) : 0

  if (projectCount === 0) {
    msg = await sendAnimation(ctx, 'video:introduction', {
      caption: buildWelcomeText({
        isReturning: !ctx.isNewUser,
        firstName,
      }),
      reply_markup: buildHomeKeyboard(ctx.config),
    })
  }
  else {
    const agg = userId
      ? await featureRepo.getAggregateStatsByUserId(userId)
      : { totalSells: 0, totalSolEarned: '0' }
    const stats = { projectCount, ...agg, firstName }
    msg = await sendAnimation(ctx, 'video:introduction', {
      caption: buildHomeText(stats),
      reply_markup: buildHomeKeyboard(ctx.config),
    })
  }

  // 7. Store nav message ID
  ctx.session.lastNavMessageId = msg.message_id
})

export { composer as startHandler }
