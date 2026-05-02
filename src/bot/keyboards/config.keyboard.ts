import {
  CB_CANCEL_CONFIG_PREFIX,
  CB_SET_MAX_SELL_PREFIX,
  CB_SET_MCAP_PREFIX,
  CB_SET_MIN_BUY_PREFIX,
  CB_SET_MIN_SELL_PREFIX,
} from '#root/bot/callback-data/index.js'
import { InlineKeyboard } from 'grammy'

export function buildMinSellKeyboard(projectId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('1%', `${CB_SET_MIN_SELL_PREFIX}1:${projectId}`)
    .text('3%', `${CB_SET_MIN_SELL_PREFIX}3:${projectId}`)
    .row()
    .text('5%', `${CB_SET_MIN_SELL_PREFIX}5:${projectId}`)
    .text('10%', `${CB_SET_MIN_SELL_PREFIX}10:${projectId}`)
    .row()
    .text('15%', `${CB_SET_MIN_SELL_PREFIX}15:${projectId}`)
    .text('✏️ Custom', `${CB_SET_MIN_SELL_PREFIX}custom:${projectId}`)
    .row()
    .text('❌ Cancel', `${CB_CANCEL_CONFIG_PREFIX}${projectId}`)
}

export function buildMaxSellKeyboard(projectId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('10%', `${CB_SET_MAX_SELL_PREFIX}10:${projectId}`)
    .text('15%', `${CB_SET_MAX_SELL_PREFIX}15:${projectId}`)
    .row()
    .text('20%', `${CB_SET_MAX_SELL_PREFIX}20:${projectId}`)
    .text('30%', `${CB_SET_MAX_SELL_PREFIX}30:${projectId}`)
    .row()
    .text('50%', `${CB_SET_MAX_SELL_PREFIX}50:${projectId}`)
    .text('✏️ Custom', `${CB_SET_MAX_SELL_PREFIX}custom:${projectId}`)
    .row()
    .text('❌ Cancel', `${CB_CANCEL_CONFIG_PREFIX}${projectId}`)
}

export function buildMcapKeyboard(projectId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('$0', `${CB_SET_MCAP_PREFIX}0:${projectId}`)
    .text('$10K', `${CB_SET_MCAP_PREFIX}10000:${projectId}`)
    .row()
    .text('$50K', `${CB_SET_MCAP_PREFIX}50000:${projectId}`)
    .text('$100K', `${CB_SET_MCAP_PREFIX}100000:${projectId}`)
    .row()
    .text('$500K', `${CB_SET_MCAP_PREFIX}500000:${projectId}`)
    .text('✏️ Custom', `${CB_SET_MCAP_PREFIX}custom:${projectId}`)
    .row()
    .text('❌ Cancel', `${CB_CANCEL_CONFIG_PREFIX}${projectId}`)
}

export function buildMinBuyKeyboard(projectId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('0.1 SOL', `${CB_SET_MIN_BUY_PREFIX}0.1:${projectId}`)
    .text('0.5 SOL', `${CB_SET_MIN_BUY_PREFIX}0.5:${projectId}`)
    .row()
    .text('1 SOL', `${CB_SET_MIN_BUY_PREFIX}1:${projectId}`)
    .text('2 SOL', `${CB_SET_MIN_BUY_PREFIX}2:${projectId}`)
    .row()
    .text('5 SOL', `${CB_SET_MIN_BUY_PREFIX}5:${projectId}`)
    .text('✏️ Custom', `${CB_SET_MIN_BUY_PREFIX}custom:${projectId}`)
    .row()
    .text('❌ Cancel', `${CB_CANCEL_CONFIG_PREFIX}${projectId}`)
}
