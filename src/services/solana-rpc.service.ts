import type { ConfirmedSignatureInfo, SignaturesForAddressOptions } from '@solana/web3.js'
import { config } from '#root/config.js'
import { createLogger } from '#root/utils/logger.js'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'

const log = createLogger('SolanaRpcService')

const FAILOVER_HTTP_STATUSES = new Set([429, 502, 503, 504])
const FAILOVER_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE'])

function isFailoverError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null)
    return false
  const e = err as { status?: unknown, code?: unknown, message?: unknown }
  if (typeof e.status === 'number' && FAILOVER_HTTP_STATUSES.has(e.status))
    return true
  if (typeof e.code === 'string' && FAILOVER_NETWORK_CODES.has(e.code))
    return true
  if (typeof e.message === 'string' && e.message === 'fetch failed')
    return true
  return false
}

export type RpcProvider = 'primary' | 'fallback'

export interface SolanaRpcServiceOptions {
  primary?: Connection
  fallback?: Connection
}

export class SolanaRpcService {
  readonly primaryConnection: Connection
  readonly fallbackConnection: Connection
  private _lastProviderUsed: RpcProvider | null = null

  constructor(opts: SolanaRpcServiceOptions = {}) {
    this.primaryConnection = opts.primary
      ?? new Connection(config.solanaPrimaryRpcUrl || config.solanaPublicRpcUrl, 'confirmed')
    this.fallbackConnection = opts.fallback
      ?? new Connection(config.solanaFallbackRpcUrl || config.solanaPublicRpcUrl, 'confirmed')
  }

  get lastProviderUsed(): RpcProvider | null {
    return this._lastProviderUsed
  }

  async withFailover<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    try {
      const result = await fn(this.primaryConnection)
      this._lastProviderUsed = 'primary'
      return result
    }
    catch (err) {
      if (!isFailoverError(err))
        throw err
      log.warn({ err }, 'primary RPC failed — failing over to fallback')
      const result = await fn(this.fallbackConnection)
      this._lastProviderUsed = 'fallback'
      return result
    }
  }

  async getSignaturesForAddress(
    account: string,
    options?: SignaturesForAddressOptions,
  ): Promise<ConfirmedSignatureInfo[]> {
    const accountKey = new PublicKey(account)
    return this.withFailover(conn => conn.getSignaturesForAddress(accountKey, options))
  }

  async getSolBalance(wallet: string): Promise<number> {
    const walletKey = new PublicKey(wallet)
    const lamports = await this.withFailover(conn => conn.getBalance(walletKey))
    return lamports / LAMPORTS_PER_SOL
  }

  async getTokenBalance(owner: string, mint: string): Promise<number> {
    try {
      const ownerKey = new PublicKey(owner)
      const mintKey = new PublicKey(mint)
      const { value } = await this.withFailover(conn =>
        conn.getParsedTokenAccountsByOwner(ownerKey, { mint: mintKey }),
      )
      return value.reduce((sum, { account }) => {
        const amount = account.data.parsed?.info?.tokenAmount?.uiAmount
        return sum + (typeof amount === 'number' ? amount : 0)
      }, 0)
    }
    catch (err) {
      log.warn({ err, owner, mint, provider: this._lastProviderUsed }, 'getTokenBalance failed — returning 0')
      return 0
    }
  }
}
