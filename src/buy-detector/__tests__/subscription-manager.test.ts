import type { Logs } from '@solana/web3.js'

import { DEX_PROGRAM_IDS, DexProgramId } from '#root/utils/dex-programs.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SubscriptionManager } from '../subscription-manager.js'

function makeLogs(overrides: Partial<Logs> = {}): Logs {
  return {
    err: null,
    logs: [],
    signature: 'sig-test',
    ...overrides,
  }
}

interface FakeSubscription {
  closed: boolean
}

interface FakeWsClient {
  subscribeCalls: Array<{ programId: string }>
  emit: (programId: string, logs: Logs) => void
  closedSubs: () => number
}

function makeFakeFactory(): { factory: (url: string) => any, client: () => FakeWsClient, urls: string[] } {
  const urls: string[] = []
  let current: FakeWsClient | null = null

  const factory = (url: string) => {
    urls.push(url)
    const subscribeCalls: Array<{ programId: string }> = []
    const listeners = new Map<string, (logs: Logs) => void>()
    const subs: FakeSubscription[] = []

    const wsClient = {
      subscribeLogs: vi.fn(async (programId: string, onLogs: (logs: Logs) => void) => {
        subscribeCalls.push({ programId })
        listeners.set(programId, onLogs)
        const sub: FakeSubscription = { closed: false }
        subs.push(sub)
        return {
          close: async () => {
            sub.closed = true
            listeners.delete(programId)
          },
        }
      }),
    }

    current = {
      subscribeCalls,
      emit: (programId, logs) => {
        const fn = listeners.get(programId)
        if (fn)
          fn(logs)
      },
      closedSubs: () => subs.filter(s => s.closed).length,
    }

    return wsClient
  }

  return { factory, client: () => current!, urls }
}

describe('subscriptionManager', () => {
  it('opens one logsSubscribe per program against the configured WSS URL', async () => {
    const { factory, client, urls } = makeFakeFactory()
    const sm = new SubscriptionManager({
      url: 'wss://chainstack.example/abc',
      wsClientFactory: factory,
      onLogs: () => {},
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])

    expect(urls).toEqual(['wss://chainstack.example/abc'])
    expect(client().subscribeCalls).toEqual([
      { programId: DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC] },
    ])
  })

  it('forwards each notification to onLogs with its DexProgramId', async () => {
    const { factory, client } = makeFakeFactory()
    const received: Array<{ programId: DexProgramId, logs: Logs }> = []
    const sm = new SubscriptionManager({
      url: 'wss://x',
      wsClientFactory: factory,
      onLogs: (programId, logs) => received.push({ programId, logs }),
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])

    const logs = makeLogs({ signature: 'sig-1' })
    client().emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], logs)

    expect(received).toEqual([{ programId: DexProgramId.PUMP_FUN_BC, logs }])
  })

  it('updates lastLogAtMs for the program when a notification arrives', async () => {
    const { factory, client } = makeFakeFactory()
    let clock = 1_000
    const sm = new SubscriptionManager({
      url: 'wss://x',
      wsClientFactory: factory,
      onLogs: () => {},
      now: () => clock,
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])
    expect(sm.getStatus().lastLogAtMs[DexProgramId.PUMP_FUN_BC]).toBeNull()

    clock = 5_000
    client().emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], makeLogs())

    expect(sm.getStatus().lastLogAtMs[DexProgramId.PUMP_FUN_BC]).toBe(5_000)
  })

  it('stop() closes every open subscription', async () => {
    const { factory, client } = makeFakeFactory()
    const sm = new SubscriptionManager({
      url: 'wss://x',
      wsClientFactory: factory,
      onLogs: () => {},
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])
    await sm.stop()

    expect(client().closedSubs()).toBe(1)
  })
})

// ── Heartbeat + degraded-mode (#39) ──────────────────────────────────────────
//
// Drives the silence heartbeat with vitest fake timers: `now: () => Date.now()`
// reads the same mocked clock that `advanceTimersByTimeAsync` advances, so one
// knob moves both the wall clock the heartbeat reads and the interval it runs on.

