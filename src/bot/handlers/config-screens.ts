import type { Context } from '#root/bot/context.js'
import type { ShadowSellConfig } from '#root/db/schema/index.js'
import {
  CB_CANCEL_CONFIG_PREFIX,
  CB_CFG_MAX_SELL_PREFIX,
  CB_CFG_MCAP_PREFIX,
  CB_CFG_MIN_BUY_PREFIX,
  CB_CFG_MIN_SELL_PREFIX,
  CB_SET_MAX_SELL_PREFIX,
  CB_SET_MCAP_PREFIX,
  CB_SET_MIN_BUY_PREFIX,
  CB_SET_MIN_SELL_PREFIX,
} from '#root/bot/callback-data/index.js'
import { renderDashboard } from '#root/bot/handlers/dashboard.js'
import { logHandle } from '#root/bot/helpers/logging.js'
import {
  buildConfigLockedText,
  buildConfigMaxSellText,
  buildConfigMcapText,
  buildConfigMinBuyText,
  buildConfigMinSellText,
  buildConfigSavedText,
} from '#root/bot/helpers/message-builder.js'
import {
  buildMaxSellKeyboard,
  buildMcapKeyboard,
  buildMinBuyKeyboard,
  buildMinSellKeyboard,
} from '#root/bot/keyboards/config.keyboard.js'
import { AuditLogRepository } from '#root/db/repositories/audit-log.repository.js'
import { projectService } from '#root/services/project.service.js'
import { Composer } from 'grammy'

const auditRepo = new AuditLogRepository()

const composer = new Composer<Context>()
const feat = composer.chatType('private')

const EDITABLE_STATUSES = new Set(['idle', 'stopped', 'completed', 'error'])

// ── Helpers ──────────────────────────────────────────────────────────────

async function getEditableFeature(ctx: Context, projectId: string) {
  if (!ctx.session.user)
    return null
  const { feature } = await projectService.getProjectWithFeature(projectId, ctx.session.user.id)
  if (!EDITABLE_STATUSES.has(feature.status)) {
    await ctx.sendTransientMessage(buildConfigLockedText(), 5_000)
    return null
  }
  return feature
}

function parseValueAndProject(data: string, prefix: string): { value: string, projectId: string } | null {
  const rest = data.slice(prefix.length)
  const colonIdx = rest.indexOf(':')
  if (colonIdx === -1)
    return null
  return { value: rest.slice(0, colonIdx), projectId: rest.slice(colonIdx + 1) }
}

async function handlePreset(
  ctx: Context,
  prefix: string,
  field: keyof ShadowSellConfig,
  fieldLabel: string,
  inputType: 'config_min_sell' | 'config_max_sell' | 'config_min_mcap' | 'config_min_buy',
  validate: (v: number, cfg: ShadowSellConfig) => string | null,
): Promise<void> {
  const data = ctx.callbackQuery?.data
  if (!data || !ctx.session.user)
    return

  const parsed = parseValueAndProject(data, prefix)
  if (!parsed)
    return

  const { value, projectId } = parsed

  if (value === 'custom') {
    const pf = await getEditableFeature(ctx, projectId)
    if (!pf)
      return
    ctx.session.inputState = { type: inputType, projectId }
    return
  }

  const numValue = Number(value)
  if (Number.isNaN(numValue))
    return

  const pf = await getEditableFeature(ctx, projectId)
  if (!pf)
    return

  const config = pf.config as ShadowSellConfig
  const error = validate(numValue, config)
  if (error) {
    await ctx.sendTransientMessage(`❌ ${error}`, 5_000)
    return
  }

  const newConfig: ShadowSellConfig = { ...config, [field]: numValue }
  await projectService.updateConfig(ctx.session.user.id, pf.id, newConfig)

  await auditRepo.create({
    userId: ctx.session.user.id,
    eventType: 'config.change',
    eventData: { featureId: pf.id, field, oldValue: config[field], newValue: numValue },
  })

  await ctx.sendTransientMessage(buildConfigSavedText(fieldLabel, String(numValue)), 5_000)
  await renderDashboard(ctx, projectId)
}

// ── Navigate to config screens ───────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_CFG_MIN_SELL_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-cfg-min-sell'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    const projectId = ctx.callbackQuery.data.slice(CB_CFG_MIN_SELL_PREFIX.length)
    const pf = await getEditableFeature(ctx, projectId)
    if (!pf)
      return
    const config = pf.config as ShadowSellConfig
    ctx.session.inputState = undefined
    await ctx.sendNavigationMessage(
      buildConfigMinSellText(config.minSellPercentage),
      { reply_markup: buildMinSellKeyboard(projectId) },
    )
  },
)

