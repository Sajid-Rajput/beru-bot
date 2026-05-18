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

// ── Notification Queue (ADR-0002 N-2, fat payload) ────────────────────────────
//
// Cross-process seam: subsystems running in the worker process enqueue a
// fat-payload Notification job; the bot process consumes it and renders the
// Telegram message. Every job carries everything needed to render — the
// consumer makes zero DB reads. See `docs/adr/0002-sell-execution-state-machine.md`
// decision 6 and the `Notification` entry in `CONTEXT.md`.

export type NotificationJob =
  | {
    userId: string
    kind: 'sell.completed'
    context: {
      mint: string
      symbol: string
      soldTokens: number
      receivedSol: number
      txSignatures: { trigger: string, sweep: string }
    }
  }
  | {
    userId: string
    kind: 'sell.failed'
    context: {
      mint: string
      symbol: string
      reason: string
    }
  }
  | {
    userId: string
    kind: 'sell.recovered'
    context: {
      mint: string
      symbol: string
    }
  }
  | {
    userId: string
    kind: 'payout.sent'
    context: {
      amountSol: number
      txSignature: string
    }
  }
  | {
    userId: string
    kind: 'state.alert'
    context: {
      message: string
      projectId: string
    }
  }
  | {
    userId: string
    kind: 'admin.alert'
    context: {
      severity: string
      message: string
    }
  }

/** Discriminant values of {@link NotificationJob} — useful for exhaustive switches. */
export type NotificationKind = NotificationJob['kind']
