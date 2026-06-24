import type { ShadowSellConfig } from '#root/db/schema/index.js'
import type { NotificationJob, SellJobData } from '#root/queue/types.js'
import type { Logger } from '#root/utils/logger.js'
import type {
  NotificationSeam,
  RecoveryConfig,
  RecoveryDeps,
  RecoveryRepoSeam,
  SellQueueSeam,
  StuckTransaction,
} from '#root/workers/recovery.processor.js'

import { runRecoveryCycle } from '#root/workers/recovery.processor.js'
import { describe, expect, it } from 'vitest'

// ── Test constants ───────────────────────────────────────────────────────────

const NOW = new Date('2026-06-24T12:00:00.000Z')
const CONFIG: RecoveryConfig = {
  cooldownMs: 300_000, // 5 min
  scanLimit: 100,
  maxRecoveryAttempts: 5,
  adminUserIds: ['900900900'],
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

function cfg(overrides: Partial<ShadowSellConfig> = {}): ShadowSellConfig {
  return {
    minSellPercentage: 10,
    maxSellPercentage: 50,
    targetMarketCapUsd: 100_000,
    minBuyAmountSol: 1,
    hysteresisPercentage: 5,
    ...overrides,
  }
}

function makeSellJob(overrides: Partial<SellJobData> = {}): SellJobData {
  return {
    schemaVersion: 1,
    featureId: 'feat-1',
    triggerSignature: 'trig-sig-1',
    mint: 'MintAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    mainWalletPubkey: 'Wallet1111111111111111111111111111111111111',
    sellPercentage: 25,
    configSnapshot: cfg(),
    buyAmountSol: 2,
    referralSnapshot: { tier1: null, tier2: null },
    ...overrides,
  }
}

function makeStuck(overrides: Partial<StuckTransaction> = {}): StuckTransaction {
  return {
    id: 'tx-1',
    jobSnapshot: makeSellJob(),
    recoveryAttempts: 0,
    ...overrides,
  }
}

// ── Fake seams ───────────────────────────────────────────────────────────────

function makeFakeRepo(initial: StuckTransaction[]) {
  const recovering: Array<{ id: string, attempts: number, at: Date }> = []
  const failures: Array<{ id: string, errorDetails: unknown }> = []
  const cutoffs: Date[] = []
  const limits: number[] = []

  const repo: RecoveryRepoSeam = {
    async findStuck(cutoff, limit) {
      cutoffs.push(cutoff)
      limits.push(limit)
      return initial.map(r => ({ ...r }))
    },
    async markRecovering(id, attempts, at) {
      recovering.push({ id, attempts, at })
    },
    async markFailed(id, errorDetails) {
      failures.push({ id, errorDetails })
    },
  }
  return Object.assign(repo, { recovering, failures, cutoffs, limits })
}

function makeFakeSellQueue() {
  const enqueued: Array<{ job: SellJobData, dedupeKey: string }> = []
  const seam: SellQueueSeam = {
    async enqueue(job, dedupeKey) {
      enqueued.push({ job, dedupeKey })
    },
  }
  return Object.assign(seam, { enqueued })
}

function makeFakeNotifications() {
  const jobs: NotificationJob[] = []
  const seam: NotificationSeam = {
    async enqueue(job) {
      jobs.push(job)
    },
  }
  return Object.assign(seam, { jobs })
}

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child: () => noopLogger,
} as unknown as Logger

function makeDeps(rows: StuckTransaction[]) {
  const repo = makeFakeRepo(rows)
  const sellQueue = makeFakeSellQueue()
  const notifications = makeFakeNotifications()
  const deps: RecoveryDeps = {
    repo,
    sellQueue,
    notifications,
    clock: () => NOW,
    logger: noopLogger,
  }
  return { deps, repo, sellQueue, notifications }
}

// ── Behaviour ────────────────────────────────────────────────────────────────

describe('runRecoveryCycle — re-enqueue', () => {
  it('re-enqueues the persisted SellJob and bumps recovery_attempts + last_attempt_at', async () => {
    const job = makeSellJob({ featureId: 'feat-7', triggerSignature: 'trig-7' })
    const { deps, repo, sellQueue } = makeDeps([makeStuck({ id: 'tx-7', jobSnapshot: job, recoveryAttempts: 0 })])

    const result = await runRecoveryCycle(deps, CONFIG)

    // The exact persisted SellJob is put back on the sell queue.
    expect(sellQueue.enqueued).toHaveLength(1)
    expect(sellQueue.enqueued[0]!.job).toEqual(job)
    // recovery_attempts goes 0 → 1, last_attempt_at is bumped to now.
    expect(repo.recovering).toContainEqual({ id: 'tx-7', attempts: 1, at: NOW })
    // The scan cutoff is now − cooldown.
    expect(repo.cutoffs[0]).toEqual(new Date(NOW.getTime() - CONFIG.cooldownMs))
    expect(result).toEqual({ scanned: 1, reEnqueued: 1, failed: 0 })
  })
})

