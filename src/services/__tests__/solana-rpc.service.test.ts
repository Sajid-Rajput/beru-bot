import { Connection } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'
import { SolanaRpcService } from '../solana-rpc.service.js'

function stubConnection(): Connection {
  return Object.create(Connection.prototype) as Connection
}

type TokenAccountsResult = Awaited<ReturnType<Connection['getParsedTokenAccountsByOwner']>>

function tokenAccounts(uiAmounts: number[]): TokenAccountsResult {
  return {
    context: { slot: 0 },
    value: uiAmounts.map(uiAmount => ({
      pubkey: { toBase58: () => 'pk' } as never,
      account: {
        data: { parsed: { info: { tokenAmount: { uiAmount } } } } as never,
        executable: false,
        lamports: 0,
        owner: { toBase58: () => 'owner' } as never,
        rentEpoch: 0,
      },
    })),
  } as TokenAccountsResult
}

// Test constants — real-shaped base58 strings; never used against a live RPC.
const OWNER = 'So11111111111111111111111111111111111111112'
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

describe('solanaRpcService.withFailover', () => {
  it('returns the primary result and reports lastProviderUsed=primary on success', async () => {
    const primary = stubConnection()
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    const result = await service.withFailover(async (conn) => {
      expect(conn).toBe(primary)
      return 'ok-primary'
    })

    expect(result).toBe('ok-primary')
    expect(service.lastProviderUsed).toBe('primary')
  })

  it.each([502, 503, 504])('falls back when the primary throws HTTP %i', async (status) => {
    const primary = stubConnection()
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    const result = await service.withFailover(async (conn) => {
      if (conn === primary) {
        const err = new Error(`${status} gateway`) as Error & { status?: number }
        err.status = status
        throw err
      }
      return 'ok-fallback'
    })

    expect(result).toBe('ok-fallback')
  })

  it('falls back to the fallback connection when the primary throws HTTP 429', async () => {
    const primary = stubConnection()
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    const result = await service.withFailover(async (conn) => {
      if (conn === primary) {
        const err = new Error('429 Too Many Requests') as Error & { status?: number }
        err.status = 429
        throw err
      }
      return 'ok-fallback'
    })

    expect(result).toBe('ok-fallback')
  })

  it('does NOT fall back on non-allowlisted errors and propagates the primary error', async () => {
    const primary = stubConnection()
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    let fallbackCalls = 0
    const primaryErr = new Error('Invalid param: invalid pubkey')

    await expect(service.withFailover(async (conn) => {
      if (conn === primary)
        throw primaryErr
      fallbackCalls += 1
      return 'ok-fallback'
    })).rejects.toBe(primaryErr)

    expect(fallbackCalls).toBe(0)
  })

  it('reports lastProviderUsed=fallback after a successful failover', async () => {
    const primary = stubConnection()
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    await service.withFailover(async (conn) => {
      if (conn === primary) {
        const err = new Error('429') as Error & { status?: number }
        err.status = 429
        throw err
      }
      return 'ok-fallback'
    })

    expect(service.lastProviderUsed).toBe('fallback')
  })

  it('throws the fallback error when both providers fail with transient errors', async () => {
    const primary = stubConnection()
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    const fallbackErr = new Error('503 fallback down') as Error & { status?: number }
    fallbackErr.status = 503

    await expect(service.withFailover(async (conn) => {
      if (conn === primary) {
        const err = new Error('429 primary down') as Error & { status?: number }
        err.status = 429
        throw err
      }
      throw fallbackErr
    })).rejects.toBe(fallbackErr)
  })

  it.each([
    { code: 'ECONNRESET' as string | undefined, message: 'socket hang up' },
    { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' },
    { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' },
    { code: 'EAI_AGAIN', message: 'getaddrinfo EAI_AGAIN' },
    { code: undefined, message: 'fetch failed' },
  ])('falls back on network error %s', async ({ code, message }) => {
    const primary = stubConnection()
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    const result = await service.withFailover(async (conn) => {
      if (conn === primary) {
        const err = new Error(message) as Error & { code?: string }
        if (code !== undefined)
          err.code = code
        throw err
      }
      return 'ok-fallback'
    })

    expect(result).toBe('ok-fallback')
  })
})

describe('solanaRpcService.getTokenBalance', () => {
  it('aggregates uiAmount across the owner\'s token accounts', async () => {
    const primary = stubConnection()
    ;(primary as unknown as { getParsedTokenAccountsByOwner: unknown }).getParsedTokenAccountsByOwner
      = vi.fn().mockResolvedValue(tokenAccounts([10, 5]))
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    await expect(service.getTokenBalance(OWNER, MINT)).resolves.toBe(15)
    expect(service.lastProviderUsed).toBe('primary')
  })

  it('routes through withFailover: returns fallback aggregate when primary throws 429', async () => {
    const primary = stubConnection()
    ;(primary as unknown as { getParsedTokenAccountsByOwner: unknown }).getParsedTokenAccountsByOwner
      = vi.fn().mockImplementation(() => {
        const err = new Error('429') as Error & { status?: number }
        err.status = 429
        throw err
      })
    const fallback = stubConnection()
    ;(fallback as unknown as { getParsedTokenAccountsByOwner: unknown }).getParsedTokenAccountsByOwner
      = vi.fn().mockResolvedValue(tokenAccounts([3, 7]))
    const service = new SolanaRpcService({ primary, fallback })

    await expect(service.getTokenBalance(OWNER, MINT)).resolves.toBe(10)
    expect(service.lastProviderUsed).toBe('fallback')
  })

  it('returns 0 when both providers fail with transient errors (token balance)', async () => {
    const throwFn = vi.fn().mockImplementation(() => {
      const err = new Error('503') as Error & { status?: number }
      err.status = 503
      throw err
    })
    const primary = stubConnection()
    ;(primary as unknown as { getParsedTokenAccountsByOwner: unknown }).getParsedTokenAccountsByOwner = throwFn
    const fallback = stubConnection()
    ;(fallback as unknown as { getParsedTokenAccountsByOwner: unknown }).getParsedTokenAccountsByOwner = throwFn
    const service = new SolanaRpcService({ primary, fallback })

    await expect(service.getTokenBalance(OWNER, MINT)).resolves.toBe(0)
  })
})

describe('solanaRpcService.getSolBalance', () => {
  it('returns lamports / LAMPORTS_PER_SOL via the primary connection', async () => {
    const primary = stubConnection()
    ;(primary as unknown as { getBalance: unknown }).getBalance
      = vi.fn().mockResolvedValue(2_500_000_000) // 2.5 SOL
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    await expect(service.getSolBalance(OWNER)).resolves.toBe(2.5)
    expect(service.lastProviderUsed).toBe('primary')
  })

  it('routes through withFailover and returns the fallback balance on primary 429', async () => {
    const primary = stubConnection()
    ;(primary as unknown as { getBalance: unknown }).getBalance
      = vi.fn().mockImplementation(() => {
        const err = new Error('429') as Error & { status?: number }
        err.status = 429
        throw err
      })
    const fallback = stubConnection()
    ;(fallback as unknown as { getBalance: unknown }).getBalance
      = vi.fn().mockResolvedValue(1_000_000_000) // 1 SOL
    const service = new SolanaRpcService({ primary, fallback })

    await expect(service.getSolBalance(OWNER)).resolves.toBe(1)
    expect(service.lastProviderUsed).toBe('fallback')
  })
})

describe('solanaRpcService.getSignaturesForAddress', () => {
  it('passes options through and returns the primary signatures array', async () => {
    const sigs = [
      { signature: 'sig-a', slot: 1, err: null, memo: null, blockTime: null, confirmationStatus: 'finalized' as const },
      { signature: 'sig-b', slot: 2, err: null, memo: null, blockTime: null, confirmationStatus: 'finalized' as const },
    ]
    const primaryFn = vi.fn().mockResolvedValue(sigs)
    const primary = stubConnection()
    ;(primary as unknown as { getSignaturesForAddress: unknown }).getSignaturesForAddress = primaryFn
    const fallback = stubConnection()
    const service = new SolanaRpcService({ primary, fallback })

    const opts = { limit: 10, before: 'cursor-x' }
    await expect(service.getSignaturesForAddress(MINT, opts)).resolves.toEqual(sigs)
    expect(primaryFn).toHaveBeenCalledTimes(1)
    expect(primaryFn.mock.calls[0][1]).toEqual(opts)
    expect(service.lastProviderUsed).toBe('primary')
  })

  it('routes through withFailover: falls back when primary throws ECONNRESET', async () => {
    const primary = stubConnection()
    ;(primary as unknown as { getSignaturesForAddress: unknown }).getSignaturesForAddress
      = vi.fn().mockImplementation(() => {
        const err = new Error('socket hang up') as Error & { code?: string }
        err.code = 'ECONNRESET'
        throw err
      })
    const fallbackSigs = [
      { signature: 'sig-fb', slot: 9, err: null, memo: null, blockTime: null, confirmationStatus: 'finalized' as const },
    ]
    const fallback = stubConnection()
    ;(fallback as unknown as { getSignaturesForAddress: unknown }).getSignaturesForAddress
      = vi.fn().mockResolvedValue(fallbackSigs)
    const service = new SolanaRpcService({ primary, fallback })

    await expect(service.getSignaturesForAddress(MINT)).resolves.toEqual(fallbackSigs)
    expect(service.lastProviderUsed).toBe('fallback')
  })
})
