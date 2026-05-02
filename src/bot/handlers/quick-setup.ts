import type { Context } from '#root/bot/context.js'
import { CB_QUICK_SETUP } from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildQuickSetupText } from '#root/bot/helpers/message-builder.js'
import { buildQuickSetupKeyboard } from '#root/bot/keyboards/quick-setup.keyboard.js'
import { Composer } from 'grammy'

const composer = new Composer<Context>()
const feature = composer.chatType('private')

// ── T3.5: Quick Setup — prompt user for wallet import ─────────────────────

feature.callbackQuery(CB_QUICK_SETUP, logHandle('cb-quick-setup'), async (ctx) => {
  await ctx.answerCallbackQuery()

  // Set input state so smart-detection routes the next text message to wallet import
  ctx.session.inputState = { type: 'import_wallet' }

  await ctx.sendNavigationMessage(buildQuickSetupText(), {
    reply_markup: buildQuickSetupKeyboard(),
  })
})

export { composer as quickSetupHandler }
