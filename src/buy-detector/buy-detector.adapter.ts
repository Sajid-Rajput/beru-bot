import type { SolanaRpcService } from '#root/services/solana-rpc.service.js'
import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'

import type { FetchParsedTransaction, FetchSignaturesForMint } from './index.js'
import type { WsClient, WsClientFactory, WsLogsSubscription } from './subscription-manager.js'

import { Connection, PublicKey } from '@solana/web3.js'

/**
 * Builds a `WsClientFactory` backed by `@solana/web3.js` Connection.onLogs.
 * One Connection is opened per call (one per BuyDetector start). web3.js
 * auto-reconnects the socket and silently resumes delivering logs, so the
 * degraded-mode heartbeat (#39) treats the first log after a silence window as
 * the fold-back signal rather than observing a reconnect event here.
 *
 * `SOLANA_PRIMARY_WS_URL` is a `wss://` endpoint, but web3.js requires the
 * `Connection` endpoint to be `http(s)` and throws otherwise — so the WSS url is
 * passed via `wsEndpoint` and an `http(s)` endpoint is derived for the (unused
 * here) RPC side.
 */
export function createSolanaWsClientFactory(): WsClientFactory {
  return (url: string): WsClient => {
    const httpEndpoint = url.startsWith('ws')
      ? url.replace(/^ws/, 'http') // wss://→https://, ws://→http://
      : url
    const connection = new Connection(httpEndpoint, { wsEndpoint: url, commitment: 'confirmed' })
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

/**
 * Builds the degraded-mode signature poll on top of `SolanaRpcService` (#39).
 * `getSignaturesForAddress` returns the mint's signatures newest→oldest; the
 * detector passes the last signature it processed as `until`, so each poll pulls
 * only the new tail (RPC failover is handled inside the service).
 */
export function createFetchSignaturesForMint(rpc: SolanaRpcService): FetchSignaturesForMint {
  return (mint, { until }) => rpc.getSignaturesForAddress(mint, { until })
}
