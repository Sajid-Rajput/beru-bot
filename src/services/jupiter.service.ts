import { JupiterError } from '#root/utils/errors.js'
import { createLogger } from '#root/utils/logger.js'

const log = createLogger('JupiterService')

const QUOTE_URL = 'https://quote-api.jup.ag/v6/quote'
const SWAP_URL = 'https://quote-api.jup.ag/v6/swap'
const RETRY_DELAY_MS = 2_000
const REQUEST_TIMEOUT_MS = 15_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface JupiterServiceOptions {
  fetch?: FetchFn
  /** Per-request timeout in ms. Defaults to 15_000. */
  timeoutMs?: number
}

export interface RoutePlanStep {
  swapInfo: {
    ammKey: string
    label?: string
    inputMint: string
    outputMint: string
    inAmount: string
    outAmount: string
    feeAmount: string
    feeMint: string
  }
  percent: number
}

export interface QuoteResponse {
  inputMint: string
  inAmount: string
  outputMint: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  priceImpactPct: string
  routePlan: RoutePlanStep[]
  contextSlot?: number
  timeTaken?: number
}

export class JupiterService {
  private readonly fetchFn: FetchFn
  private readonly timeoutMs: number

  constructor(opts: JupiterServiceOptions = {}) {
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init))
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: bigint | number | string,
    slippageBps = 50,
  ): Promise<QuoteResponse> {
    const url = new URL(QUOTE_URL)
    url.searchParams.set('inputMint', inputMint)
    url.searchParams.set('outputMint', outputMint)
    url.searchParams.set('amount', String(amount))
    url.searchParams.set('slippageBps', String(slippageBps))

    log.debug({ inputMint, outputMint, amount: String(amount), slippageBps }, 'jupiter quote request')

    const response = await this.requestWithRetry(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }, 'quote')
    return (await response.json()) as QuoteResponse
  }

  async getSwapTransaction(
    quoteResponse: QuoteResponse,
    userPublicKey: string,
  ): Promise<{ swapTransaction: string }> {
    log.debug(
      {
        inputMint: quoteResponse.inputMint,
        outputMint: quoteResponse.outputMint,
        amount: quoteResponse.inAmount,
      },
      'jupiter swap request',
    )

    const response = await this.requestWithRetry(SWAP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ quoteResponse, userPublicKey, wrapAndUnwrapSol: true }),
    }, 'swap')
    return (await response.json()) as { swapTransaction: string }
  }

  private async requestWithRetry(url: URL | string, init: RequestInit, op: string): Promise<Response> {
    const first = await this.attempt(url, init, op)
    if (first.kind === 'ok')
      return first.response
    if (first.kind === 'retryable') {
      log.warn({ op }, 'jupiter transient failure — retrying once after 2s')
      await sleep(RETRY_DELAY_MS)
      const second = await this.attempt(url, init, op)
      if (second.kind === 'ok')
        return second.response
      throw second.error
    }
    throw first.error
  }

  private async attempt(
    url: URL | string,
    init: RequestInit,
    op: string,
  ): Promise<{ kind: 'ok', response: Response } | { kind: 'retryable' | 'fatal', error: JupiterError }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(new Error(`jupiter ${op} timed out after ${this.timeoutMs}ms`)), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchFn(url, { ...init, signal: controller.signal })
    }
    catch (cause) {
      return { kind: 'retryable', error: new JupiterError(`jupiter ${op} request failed`, cause) }
    }
    finally {
      clearTimeout(timeoutId)
    }

    if (response.ok)
      return { kind: 'ok', response }

    if (response.status >= 500 && response.status < 600) {
      return { kind: 'retryable', error: new JupiterError(`jupiter ${op} failed: ${response.status}`) }
    }

    return { kind: 'fatal', error: new JupiterError(`jupiter ${op} failed: ${response.status}`) }
  }
}
