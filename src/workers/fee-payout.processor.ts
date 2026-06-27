import type { NotificationJob } from '#root/queue/types.js'
import type { Logger } from '#root/utils/logger.js'

import { TransferNotBroadcastError } from '#root/utils/errors.js'
import { solToLamports } from '#root/utils/lamports.js'

/**
 * FeePayoutWorker — pure processor (issue #21, T6.3).
 *
 * Weekly referral payout cycle. For each user with positive pending earnings
 * (Σ tier1/tier2 referrer shares from `fee_ledger` − Σ non-failed prior
 * `referral_payouts`, computed by the earnings seam), it pays out when the
 * amount clears `minPayoutSol` and a payout wallet is set:
 *
 *   1. reserve a `referral_payouts` row (status `pending`) — the row, with its
 *      period window + amount, IS the binding of the covered ledger entries;
 *   2. transfer SOL from the platform fee wallet to the user's payout wallet;
 *   3. mark the row `confirmed` with the on-chain signature and notify the user.
 *
 * Reserving before sending makes a mid-cycle crash safe: the pending/sent row
 * suppresses re-payment next week (the earnings seam excludes only `failed`).
 * Below-threshold and wallet-less users are skipped; their earnings remain in
 * the running difference and roll over (invariant 22).
 *
 * Pure function over injected seams — BullMQ + adapter wiring lives in
 * `fee-payout.worker.ts`.
 */

// ── Domain types ─────────────────────────────────────────────────────────────

/** Per-user pending referral earnings, as surfaced by the earnings seam. */
export interface UserEarnings {
  /** Internal user id (UUID) — used to reserve the referral_payouts row. */
  userId: string
  /** Recipient's Telegram chat id — used to address the payout.sent notification. */
  telegramId: string
  /** Destination for the SOL transfer; null when the user never set one. */
  payoutWalletAddress: string | null
  /** Pending amount as a `decimal(20, 9)` string (> 0). */
  pendingSol: string
  /** `period_end` of the most recent non-failed payout; null on first-ever. */
  lastPayoutEnd: Date | null
}

// ── Seam interfaces (one per collaborator) ───────────────────────────────────

export interface EarningsSeam {
  /** Users with positive pending earnings (Σ shares − Σ non-failed payouts). */
  findPendingEarnings: () => Promise<UserEarnings[]>
}

export interface PayoutRepoSeam {
  /** Reserve a `referral_payouts` row (status `pending`); returns its id. */
  createPending: (input: {
    userId: string
    amountSol: string
    periodStart: Date | null
    periodEnd: Date
  }) => Promise<{ id: string }>
  /** Terminal success: status `confirmed` + the payout tx signature. */
  markConfirmed: (id: string, signature: string) => Promise<void>
  /** Terminal failure: status `failed`. */
  markFailed: (id: string) => Promise<void>
}

export interface TransferSeam {
  /** Transfer `lamports` from the platform fee wallet to `toAddress`; returns the signature. */
  sendSol: (toAddress: string, lamports: bigint) => Promise<string>
}

export interface NotificationSeam {
  enqueue: (job: NotificationJob) => Promise<void>
}

export interface FeePayoutDeps {
  earnings: EarningsSeam
  payouts: PayoutRepoSeam
  transfer: TransferSeam
  notifications: NotificationSeam
  clock: () => Date
  logger: Logger
}

export interface FeePayoutConfig {
  /** Minimum pending SOL a user must clear to be paid this cycle. */
  minPayoutSol: number
}

export interface FeePayoutCycleResult {
  scanned: number
  paid: number
  skipped: number
  /** Could not pay this cycle but safe to retry — reserve failed, or the transfer was definitely not broadcast → rolls over next cycle. */
  failed: number
  /** Transfer may have landed but couldn't be confirmed → row left pending for reconciliation; never auto-re-paid. */
  unresolved: number
}

// ── Cycle ────────────────────────────────────────────────────────────────────

export async function runPayoutCycle(
  deps: FeePayoutDeps,
  config: FeePayoutConfig,
): Promise<FeePayoutCycleResult> {
  const rows = await deps.earnings.findPendingEarnings()
  let paid = 0
  let skipped = 0
  let failed = 0
  let unresolved = 0

  for (const earning of rows) {
    // Below threshold → leave it in the running difference; it rolls over.
    if (Number(earning.pendingSol) < config.minPayoutSol) {
      skipped++
      continue
    }

    // No payout wallet set → skip silently; earnings roll over until one is set.
    const wallet = earning.payoutWalletAddress
    if (wallet === null) {
      skipped++
      continue
    }

    // Reserve the row before sending so a mid-cycle crash can't double-pay.
    // A reserve failure means no row and no SOL moved → this user simply rolls
    // over to next cycle; it must not abort the rest of the batch.
    const periodEnd = deps.clock()
    let id: string
    try {
      ({ id } = await deps.payouts.createPending({
        userId: earning.userId,
        amountSol: earning.pendingSol,
        periodStart: earning.lastPayoutEnd,
        periodEnd,
      }))
    }
    catch (err) {
      failed++
      deps.logger.error({ err, userId: earning.userId }, 'referral payout reserve (createPending) failed; rolled over')
      continue
    }

    // ── Money-moving step ────────────────────────────────────────────────────
    // Only the transfer lives in this try. Its outcome decides the row's fate:
    //   • TransferNotBroadcastError → no SOL moved → mark failed → rolls over.
    //   • any other error → broadcast, outcome uncertain → leave the row pending
    //     (the earnings seam excludes only 'failed', so a pending row suppresses
    //     re-payment) and flag for reconciliation. Never auto-re-pay (#21).
    let signature: string
    try {
      signature = await deps.transfer.sendSol(wallet, solToLamports(earning.pendingSol))
    }
    catch (err) {
      if (err instanceof TransferNotBroadcastError) {
        failed++
        // markFailed is best-effort — a bookkeeping failure here must not abort
        // the cycle (the row simply stays pending and is reconciled later).
        await deps.payouts.markFailed(id).catch(markErr =>
          deps.logger.error({ err: markErr, payoutId: id }, 'fee payout markFailed failed'))
        deps.logger.error({ err, userId: earning.userId, payoutId: id }, 'referral payout not broadcast; rolled over')
      }
      else {
        unresolved++
        deps.logger.error({ err, userId: earning.userId, payoutId: id }, 'referral payout outcome unknown; row left pending for reconciliation')
      }
      continue
    }

    // ── Post-transfer bookkeeping (side effects) ─────────────────────────────
    // The SOL has moved. Nothing below may revert the payout to 'failed' — that
    // would re-pay next cycle. Each step is best-effort and reconciled if it fails.
    await deps.payouts.markConfirmed(id, signature).catch(err =>
      deps.logger.error({ err, payoutId: id, signature }, 'referral payout sent on-chain but markConfirmed failed; reconcile'))
    await deps.notifications.enqueue({
      userId: earning.telegramId,
      kind: 'payout.sent',
      context: { amountSol: Number(earning.pendingSol), txSignature: signature },
    }).catch(err => deps.logger.warn({ err, userId: earning.userId }, 'referral payout notification enqueue failed'))
    paid++
  }

  return { scanned: rows.length, paid, skipped, failed, unresolved }
}
