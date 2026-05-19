import type { NotificationJob, SellJobData } from '#root/queue/types.js'
import type { WalletEncryptionPayload } from '#root/services/crypto.service.js'
import type {
  ChainSeam,
  CryptoSeam,
  EphemeralWalletRepoSeam,
  FeeLedgerInput,
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
} from '#root/workers/sell-execution.processor.js'
import { Buffer } from 'node:buffer'
import { executeSellJob } from '#root/workers/sell-execution.processor.js'

import { describe, expect, it } from 'vitest'

// ── Test constants ───────────────────────────────────────────────────────────

const MINT = 'MintAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const MAIN_WALLET = 'WalletAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const PLATFORM_FEE_WALLET = 'PlatformFeeWalletaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const FEATURE_ID = 'feat-1'
const USER_ID = 'user-1'
const TRIGGER_SIG = 'sig-trigger'
const EPHEMERAL_PUBKEY = 'EphemeralAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const EPHEMERAL_SECRET = Buffer.from('a'.repeat(128), 'hex') // 64 random bytes

// ── SellJob fixture ──────────────────────────────────────────────────────────

function makeSellJob(overrides: Partial<SellJobData> = {}): SellJobData {
  return {
    schemaVersion: 1,
    featureId: FEATURE_ID,
    triggerSignature: TRIGGER_SIG,
    mint: MINT,
    mainWalletPubkey: MAIN_WALLET,
    sellPercentage: 30,
    configSnapshot: {
      minSellPercentage: 10,
      maxSellPercentage: 50,
      targetMarketCapUsd: 100_000,
      minBuyAmountSol: 1,
      hysteresisPercentage: 5,
    },
    buyAmountSol: 3,
    referralSnapshot: { tier1: null, tier2: null },
    ...overrides,
  }
}

// ── Fake seams ───────────────────────────────────────────────────────────────

function makeFakeTransactionRepo() {
  const byId = new Map<string, TransactionState>()
  let nextId = 1
  const completedWith: Array<{ transactionId: string, sweepTxSignature: string, fee: FeeLedgerInput }> = []
  const failedWith: Array<{ id: string, error: unknown }> = []
  const recoveryWith: Array<{ id: string, error: unknown }> = []

  const repo: TransactionRepoSeam = {
    async findExistingTransaction(featureId, sig) {
      for (const t of byId.values()) {
        if (t.projectFeatureId === featureId && t.triggerTxSignature === sig)
          return t
      }
      return undefined
    },
    async createTransaction(input) {
      const id = `tx-${nextId++}`
      const tx: TransactionState = {
        id,
        projectFeatureId: input.projectFeatureId,
        triggerTxSignature: input.triggerTxSignature,
        sellPercentage: input.sellPercentage,
        status: 'pending',
        fundingTxSignature: null,
        sellTxSignature: null,
        sweepTxSignature: null,
        solAmountReceived: null,
      }
      byId.set(id, tx)
      return tx
    },
    async markFunded(id, sig) {
      const t = byId.get(id)!
      t.fundingTxSignature = sig
      t.status = 'funding'
    },
    async markSwapped(id, sig, solAmountReceived) {
      const t = byId.get(id)!
      t.sellTxSignature = sig
      t.solAmountReceived = solAmountReceived
      t.status = 'swapping'
    },
    async markCompletedWithFee(input) {
      completedWith.push(input)
      const t = byId.get(input.transactionId)!
      t.sweepTxSignature = input.sweepTxSignature
      t.status = 'completed'
    },
    async markFailed(id, error) {
      failedWith.push({ id, error })
      const t = byId.get(id)!
      t.status = 'failed'
    },
    async markRecoveryNeeded(id, error) {
      recoveryWith.push({ id, error })
      const t = byId.get(id)!
      t.status = 'recovery_needed'
    },
  }
  return Object.assign(repo, { byId, completedWith, failedWith, recoveryWith })
}

