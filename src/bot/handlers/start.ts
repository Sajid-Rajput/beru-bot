import type { Context } from '#root/bot/context.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildHomeText, buildWelcomeText } from '#root/bot/helpers/message-builder.js'
import { sendAnimation } from '#root/bot/helpers/video-sender.js'
import { buildHomeKeyboard } from '#root/bot/keyboards/home.keyboard.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { ReferralRepository } from '#root/db/repositories/referral.repository.js'
import { UserRepository } from '#root/db/repositories/user.repository.js'
import { createLogger } from '#root/utils/logger.js'
import { Composer } from 'grammy'

const log = createLogger('StartHandler')
const userRepo = new UserRepository()
const referralRepo = new ReferralRepository()
const projectRepo = new ProjectRepository()
const featureRepo = new ProjectFeatureRepository()

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
  const payload = typeof ctx.match === 'string' ? ctx.match : ''

  // 4. Handle referral deep link (only for brand-new users)
  if (ctx.isNewUser && payload) {
    const refMatch = payload.match(/^ref_(\d+)$/)
    if (refMatch) {
      const refTelegramId = Number(refMatch[1])

      // Guard: prevent self-referral
      if (refTelegramId !== ctx.from.id) {
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
    }
  }

  // 5. Render screen
  let msg
  if (ctx.isNewUser) {
    msg = await sendAnimation(ctx, 'video:introduction', {
      caption: buildWelcomeText(),
      reply_markup: buildHomeKeyboard(ctx.config, 0),
    })
  }
  else {
    const userId = ctx.session.user?.id
    const firstName = ctx.from.first_name ?? 'Monarch'
    const [projectCount, agg] = userId
      ? await Promise.all([
          projectRepo.countByUserId(userId),
          featureRepo.getAggregateStatsByUserId(userId),
        ])
      : [0, { totalSells: 0, totalSolEarned: '0' }]
    const stats = { projectCount, ...agg, firstName }
    msg = await sendAnimation(ctx, 'video:introduction', {
      caption: buildHomeText(stats),
      reply_markup: buildHomeKeyboard(ctx.config, projectCount),
    })
  }

  // 7. Store nav message ID
  ctx.session.lastNavMessageId = msg.message_id
})

export { composer as startHandler }
