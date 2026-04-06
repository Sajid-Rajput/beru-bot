import type { Context, SendNavigationOptions } from '#root/bot/context.js'
import type { MiddlewareFn } from 'grammy'
import type { Message } from 'grammy/types'
import { sendAnimation } from '#root/bot/helpers/video-sender.js'
import { KEY_DISPLAY_DELETE_AFTER } from '#root/utils/constants.js'
import { createLogger } from '#root/utils/logger.js'

const log = createLogger('MessageManagement')

/**
 * Heuristic: base58 string of 80–90 chars is almost certainly a Solana private key.
 * Used as a safety net — if any user text looks like a private key, delete immediately.
 */
const PRIVATE_KEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/

/**
 * Message Management Middleware — injected onto every `ctx`.
 *
 * Implements the 4 message lifecycle categories from the interface doc §4:
 *   1. Navigation — single-message interface (delete old → send new → store ID)
 *   2. Pinned Status — persists, edited in-place
 *   3. Transient — auto-deletes on timer
 *   4. Sensitive — spoiler + auto-delete (24h default)
 *
 * Also implements invariant 7: immediate deletion of user-pasted private keys.
 */
export const messageManagement: MiddlewareFn<Context> = async (ctx, next) => {
  const chatId = ctx.chat?.id

  // ── Safety net: delete messages that look like private keys (invariant 7) ───
  if (ctx.message?.text && chatId) {
    const trimmed = ctx.message.text.trim()
    if (PRIVATE_KEY_PATTERN.test(trimmed)) {
      await ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => {})
      log.warn({ chatId }, 'Deleted message matching private key pattern (safety net)')
    }
  }

  // ── sendNavigationMessage ───────────────────────────────────────────────────
  ctx.sendNavigationMessage = async (
    text: string,
    options?: SendNavigationOptions,
  ): Promise<Message> => {
    if (!chatId)
      throw new Error('sendNavigationMessage requires a chat context')

    // 1. Delete previous navigation message
    if (ctx.session.lastNavMessageId) {
      await ctx.api.deleteMessage(chatId, ctx.session.lastNavMessageId).catch(() => {})
      ctx.session.lastNavMessageId = undefined
    }

    // 2. Send new navigation message (with or without video)
    let msg: Message
    if (options?.videoAssetKey) {
      msg = await sendAnimation(ctx, options.videoAssetKey, {
        caption: text,
        reply_markup: options?.reply_markup
          ? { inline_keyboard: options.reply_markup.inline_keyboard }
          : undefined as any,
      })
    }
    else {
      msg = await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: options?.reply_markup,
      })
    }

    // 3. Store new nav message ID
    ctx.session.lastNavMessageId = msg.message_id
    return msg
  }

  // ── sendTransientMessage ────────────────────────────────────────────────────
  ctx.sendTransientMessage = async (
    text: string,
    deleteAfterMs = 60_000,
  ): Promise<Message> => {
    if (!chatId)
      throw new Error('sendTransientMessage requires a chat context')

    const msg = await ctx.reply(text, { parse_mode: 'HTML' })

    // Schedule auto-delete
    setTimeout(async () => {
      await ctx.api.deleteMessage(chatId, msg.message_id).catch(() => {})
    }, deleteAfterMs)

    return msg
  }

  // ── sendSensitiveMessage ────────────────────────────────────────────────────
  ctx.sendSensitiveMessage = async (
    text: string,
    replyMarkup?,
    deleteAfterMs = KEY_DISPLAY_DELETE_AFTER * 1000, // default 24h
  ): Promise<Message> => {
    if (!chatId)
      throw new Error('sendSensitiveMessage requires a chat context')

    const msg = await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    })

    // Schedule auto-delete
    setTimeout(async () => {
      await ctx.api.deleteMessage(chatId, msg.message_id).catch(() => {})
    }, deleteAfterMs)

    return msg
  }

  // ── sendPinnedStatusMessage ─────────────────────────────────────────────────
  ctx.sendPinnedStatusMessage = async (text: string): Promise<Message> => {
    if (!chatId)
      throw new Error('sendPinnedStatusMessage requires a chat context')

    const msg = await ctx.reply(text, { parse_mode: 'HTML' })

    await ctx.api.pinChatMessage(chatId, msg.message_id, {
      disable_notification: true,
    }).catch((err) => {
      log.warn({ err, chatId, messageId: msg.message_id }, 'Failed to pin status message')
    })

    return msg
  }

  // ── updatePinnedStatusMessage ───────────────────────────────────────────────
  ctx.updatePinnedStatusMessage = async (
    messageId: number,
    text: string,
  ): Promise<void> => {
    if (!chatId)
      throw new Error('updatePinnedStatusMessage requires a chat context')

    await ctx.api.editMessageText(chatId, messageId, text, {
      parse_mode: 'HTML',
    }).catch((err) => {
      log.warn({ err, chatId, messageId }, 'Failed to edit pinned status message')
    })
  }

  // ── deleteUserMessage ───────────────────────────────────────────────────────
  ctx.deleteUserMessage = async (): Promise<void> => {
    if (!chatId || !ctx.message?.message_id)
      return
    await ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => {})
  }

  await next()
}
