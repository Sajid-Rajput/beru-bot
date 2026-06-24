import type { db as DrizzleDb } from '#root/db/index.js'
import type { NotificationJob } from '#root/queue/types.js'
import type { SolanaRpcService } from '#root/services/solana-rpc.service.js'
import type { Queue } from 'bullmq'
import type {
  EarningsSeam,
  NotificationSeam,
  PayoutRepoSeam,
  TransferSeam,
  UserEarnings,
} from './fee-payout.processor.js'

import { referralPayouts } from '#root/db/schema/index.js'
import { TransferNotBroadcastError } from '#root/utils/errors.js'
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { eq, sql } from 'drizzle-orm'

type Db = typeof DrizzleDb

/** Raw shape returned by the pending-earnings aggregate query. */
interface PendingEarningRow extends Record<string, unknown> {
  user_id: string
  payout_wallet_address: string | null
  pending_sol: string
  last_payout_end: Date | null
}

/**
 * Earnings seam — the only place the aggregate "what is owed" SQL lives.
 *
 * Per referrer: Σ tier1/tier2 shares credited in `fee_ledger`, minus Σ of every
 * non-`failed` prior `referral_payouts` (pending + sent + confirmed all count as
 * already-paid, so a crashed cycle can't double-pay). Only positive balances are
 * returned; the processor applies the min-payout threshold and wallet check.
 *
 * `last_payout_end` is the previous period's boundary — it becomes the new
 * payout's `period_start`, and is null on a first-ever payout.
 */
export function createEarningsSeam(db: Db): EarningsSeam {
  return {
    async findPendingEarnings(): Promise<UserEarnings[]> {
      const result = await db.execute<PendingEarningRow>(sql`
        WITH earned AS (
          SELECT referrer_id, SUM(share) AS total
          FROM (
            SELECT tier1_referrer_id AS referrer_id, tier1_referrer_share AS share
            FROM fee_ledger WHERE tier1_referrer_id IS NOT NULL
            UNION ALL
            SELECT tier2_referrer_id AS referrer_id, tier2_referrer_share AS share
            FROM fee_ledger WHERE tier2_referrer_id IS NOT NULL
          ) shares
          GROUP BY referrer_id
        ),
        paid AS (
          SELECT user_id, COALESCE(SUM(amount_sol), 0) AS total, MAX(period_end) AS last_end
          FROM referral_payouts
          WHERE status <> 'failed'
          GROUP BY user_id
        )
        SELECT
          e.referrer_id AS user_id,
          u.payout_wallet_address AS payout_wallet_address,
          (e.total - COALESCE(p.total, 0))::text AS pending_sol,
          p.last_end AS last_payout_end
        FROM earned e
        JOIN users u ON u.id = e.referrer_id
        LEFT JOIN paid p ON p.user_id = e.referrer_id
        WHERE (e.total - COALESCE(p.total, 0)) > 0
      `)

      return Array.from(result).map(row => ({
        userId: row.user_id,
        payoutWalletAddress: row.payout_wallet_address,
        pendingSol: row.pending_sol,
        lastPayoutEnd: row.last_payout_end,
      }))
    },
  }
}

/** Payout-row lifecycle: reserve `pending` → `confirmed`/`failed`. */
export function createPayoutRepoSeam(db: Db): PayoutRepoSeam {
  return {
    async createPending(input) {
      const [row] = await db
        .insert(referralPayouts)
        .values({
          userId: input.userId,
          amountSol: input.amountSol,
          earnedSinceLastPayout: input.amountSol,
          status: 'pending',
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        })
        .returning({ id: referralPayouts.id })
      return { id: row!.id }
    },
    async markConfirmed(id, signature) {
      await db
        .update(referralPayouts)
        .set({ status: 'confirmed', payoutTxSignature: signature })
        .where(eq(referralPayouts.id, id))
    },
    async markFailed(id) {
      await db
        .update(referralPayouts)
        .set({ status: 'failed' })
        .where(eq(referralPayouts.id, id))
    },
  }
}

/**
 * Transfer seam — a single SOL transfer from the platform fee wallet to the
 * referrer's payout wallet. Writes go to the primary RPC only (no failover for
 * sends, per ADR #5).
 *
 * Split so the processor can classify failures (#21). Phase A is everything
 * STRICTLY BEFORE the network send (config check, blockhash fetch, address parse,
 * signing, serialize): a failure here proves no bytes reached the cluster → throw
 * `TransferNotBroadcastError` (safe to fail + roll over). The send + confirm are
 * deliberately OUTSIDE that try: `sendRawTransaction` timing out does not prove
 * the node didn't forward the tx, so its failure (and any `confirmTransaction`
 * failure) propagates as a generic error → the cycle leaves the row pending for
 * reconciliation and never auto-re-pays.
 */
export function createTransferSeam(rpc: SolanaRpcService, platformKeypair: Keypair | null): TransferSeam {
  return {
    async sendSol(toAddress, lamports) {
      if (platformKeypair === null)
        throw new TransferNotBroadcastError('platform fee wallet private key not configured')

      const connection = rpc.primaryConnection

      // ── Phase A — provably before broadcast ────────────────────────────────
      let serialized: Uint8Array
      let blockhash: string
      let lastValidBlockHeight: number
      try {
        const latest = await connection.getLatestBlockhash('confirmed')
        blockhash = latest.blockhash
        lastValidBlockHeight = latest.lastValidBlockHeight

        const tx = new Transaction()
        tx.feePayer = platformKeypair.publicKey
        tx.recentBlockhash = blockhash
        tx.add(SystemProgram.transfer({
          fromPubkey: platformKeypair.publicKey,
          toPubkey: new PublicKey(toAddress),
          lamports,
        }))
        tx.sign(platformKeypair)
        serialized = tx.serialize()
      }
      catch (err) {
        throw new TransferNotBroadcastError('referral payout transfer was not broadcast', err)
      }

      // ── Phase B/C — the send + confirm (outcome uncertain on failure) ──────
      const signature = await connection.sendRawTransaction(serialized)
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
      return signature
    },
  }
}

export function createNotificationSeam(queue: Pick<Queue<NotificationJob>, 'add'>): NotificationSeam {
  return {
    async enqueue(job) {
      await queue.add(`${job.kind}:${job.userId}:${Date.now()}`, job)
    },
  }
}

/**
 * Load the platform fee wallet keypair from its base58 secret. Returns null when
 * unconfigured (e.g. local dev) so worker registration never throws at boot.
 */
export function loadPlatformKeypair(privateKeyBase58: string): Keypair | null {
  if (!privateKeyBase58)
    return null
  return Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
}
