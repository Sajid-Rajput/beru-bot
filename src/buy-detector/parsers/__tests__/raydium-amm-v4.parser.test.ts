import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DexProgramId } from '#root/utils/dex-programs.js'

import { describe, expect, it } from 'vitest'

import { parseBuy } from '../raydium-amm-v4.parser.js'

// Each fixture is a real Raydium AMM v4 mainnet transaction captured the same
// shape the BuyDetector sees at runtime: the `Logs` payload from
// `connection.onLogs(...)` and the `ParsedTransactionWithMeta` from
// `connection.getParsedTransaction(sig)`. Buy fixtures additionally carry an
// `expected` block (computed offline and cross-checked against the on-chain
// `BuyEvent` at capture time) so the test asserts an exact BuyEvent without
// re-parsing.
interface CapturedFixture {
  logs: Logs
  slot: number
  tx: ParsedTransactionWithMeta
  expected?: {
    signature: string
    mint: string
    buyer: string
    solIn: string // bigint serialised as decimal string
    slot: number
  }
}

const FIXTURES_ROOT = fileURLToPath(new URL('./fixtures/raydium-amm-v4/', import.meta.url))

type Category = 'buy' | 'sell' | 'liquidity' | 'failed' | 'unknown'

function loadFixtures(category: Category): Array<{ name: string, fixture: CapturedFixture }> {
  const dir = join(FIXTURES_ROOT, category)
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(file => ({
      name: file.replace(/\.json$/, ''),
      fixture: JSON.parse(readFileSync(join(dir, file), 'utf-8')) as CapturedFixture,
    }))
}

describe('parseBuy (Raydium AMM v4)', () => {
  // ── Canonical buy ──────────────────────────────────────────────────────────
  // Raydium AMM v4 is a native (non-Anchor) program, so a buy is identified by a
  // top-level swap instruction (SwapBaseIn=9 / SwapBaseOut=11 / V2=16/17) on a
  // WSOL-quoted pool where the signer net-received the pool's non-WSOL token.
  // No skip guard: an empty bucket must fail the run, not pass green-by-omission.
  describe('canonical buy', () => {
    it.each(loadFixtures('buy'))('returns BuyEvent for $name', ({ fixture }) => {
      if (!fixture.expected)
        throw new Error('buy fixture must declare .expected')

      const result = parseBuy(fixture.logs, fixture.tx)

      expect(result).toEqual({
        signature: fixture.expected.signature,
        mint: fixture.expected.mint,
        buyer: fixture.expected.buyer,
        solIn: BigInt(fixture.expected.solIn),
        slot: fixture.expected.slot,
        dexProgram: DexProgramId.RAYDIUM_AMM_V4,
      })
    })
  })

  // ── Sells ────────────────────────────────────────────────────────────────
  // A sell is a top-level swap on a WSOL-quoted pool too, but token → WSOL: the
  // signer's holding of the pool's non-WSOL token *falls*, whether the proceeds
  // are unwrapped to SOL or left as WSOL.
  describe('sells', () => {
    it.each(loadFixtures('sell'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })

  // ── Liquidity (add / remove / create) ──────────────────────────────────────
  // Pool-liquidity instructions (Initialize2 / Deposit / Withdraw) are top-level
  // Raydium instructions but not swaps (discriminator not in SWAP_DISCRIMINATORS),
  // so no buy fired.
  describe('liquidity', () => {
    it.each(loadFixtures('liquidity'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })

  // ── Failed transactions ────────────────────────────────────────────────────
  // The swap instruction is present but the transaction reverted (`err` set),
  // so no buy actually landed and balances rolled back.
  describe('failed transactions', () => {
    it.each(loadFixtures('failed'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })

  // ── Unknown / non-canonical Raydium activity ───────────────────────────────
  // Everything that touches Raydium AMM v4 but is not a canonical SOL→token buy
  // we should fire on, and so must return null:
  //   • aggregator/arbitrage txs that only reference Raydium in their accounts,
  //     or route a swap through it via CPI (no top-level Raydium instruction)
  //   • multi-hop routes where a top-level Raydium leg is only an intermediate
  //     hop (e.g. SOL→USDC on Raydium, then USDC→token on another DEX) — the
  //     signer never net-receives this pool's token
  //   • swaps on stablecoin / token-token (non-WSOL) pools
  describe('unknown instructions', () => {
    it.each(loadFixtures('unknown'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })
})
