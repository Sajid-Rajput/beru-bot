import type { NotificationJob } from '#root/queue/types.js'
import {
  AUTO_DELETE_TTL_MS,
  createNotificationConsumer,
  createNotificationProcessor,
  renderNotification,
} from '#root/workers/notification.consumer.js'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type FeatureStateContext = Extract<NotificationJob, { kind: 'feature.state' }>['context']

function makeFeatureStateJob(overrides: Partial<FeatureStateContext> = {}): NotificationJob {
  return {
    userId: '42',
    kind: 'feature.state',
    context: {
      newState: 'paused',
      pinnedMessageId: 999,
      projectId: 'proj-1',
      tokenName: 'Bonk',
      tokenSymbol: 'BONK',
      tokenMint: 'So11111111111111111111111111111111111111112',
      config: { minSellPercentage: 10, maxSellPercentage: 50, targetMarketCapUsd: 100_000, minBuyAmountSol: 1 },
      totalSellCount: 3,
      totalSolReceived: '1.5',
      totalSoldAmount: '2.0',
      ...overrides,
    },
  }
}

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

  it('feature.state announces WATCHING when newState is watching', () => {
    const { text } = renderNotification(makeFeatureStateJob({ newState: 'watching' }))
    expect(text.toUpperCase()).toContain('WATCHING')
  })

  it('feature.state announces paused when newState is paused', () => {
    const { text } = renderNotification(makeFeatureStateJob({ newState: 'paused' }))
    expect(text.toLowerCase()).toContain('paused')
  })
})

describe('createNotificationProcessor', () => {
  function setup() {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 777 })
    const scheduleDelete = vi.fn()
    const editMessage = vi.fn().mockResolvedValue(undefined)
    const processor = createNotificationProcessor({ sendMessage, scheduleDelete, editMessage })
    return { sendMessage, scheduleDelete, editMessage, processor }
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

  it('feature.state edits the pinned message in place AND fires a transient alert', async () => {
    const { sendMessage, scheduleDelete, editMessage, processor } = setup()
    sendMessage.mockResolvedValueOnce({ messageId: 2002 })

    await processor(makeFeatureStateJob({ newState: 'paused', pinnedMessageId: 999 }))

    // Pinned status message is edited in place with the re-rendered (paused) body.
    expect(editMessage).toHaveBeenCalledTimes(1)
    const [chatId, messageId, pinnedText] = editMessage.mock.calls[0]
    expect(chatId).toBe(42)
    expect(messageId).toBe(999)
    expect(pinnedText).toContain('PAUSED')
    // A transient alert is also sent and scheduled for auto-delete.
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(scheduleDelete).toHaveBeenCalledWith(42, 2002, AUTO_DELETE_TTL_MS['feature.state'])
  })

  it('feature.state with no pinned message skips the edit but still alerts', async () => {
    const { sendMessage, editMessage, processor } = setup()

    await processor(makeFeatureStateJob({ pinnedMessageId: null }))

    expect(editMessage).not.toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })
})

describe('createNotificationConsumer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const sendMessage = vi.fn().mockResolvedValue({ messageId: 1001 })
    const deleteMessage = vi.fn().mockResolvedValue(undefined)
    const editMessage = vi.fn().mockResolvedValue(undefined)
    const consumer = createNotificationConsumer({ sendMessage, deleteMessage, editMessage })
    return { sendMessage, deleteMessage, editMessage, consumer }
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
      'feature.state': 30_000,
      'payout.sent': null,
      'admin.alert': null,
    })
  })
})
