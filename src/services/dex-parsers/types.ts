import type { DexProgramId } from '#root/utils/dex-programs.js'

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
