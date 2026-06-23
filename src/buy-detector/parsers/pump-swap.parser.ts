import type { Logs, ParsedTransactionWithMeta, TokenBalance } from '@solana/web3.js'

import type { BuyEvent } from './types.js'

import { DEX_PROGRAM_IDS, DexProgramId } from '#root/utils/dex-programs.js'

const PROGRAM_ID = DEX_PROGRAM_IDS[DexProgramId.PUMP_SWAP]

// Quote mint for the canonical PumpSwap pool. NB: pools are *not* always
// WSOL-quoted, so the bought mint can't be inferred from balance deltas alone
// (a Sell into a non-WSOL pool credits the seller a non-WSOL token too) — the
// top-level instruction log is what actually distinguishes a buy. WSOL is still
// excluded as the bought mint to skip wrapped-SOL change on the buyer's side.
const WSOL_MINT = 'So11111111111111111111111111111111111111112'

// PumpSwap's Anchor program exposes two buy entrypoints, both quote → base:
//   • `Buy`              — `(base_amount_out, max_quote_amount_in)`
//   • `BuyExactQuoteIn`  — `(quote_amount_in, min_base_amount_out)`
// Anchor logs each as `Program log: Instruction: <Name>` right after the
// program-invoke line. Sell / Deposit / Withdraw / CreatePool / … are not buys.
const BUY_INSTRUCTION_LOGS = new Set([
  'Program log: Instruction: Buy',
  'Program log: Instruction: BuyExactQuoteIn',
])

// MVP scope: only fire on PumpSwap buys that ran as the top-level instruction.
// CPI buys routed through an aggregator reach this parser via the WS
// subscription too, but their `solIn`/`mint` can't be read off the buyer's
// balance deltas without route-aware decoding — deferred, see ADR 0001.
const TOP_LEVEL_INVOKE = `Program ${PROGRAM_ID} invoke [1]`

/**
 * Decode a PumpSwap AMM buy from a `logsSubscribe` notification and the
 * matching parsed transaction.
 *
 * Pure function — no network calls, no Solana `Connection`. Returns `null` for
 * sells, liquidity (deposit/withdraw/create-pool), CPI buys, and any
 * instruction that isn't a top-level PumpSwap buy.
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
    dexProgram: DexProgramId.PUMP_SWAP,
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
    if (postEntry.owner !== buyer || postEntry.mint === WSOL_MINT)
      continue
    const preEntry = pre.find(p => p.accountIndex === postEntry.accountIndex && p.mint === postEntry.mint)
    const preAmount = preEntry ? BigInt(preEntry.uiTokenAmount.amount) : 0n
    const postAmount = BigInt(postEntry.uiTokenAmount.amount)
    if (postAmount > preAmount)
      return postEntry.mint
  }
  return null
}
