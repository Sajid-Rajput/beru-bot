import type { ShadowSellConfig } from '#root/db/schema/index.js'

/**
 * Frozen view of one referrer in the chain. Kept on the cache entry so the
 * matcher can construct `SellJob.referralSnapshot` without re-reading the DB.
 */
export interface ReferrerSnapshot {
  userId: string
  sharePct: number
}

/**
 * Two-tier referrer chain captured at load time. Either tier can be `null`
 * if the feature owner has no referrer at that level.
 */
export interface ReferralSnapshot {
  tier1: ReferrerSnapshot | null
  tier2: ReferrerSnapshot | null
}

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
  referralSnapshot: ReferralSnapshot
}

export interface WatchPayload {
  mint: string
  featureId: string
}

export interface ReferralChangedPayload {
  userId: string
}

export type WatchChannel = 'watch:add' | 'watch:remove'
export type CacheChannel = WatchChannel | 'referral:changed'

/** Compile-time map from channel name to the payload shape its handler receives. */
export interface ChannelPayloadMap {
  'watch:add': WatchPayload
  'watch:remove': WatchPayload
  'referral:changed': ReferralChangedPayload
}

export interface WatchedFeatureCacheDeps {
  /** Returns all currently-watched Project Features. Used at start() and reconcile(). */
  loader: () => Promise<ProjectFeatureConfig[]>
  /** Fetches a single Project Feature by id. Used on `watch:add` and `referral:changed`. */
  fetchById: (featureId: string) => Promise<ProjectFeatureConfig | undefined>
  /**
   * Subscribes to a Redis pub/sub channel. Returns an unsubscribe fn that
   * `stop()` invokes. The seam decodes JSON before calling the handler.
   */
  subscribe: <C extends CacheChannel>(
    channel: C,
    handler: (payload: ChannelPayloadMap[C]) => Promise<void> | void,
  ) => Promise<() => Promise<void>>
  /** Reconcile interval in ms. Default 60_000. Set to 0 to disable the timer (tests). */
  reconcileIntervalMs?: number
}

const DEFAULT_RECONCILE_INTERVAL_MS = 60_000

export class WatchedFeatureCache {
  private readonly deps: WatchedFeatureCacheDeps
  private readonly byMint = new Map<string, ProjectFeatureConfig[]>()
  private readonly unsubscribers: Array<() => Promise<void>> = []
  private reconcileTimer: NodeJS.Timeout | null = null

  constructor(deps: WatchedFeatureCacheDeps) {
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

    const unsubReferral = await this.deps.subscribe('referral:changed', async ({ userId }) => {
      await this.refreshByUserId(userId)
    })
    this.unsubscribers.push(unsubReferral)

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

  private async refreshByUserId(userId: string): Promise<void> {
    const featureIds: string[] = []
    for (const entries of this.byMint.values()) {
      for (const e of entries) {
        if (e.userId === userId)
          featureIds.push(e.featureId)
      }
    }
    if (featureIds.length === 0)
      return

    for (const featureId of featureIds) {
      const fresh = await this.deps.fetchById(featureId)
      if (fresh)
        this.replace(fresh)
    }
  }

  private replace(row: ProjectFeatureConfig): void {
    const list = this.byMint.get(row.mint)
    if (!list)
      return
    const idx = list.findIndex(e => e.featureId === row.featureId)
    if (idx === -1)
      return
    list[idx] = row
  }
}
