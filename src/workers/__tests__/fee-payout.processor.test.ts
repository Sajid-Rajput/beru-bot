import type { NotificationJob } from '#root/queue/types.js'
import type { Logger } from '#root/utils/logger.js'
import type {
  EarningsSeam,
  FeePayoutConfig,
  FeePayoutDeps,
  NotificationSeam,
  PayoutRepoSeam,
  TransferSeam,
  UserEarnings,
} from '#root/workers/fee-payout.processor.js'

import { TransferNotBroadcastError } from '#root/utils/errors.js'
import { runPayoutCycle } from '#root/workers/fee-payout.processor.js'
import { describe, expect, it } from 'vitest'

// ── Test constants ───────────────────────────────────────────────────────────

const NOW = new Date('2026-06-21T08:00:00.000Z') // a Sunday
const LAST_PERIOD_END = new Date('2026-06-14T08:00:00.000Z')
const WALLET = 'PayoutWa11et1111111111111111111111111111111'
const WALLET2 = 'PayoutWa11et2222222222222222222222222222222'
const CONFIG: FeePayoutConfig = { minPayoutSol: 0.01 }

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeEarnings(overrides: Partial<UserEarnings> = {}): UserEarnings {
  return {
    userId: 'user-1',
    payoutWalletAddress: WALLET,
    pendingSol: '0.050000000',
    lastPayoutEnd: LAST_PERIOD_END,
    ...overrides,
  }
}

// ── Fake seams ───────────────────────────────────────────────────────────────

function makeFakeEarnings(initial: UserEarnings[]) {
  const seam: EarningsSeam = {
    async findPendingEarnings() {
      return initial.map(e => ({ ...e }))
    },
  }
  return seam
}

function makeFakePayouts(
  order: string[],
  opts: { throwCreateFor?: Set<string>, throwConfirmFor?: Set<string>, throwFailFor?: Set<string> } = {},
) {
  const created: Array<{ id: string, userId: string, amountSol: string, periodStart: Date | null, periodEnd: Date }> = []
  const confirmed: Array<{ id: string, signature: string }> = []
  const failed: string[] = []
  let seq = 0

  const seam: PayoutRepoSeam = {
    async createPending(input) {
      if (opts.throwCreateFor?.has(input.userId))
        throw new Error(`createPending failed for ${input.userId}`)
      const id = `payout-row-${++seq}`
      created.push({ id, ...input })
      order.push(`create:${id}`)
      return { id }
    },
    async markConfirmed(id, signature) {
      order.push(`confirm:${id}`)
      if (opts.throwConfirmFor?.has(id))
        throw new Error(`markConfirmed failed for ${id}`)
      confirmed.push({ id, signature })
    },
    async markFailed(id) {
      order.push(`fail:${id}`)
      if (opts.throwFailFor?.has(id))
        throw new Error(`markFailed failed for ${id}`)
      failed.push(id)
    },
  }
  return Object.assign(seam, { created, confirmed, failed })
}

/**
 * `notBroadcast` → throws TransferNotBroadcastError (no SOL moved, safe to fail);
 * `unknown` → throws a generic Error (broadcast, on-chain outcome uncertain).
 */
function makeFakeTransfer(
  order: string[],
  opts: { notBroadcast?: Set<string>, unknown?: Set<string> } = {},
) {
  const sent: Array<{ toAddress: string, lamports: bigint }> = []
  const seam: TransferSeam = {
    async sendSol(toAddress, lamports) {
      order.push(`send:${toAddress}`)
      if (opts.notBroadcast?.has(toAddress))
        throw new TransferNotBroadcastError(`not broadcast for ${toAddress}`)
      if (opts.unknown?.has(toAddress))
        throw new Error(`confirmation timeout for ${toAddress}`)
      sent.push({ toAddress, lamports })
      return `sig-for-${toAddress}`
    },
  }
  return Object.assign(seam, { sent })
}

