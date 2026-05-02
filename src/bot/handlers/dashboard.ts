import type { Context } from '#root/bot/context.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import {
  CB_BACK_DASH_PREFIX,
  CB_REFRESH_PREFIX,
  CB_START_PREFIX,
  CB_STOP_PREFIX,
} from '#root/bot/callback-data/index.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import { buildDashboardText, buildPinnedStatusText } from '#root/bot/helpers/message-builder.js'
import { buildDashboardKeyboard } from '#root/bot/keyboards/dashboard.keyboard.js'
import { AuditLogRepository } from '#root/db/repositories/audit-log.repository.js'
import { ProjectFeatureRepository } from '#root/db/repositories/project-feature.repository.js'
import { WalletRepository } from '#root/db/repositories/wallet.repository.js'
import { WhitelistRepository } from '#root/db/repositories/whitelist.repository.js'
import { projectService } from '#root/services/project.service.js'
import { createLogger } from '#root/utils/logger.js'
import { Composer } from 'grammy'

const log = createLogger('DashboardHandler')
const featureRepo = new ProjectFeatureRepository()
const walletRepo = new WalletRepository()
const whitelistRepo = new WhitelistRepository()
const auditRepo = new AuditLogRepository()

const composer = new Composer<Context>()
const feature = composer.chatType('private')

const ACTIVE_STATUSES = new Set(['pending', 'watching', 'executing'])

// ── Shared dashboard renderer (exported for config-screens, smart-detection) ──

export async function renderDashboard(ctx: Context, projectId: string): Promise<void> {
  if (!ctx.session.user)
    return

  const { project, feature: pf } = await projectService.getProjectWithFeature(
    projectId,
    ctx.session.user.id,
  )
  const wallet = await walletRepo.findById(project.walletId)
  const whitelistCount = await whitelistRepo.countByFeatureId(pf.id)
  const config = pf.config as ShadowSellConfig

  await ctx.sendNavigationMessage(
    buildDashboardText({
      tokenName: project.tokenName ?? project.tokenMint,
      tokenSymbol: project.tokenSymbol ?? '',
      tokenMint: project.tokenMint,
      dexUrl: project.dexUrl,
      walletPublicKey: wallet?.publicKey ?? '—',
      status: pf.status,
      config,
      totalSellCount: pf.totalSellCount,
      totalSolReceived: pf.totalSolReceived,
      totalSoldAmount: pf.totalSoldAmount,
      whitelistCount,
      lastMarketCapUsd: pf.lastMarketCapUsd,
    }),
    { reply_markup: buildDashboardKeyboard(projectId, pf.status, ctx.config) },
  )
}

// ── Back to dashboard ────────────────────────────────────────────────────

