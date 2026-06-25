import type { DexProgramId } from '#root/utils/dex-programs.js'

import type { Logs } from '@solana/web3.js'
import { DEX_PROGRAM_IDS } from '#root/utils/dex-programs.js'
import { createLogger } from '#root/utils/logger.js'

const log = createLogger('SubscriptionManager')

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

/** Mode of the resilience state machine. See ADR-0001 reconnect/degraded design. */
export type SubscriptionManagerMode = 'primary' | 'degraded' | 'stopped'

const DEFAULT_SILENCE_THRESHOLD_MS = 30_000
const DEFAULT_DEGRADED_POLL_INTERVAL_MS = 5_000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000

export interface SubscriptionManagerDeps {
  url: string
  wsClientFactory: WsClientFactory
  /** Called for every incoming log notification, tagged with the program. */
  onLogs: (programId: DexProgramId, logs: Logs) => void
  /** Override for tests. */
  now?: () => number
  /**
   * One degraded-mode poll cycle. The BuyDetector facade implements this — it
   * owns the cache + RPC + parser pipeline that a poll runs through (ADR-0003:
   * the pipeline lives in the facade, the control loop lives here). Invoked
   * immediately on entering degraded mode, every {@link degradedPollIntervalMs}
   * while degraded, and once more as the final reconcile when folding back.
   */
  degradedPoll?: () => Promise<void>
  /** Fired on every primary↔degraded transition. Wired to the mode gauge. */
  onModeChange?: (mode: 'primary' | 'degraded') => void
  /** Silence window before a subscription is considered dead. Default 30_000. */
  silenceThresholdMs?: number
  /** Cadence of the degraded-mode poll. Default 5_000. */
  degradedPollIntervalMs?: number
  /** Cadence of the silence check. Default 5_000. */
  heartbeatIntervalMs?: number
}

export interface SubscriptionManagerStatus {
  /** Current resilience mode. `stopped` before `start()` / after `stop()`. */
  mode: SubscriptionManagerMode
  /** Per-program last-seen-log timestamp; `null` until the first notification. */
  lastLogAtMs: Record<string, number | null>
}

/**
 * Holds one `logsSubscribe` WS subscription per DEX Program and runs the
 * resilience state machine on top of them (#39, per ADR-0001):
 *
 * - A heartbeat tracks `lastLogAtMs` per program. When any subscription is
 *   silent longer than {@link SubscriptionManagerDeps.silenceThresholdMs}, the
 *   manager flips to **degraded** mode and drives the injected `degradedPoll`
 *   on a fixed interval.
 * - The WS seam cannot observe a reconnect directly (`@solana/web3.js`
 *   auto-reconnects and silently resumes delivering logs), so the **first log
 *   received while degraded** is the fold-back signal: one final reconcile poll
 *   runs, the degraded loop stops, and the mode returns to **primary**.
 *
 * The backfill horizon is intentionally bounded to ~30–60 s of missed slots
 * (ADR-0001). This collaborator is internal to the BuyDetector module and is
 * not exported as a seam (ADR-0003 decision 1).
 */
export class SubscriptionManager {
  private readonly subs = new Map<DexProgramId, WsLogsSubscription>()
  private readonly lastLogAtMs = new Map<DexProgramId, number>()
  private readonly now: () => number
  private readonly silenceThresholdMs: number
  private readonly degradedPollIntervalMs: number
  private readonly heartbeatIntervalMs: number

  private mode: SubscriptionManagerMode = 'stopped'
  private startedAtMs = 0
  private heartbeatTimer: NodeJS.Timeout | null = null
  private degradedTimer: NodeJS.Timeout | null = null
  private recovering = false

  constructor(private readonly deps: SubscriptionManagerDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.silenceThresholdMs = deps.silenceThresholdMs ?? DEFAULT_SILENCE_THRESHOLD_MS
    this.degradedPollIntervalMs = deps.degradedPollIntervalMs ?? DEFAULT_DEGRADED_POLL_INTERVAL_MS
    this.heartbeatIntervalMs = deps.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  }

  async start(programs: DexProgramId[]): Promise<void> {
    const client = this.deps.wsClientFactory(this.deps.url)
    this.startedAtMs = this.now()
    for (const program of programs) {
      const sub = await client.subscribeLogs(DEX_PROGRAM_IDS[program], (logs) => {
        this.onLog(program, logs)
      })
      this.subs.set(program, sub)
    }
    this.mode = 'primary'

    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeat()
    }, this.heartbeatIntervalMs)
    this.heartbeatTimer.unref?.()
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.stopDegradedTimer()
    this.mode = 'stopped'

    const subs = [...this.subs.values()]
    this.subs.clear()
    for (const sub of subs)
      await sub.close()
  }

  getStatus(): SubscriptionManagerStatus {
    const lastLogAtMs: Record<string, number | null> = {}
    for (const program of this.subs.keys())
      lastLogAtMs[program] = this.lastLogAtMs.get(program) ?? null
    return { mode: this.mode, lastLogAtMs }
  }

  /** Stamps the heartbeat, forwards the log, and folds back if degraded. */
  private onLog(program: DexProgramId, logs: Logs): void {
    this.lastLogAtMs.set(program, this.now())
    this.deps.onLogs(program, logs)
    if (this.mode === 'degraded' && !this.recovering)
      void this.recover()
  }

  /**
   * Fold back to primary after a silence window. Stops the degraded loop so no
   * interval poll races the reconcile, runs ONE final reconcile poll to absorb
   * anything the WS missed during the gap (cross-mode overlap is deduped
   * downstream), then returns the mode to primary.
   */
  private async recover(): Promise<void> {
    this.recovering = true
    this.stopDegradedTimer()
    try {
      await this.runDegradedPoll()
    }
    finally {
      this.mode = 'primary'
      this.recovering = false
      log.info({ url: this.deps.url }, 'WS logs resumed — folded back to primary mode')
      this.deps.onModeChange?.('primary')
    }
  }

  private checkHeartbeat(): void {
    if (this.mode !== 'primary')
      return
    const silent = this.silentPrograms()
    if (silent.length > 0)
      this.enterDegraded(silent)
  }

  /** Programs whose last log (or the start baseline) is older than the threshold. */
  private silentPrograms(): DexProgramId[] {
    const now = this.now()
    const silent: DexProgramId[] = []
    for (const program of this.subs.keys()) {
      const last = this.lastLogAtMs.get(program) ?? this.startedAtMs
      if (now - last > this.silenceThresholdMs)
        silent.push(program)
    }
    return silent
  }

  private enterDegraded(silentPrograms: DexProgramId[]): void {
    this.mode = 'degraded'
    log.warn(
      { url: this.deps.url, silentPrograms, silenceThresholdMs: this.silenceThresholdMs },
      'WS log silence exceeded threshold — entering degraded polling mode',
    )
    this.deps.onModeChange?.('degraded')

    this.degradedTimer = setInterval(() => {
      void this.runDegradedPoll()
    }, this.degradedPollIntervalMs)
    this.degradedTimer.unref?.()

    void this.runDegradedPoll()
  }

  private async runDegradedPoll(): Promise<void> {
    if (!this.deps.degradedPoll)
      return
    try {
      await this.deps.degradedPoll()
    }
    catch (err) {
      log.error({ err }, 'degraded-mode poll failed')
    }
  }

  private stopDegradedTimer(): void {
    if (this.degradedTimer !== null) {
      clearInterval(this.degradedTimer)
      this.degradedTimer = null
    }
  }
}
