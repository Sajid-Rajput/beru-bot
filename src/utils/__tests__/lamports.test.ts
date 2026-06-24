import { describe, expect, it } from 'vitest'

import { solToLamports } from '../lamports.js'

describe('solToLamports', () => {
  it('converts a 9-decimal SOL string to exact lamports', () => {
    // fee_ledger / referral_payouts store SOL as decimal(20, 9) — 9 fractional
    // digits is exactly lamport precision, so the conversion must be exact.
    expect(solToLamports('0.012000000')).toBe(12_000_000n)
  })

  it('converts whole-SOL and zero strings', () => {
    expect(solToLamports('1')).toBe(1_000_000_000n)
    expect(solToLamports('0')).toBe(0n)
    expect(solToLamports('2.500000000')).toBe(2_500_000_000n)
  })

  it('pads fractional strings shorter than 9 digits', () => {
    expect(solToLamports('0.01')).toBe(10_000_000n)
    expect(solToLamports('0.1')).toBe(100_000_000n)
  })

  it('truncates any fractional digits beyond lamport precision', () => {
    // Defensive — decimal(20, 9) never exceeds 9 dp, but a stray sub-lamport
    // digit must floor rather than round up (never over-pay).
    expect(solToLamports('0.0120000009')).toBe(12_000_000n)
  })
})
