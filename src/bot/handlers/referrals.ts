import type { Context } from '#root/bot/context.js'
import { CB_REFERRALS, CB_SET_PAYOUT_WALLET } from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildReferralsText, buildSetPayoutWalletText } from '#root/bot/helpers/message-builder.js'
import { ReferralRepository } from '#root/db/repositories/referral.repository.js'
import { UserRepository } from '#root/db/repositories/user.repository.js'
import { createLogger } from '#root/utils/logger.js'
import { Composer, InlineKeyboard } from 'grammy'

const log = createLogger('ReferralsHandler')
const referralRepo = new ReferralRepository()
const userRepo = new UserRepository()

const composer = new Composer<Context>()
const feat = composer.chatType('private')

// ── Show referrals ───────────────────────────────────────────────────────

feat.callbackQuery(CB_REFERRALS, logHandle('cb-referrals'), async (ctx) => {
  await ctx.answerCallbackQuery()
  if (!ctx.session.user)
    return

  ctx.session.inputState = undefined

  try {
    const user = await userRepo.findById(ctx.session.user.id)
    if (!user)
      return

    const [tier1, tier2, earnings] = await Promise.all([
      referralRepo.findReferredUsers(user.id, 1),
      referralRepo.findReferredUsers(user.id, 2),
      referralRepo.getEarnings(user.id),
    ])

    const referralLink = `https://t.me/${ctx.config.botUsername}?start=${user.referralCode}`

    const kb = new InlineKeyboard()
    if (!user.payoutWalletAddress) {
      kb.text('💳 Set Payout Wallet', CB_SET_PAYOUT_WALLET).row()
    }
    else {
      kb.text('💳 Change Payout Wallet', CB_SET_PAYOUT_WALLET).row()
    }
    kb.text('🏰 Home', 'cb_home')

    await ctx.sendNavigationMessage(
      buildReferralsText({
        tier1Count: tier1.length,
        tier2Count: tier2.length,
        totalEarned: earnings.totalEarned,
        pendingPayout: earnings.pendingPayout,
        payoutWallet: user.payoutWalletAddress,
        referralLink,
      }),
      { reply_markup: kb },
    )
  }
  catch (err) {
    log.error({ err }, 'Failed to render referrals')
    await ctx.sendTransientMessage('❌ Failed to load referrals.')
  }
})

// ── Set payout wallet ────────────────────────────────────────────────────

feat.callbackQuery(CB_SET_PAYOUT_WALLET, logHandle('cb-set-payout-wallet'), async (ctx) => {
  await ctx.answerCallbackQuery()
  if (!ctx.session.user)
    return

  ctx.session.inputState = { type: 'set_payout_wallet' }

  await ctx.sendNavigationMessage(
    buildSetPayoutWalletText(),
    {
      reply_markup: new InlineKeyboard().text('❌ Cancel', CB_REFERRALS),
    },
  )
})

export { composer as referralsHandler }
