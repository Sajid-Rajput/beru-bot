import type { Context } from '#root/bot/context.js'
import type { HomeStats } from '#root/bot/helpers/message-builder.js'
import { CB_CANCEL_TO_HOME, CB_HOME, CB_NOOP } from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildHomeText } from '#root/bot/helpers/message-builder.js'
import { buildHomeKeyboard } from '#root/bot/keyboards/home.keyboard.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { Composer } from 'grammy'

const projectRepo = new ProjectRepository()
const featureRepo = new ProjectFeatureRepository()
const composer = new Composer<Context>()
const feature = composer.chatType('private')

/** Fetches aggregate stats used by both text and keyboard. */
async function getHomeStats(userId: string | undefined, firstName: string): Promise<HomeStats> {
  if (!userId)
    return { projectCount: 0, totalSells: 0, totalSolEarned: '0', firstName }
  const [projectCount, agg] = await Promise.all([
    projectRepo.countByUserId(userId),
    featureRepo.getAggregateStatsByUserId(userId),
  ])
  return { projectCount, ...agg, firstName }
}

// ── T3.10: Home / Cancel-to-Home callback ─────────────────────────────────

feature.callbackQuery([CB_HOME, CB_CANCEL_TO_HOME], logHandle('cb-home'), async (ctx) => {
  await ctx.answerCallbackQuery()

  // Clear any pending input state
  ctx.session.inputState = undefined

  const stats = await getHomeStats(ctx.session.user?.id, ctx.from?.first_name ?? 'Monarch')

  await ctx.sendNavigationMessage(buildHomeText(stats), {
    videoAssetKey: 'video:introduction',
    reply_markup: buildHomeKeyboard(ctx.config, stats.projectCount),
  })
})

// ── Dead button handler: section-header labels in keyboards ───────────────
feature.callbackQuery(CB_NOOP, async (ctx) => {
  await ctx.answerCallbackQuery()
})

export { composer as homeHandler }
