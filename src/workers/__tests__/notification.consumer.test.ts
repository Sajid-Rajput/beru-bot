import type { NotificationJob } from '#root/queue/types.js'
import {
  AUTO_DELETE_TTL_MS,
  createNotificationConsumer,
  createNotificationProcessor,
  renderNotification,
} from '#root/workers/notification.consumer.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('renderNotification', () => {
  it('sell.completed renders amount, symbol, and SOL received', () => {
    const job: NotificationJob = {
      userId: '12345',
      kind: 'sell.completed',
      context: {
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'BONK',
        soldTokens: 1_000_000,
        receivedSol: 0.42,
        txSignatures: { trigger: 'trigSig', sweep: 'sweepSig' },
      },
    }

    const { text } = renderNotification(job)

    expect(text).toContain('Sell Executed')
    expect(text).toContain('1000000')
    expect(text).toContain('BONK')
    expect(text).toContain('0.42')
  })

  it('sell.failed includes the failure reason', () => {
    const job: NotificationJob = {
      userId: '12345',
      kind: 'sell.failed',
      context: {
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'BONK',
        reason: 'slippage exceeded',
      },
    }

    const { text } = renderNotification(job)

    expect(text).toContain('Sell Failed')
    expect(text).toContain('slippage exceeded')
  })

  it('sell.recovered mentions the symbol', () => {
    const job: NotificationJob = {
      userId: '12345',
      kind: 'sell.recovered',
      context: {
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'BONK',
      },
    }

    const { text } = renderNotification(job)

    expect(text).toContain('recovered')
    expect(text).toContain('BONK')
  })

  it('payout.sent shows amount and tx signature', () => {
    const job: NotificationJob = {
      userId: '12345',
      kind: 'payout.sent',
      context: {
        amountSol: 0.135,
        txSignature: 'payoutSig',
      },
    }

    const { text } = renderNotification(job)

    expect(text).toContain('0.135')
    expect(text).toContain('SOL')
    expect(text).toContain('payoutSig')
  })

  it('state.alert echoes context.message verbatim', () => {
    const job: NotificationJob = {
      userId: '12345',
      kind: 'state.alert',
      context: {
        message: 'Shadow Sell paused — MCAP below threshold',
        projectId: 'proj-xyz',
      },
    }

    const { text } = renderNotification(job)

    expect(text).toContain('Shadow Sell paused — MCAP below threshold')
  })

  it('admin.alert shows severity and message', () => {
    const job: NotificationJob = {
      userId: '99999',
      kind: 'admin.alert',
      context: {
        severity: 'high',
        message: 'RPC fallback engaged',
      },
    }

    const { text } = renderNotification(job)

    expect(text).toContain('high')
    expect(text).toContain('RPC fallback engaged')
  })
})

describe('createNotificationProcessor', () => {
  function setup() {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 777 })
    const scheduleDelete = vi.fn()
    const processor = createNotificationProcessor({ sendMessage, scheduleDelete })
    return { sendMessage, scheduleDelete, processor }
  }

  it('sends the rendered text to chatId = Number(userId)', async () => {
    const { sendMessage, processor } = setup()
    const job: NotificationJob = {
      userId: '42',
      kind: 'sell.failed',
      context: { mint: 'm', symbol: 'X', reason: 'boom' },
    }

    await processor(job)

    const { text } = renderNotification(job)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(42, text)
  })

  it('schedules auto-delete with the kind TTL for sell.completed', async () => {
    const { sendMessage, scheduleDelete, processor } = setup()
    sendMessage.mockResolvedValueOnce({ messageId: 1001 })
    const job: NotificationJob = {
      userId: '42',
      kind: 'sell.completed',
      context: {
        mint: 'm',
        symbol: 'X',
        soldTokens: 1,
        receivedSol: 1,
        txSignatures: { trigger: 't', sweep: 's' },
      },
    }

    await processor(job)

    expect(scheduleDelete).toHaveBeenCalledTimes(1)
    expect(scheduleDelete).toHaveBeenCalledWith(42, 1001, AUTO_DELETE_TTL_MS['sell.completed'])
  })

  it('does NOT schedule a delete when TTL is null (payout.sent)', async () => {
    const { scheduleDelete, processor } = setup()
    const job: NotificationJob = {
      userId: '42',
      kind: 'payout.sent',
      context: { amountSol: 1, txSignature: 'sig' },
    }

    await processor(job)

    expect(scheduleDelete).not.toHaveBeenCalled()
  })
})

describe('createNotificationConsumer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 1001 })
    const deleteMessage = vi.fn().mockResolvedValue(undefined)
    const consumer = createNotificationConsumer({ sendMessage, deleteMessage })
    return { sendMessage, deleteMessage, consumer }
  }

  const sellCompletedJob: NotificationJob = {
    userId: '42',
    kind: 'sell.completed',
    context: {
      mint: 'm',
      symbol: 'X',
      soldTokens: 1,
      receivedSol: 1,
      txSignatures: { trigger: 't', sweep: 's' },
    },
  }

  it('fires deleteMessage after the kind TTL elapses', async () => {
    const { deleteMessage, consumer } = setup()

    await consumer.processor(sellCompletedJob)

    expect(deleteMessage).not.toHaveBeenCalled()
    vi.advanceTimersByTime(AUTO_DELETE_TTL_MS['sell.completed']!)
    expect(deleteMessage).toHaveBeenCalledWith(42, 1001)
  })

  it('cancelPendingDeletes prevents pending deletes from firing', async () => {
    const { deleteMessage, consumer } = setup()

    await consumer.processor(sellCompletedJob)
    consumer.cancelPendingDeletes()
    vi.advanceTimersByTime(120_000)

    expect(deleteMessage).not.toHaveBeenCalled()
  })
})

describe('aUTO_DELETE_TTL_MS', () => {
  it('matches the per-kind spec from issue #13', () => {
    expect(AUTO_DELETE_TTL_MS).toEqual({
      'sell.completed': 60_000,
      'sell.failed': 45_000,
      'sell.recovered': 30_000,
      'state.alert': 30_000,
      'payout.sent': null,
      'admin.alert': null,
    })
  })
})
