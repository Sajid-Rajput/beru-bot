import type { DexProgramId } from '#root/utils/dex-programs.js'
import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'

/**
 * A buy observed on a DEX Program that touches a Watched Mint.
 *
 * Produced by per-DEX log parsers; consumed by the Buy Detector to
 * enqueue a sell job on the `sell-queue`. See ADR 0001.
 */
export interface BuyEvent {
  signature: string
  mint: string
  buyer: string
  solIn: bigint
  slot: number
  dexProgram: DexProgramId
}

/**
 * Pure-function signature every DEX log parser implements. Given the raw
 * `logsSubscribe` payload and the matching parsed transaction, returns a
 * `BuyEvent` for a top-level buy on this DEX, or `null` for everything else
 * (sells, CPI buys we can't decode, failed transactions, non-buy instructions).
 *
 * See ADR-0003 — the `ParserRegistry` is the only public seam of the Buy
 * Detector, so every new DEX adds a new file rather than editing an existing
 * one.
 */
export type Parser = (logs: Logs, tx: ParsedTransactionWithMeta) => BuyEvent | null
