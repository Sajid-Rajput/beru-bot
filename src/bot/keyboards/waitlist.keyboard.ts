import type { Config } from '#root/config.js'
import { CB_WAITLIST_CHECK, CB_WAITLIST_JOIN } from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

/** Pre-launch welcome screen: join, check position, or reach support. */
export function buildWaitlistKeyboard(config: Config): InlineKeyboard {
  return new InlineKeyboard()
    .text('📋 Join Waitlist', CB_WAITLIST_JOIN)
    .row()
    .text('🎯 Check My Position', CB_WAITLIST_CHECK)
    .row()
    .url('💬 Support', `https://t.me/${config.supportBot}`)
}

/** Shown once a member is on the list — no Join button, just refresh + support. */
export function buildWaitlistJoinedKeyboard(config: Config): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎯 Check My Position', CB_WAITLIST_CHECK)
    .row()
    .url('💬 Support', `https://t.me/${config.supportBot}`)
}
