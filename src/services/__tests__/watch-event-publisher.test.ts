import type { WatchEventPublisherDeps } from '../watch-event-publisher.js'

import { describe, expect, it, vi } from 'vitest'
import { WatchEventPublisher } from '../watch-event-publisher.js'

// ── Test fixtures ─────────────────────────────────────────────────────────────
const MINT = 'So11111111111111111111111111111111111111112'
const FEATURE_ID = 'feat_00000000-0000-0000-0000-000000000001'

/** Builds a publisher whose `publish` seam is a spy resolving to `receivers`. */
function makePublisher(receivers = 1): {
  publisher: WatchEventPublisher
  publish: ReturnType<typeof vi.fn>
} {
  const publish = vi.fn<WatchEventPublisherDeps['publish']>().mockResolvedValue(receivers)
  return { publisher: new WatchEventPublisher({ publish }), publish }
}

describe('watchEventPublisher', () => {
  // ── watch:add ───────────────────────────────────────────────────────────────

  describe('publishWatchAdd', () => {
    it('publishes to the watch:add channel with a { mint, featureId } body', async () => {
      const { publisher, publish } = makePublisher()

      await publisher.publishWatchAdd({ mint: MINT, featureId: FEATURE_ID })

      expect(publish).toHaveBeenCalledTimes(1)
      const [channel, message] = publish.mock.calls[0]!
      expect(channel).toBe('watch:add')
      expect(JSON.parse(message)).toEqual({ mint: MINT, featureId: FEATURE_ID })
    })
  })

  // ── watch:remove ────────────────────────────────────────────────────────────

  describe('publishWatchRemove', () => {
    it('publishes to the watch:remove channel with a { mint, featureId } body', async () => {
      const { publisher, publish } = makePublisher()

      await publisher.publishWatchRemove({ mint: MINT, featureId: FEATURE_ID })

      expect(publish).toHaveBeenCalledTimes(1)
      const [channel, message] = publish.mock.calls[0]!
      expect(channel).toBe('watch:remove')
      expect(JSON.parse(message)).toEqual({ mint: MINT, featureId: FEATURE_ID })
    })
  })

  // ── Failure handling ──────────────────────────────────────────────────────────
  // The DB flip is the durable truth; a failed publish must never throw the
  // user-facing Start/Stop flow. The 60s reconcile catches any resulting drift.

  describe('when the publish seam rejects', () => {
    it('swallows the error and returns false instead of throwing', async () => {
      const publish = vi
        .fn<WatchEventPublisherDeps['publish']>()
        .mockRejectedValue(new Error('redis unreachable'))
      const publisher = new WatchEventPublisher({ publish })

      const result = await publisher.publishWatchAdd({ mint: MINT, featureId: FEATURE_ID })

      expect(result).toBe(false)
    })

    it('also swallows rejections from publishWatchRemove', async () => {
      const publish = vi
        .fn<WatchEventPublisherDeps['publish']>()
        .mockRejectedValue(new Error('redis unreachable'))
      const publisher = new WatchEventPublisher({ publish })

      await expect(
        publisher.publishWatchRemove({ mint: MINT, featureId: FEATURE_ID }),
      ).resolves.toBe(false)
    })
  })
})