describe('subscriptionManager — heartbeat + degraded mode', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flips to degraded mode when a subscription is silent longer than 30s', async () => {
    vi.useFakeTimers()
    const { factory } = makeFakeFactory()
    const modeChanges: Array<'primary' | 'degraded'> = []
    const sm = new SubscriptionManager({
      url: 'wss://x',
      wsClientFactory: factory,
      onLogs: () => {},
      now: () => Date.now(),
      degradedPoll: async () => {},
      onModeChange: m => modeChanges.push(m),
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])
    expect(sm.getStatus().mode).toBe('primary')

    await vi.advanceTimersByTimeAsync(36_000)

    expect(sm.getStatus().mode).toBe('degraded')
    expect(modeChanges).toEqual(['degraded'])

    await sm.stop()
  })

  it('stays in primary mode while a subscription keeps receiving logs', async () => {
    vi.useFakeTimers()
    const { factory, client } = makeFakeFactory()
    let polls = 0
    const sm = new SubscriptionManager({
      url: 'wss://x',
      wsClientFactory: factory,
      onLogs: () => {},
      now: () => Date.now(),
      degradedPoll: async () => { polls += 1 },
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])
    // A log every 10s for 50s — never silent for the 30s threshold.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(10_000)
      client().emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], makeLogs())
    }

    expect(sm.getStatus().mode).toBe('primary')
    expect(polls).toBe(0)

    await sm.stop()
  })

  it('runs the degraded poll immediately and then on the 5s interval while silent', async () => {
    vi.useFakeTimers()
    const { factory } = makeFakeFactory()
    let polls = 0
    const sm = new SubscriptionManager({
      url: 'wss://x',
      wsClientFactory: factory,
      onLogs: () => {},
      now: () => Date.now(),
      degradedPoll: async () => { polls += 1 },
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])
    await vi.advanceTimersByTimeAsync(36_000) // enters degraded → one immediate poll
    expect(polls).toBe(1)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(polls).toBe(2)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(polls).toBe(4)

    await sm.stop()
  })

  it('folds back to primary on the first log after silence, running one final reconcile poll', async () => {
    vi.useFakeTimers()
    const { factory, client } = makeFakeFactory()
    const modeChanges: Array<'primary' | 'degraded'> = []
    let polls = 0
    const sm = new SubscriptionManager({
      url: 'wss://x',
      wsClientFactory: factory,
      onLogs: () => {},
      now: () => Date.now(),
      degradedPoll: async () => { polls += 1 },
      onModeChange: m => modeChanges.push(m),
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])
    await vi.advanceTimersByTimeAsync(36_000)
    expect(sm.getStatus().mode).toBe('degraded')
    const pollsWhenDegraded = polls

    // WS recovers: a log arrives. This is the only fold-back signal the seam
    // surfaces (web3.js reconnects silently).
    client().emit(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC], makeLogs({ signature: 'sig-recover' }))
    await vi.advanceTimersByTimeAsync(0) // flush the final reconcile poll

    expect(sm.getStatus().mode).toBe('primary')
    expect(polls).toBe(pollsWhenDegraded + 1) // exactly ONE final reconcile poll
    expect(modeChanges).toEqual(['degraded', 'primary'])

    // The degraded loop is stopped — no further polls fire.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(polls).toBe(pollsWhenDegraded + 1)

    await sm.stop()
  })

  it('getStatus().mode reports stopped after stop()', async () => {
    vi.useFakeTimers()
    const { factory } = makeFakeFactory()
    const sm = new SubscriptionManager({
      url: 'wss://x',
      wsClientFactory: factory,
      onLogs: () => {},
      now: () => Date.now(),
    })

    await sm.start([DexProgramId.PUMP_FUN_BC])
    await sm.stop()

    expect(sm.getStatus().mode).toBe('stopped')
  })
})
