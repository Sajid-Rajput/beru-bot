import type { NotificationJob, SellJobData } from '#root/queue/types.js'
import type { Logger } from '#root/utils/logger.js'

/**
 * RecoveryWorker — pure processor (issue #41, ADR-0002 §4 / R-3).
 *
 * A thin scanner-and-enqueuer. It does NOT run sell mechanics: no keypair
 * decryption, no sweep TX building, no fee_ledger writes. It finds `transactions`
 * rows stuck in `recovery_needed` past a cooldown and re-enqueues the original
 * `SellJob` (persisted as `job_snapshot`). The Sell Execution worker's
 * idempotency check (#40) resumes each attempt from the first not-yet-landed
 * step. After `maxRecoveryAttempts` re-enqueues, the row is marked terminally
 * `failed` and an admin alert is enqueued.
 *
 * This module is a pure function over injected seams — the BullMQ + adapter
 * wiring lives in `recovery.worker.ts`.
 */

// ── Domain types ─────────────────────────────────────────────────────────────

/** Minimal slice of a stuck `transactions` row the recovery scanner reads. */
export interface StuckTransaction {
  id: string
  /** Full SellJob payload persisted at row creation; null on legacy/partial rows. */
  jobSnapshot: SellJobData | null
  /** How many times this attempt has already been re-enqueued by recovery. */
  recoveryAttempts: number
}

// ── Seam interfaces (one per collaborator) ───────────────────────────────────

export interface RecoveryRepoSeam {
  /** Rows in `recovery_needed` whose last attempt predates `cutoff`, oldest first. */
  findStuck: (cutoff: Date, limit: number) => Promise<StuckTransaction[]>
  /** Persist a re-enqueue: set recovery_attempts = `attempts`, last_attempt_at = `at`. */
  markRecovering: (id: string, attempts: number, at: Date) => Promise<void>
  /** Terminal: status = 'failed' with the given error details. */
  markFailed: (id: string, errorDetails: unknown) => Promise<void>
}

export interface SellQueueSeam {
  /**
   * Re-enqueue a SellJob onto the sell queue. `dedupeKey` is folded into the
   * BullMQ jobId so each recovery attempt is unique — re-adding with the
   * original `sell:<feature>:<trigger>` id would be silently dropped because the
   * failed job is still retained in Redis (`removeOnFail`). Resumption stays
   * correct: the executor is idempotent on the `transactions` row, not the jobId.
   */
  enqueue: (job: SellJobData, dedupeKey: string) => Promise<void>
}

export interface NotificationSeam {
  enqueue: (job: NotificationJob) => Promise<void>
}

export interface RecoveryDeps {
  repo: RecoveryRepoSeam
  sellQueue: SellQueueSeam
  notifications: NotificationSeam
  clock: () => Date
  logger: Logger
}

export interface RecoveryConfig {
  /** Rows whose last attempt is older than this many ms are eligible. */
  cooldownMs: number
  /** Max rows scanned per cycle. */
  scanLimit: number
  /** Re-enqueue ceiling; once reached, the row is failed instead of re-enqueued. */
  maxRecoveryAttempts: number
  /** Telegram chat ids the admin.alert is fanned out to on terminal failure. */
  adminUserIds: string[]
}

export interface RecoveryCycleResult {
  scanned: number
  reEnqueued: number
  failed: number
}

// ── Cycle ────────────────────────────────────────────────────────────────────

export async function runRecoveryCycle(
  deps: RecoveryDeps,
  config: RecoveryConfig,
): Promise<RecoveryCycleResult> {
  const now = deps.clock()
  const cutoff = new Date(now.getTime() - config.cooldownMs)
  const rows = await deps.repo.findStuck(cutoff, config.scanLimit)

  let reEnqueued = 0
  let failed = 0
  for (const row of rows) {
    // Isolate per-row failures: a single bad row (DB hiccup, queue error) must
    // not starve the rest of the cycle. Mirrors the market-cap monitor's loop.
    try {
      if (row.recoveryAttempts >= config.maxRecoveryAttempts) {
        await failTerminally(deps, config, row.id, `exceeded ${config.maxRecoveryAttempts} recovery attempts`)
        failed++
        continue
      }

      if (row.jobSnapshot === null) {
        // No snapshot means we can't reconstruct the SellJob — terminal, not retryable.
        await failTerminally(deps, config, row.id, 'missing job_snapshot — cannot reconstruct SellJob')
        failed++
        continue
      }

      const attempt = row.recoveryAttempts + 1
      // Enqueue first (idempotent on the per-attempt dedupeKey), then persist the
      // bumped counter. If the persist fails, the next cycle re-scans the same row
      // and re-enqueues with the SAME dedupeKey — BullMQ dedups it, so there's no
      // duplicate work and no lost attempt.
      await deps.sellQueue.enqueue(row.jobSnapshot, `r${attempt}`)
      await deps.repo.markRecovering(row.id, attempt, now)
      reEnqueued++
    }
    catch (err) {
      deps.logger.warn({ err, transactionId: row.id }, 'recovery: row processing failed; skipping')
    }
  }

  return { scanned: rows.length, reEnqueued, failed }
}

/**
 * Mark a row terminally failed and fan a high-severity alert out to every
 * configured admin. Used when recovery is exhausted or impossible.
 */
async function failTerminally(
  deps: RecoveryDeps,
  config: RecoveryConfig,
  id: string,
  reason: string,
): Promise<void> {
  await deps.repo.markFailed(id, { reason })
  for (const userId of config.adminUserIds) {
    await deps.notifications.enqueue({
      userId,
      kind: 'admin.alert',
      context: { severity: 'high', message: `Sell transaction ${id} failed recovery: ${reason}` },
    })
  }
}