function makeFakeEphemeralRepo() {
  const byTxId = new Map<string, { publicKey: string, encrypted: WalletEncryptionPayload }>()
  const repo: EphemeralWalletRepoSeam = {
    async createEphemeralWallet(input) {
      byTxId.set(input.transactionId, { publicKey: input.publicKey, encrypted: input.encrypted })
    },
    async findEphemeralWallet(txId) {
      return byTxId.get(txId)
    },
  }
  return Object.assign(repo, { byTxId })
}

function makeFakeFeeLedgerRepo() {
  const byTxId = new Map<string, FeeLedgerInput>()
  const repo: FeeLedgerRepoSeam = {
    async findFeeLedger(txId) {
      return byTxId.has(txId) ? { id: `fee-${txId}` } : undefined
    },
    async createFeeLedger(input) {
      byTxId.set(input.transactionId, input)
    },
  }
  return Object.assign(repo, { byTxId })
}

function makeFakeIdentity(): IdentitySeam {
  return {
    async getUserIdByFeatureId(featureId) {
      if (featureId === FEATURE_ID)
        return USER_ID
      throw new Error(`unknown feature: ${featureId}`)
    },
  }
}

interface FakeChainOpts {
  /** Token balance (base units) reported for getUserTokenBalance. */
  tokenBalance?: bigint
  /** SOL lamports out from the swap. */
  swapOutLamports?: bigint
  /** Signatures considered already landed before the worker runs. */
  preLanded?: Set<string>
  /** Predicate: each fresh signature this call returns is added to preLanded. */
  autoLandFreshSignatures?: boolean
}

function makeFakeChain(opts: FakeChainOpts = {}) {
  const preLanded = new Set(opts.preLanded ?? [])
  const auto = opts.autoLandFreshSignatures ?? true
  const fundingCalls: Array<Record<string, unknown>> = []
  const swapCalls: Array<Record<string, unknown>> = []
  const sweepCalls: Array<Record<string, unknown>> = []
  let nextSig = 100

  function freshSig(prefix: string) {
    const s = `${prefix}-${nextSig++}`
    if (auto)
      preLanded.add(s)
    return s
  }

  const chain: ChainSeam = {
    async getUserTokenBalance() {
      return opts.tokenBalance ?? 1_000_000n
    },
    async sendFunding(input) {
      fundingCalls.push(input as unknown as Record<string, unknown>)
      return freshSig('funding-sig')
    },
    async swapViaJupiter(input) {
      swapCalls.push(input as unknown as Record<string, unknown>)
      return {
        signature: freshSig('swap-sig'),
        outLamports: opts.swapOutLamports ?? 500_000_000n, // 0.5 SOL
      }
    },
    async sendSweep(input) {
      sweepCalls.push(input as unknown as Record<string, unknown>)
      return freshSig('sweep-sig')
    },
    async pollSignatureStatus(sig) {
      return { landed: preLanded.has(sig) }
    },
    async getSignatureStatus(sig) {
      return { landed: preLanded.has(sig) }
    },
  }
  return Object.assign(chain, { fundingCalls, swapCalls, sweepCalls, preLanded })
}

function makeFakeNotifications() {
  const sent: NotificationJob[] = []
  const seam: NotificationSeam = {
    async enqueueNotification(job) {
      sent.push(job)
    },
  }
  return Object.assign(seam, { sent })
}

function makeFakeLock(opts: { acquireResult?: boolean } = {}) {
  const acquired: string[] = []
  const released: string[] = []
  const seam: LockSeam = {
    async acquireLock(key) {
      acquired.push(key)
      return opts.acquireResult ?? true
    },
    async releaseLock(key) {
      released.push(key)
    },
  }
  return Object.assign(seam, { acquired, released })
}

function makeFakeCrypto() {
  const zeroes: Uint8Array[] = []
  const seam: CryptoSeam = {
    encryptPrivateKey() {
      return {
        encryptedPrivateKey: 'enc',
        pkIv: 'iv',
        pkAuthTag: 'tag',
        dekEncrypted: 'dek',
        dekIv: 'div',
        dekAuthTag: 'dtag',
        dekSalt: 'salt',
      }
    },
    decryptPrivateKey() {
      const copy = Buffer.from(EPHEMERAL_SECRET)
      zeroes.push(copy)
      return copy
    },
  }
  return Object.assign(seam, { zeroes })
}

