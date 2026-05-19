import type { NotificationJob, SellJobData } from '#root/queue/types.js'
import type { WalletEncryptionPayload } from '#root/services/crypto.service.js'
import { Buffer } from 'node:buffer'
import { LAMPORTS_PER_SOL, redisKeys } from '#root/utils/constants.js'

// ── Domain types exposed for tests + production wiring ───────────────────────

export type TransactionStatus =
  | 'pending'
  | 'funding'
  | 'swapping'
  | 'sweeping'
  | 'completed'
  | 'failed'
  | 'recovery_needed'

/**
 * Minimal slice of `transactions` row the processor reads/writes. Production
 * `TransactionRecord` is a superset; the seam definition only references the
 * columns this module touches.
 */
export interface TransactionState {
  id: string
  projectFeatureId: string
  triggerTxSignature: string
  sellPercentage: number
  status: TransactionStatus
  fundingTxSignature: string | null
  sellTxSignature: string | null
  sweepTxSignature: string | null
  /** SOL proceeds from the swap step, persisted as `decimal(20,9)` (string). Needed to reconstruct fee math on resume. */
  solAmountReceived: string | null
}

/**
 * What the processor passes to `markCompletedWithFee`. Mirrors the columns of
 * `fee_ledger` but keeps decimal values as strings for compatibility with the
 * Drizzle `decimal` type at the production seam.
 */
export interface FeeLedgerInput {
  transactionId: string
  userId: string
  grossSol: string
  grossFee: string
  referralDiscount: string
  effectiveFee: string
  tier1ReferrerShare: string
  tier1ReferrerId: string | null
  tier2ReferrerShare: string
  tier2ReferrerId: string | null
  platformNet: string
  collectionStatus: 'pending'
}

// ── Seam interfaces (one per collaborator) ───────────────────────────────────

export interface TransactionRepoSeam {
  findExistingTransaction: (featureId: string, triggerSignature: string) => Promise<TransactionState | undefined>
  createTransaction: (input: {
    projectFeatureId: string
    triggerTxSignature: string
    sellPercentage: number
  }) => Promise<TransactionState>
  markFunded: (transactionId: string, fundingTxSignature: string) => Promise<void>
  markSwapped: (transactionId: string, sellTxSignature: string, solAmountReceived: string) => Promise<void>
  /** Atomic: writes `sweep_tx_signature` + sets status `completed` + inserts `fee_ledger` row in ONE Postgres transaction. */
  markCompletedWithFee: (input: { transactionId: string, sweepTxSignature: string, fee: FeeLedgerInput }) => Promise<void>
  markFailed: (transactionId: string, errorDetails: unknown) => Promise<void>
  markRecoveryNeeded: (transactionId: string, errorDetails: unknown) => Promise<void>
}

export interface EphemeralWalletRepoSeam {
  createEphemeralWallet: (input: {
    transactionId: string
    publicKey: string
    encrypted: WalletEncryptionPayload
    tokenMint: string
    mainWalletPublicKey: string
  }) => Promise<void>
  findEphemeralWallet: (transactionId: string) => Promise<{ publicKey: string, encrypted: WalletEncryptionPayload } | undefined>
}

export interface FeeLedgerRepoSeam {
  findFeeLedger: (transactionId: string) => Promise<{ id: string } | undefined>
  /** Used only by the race-recovery path (sweep landed on-chain but PG write failed). */
  createFeeLedger: (input: FeeLedgerInput) => Promise<void>
}

export interface IdentitySeam {
  /** Resolves the owning user_id for a project_feature. Required for fee_ledger.user_id + notifications. */
  getUserIdByFeatureId: (featureId: string) => Promise<string>
}

