import { config } from '#root/config.js'
import { createLogger } from '#root/utils/logger.js'
import { Connection, PublicKey } from '@solana/web3.js'

const log = createLogger('SolanaRpcService')

/**
 * SolanaRpcService — minimal wrapper around a single shared Solana Connection.
 *
 * Intentionally tiny for now: the only consumer is the "link existing wallet"
 * path, which needs to know which of a user's wallets already holds a given
 * SPL token. Rate-limiting, retries, and multi-region fallbacks are
 * out-of-scope — see plan doc.
 */
export class SolanaRpcService {
  private readonly connection: Connection

  constructor(endpoint: string = config.solanaRpcUrl || 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(endpoint, 'confirmed')
  }

  /**
   * Returns the owner's total uiAmount balance of the given SPL token mint,
   * summed across all token accounts. A single wallet can own multiple
   * token accounts for the same mint (e.g. ATA + legacy account), so all
   * of them are aggregated.
   *
   * Returns 0 on any RPC error so the caller can degrade gracefully
   * (e.g. fall back to showing a wallet picker instead of crashing).
   */
  async getTokenBalance(owner: string, mint: string): Promise<number> {
    try {
      const ownerKey = new PublicKey(owner)
      const mintKey = new PublicKey(mint)
      const { value } = await this.connection.getParsedTokenAccountsByOwner(
        ownerKey,
        { mint: mintKey },
      )
      return value.reduce((sum, { account }) => {
        const amount = account.data.parsed?.info?.tokenAmount?.uiAmount
        return sum + (typeof amount === 'number' ? amount : 0)
      }, 0)
    }
    catch (err) {
      log.warn({ err, owner, mint }, 'getTokenBalance failed — returning 0')
      return 0
    }
  }
}