describe('runRecoveryCycle — terminal after max attempts', () => {
  it('marks the row failed and alerts every admin instead of re-enqueueing', async () => {
    const config = { ...CONFIG, adminUserIds: ['111', '222'] }
    const { deps, repo, sellQueue, notifications } = makeDeps([
      makeStuck({ id: 'tx-dead', recoveryAttempts: 5 }),
    ])

    const result = await runRecoveryCycle(deps, config)

    // No re-enqueue once the ceiling is reached.
    expect(sellQueue.enqueued).toHaveLength(0)
    expect(repo.recovering).toHaveLength(0)
    // The row is marked terminally failed.
    expect(repo.failures).toHaveLength(1)
    expect(repo.failures[0]!.id).toBe('tx-dead')
    // One high-severity admin alert per configured admin.
    expect(notifications.jobs).toHaveLength(2)
    expect(notifications.jobs).toContainEqual(
      expect.objectContaining({ userId: '111', kind: 'admin.alert', context: expect.objectContaining({ severity: 'high' }) }),
    )
    expect(notifications.jobs).toContainEqual(
      expect.objectContaining({ userId: '222', kind: 'admin.alert', context: expect.objectContaining({ severity: 'high' }) }),
    )
    expect(result).toEqual({ scanned: 1, reEnqueued: 0, failed: 1 })
  })
})

describe('runRecoveryCycle — per-attempt dedupe key', () => {
  it('derives the dedupe key from the attempt number so re-enqueues are not dropped', async () => {
    // A row already recovered twice; this is its third recovery.
    const { deps, sellQueue, repo } = makeDeps([makeStuck({ id: 'tx-3', recoveryAttempts: 2 })])

    await runRecoveryCycle(deps, CONFIG)

    // dedupeKey must be unique to attempt 3 — re-using the original sell jobId
    // would let BullMQ silently drop the re-enqueue.
    expect(sellQueue.enqueued[0]!.dedupeKey).toBe('r3')
    expect(repo.recovering[0]).toMatchObject({ id: 'tx-3', attempts: 3 })
  })
})

describe('runRecoveryCycle — robustness', () => {
  it('fails a row with no job_snapshot instead of crashing', async () => {
    const { deps, repo, sellQueue, notifications } = makeDeps([
      makeStuck({ id: 'tx-nosnap', jobSnapshot: null, recoveryAttempts: 0 }),
    ])

    const result = await runRecoveryCycle(deps, CONFIG)

    expect(sellQueue.enqueued).toHaveLength(0)
    expect(repo.failures[0]!.id).toBe('tx-nosnap')
    expect(notifications.jobs[0]).toMatchObject({ kind: 'admin.alert', context: { severity: 'high' } })
    expect(result).toEqual({ scanned: 1, reEnqueued: 0, failed: 1 })
  })

  it('isolates a failing row so the rest of the cycle still runs', async () => {
    const repo = makeFakeRepo([
      makeStuck({ id: 'tx-boom', recoveryAttempts: 0 }),
      makeStuck({ id: 'tx-ok', recoveryAttempts: 0 }),
    ])
    const sellQueue = makeFakeSellQueue()
    // First enqueue throws; the second must still go through.
    let calls = 0
    sellQueue.enqueue = async (job, dedupeKey) => {
      calls++
      if (calls === 1)
        throw new Error('queue boom')
      sellQueue.enqueued.push({ job, dedupeKey })
    }
    const notifications = makeFakeNotifications()
    const deps: RecoveryDeps = { repo, sellQueue, notifications, clock: () => NOW, logger: noopLogger }

    const result = await runRecoveryCycle(deps, CONFIG)

    expect(sellQueue.enqueued).toHaveLength(1)
    expect(sellQueue.enqueued[0]!.job.featureId).toBe('feat-1')
    expect(result.reEnqueued).toBe(1)
  })

  it('is a no-op when nothing is stuck', async () => {
    const { deps, sellQueue, notifications, repo } = makeDeps([])

    const result = await runRecoveryCycle(deps, CONFIG)

    expect(result).toEqual({ scanned: 0, reEnqueued: 0, failed: 0 })
    expect(sellQueue.enqueued).toHaveLength(0)
    expect(repo.failures).toHaveLength(0)
    expect(notifications.jobs).toHaveLength(0)
  })
})
