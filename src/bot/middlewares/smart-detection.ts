import type { Context } from '#root/bot/context.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import type { MiddlewareFn } from 'grammy'
import { renderDashboard } from '#root/bot/handlers/dashboard.js'
import { renderWhitelist } from '#root/bot/handlers/whitelist.js'
import {
  buildConfigSavedText,
  buildProjectExistsText,
  buildTokenFoundText,
  buildTokenNotFoundText,
  buildWalletImportedText,
  buildWalletImportErrorText,
  formatMcap,
} from '#root/bot/helpers/message-builder.js'
import { buildHomeKeyboard } from '#root/bot/keyboards/home.keyboard.js'
import { buildNewProjectCaInputKeyboard, buildTokenFoundKeyboard } from '#root/bot/keyboards/new-project.keyboard.js'
import { buildWalletImportedKeyboard } from '#root/bot/keyboards/quick-setup.keyboard.js'
import { ProjectRepository } from '#root/db/repositories/project.repository.js'
import { UserRepository } from '#root/db/repositories/user.repository.js'
import { WhitelistRepository } from '#root/db/repositories/whitelist.repository.js'
import { dexscreenerService } from '#root/services/dexscreener.service.js'
import { projectService } from '#root/services/project.service.js'
import { WalletService } from '#root/services/wallet.service.js'
import { MAX_WHITELIST_ENTRIES } from '#root/utils/constants.js'
import { WalletError } from '#root/utils/errors.js'
import { createLogger } from '#root/utils/logger.js'

const log = createLogger('SmartDetection')
const walletService = new WalletService()
const projectRepo = new ProjectRepository()
const userRepo = new UserRepository()
const whitelistRepo = new WhitelistRepository()

/** Solana base-58 address/mint pattern: 32–44 chars */
const CA_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** Solana private key heuristic: 80–90 base-58 chars (64-byte key in base58) */
const PRIVATE_KEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/

/**
 * Smart-detection middleware (T3.6).
 *
 * Intercepts plain text messages and routes them based on:
 *  1. Active `inputState` in session (highest priority)
 *  2. CA pattern detection (auto-starts new-project flow)
 *  3. Falls through to next middleware for anything else
 *
 * Always deletes the user's text message to keep the chat clean.
 */
export const smartDetection: MiddlewareFn<Context> = async (ctx, next) => {
  // Only handle text messages in private chats
  if (!ctx.message?.text || ctx.chat?.type !== 'private') {
    return next()
  }

  const text = ctx.message.text.trim()
  const inputState = ctx.session.inputState

  // ── 1. InputState-based routing ─────────────────────────────────────────

  if (inputState) {
    // Always delete user message when in input mode
    await ctx.deleteUserMessage()

    switch (inputState.type) {
      case 'import_wallet': {
        await handleWalletImport(ctx, text)
        return
      }
      case 'new_project_ca': {
        await handleNewProjectCa(ctx, text)
        return
      }
      case 'config_min_sell':
      case 'config_max_sell':
      case 'config_min_mcap':
      case 'config_min_buy': {
        await handleConfigInput(ctx, text, inputState)
        return
      }
      case 'set_payout_wallet': {
        await handlePayoutWalletInput(ctx, text)
        return
      }
      case 'whitelist_add': {
        await handleWhitelistInput(ctx, text, inputState)
        return
      }
      // Future input states will be handled here
      default: {
        // Unknown input state — fall through
        return next()
      }
    }
  }

  // ── 2. Auto-detection: CA pattern → new project flow ────────────────────

  if (CA_PATTERN.test(text)) {
    await ctx.deleteUserMessage()
    await handleNewProjectCa(ctx, text)
    return
  }

  // ── 3. Safety: detect accidental private key paste (no inputState) ──────

  if (PRIVATE_KEY_PATTERN.test(text)) {
    await ctx.deleteUserMessage()
    log.warn({ telegramId: ctx.from?.id }, 'Private key pasted outside input mode — deleted')
    await ctx.sendTransientMessage(
      '⚠️ That looked like a private key. Message has been deleted for your safety.',
      10_000,
    )
    return
  }

  // ── 4. Unrecognised text — pass through ─────────────────────────────────
  return next()
}

// ── Wallet import handler ─────────────────────────────────────────────────────

async function handleWalletImport(ctx: Context, text: string): Promise<void> {
  if (!ctx.session.user)
    return

  try {
    const wallet = await walletService.importWallet(ctx.session.user.id, text)

    // Clear input state
    ctx.session.inputState = undefined

    await ctx.sendNavigationMessage(
      buildWalletImportedText(wallet.publicKey),
      { reply_markup: buildWalletImportedKeyboard() },
    )

    log.info(
      { userId: ctx.session.user.id, publicKey: wallet.publicKey },
      'Wallet imported via quick setup',
    )
  }
  catch (err) {
    const reason = err instanceof WalletError
      ? err.message
      : 'An unexpected error occurred. Please try again.'

    log.error({ err }, 'Wallet import failed')

    await ctx.sendNavigationMessage(
      buildWalletImportErrorText(reason),
      { reply_markup: buildHomeKeyboard(ctx.config) },
    )

    // Keep inputState so user can retry (unless it was a duplicate)
    if (err instanceof WalletError && err.code === 'WALLET_DUPLICATE') {
      ctx.session.inputState = undefined
    }
  }
}

// ── New project CA handler ────────────────────────────────────────────────────

