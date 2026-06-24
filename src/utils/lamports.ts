const LAMPORT_DECIMALS = 9

/**
 * Convert a decimal SOL string (as stored in `decimal(20, 9)` columns) to an
 * exact lamport `bigint`. Float math (`Number(sol) * 1e9`) loses precision on
 * money, so this works purely on the digit string.
 */
export function solToLamports(decimalSol: string): bigint {
  const [whole, frac = ''] = decimalSol.split('.')
  const fracPadded = frac.slice(0, LAMPORT_DECIMALS).padEnd(LAMPORT_DECIMALS, '0')
  return BigInt(whole) * 10n ** BigInt(LAMPORT_DECIMALS) + BigInt(fracPadded)
}
