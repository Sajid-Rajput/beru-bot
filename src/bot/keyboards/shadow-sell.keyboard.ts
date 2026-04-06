import {
  CB_HOME,
  CB_MY_PROJECTS,
  CB_NEW_PROJECT,
  CB_QUICK_SETUP,
} from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

export function buildShadowSellHubKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('👁️ My Projects', CB_MY_PROJECTS)
    .row()
    .text('➕ New Project', CB_NEW_PROJECT)
    .row()
    .text('⚡ Quick Setup', CB_QUICK_SETUP)
    .row()
    .text('🏰 Home', CB_HOME)
}
