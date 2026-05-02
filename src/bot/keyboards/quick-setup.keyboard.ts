import {
  CB_CANCEL_TO_HOME,
  CB_HOME,
  CB_NEW_PROJECT,
} from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

/** Keyboard shown on the Quick Setup screen (waiting for private key input) */
export function buildQuickSetupKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Cancel', CB_CANCEL_TO_HOME)
}

/** Keyboard shown after a wallet has been successfully imported */
export function buildWalletImportedKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ New Project', CB_NEW_PROJECT)
    .row()
    .text('🏠 Home', CB_HOME)
}
