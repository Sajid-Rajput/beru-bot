import type { ShadowSellConfig } from '#root/db/schema/index.js'

/**
 * A Project Feature row projected into the shape the Buy Detector needs:
 * enough to identify the feature and enqueue a sell job without another DB hit.
 */
export interface ProjectFeatureConfig {
  featureId: string
  projectId: string
  userId: string
  mint: string
  config: ShadowSellConfig
}

export interface WatchPayload {
  mint: string
  featureId: string
}

export type WatchChannel = 'watch:add' | 'watch:remove'

export interface WatchedMintCacheDeps {
  /** Returns all currently-watched Project Features. Used at start() and reconcile(). */
  loader: () => Promise<ProjectFeatureConfig[]>
  /** Fetches a single Project Feature by id. Used on `watch:add`. */
  fetchById: (featureId: string) => Promise<ProjectFeatureConfig | undefined>
  /**
   * Subscribes to a Redis pub/sub channel. Returns an unsubscribe fn that
   * `stop()` invokes. The seam decodes JSON before calling the handler.
   */
  subscribe: (
    channel: WatchChannel,
    handler: (payload: WatchPayload) => Promise<void> | void,
  ) => Promise<() => Promise<void>>
  /** Reconcile interval in ms. Default 60_000. Set to 0 to disable the timer (tests). */
  reconcileIntervalMs?: number
}

const DEFAULT_RECONCILE_INTERVAL_MS = 60_000

export class WatchedMintCache {
  private readonly deps: WatchedMintCacheDeps
  private readonly byMint = new Map<string, ProjectFeatureConfig[]>()
  private readonly unsubscribers: Array<() => Promise<void>> = []
  private reconcileTimer: NodeJS.Timeout | null = null

  constructor(deps: WatchedMintCacheDeps) {
    this.deps = deps
  }

  async start(): Promise<void> {
    const rows = await this.deps.loader()
    for (const row of rows)
      this.upsert(row)

    const unsubAdd = await this.deps.subscribe('watch:add', async ({ featureId }) => {
      const row = await this.deps.fetchById(featureId)
      if (row)
        this.upsert(row)
    })
    this.unsubscribers.push(unsubAdd)

    const unsubRemove = await this.deps.subscribe('watch:remove', ({ mint, featureId }) => {
      this.remove(mint, featureId)
    })
    this.unsubscribers.push(unsubRemove)

    const intervalMs = this.deps.reconcileIntervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS
    if (intervalMs > 0) {
      this.reconcileTimer = setInterval(() => {
        void this.reconcile()
      }, intervalMs)
    }
  }

  async stop(): Promise<void> {
    if (this.reconcileTimer !== null) {
      clearInterval(this.reconcileTimer)
      this.reconcileTimer = null
    }
    while (this.unsubscribers.length > 0) {
      const unsub = this.unsubscribers.pop()!
      await unsub()
    }
  }

  get(mint: string): ProjectFeatureConfig[] | undefined {
    return this.byMint.get(mint)
  }

  has(mint: string): boolean {
    return this.byMint.has(mint)
  }

  getAllMints(): string[] {
    return [...this.byMint.keys()]
  }

  async reconcile(): Promise<void> {
    const rows = await this.deps.loader()
    const wanted = new Set(rows.map(r => r.featureId))

    for (const [mint, entries] of this.byMint) {
      const kept = entries.filter(e => wanted.has(e.featureId))
      if (kept.length === 0)
        this.byMint.delete(mint)
      else if (kept.length !== entries.length)
        this.byMint.set(mint, kept)
    }

    for (const row of rows)
      this.upsert(row)
  }

  private upsert(row: ProjectFeatureConfig): void {
    const existing = this.byMint.get(row.mint)
    if (!existing) {
      this.byMint.set(row.mint, [row])
      return
    }
    if (existing.some(e => e.featureId === row.featureId))
      return
    existing.push(row)
  }

  private remove(mint: string, featureId: string): void {
    const existing = this.byMint.get(mint)
    if (!existing)
      return
    const next = existing.filter(e => e.featureId !== featureId)
    if (next.length === 0)
      this.byMint.delete(mint)
    else
      this.byMint.set(mint, next)
  }
}
