import type { Logs, ParsedTransactionWithMeta, TokenBalance } from '@solana/web3.js'

import type { BuyEvent } from './types.js'

import { DEX_PROGRAM_IDS, DexProgramId } from '#root/utils/dex-programs.js'

const PROGRAM_ID = DEX_PROGRAM_IDS[DexProgramId.PUMP_FUN_BC]

// The Pump.fun BC program currently exposes two buy entrypoints:
//   • `Buy`            — original `(amount, max_sol_cost)`
//   • `BuyExactSolIn`  — newer `(sol_amount, min_amount_out)`
// Both are emitted by Anchor as `Program log: Instruction: <Name>` directly
// after the program-invoke line. Anything else (Sell, Create, Migrate,
// ClaimCashbackV2, …) is not a buy.
const BUY_INSTRUCTION_LOGS = new Set([
  'Program log: Instruction: Buy',
  'Program log: Instruction: BuyExactSolIn',
])

// MVP scope: only fire on Pump.fun BC buys that ran as the top-level
// instruction. CPI buys routed through an aggregator (Jupiter etc.)
// reach this parser too via the WS subscription but their `solIn` and
// `mint` can't be read off the buyer's balance deltas without
// route-aware decoding — deferred, see ADR 0001 "Out of scope".
const TOP_LEVEL_INVOKE = `Program ${PROGRAM_ID} invoke [1]`

/**
 * Decode a Pump.fun bonding-curve buy from a `logsSubscribe` notification
 * and the matching parsed transaction.
 *
 * Pure function — no network calls, no Solana `Connection`. Returns
 * `null` for sells, create/migrate/cashback, failed transactions, and
 * any instruction that isn't a top-level Pump.fun BC buy.
 *
 * See ADR 0001 (Buy Detector external scope) and ADR 0003 (parser registry).
 */
export function parseBuy(logs: Logs, tx: ParsedTransactionWithMeta): BuyEvent | null {
  if (logs.err != null)
    return null

  if (!hasBuyInvocation(logs.logs))
    return null

  const { meta } = tx
  if (!meta)
    return null

  const buyer = String(tx.transaction.message.accountKeys[0].pubkey)
  const mint = findBuyerReceivedMint(meta.preTokenBalances ?? [], meta.postTokenBalances ?? [], buyer)
  if (!mint)
    return null

  const solIn = BigInt(meta.preBalances[0]) - BigInt(meta.postBalances[0]) - BigInt(meta.fee)

  return {
    signature: logs.signature,
    mint,
    buyer,
    solIn,
    slot: tx.slot,
    dexProgram: DexProgramId.PUMP_FUN_BC,
  }
}

function hasBuyInvocation(logLines: string[]): boolean {
  for (let i = 0; i < logLines.length - 1; i++) {
    if (logLines[i] === TOP_LEVEL_INVOKE && BUY_INSTRUCTION_LOGS.has(logLines[i + 1]))
      return true
  }
  return false
}

function findBuyerReceivedMint(pre: TokenBalance[], post: TokenBalance[], buyer: string): string | null {
  for (const postEntry of post) {
    if (postEntry.owner !== buyer)
      continue
    const preEntry = pre.find(p => p.accountIndex === postEntry.accountIndex && p.mint === postEntry.mint)
    const preAmount = preEntry ? BigInt(preEntry.uiTokenAmount.amount) : 0n
    const postAmount = BigInt(postEntry.uiTokenAmount.amount)
    if (postAmount > preAmount)
      return postEntry.mint
  }
  return null
}
