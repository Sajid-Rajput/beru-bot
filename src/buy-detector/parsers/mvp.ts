import type { Parser } from './types.js'

import { DexProgramId } from '#root/utils/dex-programs.js'

import { parseBuy as parsePumpFunBuy } from './pump-fun-bc.parser.js'
import { parseBuy as parsePumpSwapBuy } from './pump-swap.parser.js'
import { parseBuy as parseRaydiumAmmV4Buy } from './raydium-amm-v4.parser.js'

/**
 * Production wiring for the Buy Detector's three MVP DEX parsers (ADR-0001
 * coverage; ADR-0003 registry seam).
 *
 * This is the composition list the `ParserRegistry` consumes: adding a DEX
 * means adding one entry here alongside a new parser file, rather than editing
 * a central dispatcher. The `BuyDetector` facade registers each pair at
 * construction.
 */
export const MVP_PARSERS: ReadonlyArray<readonly [DexProgramId, Parser]> = [
  [DexProgramId.PUMP_FUN_BC, parsePumpFunBuy],
  [DexProgramId.PUMP_SWAP, parsePumpSwapBuy],
  [DexProgramId.RAYDIUM_AMM_V4, parseRaydiumAmmV4Buy],
]

/** DEX programs the BuyDetector subscribes to, derived from `MVP_PARSERS`. */
export const MVP_PROGRAMS: DexProgramId[] = MVP_PARSERS.map(([programId]) => programId)
