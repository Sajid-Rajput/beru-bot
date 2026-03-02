import type { Config } from '#root/config.js'
import type { Logger } from '#root/logger.js'
import type { AutoChatActionFlavor } from '@grammyjs/auto-chat-action'
import type { ConversationFlavor } from '@grammyjs/conversations'
import type { HydrateFlavor } from '@grammyjs/hydrate'
import type { I18nFlavor } from '@grammyjs/i18n'
import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { Context as DefaultContext, SessionFlavor } from 'grammy'

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
}

interface ExtendedContextFlavor {
  logger: Logger
  config: Config
}

export type Context = ConversationFlavor<
  ParseModeFlavor<
    HydrateFlavor<
      DefaultContext &
      ExtendedContextFlavor &
      SessionFlavor<SessionData> &
      I18nFlavor &
      AutoChatActionFlavor
    >
  >
>
