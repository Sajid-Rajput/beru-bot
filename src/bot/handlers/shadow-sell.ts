import type { Context } from '#root/bot/context.js'
import { CB_SHADOW_SELL } from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildShadowSellHubText } from '#root/bot/helpers/message-builder.js'
import { buildShadowSellHubKeyboard } from '#root/bot/keyboards/shadow-sell.keyboard.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { Composer } from 'grammy'

const projectRepo = new ProjectRepository()
const featureRepo = new ProjectFeatureRepository()
const composer = new Composer<Context>()
const feature = composer.chatType('private')

feature.callbackQuery(CB_SHADOW_SELL, logHandle('cb-shadow-sell'), async (ctx) => {
  await ctx.answerCallbackQuery()

  ctx.session.inputState = undefined

  const userId = ctx.session.user?.id
  const [projectCount, agg] = userId
    ? await Promise.all([
        projectRepo.countByUserId(userId),
        featureRepo.getAggregateStatsByUserId(userId),
      ])
    : [0, { totalSells: 0, totalSolEarned: '0' }]

  await ctx.sendNavigationMessage(buildShadowSellHubText({ projectCount, ...agg }), {
    videoAssetKey: 'video:shadow-sell',
    reply_markup: buildShadowSellHubKeyboard(),
  })
})

export { composer as shadowSellHandler }
