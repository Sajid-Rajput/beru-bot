import type { Context } from '#root/bot/context.js'
import type { ProjectListItem } from '#root/bot/helpers/message-builder.js'
import { CB_MY_PROJECTS, CB_SELECT_PROJECT_PREFIX } from '#root/bot/callback-data/index.js'
import { renderDashboard } from '#root/bot/handlers/dashboard.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildMyProjectsText, buildNoProjectsText } from '#root/bot/helpers/message-builder.js'
import { buildMyProjectsKeyboard, buildNoProjectsKeyboard } from '#root/bot/keyboards/my-projects.keyboard.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { Composer } from 'grammy'

const projectRepo = new ProjectRepository()
const featureRepo = new ProjectFeatureRepository()

const composer = new Composer<Context>()
const feature = composer.chatType('private')

// ── T4.4: My Projects list ────────────────────────────────────────────────

feature.callbackQuery(CB_MY_PROJECTS, logHandle('cb-my-projects'), async (ctx) => {
  await ctx.answerCallbackQuery()

  if (!ctx.session.user)
    return

  const projects = await projectRepo.findAllByUserId(ctx.session.user.id)

  if (projects.length === 0) {
    await ctx.sendNavigationMessage(buildNoProjectsText(), {
      reply_markup: buildNoProjectsKeyboard(),
    })
    return
  }

  // Build list items with feature status
  const items: ProjectListItem[] = await Promise.all(
    projects.map(async (p) => {
      const pf = await featureRepo.findByProjectId(p.id)
      return {
        id: p.id,
        tokenName: p.tokenName,
        tokenSymbol: p.tokenSymbol,
        tokenMint: p.tokenMint,
        status: pf?.status ?? 'idle',
      }
    }),
  )

  await ctx.sendNavigationMessage(buildMyProjectsText(items), {
    reply_markup: buildMyProjectsKeyboard(items),
  })
})

// ── Select project → navigate to dashboard ──

feature.callbackQuery(
  new RegExp(`^${CB_SELECT_PROJECT_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-select-project'),
  async (ctx) => {
    await ctx.answerCallbackQuery()

    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_SELECT_PROJECT_PREFIX.length)
    if (!projectId)
      return

    ctx.session.inputState = undefined
    await renderDashboard(ctx, projectId)
  },
)

export { composer as myProjectsHandler }
