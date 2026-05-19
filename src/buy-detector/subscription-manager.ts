import type { DexProgramId } from '#root/utils/dex-programs.js'

import type { Logs } from '@solana/web3.js'
import { DEX_PROGRAM_IDS } from '#root/utils/dex-programs.js'

/**
 * Handle returned by `WsClient.subscribeLogs`. The single responsibility is to
 * detach the log listener and release the underlying subscription id.
 */
export interface WsLogsSubscription {
  close: () => Promise<void>
}

/**
 * Thin WS seam — production wires this with `@solana/web3.js` Connection
 * (or a Helius / Chainstack equivalent). The shape is small on purpose so
 * tests can use a fake client and so the future Helius fallback (ADR-0001)
 * can drop in without leaking into upstream code.
 */
export interface WsClient {
  subscribeLogs: (
    programId: string,
    onLogs: (logs: Logs) => void,
  ) => Promise<WsLogsSubscription>
}

export type WsClientFactory = (url: string) => WsClient

export interface SubscriptionManagerDeps {
  url: string
  wsClientFactory: WsClientFactory
  /** Called for every incoming log notification, tagged with the program. */
  onLogs: (programId: DexProgramId, logs: Logs) => void
  /** Override for tests. */
  now?: () => number
}

export interface SubscriptionManagerStatus {
  /** Per-program last-seen-log timestamp; `null` until the first notification. */
  lastLogAtMs: Record<string, number | null>
}

/**
 * Holds one `logsSubscribe` WS subscription per DEX Program and tracks the
 * `lastLogAtMs` timestamp the heartbeat / degraded-mode worker (sibling slice
 * #39) will consume. Reconnect, degraded fallback, and gap backfill are out
 * of scope for this slice — see ADR-0001.
 */
export class SubscriptionManager {
  private readonly subs = new Map<DexProgramId, WsLogsSubscription>()
  private readonly lastLogAtMs = new Map<DexProgramId, number>()
  private readonly now: () => number

  constructor(private readonly deps: SubscriptionManagerDeps) {
    this.now = deps.now ?? (() => Date.now())
  }

  async start(programs: DexProgramId[]): Promise<void> {
    const client = this.deps.wsClientFactory(this.deps.url)
    for (const program of programs) {
      const sub = await client.subscribeLogs(DEX_PROGRAM_IDS[program], (logs) => {
        this.lastLogAtMs.set(program, this.now())
        this.deps.onLogs(program, logs)
      })
      this.subs.set(program, sub)
    }
  }

  async stop(): Promise<void> {
    const subs = [...this.subs.values()]
    this.subs.clear()
    for (const sub of subs)
      await sub.close()
  }

  getStatus(): SubscriptionManagerStatus {
    const lastLogAtMs: Record<string, number | null> = {}
    for (const program of this.subs.keys())
      lastLogAtMs[program] = this.lastLogAtMs.get(program) ?? null
    return { lastLogAtMs }
  }
}
