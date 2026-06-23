import type { WatchChannel, WatchPayload } from '#root/buy-detector/watched-feature-cache.js'

import { createLogger } from '#root/utils/logger.js'

const log = createLogger('WatchEventPublisher')

/** The narrow slice of ioredis the publisher consumes — just `publish`. */
export interface WatchEventPublisherDeps {
  /** Publishes `message` to `channel`; resolves to the number of receivers. */
  publish: (channel: string, message: string) => Promise<number>
}

/**
 * Fire-and-forget notifier that tells the worker's `WatchedFeatureCache` to add
 * or drop a mint the instant a Project Feature toggles, instead of waiting for
 * the 60s reconcile. The DB flip is the durable truth; this publish is the fast
 * notification, so a failed publish is swallowed (the reconcile loop catches drift).
 */
export class WatchEventPublisher {
  private readonly deps: WatchEventPublisherDeps

  constructor(deps: WatchEventPublisherDeps) {
    this.deps = deps
  }

  async publishWatchAdd(payload: WatchPayload): Promise<boolean> {
    return this.publish('watch:add', payload)
  }

  async publishWatchRemove(payload: WatchPayload): Promise<boolean> {
    return this.publish('watch:remove', payload)
  }

  /**
   * Publishes the payload and reports whether it left the process. Failures are
   * swallowed and logged — they must never throw the user-facing Start/Stop flow.
   */
  private async publish(channel: WatchChannel, payload: WatchPayload): Promise<boolean> {
    try {
      await this.deps.publish(channel, JSON.stringify(payload))
      return true
    }
    catch (err) {
      log.warn({ err, channel, payload }, 'failed to publish watch event; reconcile will catch drift')
      return false
    }
  }
}