function makeFakeWalletGen(): WalletGenSeam {
  return {
    generateEphemeralKeypair() {
      return { publicKey: EPHEMERAL_PUBKEY, secretKey: Buffer.from(EPHEMERAL_SECRET) }
    },
  }
}

function makeNoopLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function makeDeps(overrides: Partial<{
  transactions: ReturnType<typeof makeFakeTransactionRepo>
  ephemeralWallets: ReturnType<typeof makeFakeEphemeralRepo>
  feeLedger: ReturnType<typeof makeFakeFeeLedgerRepo>
  identity: IdentitySeam
  chain: ReturnType<typeof makeFakeChain>
  notifications: ReturnType<typeof makeFakeNotifications>
  lock: ReturnType<typeof makeFakeLock>
  crypto: ReturnType<typeof makeFakeCrypto>
  walletGen: WalletGenSeam
}> = {}) {
  const transactions = overrides.transactions ?? makeFakeTransactionRepo()
  const ephemeralWallets = overrides.ephemeralWallets ?? makeFakeEphemeralRepo()
  const feeLedger = overrides.feeLedger ?? makeFakeFeeLedgerRepo()
  const identity = overrides.identity ?? makeFakeIdentity()
  const chain = overrides.chain ?? makeFakeChain()
  const notifications = overrides.notifications ?? makeFakeNotifications()
  const lock = overrides.lock ?? makeFakeLock()
  const crypto = overrides.crypto ?? makeFakeCrypto()
  const walletGen = overrides.walletGen ?? makeFakeWalletGen()
  const sleepCalls: number[] = []
  const deps: SellExecutionDeps = {
    transactions,
    ephemeralWallets,
    feeLedger,
    identity,
    chain,
    notifications,
    lock,
    crypto,
    walletGen,
    clock: () => new Date('2026-05-20T00:00:00.000Z'),
    sleep: async (ms) => {
      sleepCalls.push(ms)
    },
    logger: makeNoopLogger(),
  }
  return Object.assign(deps, {
    transactions,
    ephemeralWallets,
    feeLedger,
    chain,
    notifications,
    lock,
    crypto,
    sleepCalls,
  })
}

function makeConfig(overrides: Partial<SellExecutionConfig> = {}): SellExecutionConfig {
  return {
    platformFeeWallet: PLATFORM_FEE_WALLET,
    platformFeePercentage: 0.01,
    referralUserDiscountPct: 0.10,
    swapPollTimeoutMs: 30_000,
    fundingRetryBackoffMs: [250, 1_000, 4_000],
    sweepRetryBackoffMs: [250, 500, 1_000, 2_000, 4_000],
    ephemeralGasBudgetLamports: 5_000_000,
    ...overrides,
  }
}

// ── Helpers to seed an in-progress transaction state ────────────────────────

function seedExistingTransaction(
  transactions: ReturnType<typeof makeFakeTransactionRepo>,
  overrides: Partial<TransactionState> & { id?: string } = {},
): TransactionState {
  const id = overrides.id ?? 'tx-existing'
  const row: TransactionState = {
    id,
    projectFeatureId: FEATURE_ID,
    triggerTxSignature: TRIGGER_SIG,
    sellPercentage: 30,
    status: 'pending',
    fundingTxSignature: null,
    sellTxSignature: null,
    sweepTxSignature: null,
    solAmountReceived: null,
    ...overrides,
  }
  transactions.byId.set(id, row)
  return row
}

function seedEphemeralWallet(
  ephemeralWallets: ReturnType<typeof makeFakeEphemeralRepo>,
  transactionId: string,
) {
  ephemeralWallets.byTxId.set(transactionId, {
    publicKey: EPHEMERAL_PUBKEY,
    encrypted: {
      encryptedPrivateKey: 'enc',
      pkIv: 'iv',
      pkAuthTag: 'tag',
      dekEncrypted: 'dek',
      dekIv: 'div',
      dekAuthTag: 'dtag',
      dekSalt: 'salt',
    },
  })
}

