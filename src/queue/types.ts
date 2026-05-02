/**
 * Job payload interfaces for BullMQ queues.
 * These are the TypeScript types for data passed to workers.
 */

// ── Sell Execution Queue ──────────────────────────────────────────────────────

/** Payload enqueued by StreamWebhookHandler when a qualifying buy is detected */
export interface SellJobData {
  /** Solana token mint address that was bought */
  tokenMint: string
  /** Buyer's Solana wallet address */
  buyerAddress: string
  /** Amount of SOL spent by the buyer */
  buyAmountSol: number
  /** On-chain signature of the buy transaction (used for dedup) */
  triggerTxSignature: string
  /** UUID of the project_feature that should respond to this buy */
  projectFeatureId: string
  /** UUID of the project */
  projectId: string
}

// ── Notification Queue ────────────────────────────────────────────────────────

export type NotificationType =
  | 'sell.completed'
  | 'sell.failed'
  | 'feature.activated'
  | 'feature.paused'
  | 'feature.completed'
  | 'feature.error'
  | 'payout.sent'
  | 'recovery.success'
  | 'recovery.failed'
  | 'referral.join'

/** Payload enqueued whenever a user needs to be notified */
export interface NotificationJobData {
  /** Telegram user ID to send the notification to */
  telegramId: number
  /** Notification type — determines message template */
  type: NotificationType
  /** Type-specific extra data for message template population */
  data: Record<string, unknown>
}
