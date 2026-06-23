import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DexProgramId } from '#root/utils/dex-programs.js'

import { describe, expect, it } from 'vitest'

import { parseBuy } from '../pump-swap.parser.js'

// Each fixture is a real PumpSwap mainnet transaction captured by
// `scripts/capture-dex-fixtures.ts` (the same shape the BuyDetector sees at
// runtime: the `Logs` payload from `connection.onLogs(...)` and the
// `ParsedTransactionWithMeta` from `connection.getParsedTransaction(sig)`).
// Buy fixtures additionally carry an `expected` block (computed offline and
// cross-checked against the on-chain `BuyEvent` at capture time) so the test
// asserts an exact BuyEvent without re-parsing.
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

const FIXTURES_ROOT = fileURLToPath(new URL('./fixtures/pump-swap/', import.meta.url))

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

describe('parseBuy (PumpSwap AMM)', () => {
  // ── Canonical buy ────────────────────────────────────────────────────────
  // PumpSwap exposes two buy entrypoints — `Buy` and `BuyExactQuoteIn`; both
  // are quote(WSOL) → base(token) and both must produce a BuyEvent.
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
        dexProgram: DexProgramId.PUMP_SWAP,
      })
    })
  })

  // ── Sells ────────────────────────────────────────────────────────────────
  // A sell is base(token) → quote(WSOL): the signer's token balance falls and
  // they receive WSOL, so there is no non-WSOL mint they "received".
  describe('sells', () => {
    it.each(loadFixtures('sell'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })

  // ── Liquidity (add / remove) ─────────────────────────────────────────────
  // Pool-liquidity lifecycle instructions (create-pool / deposit / withdraw)
  // move tokens between the LP and the pool but are not swaps, so no buy fired.
  describe('liquidity', () => {
    it.each(loadFixtures('liquidity'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })

  // ── Failed transactions ──────────────────────────────────────────────────
  // The buy instruction logs are present but the transaction reverted
  // (`err` set), so no buy actually landed.
  describe('failed transactions', () => {
    it.each(loadFixtures('failed'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })

  // ── Unknown / non-buy PumpSwap activity ──────────────────────────────────
  // PumpSwap reached via CPI from an aggregator (not the top-level program) and
  // other top-level instructions (ClaimCashback, …) are not canonical buys we
  // should fire on, even when the signer's balances happen to gain a token.
  describe('unknown instructions', () => {
    it.each(loadFixtures('unknown'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })
})