export interface ChainSeam {
  getUserTokenBalance: (mainWalletPubkey: string, mint: string) => Promise<bigint>
  sendFunding: (input: {
    mainWalletPubkey: string
    ephemeralPubkey: string
    mint: string
    tokenAmount: bigint
    lamports: number
  }) => Promise<string>
  swapViaJupiter: (input: {
    ephemeralPubkey: string
    ephemeralSecretKey: Buffer | Uint8Array
    mint: string
    tokenAmount: bigint
  }) => Promise<{ signature: string, outLamports: bigint }>
  sendSweep: (input: {
    ephemeralPubkey: string
    ephemeralSecretKey: Buffer | Uint8Array
    mainWalletPubkey: string
    platformFeeWallet: string
    userNetLamports: number
    feeLamports: number
  }) => Promise<string>
  pollSignatureStatus: (signature: string, opts: { timeoutMs: number, intervalMs?: number }) => Promise<{ landed: boolean }>
  getSignatureStatus: (signature: string) => Promise<{ landed: boolean }>
}

export interface NotificationSeam {
  enqueueNotification: (job: NotificationJob) => Promise<void>
}

export interface LockSeam {
  acquireLock: (key: string, ttlSeconds: number) => Promise<boolean>
  releaseLock: (key: string) => Promise<void>
}

export interface CryptoSeam {
  encryptPrivateKey: (privateKeyBase58: string) => WalletEncryptionPayload
  /** Returns a freshly-allocated buffer the processor will `.fill(0)` in finally. */
  decryptPrivateKey: (payload: WalletEncryptionPayload) => Buffer | Uint8Array
}

export interface WalletGenSeam {
  generateEphemeralKeypair: () => { publicKey: string, secretKey: Buffer | Uint8Array }
}

export interface Logger {
  // Matches the structural shape of `pino`'s `BaseLogger.LogFn` without
  // depending on pino directly. The seam accepts any logger that exposes
  // these four methods.

  debug: (...args: any[]) => void

  info: (...args: any[]) => void

  warn: (...args: any[]) => void

  error: (...args: any[]) => void
}

export interface SellExecutionDeps {
  transactions: TransactionRepoSeam
  ephemeralWallets: EphemeralWalletRepoSeam
  feeLedger: FeeLedgerRepoSeam
  identity: IdentitySeam
  chain: ChainSeam
  notifications: NotificationSeam
  lock: LockSeam
  crypto: CryptoSeam
  walletGen: WalletGenSeam
  clock: () => Date
  sleep: (ms: number) => Promise<void>
  logger: Logger
}

export interface SellExecutionConfig {
  platformFeeWallet: string
  /** Decimal fraction, e.g. 0.01 for 1%. */
  platformFeePercentage: number
  /** Decimal fraction of the gross fee waived when a tier-1 referrer is present (e.g. 0.10 = 10%). */
  referralUserDiscountPct: number
  swapPollTimeoutMs: number
  /** Backoff between funding attempts. Length = max attempts - 1. */
  fundingRetryBackoffMs: number[]
  /** Backoff between sweep attempts. Length = max attempts - 1. */
  sweepRetryBackoffMs: number[]
  ephemeralGasBudgetLamports: number
}

export type SellExecutionOutcome =
  | { kind: 'completed', transactionId: string }
  | { kind: 'failed', transactionId: string, reason: string }
  | { kind: 'recovery_needed', transactionId: string, reason: string }
  | { kind: 'skipped', reason: 'lock-not-acquired' }

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDecimalString(n: number): string {
  if (!Number.isFinite(n))
    throw new Error(`non-finite fee component: ${n}`)
  // Postgres `decimal(20, 9)` — 9 fractional digits is plenty for SOL math.
  return n.toFixed(9)
}

/**
 * Run `attempt` with at-most `backoffMs.length + 1` calls (initial + one retry
 * per backoff). Sleeps `backoffMs[i]` before retry `i`. Throws the last error
 * if every attempt fails.
 */
async function runWithRetries<T>(
  attempt: () => Promise<T>,
  backoffMs: readonly number[],
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i <= backoffMs.length; i++) {
    try {
      return await attempt()
    }
    catch (err) {
      lastErr = err
      if (i < backoffMs.length)
        await sleep(backoffMs[i]!)
    }
  }
  throw lastErr
}

