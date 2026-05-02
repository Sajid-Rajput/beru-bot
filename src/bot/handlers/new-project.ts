import type { Context } from '#root/bot/context.js'
import {
  CB_CONFIRM_PROJECT_PREFIX,
  CB_KEY_ACKNOWLEDGED_PREFIX,
  CB_NEW_PROJECT,
  CB_PROJECT_WALLET_GENERATE,
  CB_PROJECT_WALLET_LINK,
  CB_PROJECT_WALLET_PICK_PREFIX,
  CB_SELECT_PROJECT_PREFIX,
} from '#root/bot/callback-data/index.js'
import { renderDashboard } from '#root/bot/handlers/dashboard.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import {
  buildNewProjectCaInputText,
  buildProjectKeyText,
  buildProjectLimitText,
  buildWalletChoiceText,
  buildWalletPickerText,
} from '#root/bot/helpers/message-builder.js'
import { buildHomeKeyboard } from '#root/bot/keyboards/home.keyboard.js'
import {
  buildKeyAcknowledgedKeyboard,
  buildNewProjectCaInputKeyboard,
  buildWalletChoiceKeyboard,
  buildWalletPickerKeyboard,
} from '#root/bot/keyboards/new-project.keyboard.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { dexscreenerService } from '#root/services/dexscreener.service.js'
import { ProjectService } from '#root/services/project.service.js'
import { WalletService } from '#root/services/wallet.service.js'
import { KEY_DISPLAY_DELETE_AFTER, MAX_PROJECTS_PER_USER } from '#root/utils/constants.js'
import { createLogger } from '#root/utils/logger.js'
import { Composer, InlineKeyboard } from 'grammy'

const log = createLogger('NewProjectHandler')
const projectRepo = new ProjectRepository()
const projectService = new ProjectService()
const walletService = new WalletService()

const composer = new Composer<Context>()
const feature = composer.chatType('private')

// ── Helpers ──────────────────────────────────────────────────────────────

async function resolveTokenName(tokenMint: string): Promise<string> {
  const info = await dexscreenerService.getTokenInfo(tokenMint).catch(() => null)
  return info?.name ?? tokenMint
}

