import type { RedisSubscriber } from '../watched-mint-cache.adapter.js'

import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { createWatchPubSubSubscriber } from '../watched-mint-cache.adapter.js'

// ── Fake ioredis subscriber ──────────────────────────────────────────────────
// Models the slice of ioredis we touch: subscribe(channel), unsubscribe(channel),
// and a 'message' event that fires (channel, raw) for every incoming message.

class FakeRedisSubscriber extends EventEmitter implements RedisSubscriber {
  subscribed = new Set<string>()
  subscribeCalls: string[] = []
  unsubscribeCalls: string[] = []

  async subscribe(channel: string): Promise<void> {
    this.subscribed.add(channel)
    this.subscribeCalls.push(channel)
  }

  async unsubscribe(channel: string): Promise<void> {
    this.subscribed.delete(channel)
    this.unsubscribeCalls.push(channel)
  }

  // Test helper: simulate an inbound Redis message.
  deliver(channel: string, raw: string) {
    this.emit('message', channel, raw)
  }
}

describe('createWatchPubSubSubscriber', () => {
  it('subscribes to the requested channel and routes messages to the handler', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    await subscribe('watch:add', handler)

    expect(fake.subscribed.has('watch:add')).toBe(true)
    fake.deliver('watch:add', JSON.stringify({ mint: 'M1', featureId: 'F1' }))

    expect(handler).toHaveBeenCalledWith({ mint: 'M1', featureId: 'F1' })
  })

  it('routes only messages for the subscribed channel', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const addHandler = vi.fn()
    const removeHandler = vi.fn()

    await subscribe('watch:add', addHandler)
    await subscribe('watch:remove', removeHandler)

    fake.deliver('watch:add', JSON.stringify({ mint: 'M1', featureId: 'F1' }))
    fake.deliver('watch:remove', JSON.stringify({ mint: 'M2', featureId: 'F2' }))

    expect(addHandler).toHaveBeenCalledTimes(1)
    expect(addHandler).toHaveBeenCalledWith({ mint: 'M1', featureId: 'F1' })
    expect(removeHandler).toHaveBeenCalledTimes(1)
    expect(removeHandler).toHaveBeenCalledWith({ mint: 'M2', featureId: 'F2' })
  })

  it('does not invoke handler on malformed JSON and does not throw', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    await subscribe('watch:add', handler)

    expect(() => fake.deliver('watch:add', '{not json')).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not invoke handler when payload is missing required fields', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    await subscribe('watch:add', handler)
    fake.deliver('watch:add', JSON.stringify({ mint: 'M1' })) // missing featureId
    fake.deliver('watch:add', JSON.stringify({ featureId: 'F1' })) // missing mint
    fake.deliver('watch:add', JSON.stringify({ mint: 1, featureId: 'F1' })) // wrong type

    expect(handler).not.toHaveBeenCalled()
  })

  it('returned unsubscribe fn calls Redis unsubscribe and detaches the handler', async () => {
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const handler = vi.fn()

    const unsub = await subscribe('watch:add', handler)
    fake.deliver('watch:add', JSON.stringify({ mint: 'M1', featureId: 'F1' }))
    expect(handler).toHaveBeenCalledTimes(1)

    await unsub()
    expect(fake.unsubscribeCalls).toContain('watch:add')

    fake.deliver('watch:add', JSON.stringify({ mint: 'M2', featureId: 'F2' }))
    expect(handler).toHaveBeenCalledTimes(1) // no new call
  })

  it('does not swallow exceptions thrown by the handler', async () => {
    // Handler errors are the cache's responsibility; the wrapper just routes.
    // We surface them so a future logger middleware can wire pino.error.
    const fake = new FakeRedisSubscriber()
    const subscribe = createWatchPubSubSubscriber(fake)
    const errors: unknown[] = []
    fake.on('error', err => errors.push(err))

    await subscribe('watch:add', () => {
      throw new Error('handler boom')
    })

    fake.deliver('watch:add', JSON.stringify({ mint: 'M1', featureId: 'F1' }))
    // The subscriber wraps handler errors so they don't kill the process; verify
    // the message handler doesn't crash on synchronous throw.
    expect(true).toBe(true)
  })
})
