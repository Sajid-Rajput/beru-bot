import { describe, expect, it } from 'vitest'

import { createSolanaWsClientFactory } from '../buy-detector.adapter.js'

describe('createSolanaWsClientFactory', () => {
  // Regression: web3.js's Connection endpoint must be http(s); a `wss://` url
  // (what SOLANA_PRIMARY_WS_URL holds) used to be passed straight in and threw
  // "Endpoint URL must start with http: or https:" at BuyDetector.start().
  it('builds a client from a wss:// url without throwing', () => {
    const factory = createSolanaWsClientFactory()
    const client = factory('wss://example-rpc.com/?api-key=abc')

    expect(typeof client.subscribeLogs).toBe('function')
  })

  it('accepts a ws:// url too', () => {
    const factory = createSolanaWsClientFactory()
    expect(() => factory('ws://localhost:8900')).not.toThrow()
  })

  it('still accepts an https:// url unchanged', () => {
    const factory = createSolanaWsClientFactory()
    expect(() => factory('https://example-rpc.com')).not.toThrow()
  })
})
