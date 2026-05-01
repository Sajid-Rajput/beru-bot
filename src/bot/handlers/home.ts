import type { Context } from '#root/bot/context.js'
import type { HomeStats } from '#root/bot/helpers/message-builder.js'
import { CB_CANCEL_TO_HOME, CB_HOME, CB_NOOP } from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildHomeText, buildWelcomeText } from '#root/bot/helpers/message-builder.js'
import { buildHomeKeyboard } from '#root/bot/keyboards/home.keyboard.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { Composer } from 'grammy'

const projectRepo = new ProjectRepository()
const featureRepo = new ProjectFeatureRepository()
const composer = new Composer<Context>()
const feature = composer.chatType('private')

/**
 * Returns HOME stats only when the user has onboarded (≥1 project).
 * Returns null otherwise, signaling that the welcome screen should be
 * shown instead so HOME never renders with all-zero stats.
 */
async function getHomeStats(userId: string | undefined, firstName: string): Promise<HomeStats | null> {
  if (!userId)
    return null
  const projectCount = await projectRepo.countByUserId(userId)
  if (projectCount === 0)
    return null
  const agg = await featureRepo.getAggregateStatsByUserId(userId)
  return { projectCount, ...agg, firstName }
}

// ── T3.10: Home / Cancel-to-Home callback ─────────────────────────────────

feature.callbackQuery([CB_HOME, CB_CANCEL_TO_HOME], logHandle('cb-home'), async (ctx) => {
  await ctx.answerCallbackQuery()

  // Clear any pending input state
  ctx.session.inputState = undefined

  const firstName = ctx.from?.first_name ?? 'Monarch'
  const stats = await getHomeStats(ctx.session.user?.id, firstName)

  const caption = stats
    ? buildHomeText(stats)
    : buildWelcomeText({ isReturning: true, firstName })

  await ctx.sendNavigationMessage(caption, {
    videoAssetKey: 'video:introduction',
    reply_markup: buildHomeKeyboard(ctx.config),
  })
})

// ── Dead button handler: section-header labels in keyboards ───────────────
feature.callbackQuery(CB_NOOP, async (ctx) => {
  await ctx.answerCallbackQuery()
})

export { composer as homeHandler }
