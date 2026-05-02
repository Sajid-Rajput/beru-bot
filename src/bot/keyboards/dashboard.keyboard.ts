import type { Config } from '#root/config.js'
import {
  CB_CFG_MAX_SELL_PREFIX,
  CB_CFG_MCAP_PREFIX,
  CB_CFG_MIN_BUY_PREFIX,
  CB_CFG_MIN_SELL_PREFIX,
  CB_DELETE_PREFIX,
  CB_HOME,
  CB_MY_PROJECTS,
  CB_REFRESH_PREFIX,
  CB_START_PREFIX,
  CB_STOP_PREFIX,
  CB_WHITELIST_PREFIX,
} from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

const ACTIVE_STATUSES = new Set(['pending', 'watching', 'executing'])

export function buildDashboardKeyboard(
  projectId: string,
  status: string,
  config: Config,
): InlineKeyboard {
  const isActive = ACTIVE_STATUSES.has(status)
  const kb = new InlineKeyboard()

  // Row 1: Refresh
  kb.text('🔄 Refresh', `${CB_REFRESH_PREFIX}${projectId}`).row()

  // Row 2: Start or Stop
  if (isActive) {
    kb.text('⏹️ STOP', `${CB_STOP_PREFIX}${projectId}`).row()
  }
  else {
    kb.text('⚡ START', `${CB_START_PREFIX}${projectId}`).row()
  }

  // Row 3-4: Config buttons
  kb.text('📉 Min Sell%', `${CB_CFG_MIN_SELL_PREFIX}${projectId}`)
    .text('📈 Max Sell%', `${CB_CFG_MAX_SELL_PREFIX}${projectId}`)
    .row()

  kb.text('💰 Min MCAP', `${CB_CFG_MCAP_PREFIX}${projectId}`)
    .text('💵 Min Buy', `${CB_CFG_MIN_BUY_PREFIX}${projectId}`)
    .row()

  // Row 5: Whitelist
  kb.text('🛡️ Whitelist', `${CB_WHITELIST_PREFIX}${projectId}`).row()

  // Row 6: Delete
  kb.text('💀 Delete Project', `${CB_DELETE_PREFIX}${projectId}`).row()

  // Row 7: Navigation
  kb.text('👁️ My Projects', CB_MY_PROJECTS)
    .text('🏰 Home', CB_HOME)
    .row()

  // Row 8: Support
  kb.url('💬 Support', `https://t.me/${config.supportBot}`)

  return kb
}