function computeFeeLedger(input: {
  grossSol: number
  job: SellJobData
  userId: string
  transactionId: string
  config: SellExecutionConfig
}): FeeLedgerInput {
  const { grossSol, job, userId, transactionId, config } = input
  const grossFee = grossSol * config.platformFeePercentage
  const referralDiscount = job.referralSnapshot.tier1 ? grossFee * config.referralUserDiscountPct : 0
  const effectiveFee = grossFee - referralDiscount
  const tier1Share = job.referralSnapshot.tier1 ? effectiveFee * job.referralSnapshot.tier1.sharePct : 0
  const tier2Share = job.referralSnapshot.tier2 ? effectiveFee * job.referralSnapshot.tier2.sharePct : 0
  const platformNet = effectiveFee - tier1Share - tier2Share

  return {
    transactionId,
    userId,
    grossSol: toDecimalString(grossSol),
    grossFee: toDecimalString(grossFee),
    referralDiscount: toDecimalString(referralDiscount),
    effectiveFee: toDecimalString(effectiveFee),
    tier1ReferrerShare: toDecimalString(tier1Share),
    tier1ReferrerId: job.referralSnapshot.tier1?.userId ?? null,
    tier2ReferrerShare: toDecimalString(tier2Share),
    tier2ReferrerId: job.referralSnapshot.tier2?.userId ?? null,
    platformNet: toDecimalString(platformNet),
    collectionStatus: 'pending',
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Executes a single Sell Job end-to-end: fund → swap → sweep+fee → notify.
 *
 * Idempotent on `(featureId, triggerSignature)` per ADR-0002 R-3. Every entry
 * (fresh, BullMQ retry, recovery re-enqueue) starts by reading the existing
 * `transactions` row, checks which of its persisted signatures actually landed
 * on-chain, and resumes from the first not-yet-landed step.
 */
export async function executeSellJob(
  job: SellJobData,
  deps: SellExecutionDeps,
  config: SellExecutionConfig,
): Promise<SellExecutionOutcome> {
  const lockKey = redisKeys.sellLock(job.featureId)
  const acquired = await deps.lock.acquireLock(lockKey, 60)
  if (!acquired)
    return { kind: 'skipped', reason: 'lock-not-acquired' }

  let decryptedKey: Buffer | Uint8Array | null = null

  try {
    // 1. Idempotency check
    let tx = await deps.transactions.findExistingTransaction(job.featureId, job.triggerSignature)
    if (!tx) {
      tx = await deps.transactions.createTransaction({
        projectFeatureId: job.featureId,
        triggerTxSignature: job.triggerSignature,
        sellPercentage: job.sellPercentage,
      })
    }
    // 2. Resolve userId (needed for fee_ledger + every notification path)
    const userId = await deps.identity.getUserIdByFeatureId(job.featureId)

    // 3. Check which persisted signatures actually landed on-chain. Recovery
    //    and fresh-job paths share this code: every step decides "skip vs run"
    //    based on whether its signature is set AND on-chain.
    const fundingLanded = tx.fundingTxSignature
      ? (await deps.chain.getSignatureStatus(tx.fundingTxSignature)).landed
      : false
    const swapLanded = tx.sellTxSignature
      ? (await deps.chain.getSignatureStatus(tx.sellTxSignature)).landed
      : false
    const sweepLanded = tx.sweepTxSignature
      ? (await deps.chain.getSignatureStatus(tx.sweepTxSignature)).landed
      : false

    // 4. If sweep already landed, the only thing left is the race-recovery
    //    fee_ledger write — and only if the previous attempt crashed between
    //    the on-chain confirmation and the Postgres write.
    if (sweepLanded) {
      const existingFee = await deps.feeLedger.findFeeLedger(tx.id)
      if (existingFee)
        return { kind: 'completed', transactionId: tx.id }

      const grossSol = Number(tx.solAmountReceived ?? '0')
      const fee = computeFeeLedger({ grossSol, job, userId, transactionId: tx.id, config })
      await deps.feeLedger.createFeeLedger(fee)
      if (tx.status !== 'completed') {
        await deps.transactions.markCompletedWithFee({
          transactionId: tx.id,
          sweepTxSignature: tx.sweepTxSignature!,
          fee,
        })
      }
      await deps.notifications.enqueueNotification({
        userId,
        kind: 'sell.completed',
        context: {
          mint: job.mint,
          symbol: job.mint,
          soldTokens: 0,
          receivedSol: grossSol,
          txSignatures: { trigger: job.triggerSignature, sweep: tx.sweepTxSignature! },
        },
      })
      return { kind: 'completed', transactionId: tx.id }
    }

    // 5. Funding step (Slice 1 path; retry policy lands in Slice 4)
    let ephem = await deps.ephemeralWallets.findEphemeralWallet(tx.id)
    let tokenAmount = 0n
    if (!fundingLanded) {
      if (!ephem) {
        const kp = deps.walletGen.generateEphemeralKeypair()
        const encrypted = deps.crypto.encryptPrivateKey(Buffer.from(kp.secretKey).toString('base64'))
        await deps.ephemeralWallets.createEphemeralWallet({
          transactionId: tx.id,
          publicKey: kp.publicKey,
          encrypted,
          tokenMint: job.mint,
          mainWalletPublicKey: job.mainWalletPubkey,
        })
        ephem = { publicKey: kp.publicKey, encrypted }
      }

      const balance = await deps.chain.getUserTokenBalance(job.mainWalletPubkey, job.mint)
      tokenAmount = (balance * BigInt(job.sellPercentage)) / 100n

      let fundingSig: string
      try {
        fundingSig = await runWithRetries(
          () => deps.chain.sendFunding({
            mainWalletPubkey: job.mainWalletPubkey,
            ephemeralPubkey: ephem!.publicKey,
            mint: job.mint,
            tokenAmount,
            lamports: config.ephemeralGasBudgetLamports,
          }),
          config.fundingRetryBackoffMs,
          deps.sleep,
        )
      }
      catch (err) {
        // Funding never moved funds — terminal failure, no recovery branch.
        await deps.transactions.markFailed(tx.id, { step: 'funding', error: String(err) })
        await deps.notifications.enqueueNotification({
          userId,
          kind: 'sell.failed',
          context: {
            mint: job.mint,
            symbol: job.mint,
            reason: `Funding failed after retries: ${String(err)}`,
          },
        })
        return { kind: 'failed', transactionId: tx.id, reason: String(err) }
      }
      await deps.transactions.markFunded(tx.id, fundingSig)
      tx.fundingTxSignature = fundingSig
    }

    if (!ephem)
      throw new Error('inconsistent state: funding landed but ephemeral wallet missing')

    // 6. Swap step. The seam SENDS one TX and returns its signature; this
    //    function then polls signature status — see ADR-0002 decision 4
    //    ("Swap TX — 1 send + N confirm-checks"). Resending would risk a
    //    double-swap; if the prior signature is persisted but not landed,
    //    bail to recovery instead.
    let outLamports: bigint
    if (!swapLanded) {
      if (tx.sellTxSignature) {
        // A prior attempt sent a swap but we never observed it land. Do NOT
        // re-send. Poll once more in case our previous poll just missed it;
        // otherwise hand off to the recovery scanner.
        const status = await deps.chain.pollSignatureStatus(
          tx.sellTxSignature,
          { timeoutMs: config.swapPollTimeoutMs },
        )
        if (!status.landed) {
          await deps.transactions.markRecoveryNeeded(tx.id, {
            step: 'swap',
            reason: 'prior-signature-not-landed',
            signature: tx.sellTxSignature,
          })
          await deps.notifications.enqueueNotification({
            userId,
            kind: 'sell.failed',
            context: { mint: job.mint, symbol: job.mint, reason: 'Swap signature did not land' },
          })
          return { kind: 'recovery_needed', transactionId: tx.id, reason: 'swap-confirm-timeout' }
        }
        // Accept the prior signature.
        const stored = Number(tx.solAmountReceived ?? '0')
        outLamports = BigInt(Math.round(stored * LAMPORTS_PER_SOL))
      }
      else {
        decryptedKey = deps.crypto.decryptPrivateKey(ephem.encrypted)
        const swapResult = await deps.chain.swapViaJupiter({
          ephemeralPubkey: ephem.publicKey,
          ephemeralSecretKey: decryptedKey,
          mint: job.mint,
          tokenAmount,
        })
        const grossSolStr = toDecimalString(Number(swapResult.outLamports) / LAMPORTS_PER_SOL)
        await deps.transactions.markSwapped(tx.id, swapResult.signature, grossSolStr)
        tx.sellTxSignature = swapResult.signature
        tx.solAmountReceived = grossSolStr

        const status = await deps.chain.pollSignatureStatus(
          swapResult.signature,
          { timeoutMs: config.swapPollTimeoutMs },
        )
        if (!status.landed) {
          await deps.transactions.markRecoveryNeeded(tx.id, {
            step: 'swap',
            reason: 'confirm-timeout',
            signature: swapResult.signature,
          })
          await deps.notifications.enqueueNotification({
            userId,
            kind: 'sell.failed',
            context: { mint: job.mint, symbol: job.mint, reason: 'Swap confirmation timed out' },
          })
          return { kind: 'recovery_needed', transactionId: tx.id, reason: 'swap-confirm-timeout' }
        }
        outLamports = swapResult.outLamports
      }
    }
    else {
      // Recovery: re-use the prior outLamports captured to the transactions row.
      const stored = Number(tx.solAmountReceived ?? '0')
      outLamports = BigInt(Math.round(stored * LAMPORTS_PER_SOL))
    }

    // 7. Compute fee breakdown from snapshot
    const grossSol = Number(outLamports) / LAMPORTS_PER_SOL
    const fee = computeFeeLedger({ grossSol, job, userId, transactionId: tx.id, config })
    const userNetLamports = Math.floor((grossSol - Number(fee.effectiveFee)) * LAMPORTS_PER_SOL)
    const feeLamports = Math.floor(Number(fee.effectiveFee) * LAMPORTS_PER_SOL)

    // 8. Sweep step + atomic fee_ledger write. Sweep is idempotent on amount,
    //    so retries are safe; exhaustion is handed off to the recovery
    //    scanner (ADR-0002 R-3) rather than terminal-failed.
    if (!decryptedKey)
      decryptedKey = deps.crypto.decryptPrivateKey(ephem.encrypted)
    let sweepSig: string
    try {
      sweepSig = await runWithRetries(
        () => deps.chain.sendSweep({
          ephemeralPubkey: ephem!.publicKey,
          ephemeralSecretKey: decryptedKey!,
          mainWalletPubkey: job.mainWalletPubkey,
          platformFeeWallet: config.platformFeeWallet,
          userNetLamports,
          feeLamports,
        }),
        config.sweepRetryBackoffMs,
        deps.sleep,
      )
    }
    catch (err) {
      await deps.transactions.markRecoveryNeeded(tx.id, { step: 'sweep', error: String(err) })
      await deps.notifications.enqueueNotification({
        userId,
        kind: 'sell.failed',
        context: { mint: job.mint, symbol: job.mint, reason: `Sweep failed after retries: ${String(err)}` },
      })
      return { kind: 'recovery_needed', transactionId: tx.id, reason: String(err) }
    }

    await deps.transactions.markCompletedWithFee({
      transactionId: tx.id,
      sweepTxSignature: sweepSig,
      fee,
    })

    // 9. Terminal notification
    await deps.notifications.enqueueNotification({
      userId,
      kind: 'sell.completed',
      context: {
        mint: job.mint,
        symbol: job.mint,
        soldTokens: Number(tokenAmount),
        receivedSol: grossSol,
        txSignatures: { trigger: job.triggerSignature, sweep: sweepSig },
      },
    })

    return { kind: 'completed', transactionId: tx.id }
  }
  finally {
    if (decryptedKey)
      decryptedKey.fill(0)
    await deps.lock.releaseLock(lockKey)
  }
}
