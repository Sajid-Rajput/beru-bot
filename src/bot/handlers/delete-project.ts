import type { Context } from '#root/bot/context.js'
import {
  CB_CANCEL_DELETE_PREFIX,
  CB_CONFIRM_DELETE_PREFIX,
  CB_DELETE_PREFIX,
  CB_HOME,
  CB_MY_PROJECTS,
} from '#root/bot/callback-data/index.js'
import { renderDashboard } from '#root/bot/handlers/dashboard.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildDeleteConfirmText } from '#root/bot/helpers/message-builder.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { projectService } from '#root/services/project.service.js'
import { createLogger } from '#root/utils/logger.js'
import { Composer, InlineKeyboard } from 'grammy'

const log = createLogger('DeleteProjectHandler')
const featureRepo = new ProjectFeatureRepository()

const composer = new Composer<Context>()
const feat = composer.chatType('private')

const ACTIVE_STATUSES = new Set(['pending', 'watching', 'executing'])

// ── Show delete confirmation ─────────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_DELETE_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-delete-project'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_DELETE_PREFIX.length)
    if (!projectId)
      return

    const { project, feature } = await projectService.getProjectWithFeature(
      projectId,
      ctx.session.user.id,
    )
    const isActive = ACTIVE_STATUSES.has(feature.status)

    await ctx.sendNavigationMessage(
      buildDeleteConfirmText(project.tokenName ?? project.tokenMint, isActive),
      {
        reply_markup: new InlineKeyboard()
          .text('✅ Confirm Delete', `${CB_CONFIRM_DELETE_PREFIX}${projectId}`)
          .text('❌ Cancel', `${CB_CANCEL_DELETE_PREFIX}${projectId}`),
      },
    )
  },
)

// ── Confirm delete ───────────────────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_CONFIRM_DELETE_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-confirm-delete'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_CONFIRM_DELETE_PREFIX.length)
    if (!projectId)
      return

    try {
      // Stop feature if active before deleting
      const { feature } = await projectService.getProjectWithFeature(
        projectId,
        ctx.session.user.id,
      )
      if (ACTIVE_STATUSES.has(feature.status)) {
        await featureRepo.updateStatus(feature.id, 'stopped')
        await featureRepo.setWatching(feature.id, false)
      }

      await projectService.deleteProject(ctx.session.user.id, projectId)

      await ctx.sendNavigationMessage('✅ Project deleted successfully.', {
        reply_markup: new InlineKeyboard()
          .text('👁️ My Projects', CB_MY_PROJECTS)
          .text('🏰 Home', CB_HOME),
      })
    }
    catch (err) {
      log.error({ err, projectId }, 'Failed to delete project')
      await ctx.sendTransientMessage(
        `❌ Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  },
)

// ── Cancel delete ────────────────────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_CANCEL_DELETE_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-cancel-delete'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_CANCEL_DELETE_PREFIX.length)
    if (!projectId)
      return

    await renderDashboard(ctx, projectId)
  },
)

export { composer as deleteProjectHandler }