function makeFakeNotifications(opts: { throwFor?: Set<string> } = {}) {
  const jobs: NotificationJob[] = []
  const seam: NotificationSeam = {
    async enqueue(job) {
      if (opts.throwFor?.has(job.userId))
        throw new Error(`notify failed for ${job.userId}`)
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

interface DepsOpts {
  notBroadcast?: Set<string>
  unknown?: Set<string>
  throwCreateFor?: Set<string>
  throwConfirmFor?: Set<string>
  throwFailFor?: Set<string>
  notifyThrowFor?: Set<string>
}

function makeDeps(rows: UserEarnings[], opts: DepsOpts = {}) {
  const order: string[] = []
  const earnings = makeFakeEarnings(rows)
  const payouts = makeFakePayouts(order, { throwCreateFor: opts.throwCreateFor, throwConfirmFor: opts.throwConfirmFor, throwFailFor: opts.throwFailFor })
  const transfer = makeFakeTransfer(order, { notBroadcast: opts.notBroadcast, unknown: opts.unknown })
  const notifications = makeFakeNotifications({ throwFor: opts.notifyThrowFor })
  const deps: FeePayoutDeps = {
    earnings,
    payouts,
    transfer,
    notifications,
    clock: () => NOW,
    logger: noopLogger,
  }
  return { deps, earnings, payouts, transfer, notifications, order }
}

// ── Behaviour ────────────────────────────────────────────────────────────────

describe('runPayoutCycle — happy path', () => {
  it('pays a user above threshold: reserves a row, sends SOL, confirms, notifies', async () => {
    const { deps, payouts, transfer, notifications } = makeDeps([makeEarnings()])

    const result = await runPayoutCycle(deps, CONFIG)

    // A referral_payouts row is written binding the period and exact amount.
    expect(payouts.created).toEqual([
      { id: 'payout-row-1', userId: 'user-1', amountSol: '0.050000000', periodStart: LAST_PERIOD_END, periodEnd: NOW },
    ])
    // SOL transferred to the payout wallet, lamports exact (0.05 SOL).
    expect(transfer.sent).toEqual([{ toAddress: WALLET, lamports: 50_000_000n }])
    // Row marked confirmed with the on-chain signature.
    expect(payouts.confirmed).toEqual([{ id: 'payout-row-1', signature: `sig-for-${WALLET}` }])
    // Exactly one payout.sent notification with the SOL amount + signature.
    expect(notifications.jobs).toHaveLength(1)
    expect(notifications.jobs[0]).toMatchObject({
      kind: 'payout.sent',
      userId: 'user-1',
      context: { amountSol: 0.05, txSignature: `sig-for-${WALLET}` },
    })
    expect(result).toEqual({ scanned: 1, paid: 1, skipped: 0, failed: 0, unresolved: 0 })
  })
})

describe('runPayoutCycle — below threshold rolls over', () => {
  it('skips a user under minPayoutSol without writing a row, transfer, or notification', async () => {
    const { deps, payouts, transfer, notifications } = makeDeps([
      makeEarnings({ pendingSol: '0.005000000' }), // < 0.01
    ])

    const result = await runPayoutCycle(deps, CONFIG)

    // Nothing happens — the earnings stay in the running difference for next week.
    expect(payouts.created).toHaveLength(0)
    expect(transfer.sent).toHaveLength(0)
    expect(notifications.jobs).toHaveLength(0)
    expect(result).toEqual({ scanned: 1, paid: 0, skipped: 1, failed: 0, unresolved: 0 })
  })
})

describe('runPayoutCycle — crash-safe ordering', () => {
  it('reserves the row before sending, and confirms only after the send returns', async () => {
    const { deps, order } = makeDeps([makeEarnings()])

    await runPayoutCycle(deps, CONFIG)

    // The pending row must exist before any SOL leaves the wallet, and must be
    // confirmed only after the transfer's signature is known.
    expect(order).toEqual([
      'create:payout-row-1',
      `send:${WALLET}`,
      'confirm:payout-row-1',
    ])
  })
})

describe('runPayoutCycle — period binding', () => {
  it('binds a first-ever payout with a null periodStart and periodEnd = now', async () => {
    const { deps, payouts } = makeDeps([makeEarnings({ lastPayoutEnd: null, pendingSol: '0.123456789' })])

    await runPayoutCycle(deps, CONFIG)

    expect(payouts.created).toEqual([
      { id: 'payout-row-1', userId: 'user-1', amountSol: '0.123456789', periodStart: null, periodEnd: NOW },
    ])
  })
})

describe('runPayoutCycle — not-broadcast transfer (no money moved)', () => {
  it('marks the reserved row failed, sends no notification, and continues to the next user', async () => {
    const { deps, payouts, transfer, notifications } = makeDeps(
      [
        makeEarnings({ userId: 'user-1', payoutWalletAddress: WALLET }),
        makeEarnings({ userId: 'user-2', payoutWalletAddress: WALLET2 }),
      ],
      { notBroadcast: new Set([WALLET]) }, // tx never left the process → safe to fail
    )

    const result = await runPayoutCycle(deps, CONFIG)

    // Both rows were reserved (reserve-before-send), but only user-2's transfer landed.
    expect(payouts.created.map(c => c.id)).toEqual(['payout-row-1', 'payout-row-2'])
    expect(transfer.sent).toEqual([{ toAddress: WALLET2, lamports: 50_000_000n }])
    // A not-broadcast send rolls over: the row is marked failed so next cycle re-pays.
    expect(payouts.failed).toEqual(['payout-row-1'])
    expect(payouts.confirmed).toEqual([{ id: 'payout-row-2', signature: `sig-for-${WALLET2}` }])
    // Only the successful payout notifies.
    expect(notifications.jobs).toHaveLength(1)
    expect(notifications.jobs[0]).toMatchObject({ kind: 'payout.sent', userId: 'user-2' })
    expect(result).toEqual({ scanned: 2, paid: 1, skipped: 0, failed: 1, unresolved: 0 })
  })
})

describe('runPayoutCycle — send outcome unknown (post-broadcast)', () => {
  it('leaves the row pending and counts it unresolved when the transfer may have landed', async () => {
    const { deps, payouts, notifications } = makeDeps(
      [makeEarnings({ userId: 'maybe', payoutWalletAddress: WALLET })],
      { unknown: new Set([WALLET]) }, // broadcast, confirmation threw → outcome uncertain
    )

    const result = await runPayoutCycle(deps, CONFIG)

    // The row was reserved but must NOT be flipped to failed — that would re-expose
    // the balance and double-pay a transfer that may already have landed on-chain.
    expect(payouts.created.map(c => c.id)).toEqual(['payout-row-1'])
    expect(payouts.failed).toEqual([])
    expect(payouts.confirmed).toEqual([])
    expect(notifications.jobs).toHaveLength(0)
    expect(result).toEqual({ scanned: 1, paid: 0, skipped: 0, failed: 0, unresolved: 1 })
  })
})

describe('runPayoutCycle — bookkeeping failures cannot reverse a paid transfer', () => {
  it('does not mark the row failed when markConfirmed throws after the money moved', async () => {
    const { deps, payouts, transfer } = makeDeps(
      [makeEarnings({ userId: 'user-1', payoutWalletAddress: WALLET })],
      { throwConfirmFor: new Set(['payout-row-1']) },
    )

    const result = await runPayoutCycle(deps, CONFIG)

    // The SOL left the wallet; a failed DB write must never route to markFailed
    // (that would re-pay next cycle). The row is reconciled out-of-band.
    expect(transfer.sent).toEqual([{ toAddress: WALLET, lamports: 50_000_000n }])
    expect(payouts.failed).toEqual([])
    expect(result).toEqual({ scanned: 1, paid: 1, skipped: 0, failed: 0, unresolved: 0 })
  })

  it('still counts the payout paid when the notification enqueue throws', async () => {
    const { deps, payouts } = makeDeps(
      [makeEarnings({ userId: 'user-1', payoutWalletAddress: WALLET })],
      { notifyThrowFor: new Set(['user-1']) },
    )

    const result = await runPayoutCycle(deps, CONFIG)

    // markConfirmed sealed the record; a notification outage must not undo it.
    expect(payouts.confirmed).toEqual([{ id: 'payout-row-1', signature: `sig-for-${WALLET}` }])
    expect(payouts.failed).toEqual([])
    expect(result).toEqual({ scanned: 1, paid: 1, skipped: 0, failed: 0, unresolved: 0 })
  })
})

describe('runPayoutCycle — markFailed failure does not abort the cycle', () => {
  it('continues to the next user when markFailed throws on a not-broadcast transfer', async () => {
    const { deps, transfer } = makeDeps(
      [
        makeEarnings({ userId: 'user-1', payoutWalletAddress: WALLET }), // not broadcast + markFailed throws
        makeEarnings({ userId: 'user-2', payoutWalletAddress: WALLET2 }), // healthy
      ],
      { notBroadcast: new Set([WALLET]), throwFailFor: new Set(['payout-row-1']) },
    )

    const result = await runPayoutCycle(deps, CONFIG)

    // The second user is still paid despite the first user's bookkeeping error.
    expect(transfer.sent).toEqual([{ toAddress: WALLET2, lamports: 50_000_000n }])
    expect(result).toEqual({ scanned: 2, paid: 1, skipped: 0, failed: 1, unresolved: 0 })
  })
})

describe('runPayoutCycle — reserve (createPending) failure does not abort the cycle', () => {
  it('rolls over a user whose row reservation fails and continues to the next', async () => {
    const { deps, payouts, transfer, notifications } = makeDeps(
      [
        makeEarnings({ userId: 'user-1', payoutWalletAddress: WALLET }), // createPending throws
        makeEarnings({ userId: 'user-2', payoutWalletAddress: WALLET2 }), // healthy
      ],
      { throwCreateFor: new Set(['user-1']) },
    )

    const result = await runPayoutCycle(deps, CONFIG)

    // No SOL moved for user-1 (no row reserved); user-2 is still paid.
    expect(transfer.sent).toEqual([{ toAddress: WALLET2, lamports: 50_000_000n }])
    expect(payouts.created.map(c => c.userId)).toEqual(['user-2'])
    expect(notifications.jobs.map(j => j.userId)).toEqual(['user-2'])
    // user-1 rolls over (balance intact, retried next cycle); cycle not aborted.
    expect(result).toEqual({ scanned: 2, paid: 1, skipped: 0, failed: 1, unresolved: 0 })
  })
})

describe('runPayoutCycle — no payout wallet', () => {
  it('silently skips an above-threshold user who has not set a payout wallet', async () => {
    const { deps, payouts, transfer, notifications } = makeDeps([
      makeEarnings({ payoutWalletAddress: null }), // pending 0.05 ≥ min, but no wallet
    ])

    const result = await runPayoutCycle(deps, CONFIG)

    expect(payouts.created).toHaveLength(0)
    expect(transfer.sent).toHaveLength(0)
    expect(notifications.jobs).toHaveLength(0)
    expect(result).toEqual({ scanned: 1, paid: 0, skipped: 1, failed: 0, unresolved: 0 })
  })
})

describe('runPayoutCycle — mixed cohort summary', () => {
  it('tallies paid / skipped / failed / unresolved across a mixed set of users', async () => {
    const { deps, notifications } = makeDeps(
      [
        makeEarnings({ userId: 'paid', payoutWalletAddress: WALLET }), // 0.05 → paid
        makeEarnings({ userId: 'tiny', pendingSol: '0.000500000' }), // below threshold → skip
        makeEarnings({ userId: 'no-wallet', payoutWalletAddress: null }), // no wallet → skip
        makeEarnings({ userId: 'boom', payoutWalletAddress: WALLET2 }), // not broadcast → failed
      ],
      { notBroadcast: new Set([WALLET2]) },
    )

    const result = await runPayoutCycle(deps, CONFIG)

    expect(result).toEqual({ scanned: 4, paid: 1, skipped: 2, failed: 1, unresolved: 0 })
    // Only the genuinely-paid user is notified.
    expect(notifications.jobs.map(j => j.userId)).toEqual(['paid'])
  })
})
