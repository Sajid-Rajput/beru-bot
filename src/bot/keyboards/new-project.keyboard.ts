import {
  CB_CANCEL_TO_HOME,
  CB_CONFIRM_PROJECT_PREFIX,
  CB_KEY_ACKNOWLEDGED_PREFIX,
  CB_PROJECT_WALLET_GENERATE,
  CB_PROJECT_WALLET_LINK,
  CB_PROJECT_WALLET_PICK_PREFIX,
} from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

/** Keyboard shown on the "Enter CA" screen */
export function buildNewProjectCaInputKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('❌ Cancel', CB_CANCEL_TO_HOME)
}

/** Keyboard shown when a token is found — user can confirm or cancel */
export function buildTokenFoundKeyboard(tokenMint: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', `${CB_CONFIRM_PROJECT_PREFIX}${tokenMint}`)
    .row()
    .text('❌ Cancel', CB_CANCEL_TO_HOME)
}

/** Keyboard shown on the project key display screen */
export function buildKeyAcknowledgedKeyboard(projectId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Acknowledged', `${CB_KEY_ACKNOWLEDGED_PREFIX}${projectId}`)
}

/**
 * Shown after the user confirms a token — offers "link existing" and/or
 * "create new" wallet. If the user has no wallets yet, the link option is
 * omitted so they only see the generate path.
 */
export function buildWalletChoiceKeyboard(hasExistingWallets: boolean): InlineKeyboard {
  const kb = new InlineKeyboard()
  if (hasExistingWallets)
    kb.text('🔗 Link existing wallet', CB_PROJECT_WALLET_LINK).row()
  kb.text('🆕 Create new wallet for this project', CB_PROJECT_WALLET_GENERATE).row()
  kb.text('❌ Cancel', CB_CANCEL_TO_HOME)
  return kb
}

/**
 * One row per wallet — label shows a truncated pubkey + either the balance
 * of the pending token (when known) or a generic marker.
 */
export function buildWalletPickerKeyboard(
  wallets: Array<{ id: string, publicKey: string, balanceLabel?: string }>,
): InlineKeyboard {
  const kb = new InlineKeyboard()
  for (const w of wallets) {
    const truncated = `${w.publicKey.slice(0, 6)}…${w.publicKey.slice(-4)}`
    const label = w.balanceLabel ? `${truncated} — ${w.balanceLabel}` : truncated
    kb.text(label, `${CB_PROJECT_WALLET_PICK_PREFIX}${w.id}`).row()
  }
  kb.text('❌ Cancel', CB_CANCEL_TO_HOME)
  return kb
}
