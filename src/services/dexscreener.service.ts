import { logger } from '#root/logger.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TokenInfo {
  /** Human-readable token name, e.g. "Bonk" */
  name: string
  /** Token ticker symbol, e.g. "BONK" */
  symbol: string
  /** On-chain decimal precision */
  decimals: number
  /** Current price in USD as a string (may be "0" if illiquid) */
  priceUsd: string
  /** Fully-diluted valuation / market-cap in USD; null if unavailable */
  marketCapUsd: number | null
  /** DexScreener pair URL */
  dexUrl: string
  /** DEX identifier, e.g. "raydium", "orca" */
  dex: string
}

// ── Internal cache entry ──────────────────────────────────────────────────────

interface CacheEntry {
  info: TokenInfo
  cachedAt: number
}

// ── DexScreener API shape (partial) ──────────────────────────────────────────

interface DexScreenerPair {
  dexId: string
  url: string
  priceUsd?: string
  fdv?: number
  baseToken: {
    address: string
    name: string
    symbol: string
  }
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null
}

// ── Service ───────────────────────────────────────────────────────────────────

/** Cache TTL: 60 seconds */
const CACHE_TTL_MS = 60_000

/** HTTP timeout: 15 seconds (Node 20 AbortSignal.timeout built-in) */
const HTTP_TIMEOUT_MS = 15_000

const BASE_URL = 'https://api.dexscreener.com/latest/dex/tokens'

export class DexscreenerService {
  private readonly cache = new Map<string, CacheEntry>()

  /**
   * Fetch token metadata for a Solana mint address.
   *
   * Returns `null` when:
   *  - No trading pairs exist for the mint
   *  - The DexScreener API is unreachable or returns an error
   *
   * Results are cached in-memory for `CACHE_TTL_MS` (60 s).
   */
  async getTokenInfo(mint: string): Promise<TokenInfo | null> {
    const now = Date.now()
    const cached = this.cache.get(mint)
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return cached.info
    }

    let response: Response
    try {
      response = await fetch(`${BASE_URL}/${mint}`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        headers: { 'Accept': 'application/json' },
      })
    }
    catch (err) {
      logger.warn({ err, mint }, 'DexscreenerService: fetch error')
      return null
    }

    if (!response.ok) {
      logger.warn({ mint, status: response.status }, 'DexscreenerService: non-2xx response')
      return null
    }

    let body: DexScreenerResponse
    try {
      body = (await response.json()) as DexScreenerResponse
    }
    catch (err) {
      logger.warn({ err, mint }, 'DexscreenerService: JSON parse error')
      return null
    }

    if (!body.pairs || body.pairs.length === 0) {
      logger.debug({ mint }, 'DexscreenerService: no pairs found')
      return null
    }

    // DexScreener returns pairs sorted by liquidity (highest first)
    const pair = body.pairs[0]

    // Decimals are not available from the pairs endpoint — use 0 as sentinel.
    // The token-info endpoint provides decimals but requires a separate call;
    // callers that need precise decimals should use the token-meta endpoint.
    const info: TokenInfo = {
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      decimals: 0,
      priceUsd: pair.priceUsd ?? '0',
      marketCapUsd: pair.fdv ?? null,
      dexUrl: pair.url,
      dex: pair.dexId,
    }

    this.cache.set(mint, { info, cachedAt: now })
    return info
  }

  /** Manually evict a mint from the cache (e.g. after a project is deleted). */
  invalidate(mint: string): void {
    this.cache.delete(mint)
  }

  /** Evict all entries older than CACHE_TTL_MS. */
  pruneCache(): void {
    const now = Date.now()
    for (const [mint, entry] of this.cache) {
      if (now - entry.cachedAt >= CACHE_TTL_MS) {
        this.cache.delete(mint)
      }
    }
  }
}

/** Singleton instance shared across the application */
export const dexscreenerService = new DexscreenerService()