async function finalizeLink(ctx: Context, walletId: string, tokenMint: string): Promise<void> {
  if (!ctx.session.user)
    return
  try {
    const { project } = await projectService.createProject(
      ctx.session.user.id,
      tokenMint,
      walletId,
    )
    ctx.session.pendingNewProjectMint = undefined
    log.info(
      { userId: ctx.session.user.id, projectId: project.id, walletId, tokenMint },
      'Project created via link-existing wallet',
    )

    const kb = new InlineKeyboard()
      .text('📊 Open Dashboard', `${CB_SELECT_PROJECT_PREFIX}${project.id}`)
      .row()
      .text('🏠 Home', 'cb_home')
    await ctx.sendNavigationMessage(
      `✅ Project <b>${project.tokenName ?? tokenMint}</b> created and linked to your wallet.`,
      { reply_markup: kb },
    )
  }
  catch (err) {
    log.error({ err, tokenMint, walletId }, 'Link-wallet project creation failed')
    await ctx.sendTransientMessage(
      `❌ Project creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }
}

// ── T3.7: New Project — prompt for CA ─────────────────────────────────────

feature.callbackQuery(CB_NEW_PROJECT, logHandle('cb-new-project'), async (ctx) => {
  await ctx.answerCallbackQuery()

  if (!ctx.session.user)
    return

  // Enforce project limit
  const projectCount = await projectRepo.countByUserId(ctx.session.user.id)
  if (projectCount >= MAX_PROJECTS_PER_USER) {
    await ctx.sendNavigationMessage(buildProjectLimitText(), {
      reply_markup: buildHomeKeyboard(ctx.config),
    })
    return
  }

  // Wallet check removed — we now let the user generate a wallet inline if
  // they don't already have one. Set input mode so smart-detection routes
  // the next text message as a token CA.
  ctx.session.inputState = { type: 'new_project_ca' }

  await ctx.sendNavigationMessage(buildNewProjectCaInputText(), {
    reply_markup: buildNewProjectCaInputKeyboard(),
  })
})

// ── Confirm token — show wallet choice ────────────────────────────────────

feature.callbackQuery(
  new RegExp(`^${CB_CONFIRM_PROJECT_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-confirm-project'),
  async (ctx) => {
    await ctx.answerCallbackQuery()

    if (!ctx.session.user)
      return

    const tokenMint = ctx.callbackQuery.data.slice(CB_CONFIRM_PROJECT_PREFIX.length)
    if (!tokenMint)
      return

    // Stash the pending mint in session so the wallet-choice callbacks below
    // stay within Telegram's 64-byte callback-data limit.
    ctx.session.pendingNewProjectMint = tokenMint
    ctx.session.inputState = undefined

    const [existingWallets, tokenName] = await Promise.all([
      walletService.listWallets(ctx.session.user.id),
      resolveTokenName(tokenMint),
    ])

    await ctx.sendNavigationMessage(
      buildWalletChoiceText(tokenName, existingWallets.length > 0),
      { reply_markup: buildWalletChoiceKeyboard(existingWallets.length > 0) },
    )
  },
)

// ── Link existing wallet ──────────────────────────────────────────────────

feature.callbackQuery(CB_PROJECT_WALLET_LINK, logHandle('cb-pwl'), async (ctx) => {
  await ctx.answerCallbackQuery()

  if (!ctx.session.user)
    return
  const tokenMint = ctx.session.pendingNewProjectMint
  if (!tokenMint) {
    await ctx.sendTransientMessage('❌ Session expired. Please start over.')
    return
  }

  const holders = await walletService.listWalletsHoldingToken(ctx.session.user.id, tokenMint)

  // Exactly one holder → auto-pick, no extra click
  if (holders.length === 1) {
    await finalizeLink(ctx, holders[0]!.wallet.id, tokenMint)
    return
  }

  // 0 or >1 holders → show picker. When no wallet holds the token, fall back
  // to listing every wallet the user owns so they can still pick one.
  const candidates = holders.length > 0
    ? holders.map(h => ({
        id: h.wallet.id,
        publicKey: h.wallet.publicKey,
        balanceLabel: `${h.balance.toLocaleString()} tokens`,
      }))
    : (await walletService.listWallets(ctx.session.user.id)).map(w => ({
        id: w.id,
        publicKey: w.publicKey,
      }))

  const tokenName = await resolveTokenName(tokenMint)
  await ctx.sendNavigationMessage(
    buildWalletPickerText(tokenName, holders.length > 0),
    { reply_markup: buildWalletPickerKeyboard(candidates) },
  )
})

// ── Pick a specific wallet (from the picker) ─────────────────────────────

feature.callbackQuery(
  new RegExp(`^${CB_PROJECT_WALLET_PICK_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-pwp'),
  async (ctx) => {
    await ctx.answerCallbackQuery()

    if (!ctx.session.user)
      return
    const tokenMint = ctx.session.pendingNewProjectMint
    if (!tokenMint) {
      await ctx.sendTransientMessage('❌ Session expired. Please start over.')
      return
    }

    const walletId = ctx.callbackQuery.data.slice(CB_PROJECT_WALLET_PICK_PREFIX.length)
    if (!walletId)
      return

    await finalizeLink(ctx, walletId, tokenMint)
  },
)

// ── Generate a fresh wallet for this project ─────────────────────────────

feature.callbackQuery(CB_PROJECT_WALLET_GENERATE, logHandle('cb-pwg'), async (ctx) => {
  await ctx.answerCallbackQuery()

  if (!ctx.session.user)
    return
  const tokenMint = ctx.session.pendingNewProjectMint
  if (!tokenMint) {
    await ctx.sendTransientMessage('❌ Session expired. Please start over.')
    return
  }

  try {
    const wallet = await walletService.generateWallet(ctx.session.user.id)
    const { project } = await projectService.createProject(
      ctx.session.user.id,
      tokenMint,
      wallet.id,
    )
    ctx.session.pendingNewProjectMint = undefined

    const privateKey = await walletService.decryptWalletKey(
      wallet.id,
      'display',
      ctx.session.user.id,
    )

    // Delete the previous navigation message (wallet choice screen)
    if (ctx.session.lastNavMessageId && ctx.chat) {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.session.lastNavMessageId).catch(() => {})
      ctx.session.lastNavMessageId = undefined
    }

    const keyMsg = await ctx.sendSensitiveMessage(
      buildProjectKeyText(
        project.tokenName ?? tokenMint,
        tokenMint,
        wallet.publicKey,
        privateKey,
      ),
      buildKeyAcknowledgedKeyboard(project.id),
      KEY_DISPLAY_DELETE_AFTER * 1000, // seconds → ms
    )

    if (ctx.chat) {
      await ctx.api
        .pinChatMessage(ctx.chat.id, keyMsg.message_id, { disable_notification: true })
        .catch(err => log.warn({ err, messageId: keyMsg.message_id }, 'Failed to pin project key message'))
    }

    log.info(
      { userId: ctx.session.user.id, projectId: project.id, tokenMint },
      'Project created with generated wallet',
    )
  }
  catch (err) {
    log.error({ err, tokenMint }, 'Generate-wallet project creation failed')
    await ctx.sendTransientMessage(
      `❌ Project creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }
})

// ── Key Acknowledged — navigate to project dashboard ─────────────────────

feature.callbackQuery(
  new RegExp(`^${CB_KEY_ACKNOWLEDGED_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-key-acknowledged'),
  async (ctx) => {
    await ctx.answerCallbackQuery()

    if (!ctx.session.user)
      return

    // Delete the key message (the callback came from the sensitive message)
    await ctx.deleteMessage().catch(() => {})

    const projectId = ctx.callbackQuery.data.slice(CB_KEY_ACKNOWLEDGED_PREFIX.length)
    if (!projectId)
      return

    await renderDashboard(ctx, projectId)
  },
)

export { composer as newProjectHandler }
