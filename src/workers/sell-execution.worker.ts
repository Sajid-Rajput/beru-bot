import type { NotificationJob, SellJobData } from '#root/queue/types.js'
import type { SolanaRpcService } from '#root/services/solana-rpc.service.js'
import type { ConnectionOptions } from 'bullmq'
import type { Redis } from 'ioredis'
import type {
  ChainSeam,
  CryptoSeam,
  EphemeralWalletRepoSeam,
  FeeLedgerRepoSeam,
  IdentitySeam,
  LockSeam,
  Logger,
  NotificationSeam,
  SellExecutionConfig,
  SellExecutionDeps,
  TransactionRepoSeam,
  TransactionState,
  WalletGenSeam,
} from './sell-execution.processor.js'
import { Buffer } from 'node:buffer'
import { config } from '#root/config.js'
import { db } from '#root/db/index.js'
import {
  ephemeralWallets,
  feeLedger,
  projectFeatures,
  projects,
  transactions,
  wallets,
} from '#root/db/schema/index.js'
import { notificationQueue } from '#root/queue/queues.js'

import { redis as defaultRedis } from '#root/queue/redis.js'
import { CryptoService } from '#root/services/crypto.service.js'
import { JupiterService } from '#root/services/jupiter.service.js'
import {
  buildCombinedFundingTx,
  buildSweepAndFeeTx,
  sendAndConfirmTransaction,
} from '#root/services/solana-tx.service.js'
import {
  BULLMQ_SELL_CONCURRENCY,
  LAMPORTS_PER_SOL,
  PLATFORM_FEE_PERCENTAGE,
  QUEUE_SELL_EXECUTION,
  redisKeys,
  REFERRAL_USER_DISCOUNT_PCT,
  SELL_LOCK_TTL,
} from '#root/utils/constants.js'
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { Worker } from 'bullmq'
import { and, eq } from 'drizzle-orm'

import { executeSellJob } from './sell-execution.processor.js'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const SWAP_POLL_TIMEOUT_MS = 30_000
const SWAP_POLL_INTERVAL_MS = 1_000
const FUNDING_RETRY_BACKOFF_MS = [250, 1_000, 4_000]
const SWEEP_RETRY_BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000]
const EPHEMERAL_GAS_BUDGET_LAMPORTS = Math.floor(0.005 * LAMPORTS_PER_SOL)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Repo seam adapters ───────────────────────────────────────────────────────

function toTransactionState(row: typeof transactions.$inferSelect): TransactionState {
  return {
    id: row.id,
    projectFeatureId: row.projectFeatureId,
    triggerTxSignature: row.triggerTxSignature ?? '',
    sellPercentage: row.sellPercentage ? Number(row.sellPercentage) : 0,
    status: row.status,
    fundingTxSignature: row.fundingTxSignature ?? null,
    sellTxSignature: row.sellTxSignature ?? null,
    sweepTxSignature: row.sweepTxSignature ?? null,
    solAmountReceived: row.solAmountReceived ?? null,
  }
}