feature.callbackQuery(
  new RegExp(`^${CB_BACK_DASH_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-back-to-dashboard'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_BACK_DASH_PREFIX.length)
    if (!projectId)
      return

    ctx.session.inputState = undefined

    try {
      await renderDashboard(ctx, projectId)
    }
    catch (err) {
      log.error({ err, projectId }, 'Failed to render dashboard')
      await ctx.sendTransientMessage('❌ Failed to load project.')
    }
  },
)

// ── Refresh dashboard ────────────────────────────────────────────────────

feature.callbackQuery(
  new RegExp(`^${CB_REFRESH_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-refresh-dashboard'),
  async (ctx) => {
    await ctx.answerCallbackQuery({ text: '🔄 Refreshed' })
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_REFRESH_PREFIX.length)
    if (!projectId)
      return

    try {
      await renderDashboard(ctx, projectId)
    }
    catch (err) {
      log.error({ err, projectId }, 'Failed to refresh dashboard')
    }
  },
)

// ── Start Shadow Sell (T4.7) ─────────────────────────────────────────────

feature.callbackQuery(
  new RegExp(`^${CB_START_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-start-shadow-sell'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_START_PREFIX.length)
    if (!projectId)
      return

    try {
      const { project, feature: pf } = await projectService.getProjectWithFeature(
        projectId,
        ctx.session.user.id,
      )

      if (ACTIVE_STATUSES.has(pf.status)) {
        await ctx.sendTransientMessage('⚠️ Shadow Sell is already active.')
        return
      }

      const config = pf.config as ShadowSellConfig

      // TODO: Pre-flight balance checks when SolanaService is implemented

      // Transition: idle/stopped/completed/error → pending
      await featureRepo.updateStatus(pf.id, 'pending')

      // If no MCAP threshold, immediately transition to watching
      if (config.targetMarketCapUsd === 0) {
        await featureRepo.updateStatus(pf.id, 'watching')
        await featureRepo.setWatching(pf.id, true)

        // TODO: Add to watched-token cache + sync QN KV

        // Create + pin status message
        const pinnedMsg = await ctx.sendPinnedStatusMessage(
          buildPinnedStatusText({
            tokenName: project.tokenName ?? project.tokenMint,
            tokenSymbol: project.tokenSymbol ?? '',
            tokenMint: project.tokenMint,
            config,
            totalSellCount: pf.totalSellCount,
            totalSolReceived: pf.totalSolReceived,
            totalSoldAmount: pf.totalSoldAmount,
            state: 'watching',
          }),
        )
        await featureRepo.updatePinnedMessageId(pf.id, pinnedMsg.message_id)
        await ctx.sendTransientMessage('⚡ Shadow Sell is now <b>WATCHING</b>', 30_000)
      }
      else {
        await ctx.sendTransientMessage(
          '🟡 Shadow Sell is <b>PENDING</b> — waiting for MCAP target',
          30_000,
        )
      }

      await auditRepo.create({
        userId: ctx.session.user.id,
        eventType: 'feature.start',
        eventData: { projectId, featureId: pf.id },
      })

      await renderDashboard(ctx, projectId)
    }
    catch (err) {
      log.error({ err, projectId }, 'Failed to start Shadow Sell')
      await ctx.sendTransientMessage(
        `❌ Failed to start: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  },
)

// ── Stop Shadow Sell (T4.7) ──────────────────────────────────────────────

feature.callbackQuery(
  new RegExp(`^${CB_STOP_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-stop-shadow-sell'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return

    const projectId = ctx.callbackQuery.data.slice(CB_STOP_PREFIX.length)
    if (!projectId)
      return

    try {
      const { project, feature: pf } = await projectService.getProjectWithFeature(
        projectId,
        ctx.session.user.id,
      )

      if (!ACTIVE_STATUSES.has(pf.status)) {
        await ctx.sendTransientMessage('⚠️ Shadow Sell is not active.')
        return
      }

      await featureRepo.updateStatus(pf.id, 'stopped')
      await featureRepo.setWatching(pf.id, false)

      // TODO: Remove from watched-token cache + sync QN KV

      if (pf.pinnedMessageId) {
        const config = pf.config as ShadowSellConfig
        try {
          await ctx.updatePinnedStatusMessage(
            pf.pinnedMessageId,
            buildPinnedStatusText({
              tokenName: project.tokenName ?? project.tokenMint,
              tokenSymbol: project.tokenSymbol ?? '',
              tokenMint: project.tokenMint,
              config,
              totalSellCount: pf.totalSellCount,
              totalSolReceived: pf.totalSolReceived,
              totalSoldAmount: pf.totalSoldAmount,
              state: 'stopped',
            }),
          )
        }
        catch (pinErr) {
          log.warn({ err: pinErr }, 'Failed to update pinned message')
        }
      }

      await auditRepo.create({
        userId: ctx.session.user.id,
        eventType: 'feature.stop',
        eventData: { projectId, featureId: pf.id },
      })

      await ctx.sendTransientMessage('⏹️ Shadow Sell <b>STOPPED</b>', 30_000)
      await renderDashboard(ctx, projectId)
    }
    catch (err) {
      log.error({ err, projectId }, 'Failed to stop Shadow Sell')
      await ctx.sendTransientMessage(
        `❌ Failed to stop: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  },
)

export { composer as dashboardHandler }