// ── Slice 1: tracer — happy path E2E ─────────────────────────────────────────

describe('executeSellJob — happy path tracer', () => {
  it('runs fund → swap → sweep → fee ledger → notify for a fresh job', async () => {
    const deps = makeDeps()
    const config = makeConfig()
    const job = makeSellJob()

    const outcome = await executeSellJob(job, deps, config)

    // Returns a completed outcome
    expect(outcome.kind).toBe('completed')

    // One transaction row created and walked through every step
    const ids = Array.from(deps.transactions.byId.keys())
    expect(ids).toHaveLength(1)
    const row = deps.transactions.byId.get(ids[0]!)!
    expect(row.status).toBe('completed')
    expect(row.fundingTxSignature).toBeTruthy()
    expect(row.sellTxSignature).toBeTruthy()
    expect(row.sweepTxSignature).toBeTruthy()

    // Atomic sweep+fee write was used (not two separate writes)
    expect(deps.transactions.completedWith).toHaveLength(1)
    const completed = deps.transactions.completedWith[0]!
    expect(completed.sweepTxSignature).toBe(row.sweepTxSignature)
    expect(completed.fee.transactionId).toBe(row.id)
    expect(completed.fee.userId).toBe(USER_ID)
    expect(completed.fee.collectionStatus).toBe('pending')

    // sell.completed notification was enqueued
    expect(deps.notifications.sent).toHaveLength(1)
    const notif = deps.notifications.sent[0]!
    expect(notif.kind).toBe('sell.completed')
    expect(notif.userId).toBe(USER_ID)
    if (notif.kind === 'sell.completed') {
      expect(notif.context.mint).toBe(MINT)
      expect(notif.context.txSignatures.trigger).toBe(TRIGGER_SIG)
      expect(notif.context.txSignatures.sweep).toBe(row.sweepTxSignature)
    }

    // The sell lock was acquired and released
    expect(deps.lock.acquired).toEqual([`sell-lock:${FEATURE_ID}`])
    expect(deps.lock.released).toEqual([`sell-lock:${FEATURE_ID}`])
  })

  it('does not run any chain TXs when sweep already landed and fee_ledger exists', async () => {
    const transactions = makeFakeTransactionRepo()
    const ephemeralWallets = makeFakeEphemeralRepo()
    const feeLedger = makeFakeFeeLedgerRepo()
    const chain = makeFakeChain({
      preLanded: new Set(['funding-prev', 'swap-prev', 'sweep-prev']),
    })
    const row = seedExistingTransaction(transactions, {
      id: 'tx-done',
      status: 'completed',
      fundingTxSignature: 'funding-prev',
      sellTxSignature: 'swap-prev',
      sweepTxSignature: 'sweep-prev',
      solAmountReceived: '0.5',
    })
    seedEphemeralWallet(ephemeralWallets, row.id)
    feeLedger.byTxId.set(row.id, {
      transactionId: row.id,
      userId: USER_ID,
      grossSol: '0.5',
      grossFee: '0.005',
      referralDiscount: '0',
      effectiveFee: '0.005',
      tier1ReferrerShare: '0',
      tier1ReferrerId: null,
      tier2ReferrerShare: '0',
      tier2ReferrerId: null,
      platformNet: '0.005',
      collectionStatus: 'pending',
    })

    const deps = makeDeps({ transactions, ephemeralWallets, feeLedger, chain })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome.kind).toBe('completed')
    expect(chain.fundingCalls).toHaveLength(0)
    expect(chain.swapCalls).toHaveLength(0)
    expect(chain.sweepCalls).toHaveLength(0)
    expect(transactions.completedWith).toHaveLength(0)
    expect(deps.notifications.sent).toHaveLength(0)
  })

  it('writes the missing fee_ledger row when sweep landed but PG write failed previously', async () => {
    const transactions = makeFakeTransactionRepo()
    const ephemeralWallets = makeFakeEphemeralRepo()
    const feeLedger = makeFakeFeeLedgerRepo() // intentionally empty
    const chain = makeFakeChain({
      preLanded: new Set(['funding-prev', 'swap-prev', 'sweep-prev']),
    })
    const row = seedExistingTransaction(transactions, {
      id: 'tx-race',
      status: 'sweeping', // sweep was last written sig but completion+fee_ledger never happened
      fundingTxSignature: 'funding-prev',
      sellTxSignature: 'swap-prev',
      sweepTxSignature: 'sweep-prev',
      solAmountReceived: '1.0', // captured during the prior swap step
    })
    seedEphemeralWallet(ephemeralWallets, row.id)

    const deps = makeDeps({ transactions, ephemeralWallets, feeLedger, chain })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome.kind).toBe('completed')
    expect(chain.fundingCalls).toHaveLength(0)
    expect(chain.swapCalls).toHaveLength(0)
    expect(chain.sweepCalls).toHaveLength(0)
    expect(feeLedger.byTxId.has(row.id)).toBe(true)
    expect(transactions.byId.get(row.id)!.status).toBe('completed')
    expect(deps.notifications.sent).toHaveLength(1)
    expect(deps.notifications.sent[0]!.kind).toBe('sell.completed')
  })

  it('retries funding on transient failures and recovers when one succeeds', async () => {
    const transactions = makeFakeTransactionRepo()
    const chain = makeFakeChain()
    let fundingAttempts = 0
    chain.sendFunding = async (input) => {
      chain.fundingCalls.push(input as unknown as Record<string, unknown>)
      fundingAttempts++
      if (fundingAttempts < 3)
        throw new Error('rpc transient')
      const sig = `funding-sig-${fundingAttempts}`
      chain.preLanded.add(sig)
      return sig
    }

    const deps = makeDeps({ transactions, chain })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome.kind).toBe('completed')
    expect(fundingAttempts).toBe(3)
    // Two backoff sleeps were observed between the three attempts.
    expect(deps.sleepCalls.slice(0, 2)).toEqual([250, 1_000])
  })

  it('marks transaction failed + emits sell.failed after exhausting funding retries', async () => {
    const transactions = makeFakeTransactionRepo()
    const chain = makeFakeChain()
    chain.sendFunding = async (input) => {
      chain.fundingCalls.push(input as unknown as Record<string, unknown>)
      throw new Error('rpc dead')
    }

    const deps = makeDeps({ transactions, chain })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome.kind).toBe('failed')
    // 4 attempts total: 1 initial + 3 retries (one per entry in fundingRetryBackoffMs).
    expect(chain.fundingCalls).toHaveLength(4)
    expect(deps.sleepCalls).toEqual([250, 1_000, 4_000])
    expect(transactions.failedWith).toHaveLength(1)
    expect(deps.notifications.sent).toHaveLength(1)
    expect(deps.notifications.sent[0]!.kind).toBe('sell.failed')
  })

  it('zeroes the decrypted ephemeral private key after a successful run', async () => {
    const deps = makeDeps()
    await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(deps.crypto.zeroes).toHaveLength(1)
    expect(deps.crypto.zeroes[0]!.every(b => b === 0)).toBe(true)
  })

  it('zeroes the decrypted ephemeral private key even when the sweep fails', async () => {
    const chain = makeFakeChain()
    chain.sendSweep = async () => {
      chain.sweepCalls.push({})
      throw new Error('rpc dead')
    }
    const deps = makeDeps({ chain })
    await executeSellJob(
      makeSellJob(),
      deps,
      makeConfig({ sweepRetryBackoffMs: [1, 1, 1, 1, 1] }),
    )

    expect(deps.crypto.zeroes).toHaveLength(1)
    expect(deps.crypto.zeroes[0]!.every(b => b === 0)).toBe(true)
  })

  it('exits with `skipped` when the sell lock is already held by another worker', async () => {
    const lock = makeFakeLock({ acquireResult: false })
    const deps = makeDeps({ lock })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome).toEqual({ kind: 'skipped', reason: 'lock-not-acquired' })
    // Did not start any chain work, did not create a transactions row,
    // did not enqueue a notification.
    expect(deps.chain.fundingCalls).toHaveLength(0)
    expect(deps.transactions.byId.size).toBe(0)
    expect(deps.notifications.sent).toHaveLength(0)
    // Did not release a lock it never held.
    expect(lock.released).toEqual([])
  })

  it('releases the lock even when the sweep step throws to recovery', async () => {
    const chain = makeFakeChain()
    chain.sendSweep = async () => {
      chain.sweepCalls.push({})
      throw new Error('rpc dead')
    }
    const deps = makeDeps({ chain })
    await executeSellJob(
      makeSellJob(),
      deps,
      makeConfig({ sweepRetryBackoffMs: [1, 1, 1, 1, 1] }),
    )

    expect(deps.lock.released).toEqual([`sell-lock:${FEATURE_ID}`])
  })

  it('retries the sweep on transient failure and writes fee_ledger atomically', async () => {
    const chain = makeFakeChain()
    let sweepAttempts = 0
    chain.sendSweep = async (input) => {
      chain.sweepCalls.push(input as unknown as Record<string, unknown>)
      sweepAttempts++
      if (sweepAttempts < 3)
        throw new Error('blockhash expired')
      const sig = `sweep-sig-${sweepAttempts}`
      chain.preLanded.add(sig)
      return sig
    }

    const deps = makeDeps({ chain })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome.kind).toBe('completed')
    expect(sweepAttempts).toBe(3)
    expect(deps.transactions.completedWith).toHaveLength(1)
  })

  it('marks recovery_needed + emits sell.failed after exhausting sweep retries', async () => {
    const chain = makeFakeChain()
    chain.sendSweep = async (input) => {
      chain.sweepCalls.push(input as unknown as Record<string, unknown>)
      throw new Error('rpc dead')
    }

    const deps = makeDeps({ chain })
    const outcome = await executeSellJob(
      makeSellJob(),
      deps,
      makeConfig({ sweepRetryBackoffMs: [10, 20, 30, 40, 50] }),
    )

    expect(outcome.kind).toBe('recovery_needed')
    // 6 attempts: 1 initial + 5 retries
    expect(chain.sweepCalls).toHaveLength(6)
    expect(deps.transactions.completedWith).toHaveLength(0)
    expect(deps.transactions.recoveryWith).toHaveLength(1)
    expect(deps.notifications.sent).toHaveLength(1)
    expect(deps.notifications.sent[0]!.kind).toBe('sell.failed')
  })

  it('polls signature status exactly once after sending the swap', async () => {
    const chain = makeFakeChain()
    const pollCalls: Array<{ sig: string, timeoutMs: number }> = []
    chain.pollSignatureStatus = async (sig, opts) => {
      pollCalls.push({ sig, timeoutMs: opts.timeoutMs })
      return { landed: true }
    }
    const deps = makeDeps({ chain })
    await executeSellJob(makeSellJob(), deps, makeConfig({ swapPollTimeoutMs: 30_000 }))

    // Swap was sent exactly once
    expect(chain.swapCalls).toHaveLength(1)
    // Poll happened once on the resulting swap signature with the 30s budget
    const swapSig = deps.transactions.byId.values().next().value!.sellTxSignature
    expect(pollCalls).toEqual([{ sig: swapSig, timeoutMs: 30_000 }])
  })

  it('marks recovery_needed and notifies sell.failed when swap poll times out', async () => {
    const chain = makeFakeChain({ autoLandFreshSignatures: false })
    chain.pollSignatureStatus = async () => ({ landed: false })

    const deps = makeDeps({ chain })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome.kind).toBe('recovery_needed')
    // No sweep attempt — we don't double-spend after a swap whose status is unknown.
    expect(chain.sweepCalls).toHaveLength(0)
    expect(deps.transactions.recoveryWith).toHaveLength(1)
    expect(deps.notifications.sent).toHaveLength(1)
    expect(deps.notifications.sent[0]!.kind).toBe('sell.failed')
  })

  it('does not re-send the swap when a prior sellTxSignature is persisted but not yet landed', async () => {
    const transactions = makeFakeTransactionRepo()
    const ephemeralWallets = makeFakeEphemeralRepo()
    const chain = makeFakeChain({
      preLanded: new Set(['funding-prev']), // funding landed, swap sig persisted but not landed
    })
    chain.pollSignatureStatus = async () => ({ landed: false })

    const row = seedExistingTransaction(transactions, {
      id: 'tx-stuck-swap',
      status: 'swapping',
      fundingTxSignature: 'funding-prev',
      sellTxSignature: 'swap-stuck',
    })
    seedEphemeralWallet(ephemeralWallets, row.id)

    const deps = makeDeps({ transactions, ephemeralWallets, chain })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome.kind).toBe('recovery_needed')
    // No new swap was attempted — would cause double-swap.
    expect(chain.swapCalls).toHaveLength(0)
    expect(chain.sweepCalls).toHaveLength(0)
  })

  it('resumes from sweep when funding + swap have already landed', async () => {
    const transactions = makeFakeTransactionRepo()
    const ephemeralWallets = makeFakeEphemeralRepo()
    const feeLedger = makeFakeFeeLedgerRepo()
    const chain = makeFakeChain({
      preLanded: new Set(['funding-prev', 'swap-prev']),
    })
    const row = seedExistingTransaction(transactions, {
      id: 'tx-mid',
      status: 'swapping',
      fundingTxSignature: 'funding-prev',
      sellTxSignature: 'swap-prev',
      solAmountReceived: '0.5',
    })
    seedEphemeralWallet(ephemeralWallets, row.id)

    const deps = makeDeps({ transactions, ephemeralWallets, feeLedger, chain })
    const outcome = await executeSellJob(makeSellJob(), deps, makeConfig())

    expect(outcome.kind).toBe('completed')

    // No funding/swap calls — those steps are skipped.
    expect(chain.fundingCalls).toHaveLength(0)
    expect(chain.swapCalls).toHaveLength(0)
    // Sweep does run.
    expect(chain.sweepCalls).toHaveLength(1)
    // grossSol persisted at 0.5; sweep should transfer userNet = 0.5 - effectiveFee
    const sweep = chain.sweepCalls[0]!
    expect(sweep.userNetLamports).toBeGreaterThan(0)
    expect(sweep.feeLamports).toBeGreaterThan(0)

    // Fee ledger written via the atomic markCompletedWithFee path
    expect(transactions.completedWith).toHaveLength(1)
  })

  it('writes the fee_ledger row using snapshot referral shares', async () => {
    const deps = makeDeps({
      chain: makeFakeChain({ swapOutLamports: 1_000_000_000n }), // 1 SOL
    })
    const job = makeSellJob({
      referralSnapshot: {
        tier1: { userId: 'ref-1', sharePct: 0.35 },
        tier2: { userId: 'ref-2', sharePct: 0.05 },
      },
    })

    await executeSellJob(job, deps, makeConfig())

    const fee = deps.transactions.completedWith[0]!.fee
    // grossSol = 1.0; grossFee = 0.01; referralDiscount = 10% of grossFee = 0.001
    // effectiveFee = 0.009; tier1 = 0.009 * 0.35 = 0.00315; tier2 = 0.009 * 0.05 = 0.00045
    // platformNet = 0.009 - 0.00315 - 0.00045 = 0.0054
    expect(Number(fee.grossSol)).toBeCloseTo(1.0, 9)
    expect(Number(fee.grossFee)).toBeCloseTo(0.01, 9)
    expect(Number(fee.referralDiscount)).toBeCloseTo(0.001, 9)
    expect(Number(fee.effectiveFee)).toBeCloseTo(0.009, 9)
    expect(Number(fee.tier1ReferrerShare)).toBeCloseTo(0.00315, 9)
    expect(fee.tier1ReferrerId).toBe('ref-1')
    expect(Number(fee.tier2ReferrerShare)).toBeCloseTo(0.00045, 9)
    expect(fee.tier2ReferrerId).toBe('ref-2')
    expect(Number(fee.platformNet)).toBeCloseTo(0.0054, 9)
  })
})