function createTransactionRepoSeam(): TransactionRepoSeam {
  return {
    async findExistingTransaction(featureId, triggerSignature) {
      const row = await db.query.transactions.findFirst({
        where: and(
          eq(transactions.projectFeatureId, featureId),
          eq(transactions.triggerTxSignature, triggerSignature),
        ),
      })
      return row ? toTransactionState(row) : undefined
    },
    async createTransaction(input) {
      const [row] = await db
        .insert(transactions)
        .values({
          projectFeatureId: input.projectFeatureId,
          type: 'shadow_sell',
          triggerTxSignature: input.triggerTxSignature,
          sellPercentage: input.sellPercentage.toFixed(2),
          status: 'pending',
        })
        .returning()
      return toTransactionState(row!)
    },
    async markFunded(id, fundingTxSignature) {
      await db
        .update(transactions)
        .set({ fundingTxSignature, status: 'funding' })
        .where(eq(transactions.id, id))
    },
    async markSwapped(id, sellTxSignature, solAmountReceived) {
      await db
        .update(transactions)
        .set({ sellTxSignature, solAmountReceived, status: 'swapping' })
        .where(eq(transactions.id, id))
    },
    async markCompletedWithFee(input) {
      await db.transaction(async (tx) => {
        await tx
          .update(transactions)
          .set({
            sweepTxSignature: input.sweepTxSignature,
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(transactions.id, input.transactionId))
        await tx.insert(feeLedger).values(input.fee)
      })
    },
    async markFailed(id, errorDetails) {
      await db
        .update(transactions)
        .set({ status: 'failed', errorDetails: errorDetails as object, completedAt: new Date() })
        .where(eq(transactions.id, id))
    },
    async markRecoveryNeeded(id, errorDetails) {
      await db
        .update(transactions)
        .set({ status: 'recovery_needed', errorDetails: errorDetails as object })
        .where(eq(transactions.id, id))
    },
  }
}

function createEphemeralWalletRepoSeam(): EphemeralWalletRepoSeam {
  return {
    async createEphemeralWallet(input) {
      await db.insert(ephemeralWallets).values({
        transactionId: input.transactionId,
        publicKey: input.publicKey,
        encryptedPrivateKey: input.encrypted.encryptedPrivateKey,
        pkIv: input.encrypted.pkIv,
        pkAuthTag: input.encrypted.pkAuthTag,
        dekEncrypted: input.encrypted.dekEncrypted,
        dekIv: input.encrypted.dekIv,
        dekAuthTag: input.encrypted.dekAuthTag,
        dekSalt: input.encrypted.dekSalt,
        tokenMint: input.tokenMint,
        mainWalletPublicKey: input.mainWalletPublicKey,
      })
    },
    async findEphemeralWallet(transactionId) {
      const row = await db.query.ephemeralWallets.findFirst({
        where: eq(ephemeralWallets.transactionId, transactionId),
      })
      if (!row)
        return undefined
      return {
        publicKey: row.publicKey,
        encrypted: {
          encryptedPrivateKey: row.encryptedPrivateKey,
          pkIv: row.pkIv,
          pkAuthTag: row.pkAuthTag,
          dekEncrypted: row.dekEncrypted,
          dekIv: row.dekIv,
          dekAuthTag: row.dekAuthTag,
          dekSalt: row.dekSalt,
        },
      }
    },
  }
}

function createFeeLedgerRepoSeam(): FeeLedgerRepoSeam {
  return {
    async findFeeLedger(transactionId) {
      const row = await db.query.feeLedger.findFirst({
        where: eq(feeLedger.transactionId, transactionId),
      })
      return row ? { id: row.id } : undefined
    },
    async createFeeLedger(input) {
      await db.insert(feeLedger).values(input)
    },
  }
}

function createIdentitySeam(): IdentitySeam {
  return {
    async getUserIdByFeatureId(featureId) {
      const [row] = await db
        .select({ userId: projects.userId })
        .from(projectFeatures)
        .innerJoin(projects, eq(projectFeatures.projectId, projects.id))
        .where(eq(projectFeatures.id, featureId))
        .limit(1)
      if (!row)
        throw new Error(`Could not resolve userId for feature ${featureId}`)
      return row.userId
    },
  }
}

function createNotificationSeam(): NotificationSeam {
  return {
    async enqueueNotification(job: NotificationJob) {
      await notificationQueue.add(`${job.kind}:${job.userId}:${Date.now()}`, job)
    },
  }
}

function createLockSeam(redis: Redis): LockSeam {
  return {
    async acquireLock(key, ttlSeconds) {
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX')
      return result === 'OK'
    },
    async releaseLock(key) {
      await redis.del(key)
    },
  }
}

function createCryptoSeam(crypto: CryptoService): CryptoSeam {
  return {
    encryptPrivateKey: b58 => crypto.encryptPrivateKey(b58),
    decryptPrivateKey: (payload) => {
      const b58 = crypto.decryptPrivateKey(payload)
      // Convert base58 back to raw 64-byte secret key buffer so the processor
      // can `.fill(0)` it in finally (strings are immutable in JS).
      return Buffer.from(bs58.decode(b58))
    },
  }
}

function createWalletGenSeam(): WalletGenSeam {
  return {
    generateEphemeralKeypair() {
      const kp = Keypair.generate()
      return {
        publicKey: kp.publicKey.toBase58(),
        secretKey: Buffer.from(kp.secretKey),
      }
    },
  }
}

// ── Chain seam ───────────────────────────────────────────────────────────────

interface ChainAdapterDeps {
  rpc: SolanaRpcService
  jupiter: JupiterService
  crypto: CryptoService
  logger: Logger
}

function ephemeralKeypairFromSecret(secretKey: Buffer | Uint8Array): Keypair {
  return Keypair.fromSecretKey(secretKey instanceof Buffer ? secretKey : Buffer.from(secretKey))
}

async function loadMainWalletKeypair(crypto: CryptoService, publicKey: string): Promise<Keypair> {
  const wallet = await db.query.wallets.findFirst({ where: eq(wallets.publicKey, publicKey) })
  if (!wallet)
    throw new Error(`Main wallet not registered: ${publicKey}`)

  const b58 = crypto.decryptPrivateKey({
    encryptedPrivateKey: wallet.encryptedPrivateKey,
    pkIv: wallet.pkIv,
    pkAuthTag: wallet.pkAuthTag,
    dekEncrypted: wallet.dekEncrypted,
    dekIv: wallet.dekIv,
    dekAuthTag: wallet.dekAuthTag,
    dekSalt: wallet.dekSalt,
  })
  try {
    return Keypair.fromSecretKey(bs58.decode(b58))
  }
  finally {
    // The base58 string itself can't be zeroed — keeping it short-lived is
    // the best mitigation (Inv 3 — never logged).
  }
}

function createChainSeam(deps: ChainAdapterDeps): ChainSeam {
  return {
    async getUserTokenBalance(mainWalletPubkey, mint) {
      const ownerKey = new PublicKey(mainWalletPubkey)
      const mintKey = new PublicKey(mint)
      const { value } = await deps.rpc.withFailover(conn =>
        conn.getParsedTokenAccountsByOwner(ownerKey, { mint: mintKey }),
      )
      let total = 0n
      for (const { account } of value) {
        const raw = account.data.parsed?.info?.tokenAmount?.amount
        if (typeof raw === 'string')
          total += BigInt(raw)
      }
      return total
    },

    async sendFunding(input) {
      const payer = await loadMainWalletKeypair(deps.crypto, input.mainWalletPubkey)
      try {
        const tx = buildCombinedFundingTx(
          payer.publicKey,
          new PublicKey(input.ephemeralPubkey),
          new PublicKey(input.mint),
          input.tokenAmount,
          input.lamports,
        )
        return await sendAndConfirmTransaction(deps.rpc, tx, [payer])
      }
      finally {
        payer.secretKey.fill(0)
      }
    },

    async swapViaJupiter(input) {
      const ephemeral = ephemeralKeypairFromSecret(input.ephemeralSecretKey)
      try {
        const quote = await deps.jupiter.getQuote(input.mint, SOL_MINT, input.tokenAmount)
        const { swapTransaction } = await deps.jupiter.getSwapTransaction(quote, input.ephemeralPubkey)
        const versioned = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'))
        versioned.sign([ephemeral])
        const signature = await deps.rpc.primaryConnection.sendRawTransaction(versioned.serialize())
        return { signature, outLamports: BigInt(quote.outAmount) }
      }
      finally {
        ephemeral.secretKey.fill(0)
      }
    },

    async sendSweep(input) {
      const ephemeral = ephemeralKeypairFromSecret(input.ephemeralSecretKey)
      try {
        const tx = buildSweepAndFeeTx(
          ephemeral.publicKey,
          new PublicKey(input.mainWalletPubkey),
          new PublicKey(input.platformFeeWallet),
          input.userNetLamports,
          input.feeLamports,
        )
        return await sendAndConfirmTransaction(deps.rpc, tx, [ephemeral])
      }
      finally {
        ephemeral.secretKey.fill(0)
      }
    },

    async pollSignatureStatus(signature, opts) {
      const start = Date.now()
      const interval = opts.intervalMs ?? SWAP_POLL_INTERVAL_MS
      while (Date.now() - start < opts.timeoutMs) {
        const { value } = await deps.rpc.primaryConnection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        })
        if (value && (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized'))
          return { landed: true }
        await sleep(interval)
      }
      return { landed: false }
    },

    async getSignatureStatus(signature) {
      const { value } = await deps.rpc.primaryConnection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      })
      return { landed: !!value && (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized') }
    },
  }
}

// ── Public registration ──────────────────────────────────────────────────────

export interface SellExecutionWorkerOptions {
  connection: ConnectionOptions
  redis: Redis
  rpc: SolanaRpcService
  jupiter?: JupiterService
  logger: Logger
}

export function registerSellExecutionWorker(opts: SellExecutionWorkerOptions): {
  worker: Worker<SellJobData>
  stop: () => Promise<void>
} {
  const log = opts.logger
  const crypto = new CryptoService(config.masterKeySecret)
  const jupiter = opts.jupiter ?? new JupiterService()

  const sellConfig: SellExecutionConfig = {
    platformFeeWallet: config.platformFeeWallet,
    platformFeePercentage: config.platformFeePercentage || PLATFORM_FEE_PERCENTAGE,
    referralUserDiscountPct: REFERRAL_USER_DISCOUNT_PCT,
    swapPollTimeoutMs: SWAP_POLL_TIMEOUT_MS,
    fundingRetryBackoffMs: FUNDING_RETRY_BACKOFF_MS,
    sweepRetryBackoffMs: SWEEP_RETRY_BACKOFF_MS,
    ephemeralGasBudgetLamports: EPHEMERAL_GAS_BUDGET_LAMPORTS,
  }

  const deps: SellExecutionDeps = {
    transactions: createTransactionRepoSeam(),
    ephemeralWallets: createEphemeralWalletRepoSeam(),
    feeLedger: createFeeLedgerRepoSeam(),
    identity: createIdentitySeam(),
    chain: createChainSeam({ rpc: opts.rpc, jupiter, crypto, logger: log }),
    notifications: createNotificationSeam(),
    lock: createLockSeam(opts.redis),
    crypto: createCryptoSeam(crypto),
    walletGen: createWalletGenSeam(),
    clock: () => new Date(),
    sleep,
    logger: log,
  }

  const worker = new Worker<SellJobData>(
    QUEUE_SELL_EXECUTION,
    async (job) => {
      await executeSellJob(job.data, deps, sellConfig)
    },
    {
      connection: opts.connection,
      concurrency: BULLMQ_SELL_CONCURRENCY,
    },
  )

  worker.on('failed', (job, err) => {
    log.error({ err, jobId: job?.id, featureId: job?.data.featureId }, 'sell-execution job failed')
  })

  return {
    worker,
    stop: async () => {
      await worker.close()
    },
  }
}

// Reference SELL_LOCK_TTL / redisKeys / defaultRedis to keep the imports
// surface obvious — they're used by the registered seams and helpful as
// jumping-off points when reading this file.
void SELL_LOCK_TTL
void redisKeys
void defaultRedis
