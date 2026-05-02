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
  if (!userId) {
    await ctx.sendNavigationMessage(
      buildShadowSellHubText({ totalSells: 0, totalSolEarned: '0', statusCounts: {} }),
      { videoAssetKey: 'video:shadow-sell', reply_markup: buildShadowSellHubKeyboard() },
    )
    return
  }

  const [userProjects, agg] = await Promise.all([
    projectRepo.findAllByUserId(userId),
    featureRepo.getAggregateStatsByUserId(userId),
  ])

  const statusCounts: Record<string, number> = {}
  await Promise.all(
    userProjects.map(async (p) => {
      const pf = await featureRepo.findByProjectId(p.id)
      const status = pf?.status ?? 'idle'
      statusCounts[status] = (statusCounts[status] ?? 0) + 1
    }),
  )

  await ctx.sendNavigationMessage(buildShadowSellHubText({ ...agg, statusCounts }), {
    videoAssetKey: 'video:shadow-sell',
    reply_markup: buildShadowSellHubKeyboard(),
  })
})

export { composer as shadowSellHandler }
