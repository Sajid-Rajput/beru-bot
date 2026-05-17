import { PublicKey } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'

import { DEX_PROGRAM_IDS, DexProgramId } from '../dex-programs.js'

describe('dex-programs', () => {
  describe('dEX_PROGRAM_IDS map', () => {
    it('has an entry for every DexProgramId value', () => {
      for (const value of Object.values(DexProgramId)) {
        expect(DEX_PROGRAM_IDS[value], `missing entry for ${value}`).toBeTypeOf('string')
        expect(DEX_PROGRAM_IDS[value].length).toBeGreaterThan(0)
      }
    })

    it('each entry is a valid base58 32-byte Solana public key', () => {
      for (const [name, address] of Object.entries(DEX_PROGRAM_IDS)) {
        expect(
          () => new PublicKey(address),
          `${name}: ${address} is not a valid base58 PublicKey`,
        ).not.toThrow()
      }
    })

    it('pins Pump.fun bonding curve to its canonical program ID', () => {
      expect(DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC])
        .toBe('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
    })

    it('pins Raydium AMM v4 to its canonical program ID', () => {
      expect(DEX_PROGRAM_IDS[DexProgramId.RAYDIUM_AMM_V4])
        .toBe('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')
    })

    it('pins PumpSwap AMM to its canonical program ID', () => {
      expect(DEX_PROGRAM_IDS[DexProgramId.PUMP_SWAP])
        .toBe('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA')
    })
  })
})
