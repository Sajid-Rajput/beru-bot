import type { NotificationJob } from '#root/queue/types.js'
import { notificationQueue } from '#root/queue/queues.js'

import { describe, expect, expectTypeOf, it } from 'vitest'

describe('notification-queue contract (ADR-0002 N-2)', () => {
  it('is registered under the queue name "notification-queue"', () => {
    expect(notificationQueue.name).toBe('notification-queue')
  })

  describe('notificationJob discriminated union', () => {
    it('sell.completed carries mint, symbol, soldTokens, receivedSol, txSignatures.{trigger,sweep}', () => {
      const job: NotificationJob = {
        userId: '12345',
        kind: 'sell.completed',
        context: {
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          soldTokens: 1000,
          receivedSol: 0.42,
          txSignatures: { trigger: 'sigA', sweep: 'sigB' },
        },
      }

      if (job.kind === 'sell.completed') {
        expectTypeOf(job.context).toEqualTypeOf<{
          mint: string
          symbol: string
          soldTokens: number
          receivedSol: number
          txSignatures: { trigger: string, sweep: string }
        }>()
      }
    })

    it('closes the union at exactly the six kinds from ADR-0002 N-2', () => {
      // An exhaustive switch — the `never` assignment is the lock. If any
      // kind is added or removed, this stops compiling, forcing a deliberate
      // contract update rather than a silent drift.
      const exhaust = (job: NotificationJob): string => {
        switch (job.kind) {
          case 'sell.completed':
          case 'sell.failed':
          case 'sell.recovered':
          case 'payout.sent':
          case 'state.alert':
          case 'admin.alert':
            return job.kind
          default: {
            const _exhaustive: never = job
            return _exhaustive
          }
        }
      }

      expect(exhaust({
        userId: 'u',
        kind: 'admin.alert',
        context: { severity: 'high', message: 'hi' },
      })).toBe('admin.alert')
    })
  })
})
