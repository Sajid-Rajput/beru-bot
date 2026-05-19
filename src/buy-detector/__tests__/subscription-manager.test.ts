import type { Logs } from '@solana/web3.js'

import { DEX_PROGRAM_IDS, DexProgramId } from '#root/utils/dex-programs.js'
import { describe, expect, it, vi } from 'vitest'

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