async function handleNewProjectCa(ctx: Context, text: string): Promise<void> {
  if (!ctx.session.user)
    return

  // Validate CA format
  if (!CA_PATTERN.test(text)) {
    await ctx.sendNavigationMessage(
      buildTokenNotFoundText(),
      { reply_markup: buildNewProjectCaInputKeyboard() },
    )
    return
  }

  const tokenMint = text

  // Check if user already has a project for this token
  const existing = await projectRepo.findByUserIdAndMint(ctx.session.user.id, tokenMint)
  if (existing) {
    ctx.session.inputState = undefined
    await ctx.sendTransientMessage(
      buildProjectExistsText(existing.tokenName ?? tokenMint),
      5000,
    )
    // TODO: Navigate to project dashboard when implemented
    return
  }

  // Look up token on DexScreener
  const tokenInfo = await dexscreenerService.getTokenInfo(tokenMint)

  if (!tokenInfo) {
    // Keep input state so user can retry
    await ctx.sendNavigationMessage(
      buildTokenNotFoundText(),
      { reply_markup: buildNewProjectCaInputKeyboard() },
    )
    return
  }

  // Clear input state — user will confirm via callback button
  ctx.session.inputState = undefined

  await ctx.sendNavigationMessage(
    buildTokenFoundText(tokenInfo.name, tokenInfo.symbol, tokenInfo.dex, tokenMint),
    { reply_markup: buildTokenFoundKeyboard(tokenMint) },
  )
}

// ── Config custom value handler ───────────────────────────────────────────────

async function handleConfigInput(
  ctx: Context,
  text: string,
  inputState: NonNullable<Context['session']['inputState']>,
): Promise<void> {
  if (!ctx.session.user || !inputState.projectId)
    return

  const value = Number(text.replace(/,/g, '').trim())
  if (Number.isNaN(value)) {
    await ctx.sendTransientMessage('❌ Please enter a valid number.', 5_000)
    return
  }

  const { feature } = await projectService.getProjectWithFeature(
    inputState.projectId,
    ctx.session.user.id,
  )
  const config = feature.config as ShadowSellConfig

  let field: keyof ShadowSellConfig
  let label: string
  let error: string | null = null

  switch (inputState.type) {
    case 'config_min_sell':
      field = 'minSellPercentage'
      label = 'Min Sell %'
      if (value < 1 || value > 100 || !Number.isInteger(value))
        error = 'Must be 1–100.'
      else if (value > config.maxSellPercentage)
        error = `Must be ≤ Max Sell (${config.maxSellPercentage}%).`
      break
    case 'config_max_sell':
      field = 'maxSellPercentage'
      label = 'Max Sell %'
      if (value < 1 || value > 100 || !Number.isInteger(value))
        error = 'Must be 1–100.'
      else if (value < config.minSellPercentage)
        error = `Must be ≥ Min Sell (${config.minSellPercentage}%).`
      break
    case 'config_min_mcap':
      field = 'targetMarketCapUsd'
      label = 'Min MCAP'
      if (value < 0)
        error = 'Must be ≥ 0.'
      break
    case 'config_min_buy':
      field = 'minBuyAmountSol'
      label = 'Min Buy'
      if (value < 0.001)
        error = 'Must be at least 0.001 SOL.'
      break
    default:
      return
  }

  if (error) {
    await ctx.sendTransientMessage(`❌ ${error}`, 5_000)
    return
  }

  const newConfig: ShadowSellConfig = { ...config, [field]: value }
  await projectService.updateConfig(ctx.session.user.id, feature.id, newConfig)

  ctx.session.inputState = undefined
  const displayValue = inputState.type === 'config_min_mcap'
    ? (value === 0 ? '$0' : `$${formatMcap(value)}`)
    : String(value)
  await ctx.sendTransientMessage(buildConfigSavedText(label, displayValue), 5_000)
  await renderDashboard(ctx, inputState.projectId)
}

// ── Payout wallet handler ─────────────────────────────────────────────────────

async function handlePayoutWalletInput(ctx: Context, text: string): Promise<void> {
  if (!ctx.session.user)
    return

  if (!CA_PATTERN.test(text)) {
    await ctx.sendTransientMessage('❌ Invalid Solana address. Please try again.', 5_000)
    return
  }

  await userRepo.updatePayoutWallet(ctx.session.user.id, text)
  ctx.session.inputState = undefined
  await ctx.sendTransientMessage('✅ Payout wallet updated.', 5_000)
}

// ── Whitelist add handler ─────────────────────────────────────────────────────

async function handleWhitelistInput(
  ctx: Context,
  text: string,
  inputState: NonNullable<Context['session']['inputState']>,
): Promise<void> {
  if (!ctx.session.user || !inputState.projectId)
    return

  if (!CA_PATTERN.test(text)) {
    await ctx.sendTransientMessage('❌ Invalid Solana address. Please try again.', 5_000)
    return
  }

  const address = text
  const { feature } = await projectService.getProjectWithFeature(
    inputState.projectId,
    ctx.session.user.id,
  )

  const count = await whitelistRepo.countByFeatureId(feature.id)
  if (count >= MAX_WHITELIST_ENTRIES) {
    ctx.session.inputState = undefined
    await ctx.sendTransientMessage('❌ Whitelist is full (25/25).', 5_000)
    return
  }

  const exists = await whitelistRepo.isWhitelisted(feature.id, address)
  if (exists) {
    await ctx.sendTransientMessage('❌ This address is already whitelisted.', 5_000)
    return
  }

  await whitelistRepo.create(feature.id, address)
  ctx.session.inputState = undefined
  await ctx.sendTransientMessage('✅ Wallet added to whitelist.', 5_000)
  await renderWhitelist(ctx, inputState.projectId)
}
