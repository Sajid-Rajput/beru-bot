/**
 * Job payload interfaces for BullMQ queues.
 * These are the TypeScript types for data passed to workers.
 */

// ── Sell Execution Queue ──────────────────────────────────────────────────────

import type { ShadowSellConfig } from '#root/db/schema/index.js'

/**
 * Frozen view of one referrer in the chain, captured by the Buy Detector when
 * the buy was matched. Mirrors `ReferrerSnapshot` from the WatchedFeatureCache.
 */
export interface SellJobReferrerSnapshot {
  userId: string
  sharePct: number
}

/** Two-tier referrer chain snapshot. Either tier may be null. */
export interface SellJobReferralSnapshot {
  tier1: SellJobReferrerSnapshot | null
  tier2: SellJobReferrerSnapshot | null
}

/**
 * Fully-resolved Sell Execution payload, per ADR-0002 decision 1 (Shape A).
 *
 * The Buy Detector has already matched against thresholds, picked a concrete
 * `sellPercentage`, snapshotted the owner's referrer chain, and deduped by
 * `triggerSignature`. The executor runs against this snapshot alone — no
 * cache reads, no live config or referral lookups.
 */
export interface SellJobData {
  /** Schema version of this payload (bump when shape changes). */
  schemaVersion: 1
  /** UUID of the project_feature this sell belongs to. */
  featureId: string
  /** On-chain signature of the buy transaction. Idempotency key. */
  triggerSignature: string
  /** SPL token mint address that was bought. */
  mint: string
  /** Public key of the user's main wallet (sweep destination). */
  mainWalletPubkey: string
  /** Integer percentage of the user's holding to sell (resolved at match time). */
  sellPercentage: number
  /** Frozen copy of the feature's ShadowSell config at match time. */
  configSnapshot: ShadowSellConfig
  /** Amount of SOL spent by the buyer that triggered this sell. */
  buyAmountSol: number
  /** Referrer chain captured at match time. */
  referralSnapshot: SellJobReferralSnapshot
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
