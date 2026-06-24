import type { Logs, ParsedInstruction, ParsedTransactionWithMeta, PartiallyDecodedInstruction, TokenBalance } from '@solana/web3.js'

import type { BuyEvent } from './types.js'

import { DEX_PROGRAM_IDS, DexProgramId } from '#root/utils/dex-programs.js'

import bs58 from 'bs58'

const PROGRAM_ID = DEX_PROGRAM_IDS[DexProgramId.RAYDIUM_AMM_V4]

const WSOL_MINT = 'So11111111111111111111111111111111111111112'

// Raydium AMM v4's single program-derived authority — it owns the coin & pc
// vaults of *every* v4 pool. We read a swapped pool's two token mints off the
// vault token-balances owned by this authority, which is how we tell a
// SOL-quoted pool (one vault is WSOL) from a stablecoin/token-token pool.
const AMM_AUTHORITY = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'

// Raydium AMM v4 is a native (non-Anchor) program, so it emits no
// `Program log: Instruction: …` line the Pump.fun / PumpSwap parsers key off.
// The swap is identified by the leading byte (u8 tag) of the instruction data:
// SwapBaseIn=9, SwapBaseOut=11, plus the newer SwapBaseInV2=16 / SwapBaseOutV2=17
// (same swap semantics). Liquidity (Initialize/Initialize2/Deposit/Withdraw/
// PreInitialize = 0/1/3/4/10) and everything else are not swaps. See
// raydium-io/raydium-amm `instruction.rs`.
const SWAP_DISCRIMINATORS = new Set([9, 11, 16, 17])

/**
 * Decode a Raydium AMM v4 buy from a `logsSubscribe` notification and the
 * matching parsed transaction.
 *
 * Pure function — no network calls, no Solana `Connection`, never throws. A buy
 * is a **top-level** Raydium swap on a **WSOL-quoted** pool where the signer
 * net-received the pool's non-WSOL token. That deliberately returns `null` for:
 * sells, liquidity, failed transactions, CPI swaps routed through an aggregator
 * (no top-level Raydium instruction), swaps on stablecoin/token-token pools, and
 * — unlike a naive "signer gained any token" heuristic — multi-hop routes where
 * a top-level Raydium leg is only an intermediate hop (e.g. SOL→USDC on Raydium,
 * then USDC→token on another DEX). Reading the pool's tokens off the swap's own
 * vault accounts is what keeps those multi-hop legs from being mis-attributed; a
 * transaction with several top-level Raydium swaps fires on the first that is a
 * genuine WSOL→token buy for the signer.
 *
 * `solIn` is the signer's net lamport outlay (minus fee), consistent with the
 * sibling parsers. A buy funded from a pre-existing WSOL balance therefore
 * reports ~0, and one that closes a pre-existing WSOL account (reclaiming rent)
 * can even report a small negative — both are well below any real buy threshold,
 * so the downstream matcher's min-buy filter drops them. See ADR 0001 (Buy
 * Detector scope) and ADR 0003 (parser registry).
 */
export function parseBuy(logs: Logs, tx: ParsedTransactionWithMeta): BuyEvent | null {
  if (logs.err != null)
    return null

  const { meta } = tx
  if (!meta)
    return null

  const buyer = String(tx.transaction.message.accountKeys[0].pubkey)

  // A multi-hop route can run several top-level Raydium swaps; fire on the first
  // that is actually a WSOL→token buy whose token the signer kept.
  for (const swap of topLevelSwaps(tx)) {
    const swapAccounts = new Set(swap.accounts.map(a => a.toString()))
    const poolMints = findPoolMints(meta, tx.transaction.message.accountKeys, swapAccounts)
    if (!poolMints.has(WSOL_MINT))
      continue

    const mint = [...poolMints].find(m => m !== WSOL_MINT)
    if (!mint)
      continue

    if (signerTokenDelta(meta, buyer, mint) <= 0n)
      continue

    const solIn = BigInt(meta.preBalances[0]) - BigInt(meta.postBalances[0]) - BigInt(meta.fee)
    return {
      signature: logs.signature,
      mint,
      buyer,
      solIn,
      slot: tx.slot,
      dexProgram: DexProgramId.RAYDIUM_AMM_V4,
    }
  }

  return null
}

// MVP scope: only fire on a Raydium swap that ran as a top-level instruction.
// CPI swaps routed through an aggregator appear only as inner instructions and
// their pool/amounts can't be attributed without route-aware decoding — they
// reach this parser via the WS subscription but are dropped here (ADR 0001).
function* topLevelSwaps(tx: ParsedTransactionWithMeta): Generator<PartiallyDecodedInstruction> {
  for (const ix of tx.transaction.message.instructions) {
    if (!isPartiallyDecoded(ix) || ix.programId.toString() !== PROGRAM_ID)
      continue
    const discriminator = decodeDiscriminator(ix.data)
    if (discriminator !== undefined && SWAP_DISCRIMINATORS.has(discriminator))
      yield ix
  }
}

// The two token mints of the pool this swap traded against: the vault token
// accounts owned by the AMM authority and referenced by the swap instruction.
// Both pre- and post-balances are scanned so a vault that only appears on one
// side (e.g. a freshly funded account) is still captured.
function findPoolMints(
  meta: NonNullable<ParsedTransactionWithMeta['meta']>,
  accountKeys: ParsedTransactionWithMeta['transaction']['message']['accountKeys'],
  swapAccounts: Set<string>,
): Set<string> {
  const mints = new Set<string>()
  for (const bal of [...(meta.preTokenBalances ?? []), ...(meta.postTokenBalances ?? [])]) {
    if (bal.owner !== AMM_AUTHORITY)
      continue
    if (!swapAccounts.has(accountKeys[bal.accountIndex].pubkey.toString()))
      continue
    mints.add(bal.mint)
  }
  return mints
}

// Net change in `owner`'s holdings of `mint` across the transaction (sums any
// number of token accounts the owner holds for that mint).
function signerTokenDelta(
  meta: NonNullable<ParsedTransactionWithMeta['meta']>,
  owner: string,
  mint: string,
): bigint {
  const sum = (bals: TokenBalance[] | null | undefined): bigint =>
    (bals ?? [])
      .filter(b => b.owner === owner && b.mint === mint)
      .reduce((acc, b) => acc + BigInt(b.uiTokenAmount.amount), 0n)
  return sum(meta.postTokenBalances) - sum(meta.preTokenBalances)
}

// First byte (u8 instruction tag) of base58 instruction data, or `undefined` if
// the data is empty or not valid base58 — keeps the parser total (never throws).
function decodeDiscriminator(data: string): number | undefined {
  try {
    return bs58.decode(data)[0]
  }
  catch {
    return undefined
  }
}

function isPartiallyDecoded(
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): ix is PartiallyDecodedInstruction {
  return 'data' in ix
}
