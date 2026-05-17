import type { FetchFn } from '../jupiter.service.js'
import { describe, expect, it, vi } from 'vitest'
import { JupiterError } from '../../utils/errors.js'
import { JupiterService } from '../jupiter.service.js'

// ── Test constants ──────────────────────────────────────────────────────────
// Real-shaped base58 strings; never used against a live API.
const SOL = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const RETRY_DELAY_MS = 2_000

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('jupiterService.getQuote', () => {
  it('issues a GET to the Jupiter v6 quote endpoint with the expected query and returns the parsed payload', async () => {
    const quotePayload = {
      inputMint: SOL,
      inAmount: '1000000000',
      outputMint: USDC,
      outAmount: '24500000',
      otherAmountThreshold: '24378750',
      swapMode: 'ExactIn',
      slippageBps: 50,
      priceImpactPct: '0.0001',
      routePlan: [],
    }
    const fetchFn: FetchFn = vi.fn(async () => jsonResponse(quotePayload))
    const service = new JupiterService({ fetch: fetchFn })

    const result = await service.getQuote(SOL, USDC, 1_000_000_000n, 50)

    expect(result).toEqual(quotePayload)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]
    const u = new URL(String(url))
    expect(u.origin + u.pathname).toBe('https://quote-api.jup.ag/v6/quote')
    expect(u.searchParams.get('inputMint')).toBe(SOL)
    expect(u.searchParams.get('outputMint')).toBe(USDC)
    expect(u.searchParams.get('amount')).toBe('1000000000')
    expect(u.searchParams.get('slippageBps')).toBe('50')
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('throws JupiterError on a 4xx response without retrying', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'bad inputMint' }), { status: 400 }),
    )
    const service = new JupiterService({ fetch: fetchFn })

    await expect(service.getQuote(SOL, USDC, 1n)).rejects.toBeInstanceOf(JupiterError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries once on 5xx after a 2 s delay and returns the second response', async () => {
    vi.useFakeTimers()
    try {
      const quotePayload = { outAmount: '99', routePlan: [] }
      const fetchFn = vi.fn()
        .mockImplementationOnce(async () => new Response('boom', { status: 503 }))
        .mockImplementationOnce(async () => jsonResponse(quotePayload))
      const service = new JupiterService({ fetch: fetchFn })

      const promise = service.getQuote(SOL, USDC, 1n)

      // After the first failed attempt, the retry must wait 2s.
      await vi.advanceTimersByTimeAsync(1999)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)

      await expect(promise).resolves.toMatchObject({ outAmount: '99' })
      expect(fetchFn).toHaveBeenCalledTimes(2)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('passes an AbortSignal to fetch on each attempt and surfaces an abort as JupiterError', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn: FetchFn = vi.fn(async (_url, init) => {
        const signal = init?.signal
        expect(signal).toBeInstanceOf(AbortSignal)
        return await new Promise<Response>((_resolve, reject) => {
          signal!.addEventListener('abort', () => {
            reject(new DOMException('timeout', 'AbortError'))
          })
        })
      })
      const service = new JupiterService({ fetch: fetchFn, timeoutMs: 50 })

      const promise = service.getQuote(SOL, USDC, 1n).catch(err => err)
      // First attempt aborts after 50ms.
      await vi.advanceTimersByTimeAsync(50)
      // Retry waits RETRY_DELAY_MS, then second attempt aborts after another 50ms.
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS + 50)
      const err = await promise

      expect(err).toBeInstanceOf(JupiterError)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('throws JupiterError when both the initial 5xx and the retry fail', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn(async () => new Response('boom', { status: 502 }))
      const service = new JupiterService({ fetch: fetchFn })

      const promise = service.getQuote(SOL, USDC, 1n).catch(err => err)
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
      const err = await promise

      expect(err).toBeInstanceOf(JupiterError)
      expect(fetchFn).toHaveBeenCalledTimes(2)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

describe('jupiterService.getSwapTransaction', () => {
  const USER_PK = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'

  it('posts to /v6/swap with quoteResponse + userPublicKey + wrapAndUnwrapSol and returns { swapTransaction }', async () => {
    const quote = { outAmount: '99', outputMint: USDC, inputMint: SOL, routePlan: [] }
    const swapPayload = { swapTransaction: 'BASE64_TX_BLOB' }
    const fetchFn: FetchFn = vi.fn(async () => jsonResponse(swapPayload))
    const service = new JupiterService({ fetch: fetchFn })

    const result = await service.getSwapTransaction(quote as never, USER_PK)

    expect(result).toEqual(swapPayload)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]
    expect(String(url)).toBe('https://quote-api.jup.ag/v6/swap')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({
      quoteResponse: quote,
      userPublicKey: USER_PK,
      wrapAndUnwrapSol: true,
    })
  })

  it('retries once on 5xx after a 2 s delay and returns the second response', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn()
        .mockImplementationOnce(async () => new Response('boom', { status: 504 }))
        .mockImplementationOnce(async () => jsonResponse({ swapTransaction: 'ok' }))
      const service = new JupiterService({ fetch: fetchFn })

      const promise = service.getSwapTransaction({ inputMint: SOL, outputMint: USDC, inAmount: '1' } as never, USER_PK)
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
      await expect(promise).resolves.toEqual({ swapTransaction: 'ok' })
      expect(fetchFn).toHaveBeenCalledTimes(2)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('throws JupiterError on a 4xx response without retrying', async () => {
    const fetchFn: FetchFn = vi.fn(async () => new Response('bad', { status: 422 }))
    const service = new JupiterService({ fetch: fetchFn })

    await expect(
      service.getSwapTransaction({ inputMint: SOL, outputMint: USDC, inAmount: '1' } as never, USER_PK),
    ).rejects.toBeInstanceOf(JupiterError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
