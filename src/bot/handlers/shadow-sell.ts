import type { Context } from '#root/bot/context.js'
import { CB_SHADOW_SELL } from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildShadowSellHubText } from '#root/bot/helpers/message-builder.js'
import { buildShadowSellHubKeyboard } from '#root/bot/keyboards/shadow-sell.keyboard.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { Composer } from 'grammy'

const projectRepo = new ProjectRepository()
const composer = new Composer<Context>()
const feature = composer.chatType('private')

feature.callbackQuery(CB_SHADOW_SELL, logHandle('cb-shadow-sell'), async (ctx) => {
  await ctx.answerCallbackQuery()

  ctx.session.inputState = undefined

  const projectCount = ctx.session.user
    ? await projectRepo.countByUserId(ctx.session.user.id)
    : 0

  await ctx.sendNavigationMessage(buildShadowSellHubText(projectCount), {
    videoAssetKey: 'video:shadow-sell',
    reply_markup: buildShadowSellHubKeyboard(),
  })
})

export { composer as shadowSellHandler }
