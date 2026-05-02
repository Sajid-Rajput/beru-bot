import type { WhitelistDisplayEntry } from '#root/bot/helpers/message-builder.js'
import {
  CB_BACK_DASH_PREFIX,
  CB_WHITELIST_PREFIX,
  CB_WL_ADD_PREFIX,
  CB_WL_PAGE_PREFIX,
  CB_WL_REMOVE_PREFIX,
} from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

export function buildWhitelistKeyboard(
  entries: WhitelistDisplayEntry[],
  projectId: string,
  page: number,
  totalPages: number,
): InlineKeyboard {
  const kb = new InlineKeyboard()

  // Remove button per entry
  for (const entry of entries) {
    const addr = `${entry.walletAddress.slice(0, 6)}…${entry.walletAddress.slice(-4)}`
    kb.text(`💀 ${addr}`, `${CB_WL_REMOVE_PREFIX}${entry.id}`).row()
  }

  // Pagination
  if (totalPages > 1) {
    if (page > 1)
      kb.text('« Prev', `${CB_WL_PAGE_PREFIX}${page - 1}:${projectId}`)
    if (page < totalPages)
      kb.text('Next »', `${CB_WL_PAGE_PREFIX}${page + 1}:${projectId}`)
    kb.row()
  }

  kb.text('➕ Add Wallet', `${CB_WL_ADD_PREFIX}${projectId}`).row()
  kb.text('« Back to Project', `${CB_BACK_DASH_PREFIX}${projectId}`)

  return kb
}

export function buildAddWhitelistKeyboard(projectId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Cancel', `${CB_WHITELIST_PREFIX}${projectId}`)
}
