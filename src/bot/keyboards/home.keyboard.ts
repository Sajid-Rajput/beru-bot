import type { Config } from '#root/config.js'
import {
  CB_NOOP,
  CB_REFERRALS,
  CB_SHADOW_SELL,
  CB_WALLETS,
} from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

export function buildHomeKeyboard(
  config: Config,
): InlineKeyboard {
  return new InlineKeyboard()
    .text('─────  ⚔️ FEATURES  ─────', CB_NOOP)
    .row()
    .text('🌑 Shadow Sell', CB_SHADOW_SELL)
    .row()
    .text('─────  💼 ACCOUNT  ─────', CB_NOOP)
    .row()
    .text('💼 Wallets', CB_WALLETS)
    .text('🎁 Referrals', CB_REFERRALS)
    .row()
    .url('💬 Support', `https://t.me/${config.supportBot}`)
}
