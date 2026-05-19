import type { DexProgramId } from '#root/utils/dex-programs.js'

import type { Parser } from './types.js'

/**
 * Lookup of per-DEX log parsers. The only public seam of the Buy Detector
 * (ADR-0003 decision 1): adding a new DEX adds a new file that registers
 * with this registry rather than editing the central dispatcher.
 *
 * Registration happens at construction time inside the BuyDetector facade.
 */
export class ParserRegistry {
  private readonly parsers = new Map<DexProgramId, Parser>()

  register(programId: DexProgramId, parser: Parser): void {
    this.parsers.set(programId, parser)
  }

  get(programId: DexProgramId): Parser | undefined {
    return this.parsers.get(programId)
  }
}

export type { BuyEvent, Parser } from './types.js'
