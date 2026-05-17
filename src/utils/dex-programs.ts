/**
 * Solana DEX Program identifiers in MVP scope for the Buy Detector.
 *
 * See ADR 0001 for the rationale behind the three-DEX MVP coverage
 * (Pump.fun bonding curve, PumpSwap AMM, Raydium AMM v4).
 */
export enum DexProgramId {
  PUMP_FUN_BC = 'PUMP_FUN_BC',
  PUMP_SWAP = 'PUMP_SWAP',
  RAYDIUM_AMM_V4 = 'RAYDIUM_AMM_V4',
}

export const DEX_PROGRAM_IDS: Record<DexProgramId, string> = {
  // Pump.fun bonding-curve program. Source: Pump.fun IDL / public docs.
  [DexProgramId.PUMP_FUN_BC]: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  // PumpSwap AMM program. Source: https://docs.pump.fun/ (PumpSwap reference).
  [DexProgramId.PUMP_SWAP]: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
  // Raydium AMM v4 program. Source: Raydium public deployment docs.
  [DexProgramId.RAYDIUM_AMM_V4]: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
}
