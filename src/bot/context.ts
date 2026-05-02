import type { Config } from '#root/config.js'
import type { Logger } from '#root/logger.js'
import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { ConversationFlavor } from '@grammyjs/conversations'
import type { HydrateFlavor } from '@grammyjs/hydrate'
import type { I18nFlavor } from '@grammyjs/i18n'
import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { Context as DefaultContext, SessionFlavor } from 'grammy'
import type { InlineKeyboardMarkup, Message } from 'grammy/types'

/** Shape of the awaited-input tracking stored in session */
export interface InputState {
  type:
    | 'import_wallet'
    | 'new_project_ca'
    | 'config_min_sell'
    | 'config_max_sell'
    | 'config_min_mcap'
    | 'config_min_buy'
    | 'set_payout_wallet'
    | 'whitelist_add'
  /** Scoped to a specific project when setting config values */
  projectId?: string
}

/** Lightweight user reference cached in session (avoids repeat DB lookups) */
export interface SessionUser {
  id: string
  telegramId: number
}

export interface SessionData {
  /** Message ID of the last navigation-category message — deleted when a new one is sent */
  lastNavMessageId?: number
  /** Current awaited-input mode (set when bot expects a free-text reply) */
  inputState?: InputState
  /** Cached DB user reference — populated by user-resolution middleware */
  user?: SessionUser
  /**
   * Token mint the user is currently creating a project for — kept in session
   *  so wallet-choice callbacks stay within the 64-byte callback-data limit.
   */
  pendingNewProjectMint?: string
}

/** Options for sendNavigationMessage */
export interface SendNavigationOptions {
  reply_markup?: InlineKeyboardMarkup
  /** Video asset key (e.g. 'video:introduction') — if provided, sends animation instead of text */
  videoAssetKey?: string
}

/** Message management helpers injected by message-management middleware */
interface MessageManagementFlavor {
  /**
   * Delete the previous navigation message, send a new one, and store its ID
   * in session.lastNavMessageId. Only 1 nav message visible at a time.
   */
  sendNavigationMessage: (text: string, options?: SendNavigationOptions) => Promise<Message>
  /**
   * Send a transient message that auto-deletes after `deleteAfterMs` (default 60s).
   * Does NOT replace the navigation message.
   */
  sendTransientMessage: (text: string, deleteAfterMs?: number) => Promise<Message>
  /**
   * Send a sensitive message (e.g. private key) with Telegram spoiler formatting.
   * Auto-deletes after `deleteAfterMs` (default 24h). Includes inline keyboard if provided.
   */
  sendSensitiveMessage: (text: string, replyMarkup?: InlineKeyboardMarkup, deleteAfterMs?: number) => Promise<Message>
  /**
   * Send a new pinned status message (e.g. Shadow Sell active status).
   * Pins the message to the chat.
   */
  sendPinnedStatusMessage: (text: string) => Promise<Message>
  /**
   * Edit an existing pinned status message in-place.
   */
  updatePinnedStatusMessage: (messageId: number, text: string) => Promise<void>
  /**
   * Delete the user's current message (the one that triggered this update).
   * Silently ignores errors (message already deleted, etc.).
   */
  deleteUserMessage: () => Promise<void>
}

interface ExtendedContextFlavor {
  logger: Logger
  config: Config
  /** Set to `true` by user-resolution middleware when a brand-new user is created */
  isNewUser?: boolean
}

export type Context = ConversationFlavor<
  ParseModeFlavor<
    HydrateFlavor<
      DefaultContext &
      ExtendedContextFlavor &
      MessageManagementFlavor &
      SessionFlavor<SessionData> &
      I18nFlavor &
      AutoChatActionFlavor
    >
  >
>
