import type { SolanaRpcService } from '#root/services/solana-rpc.service.js'
import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'

import type { FetchParsedTransaction } from './index.js'
import type { WsClient, WsClientFactory, WsLogsSubscription } from './subscription-manager.js'

import { Connection, PublicKey } from '@solana/web3.js'

/**
 * Builds a `WsClientFactory` backed by `@solana/web3.js` Connection.onLogs.
 * One Connection is opened per call (one per BuyDetector start) so reconnect
 * and degraded-mode (sibling slice #39) can swap the underlying transport
 * without touching higher layers.
 */
export function createSolanaWsClientFactory(): WsClientFactory {
  return (url: string): WsClient => {
    const connection = new Connection(url, 'confirmed')
    return {
      async subscribeLogs(programId, onLogs): Promise<WsLogsSubscription> {
        const programKey = new PublicKey(programId)
        const subId = await connection.onLogs(programKey, (logs: Logs) => {
          onLogs(logs)
        }, 'confirmed')
        return {
          close: async () => {
            await connection.removeOnLogsListener(subId).catch(() => {})
          },
        }
      },
    }
  }
}

/**
 * Builds a `fetchTx` seam on top of `SolanaRpcService` with failover.
 * Returns `null` when the transaction cannot be fetched within the seam's
 * single attempt — the dispatcher drops silently and the recovery scanner
 * (sibling slice #41) picks the trail up later if needed.
 */
export function createFetchParsedTransaction(rpc: SolanaRpcService): FetchParsedTransaction {
  return async (signature: string): Promise<ParsedTransactionWithMeta | null> => {
    try {
      return await rpc.withFailover(conn => conn.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      }))
    }
    catch {
      return null
    }
  }
}