feat.callbackQuery(
  new RegExp(`^${CB_CFG_MAX_SELL_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-cfg-max-sell'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    const projectId = ctx.callbackQuery.data.slice(CB_CFG_MAX_SELL_PREFIX.length)
    const pf = await getEditableFeature(ctx, projectId)
    if (!pf)
      return
    const config = pf.config as ShadowSellConfig
    ctx.session.inputState = undefined
    await ctx.sendNavigationMessage(
      buildConfigMaxSellText(config.maxSellPercentage, config.minSellPercentage),
      { reply_markup: buildMaxSellKeyboard(projectId) },
    )
  },
)

feat.callbackQuery(
  new RegExp(`^${CB_CFG_MCAP_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-cfg-mcap'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    const projectId = ctx.callbackQuery.data.slice(CB_CFG_MCAP_PREFIX.length)
    const pf = await getEditableFeature(ctx, projectId)
    if (!pf)
      return
    const config = pf.config as ShadowSellConfig
    ctx.session.inputState = undefined
    await ctx.sendNavigationMessage(
      buildConfigMcapText(config.targetMarketCapUsd),
      { reply_markup: buildMcapKeyboard(projectId) },
    )
  },
)

feat.callbackQuery(
  new RegExp(`^${CB_CFG_MIN_BUY_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-cfg-min-buy'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    const projectId = ctx.callbackQuery.data.slice(CB_CFG_MIN_BUY_PREFIX.length)
    const pf = await getEditableFeature(ctx, projectId)
    if (!pf)
      return
    const config = pf.config as ShadowSellConfig
    ctx.session.inputState = undefined
    await ctx.sendNavigationMessage(
      buildConfigMinBuyText(config.minBuyAmountSol),
      { reply_markup: buildMinBuyKeyboard(projectId) },
    )
  },
)

// ── Preset value handlers ────────────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_SET_MIN_SELL_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-set-min-sell'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    await handlePreset(ctx, CB_SET_MIN_SELL_PREFIX, 'minSellPercentage', 'Min Sell %', 'config_min_sell', (v, cfg) => {
      if (v < 1 || v > 100 || !Number.isInteger(v))
        return 'Must be 1–100.'
      if (v > cfg.maxSellPercentage)
        return `Must be ≤ Max Sell (${cfg.maxSellPercentage}%).`
      return null
    })
  },
)

feat.callbackQuery(
  new RegExp(`^${CB_SET_MAX_SELL_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-set-max-sell'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    await handlePreset(ctx, CB_SET_MAX_SELL_PREFIX, 'maxSellPercentage', 'Max Sell %', 'config_max_sell', (v, cfg) => {
      if (v < 1 || v > 100 || !Number.isInteger(v))
        return 'Must be 1–100.'
      if (v < cfg.minSellPercentage)
        return `Must be ≥ Min Sell (${cfg.minSellPercentage}%).`
      return null
    })
  },
)

feat.callbackQuery(
  new RegExp(`^${CB_SET_MCAP_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-set-mcap'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    await handlePreset(ctx, CB_SET_MCAP_PREFIX, 'targetMarketCapUsd', 'Min MCAP', 'config_min_mcap', (v) => {
      if (v < 0)
        return 'Must be ≥ 0.'
      return null
    })
  },
)

feat.callbackQuery(
  new RegExp(`^${CB_SET_MIN_BUY_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-set-min-buy'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    await handlePreset(ctx, CB_SET_MIN_BUY_PREFIX, 'minBuyAmountSol', 'Min Buy', 'config_min_buy', (v) => {
      if (v < 0.001)
        return 'Must be at least 0.001 SOL.'
      return null
    })
  },
)

// ── Cancel config ────────────────────────────────────────────────────────

feat.callbackQuery(
  new RegExp(`^${CB_CANCEL_CONFIG_PREFIX.replace(':', '\\:')}`),
  logHandle('cb-cancel-config'),
  async (ctx) => {
    await ctx.answerCallbackQuery()
    if (!ctx.session.user)
      return
    const projectId = ctx.callbackQuery.data.slice(CB_CANCEL_CONFIG_PREFIX.length)
    ctx.session.inputState = undefined
    await renderDashboard(ctx, projectId)
  },
)

export { composer as configScreensHandler }
