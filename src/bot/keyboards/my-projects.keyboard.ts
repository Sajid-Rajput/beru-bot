import type { ProjectListItem } from '#root/bot/helpers/message-builder.js'
import {
  CB_HOME,
  CB_NEW_PROJECT,
  CB_SELECT_PROJECT_PREFIX,
} from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

const STATUS_EMOJI: Record<string, string> = {
  idle: '⏸️',
  pending: '⏳',
  watching: '👁️',
  executing: '⚡',
  completed: '✅',
  stopped: '🛑',
  error: '❌',
}

export function buildMyProjectsKeyboard(projects: ProjectListItem[]): InlineKeyboard {
  const kb = new InlineKeyboard()

  for (const p of projects) {
    const emoji = STATUS_EMOJI[p.status] ?? '⏸️'
    const name = p.tokenSymbol ?? p.tokenName ?? p.tokenMint.slice(0, 8)
    kb.text(`${emoji} ${name}`, `${CB_SELECT_PROJECT_PREFIX}${p.id}`).row()
  }

  kb.text('➕ New Project', CB_NEW_PROJECT).row()
  kb.text('🏠 Home', CB_HOME)

  return kb
}

export function buildNoProjectsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ New Project', CB_NEW_PROJECT)
    .row()
    .text('🏠 Home', CB_HOME)
}
