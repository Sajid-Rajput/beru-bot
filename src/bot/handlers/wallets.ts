import type { Context } from '#root/bot/context.js'
import { CB_HOME, CB_QUICK_SETUP, CB_WALLETS } from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildNoWalletsText, buildWalletsText } from '#root/bot/helpers/message-builder.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { WalletRepository } from '#root/db/repositories/wallet.repository.js'
import { Composer, InlineKeyboard } from 'grammy'

const walletRepo = new WalletRepository()
const projectRepo = new ProjectRepository()

const composer = new Composer<Context>()
const feature = composer.chatType('private')

function buildWalletsScreenKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('⚡ Import Wallet', CB_QUICK_SETUP)
    .row()
    .text('🏰 Home', CB_HOME)
}

feature.callbackQuery(CB_WALLETS, logHandle('cb-wallets'), async (ctx) => {
  await ctx.answerCallbackQuery()
  if (!ctx.session.user)
    return

  ctx.session.inputState = undefined

  const wallets = await walletRepo.findByUserId(ctx.session.user.id)

  if (wallets.length === 0) {
    await ctx.sendNavigationMessage(buildNoWalletsText(), {
      reply_markup: buildWalletsScreenKeyboard(),
    })
    return
  }

  // Build display items — list every active project that references each wallet
  const items = await Promise.all(
    wallets.map(async (w) => {
      const projects = await projectRepo.findByWalletId(w.id)
      return {
        publicKey: w.publicKey,
        projectNames: projects.map(p => p.tokenName ?? p.tokenMint),
      }
    }),
  )

  await ctx.sendNavigationMessage(buildWalletsText(items), {
    reply_markup: buildWalletsScreenKeyboard(),
  })
})

export { composer as walletsHandler }
