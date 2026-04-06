import type { Context } from '#root/bot/context.js'
import {
  CB_WHITELIST_PREFIX,
  CB_WL_ADD_PREFIX,
  CB_WL_PAGE_PREFIX,
  CB_WL_REMOVE_PREFIX,
} from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildAddWhitelistText, buildWhitelistText } from '#root/bot/helpers/message-builder.js'
import { buildAddWhitelistKeyboard, buildWhitelistKeyboard } from '#root/bot/keyboards/whitelist.keyboard.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { WhitelistRepository } from '#root/db/repositories/whitelist.repository.js'
import { projectService } from '#root/services/project.service.js'
import { MAX_WHITELIST_ENTRIES } from '#root/utils/constants.js'
import { createLogger } from '#root/utils/logger.js'
import { Composer } from 'grammy'

const log = createLogger('WhitelistHandler')
const whitelistRepo = new WhitelistRepository()
const featureRepo = new ProjectFeatureRepository()

const composer = new Composer<Context>()
const feat = composer.chatType('private')

const PAGE_SIZE = 5

// ── Shared whitelist renderer ────────────────────────────────────────────

export async function renderWhitelist(ctx: Context, projectId: string, page = 1): Promise<void> {
  if (!ctx.session.user)
    return

  const { feature } = await projectService.getProjectWithFeature(projectId, ctx.session.user.id)
  const allEntries = await whitelistRepo.findByFeatureId(feature.id)
  const total = allEntries.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageEntries = allEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const displayEntries = pageEntries.map(e => ({
    id: e.id,
    walletAddress: e.walletAddress,
  }))

  await ctx.sendNavigationMessage(
    buildWhitelistText(displayEntries, total, safePage, totalPages),
    { reply_markup: buildWhitelistKeyboard(displayEntries, projectId, safePage, totalPages) },
  )
}

// ── Navigate to whitelist ────────────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_WHITELIST_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-whitelist'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_WHITELIST_PREFIX.length)
    if (!projectId)
      return

    ctx.session.inputState = undefined

    try {
      await renderWhitelist(ctx, projectId)
    }
    catch (err) {
      log.error({ err, projectId }, 'Failed to render whitelist')
      await ctx.sendTransientMessage('❌ Failed to load whitelist.')
    }
  },
)

// ── Add whitelist entry (sets input mode) ────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_WL_ADD_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-wl-add'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_WL_ADD_PREFIX.length)
    if (!projectId)
      return

    const { feature } = await projectService.getProjectWithFeature(projectId, ctx.session.user.id)
    const count = await whitelistRepo.countByFeatureId(feature.id)

    if (count >= MAX_WHITELIST_ENTRIES) {
      await ctx.sendTransientMessage('❌ Whitelist is full (25/25).', 5_000)
      return
    }

    ctx.session.inputState = { type: 'whitelist_add', projectId }
    await ctx.sendNavigationMessage(
      buildAddWhitelistText(count),
      { reply_markup: buildAddWhitelistKeyboard(projectId) },
    )
  },
)

// ── Remove whitelist entry ───────────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_WL_REMOVE_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-wl-remove'),
  async (ctx) => {
    await ctx.answerCallbackQuery({ text: '✅ Removed' })
    if (!ctx.session.user)
      return

    const entryId = ctx.callbackQuery.data.slice(CB_WL_REMOVE_PREFIX.length)
    if (!entryId)
      return

    try {
      // Look up entry → feature → project before deleting
      const entry = await whitelistRepo.findById(entryId)
      if (!entry)
        return

      const pf = await featureRepo.findById(entry.projectFeatureId)
      if (!pf)
        return

      await whitelistRepo.delete(entryId)
      await renderWhitelist(ctx, pf.projectId)
    }
    catch (err) {
      log.error({ err, entryId }, 'Failed to remove whitelist entry')
      await ctx.sendTransientMessage('❌ Failed to remove entry.')
    }
  },
)

// ── Whitelist pagination ─────────────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_WL_PAGE_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-wl-page'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    // Format: cb_wl_pg:{page}:{projectId}
    const rest = ctx.callbackQuery.data.slice(CB_WL_PAGE_PREFIX.length)
    const colonIdx = rest.indexOf(':')
    if (colonIdx === -1)
      return

    const page = Number(rest.slice(0, colonIdx))
    const projectId = rest.slice(colonIdx + 1)
    if (Number.isNaN(page) || !projectId)
      return

    try {
      await renderWhitelist(ctx, projectId, page)
    }
    catch (err) {
      log.error({ err, projectId }, 'Failed to paginate whitelist')
    }
  },
)

export { composer as whitelistHandler }
