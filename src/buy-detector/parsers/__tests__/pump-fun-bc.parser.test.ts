import type { Logs, ParsedTransactionWithMeta } from '@solana/web3.js'

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DexProgramId } from '#root/utils/dex-programs.js'

import { describe, expect, it } from 'vitest'

import { parseBuy } from '../pump-fun-bc.parser.js'

// Each fixture is the raw output of `scripts/capture-dex-fixtures.ts` —
// the same shape the BuyDetector receives at runtime: the `Logs` payload
// from `connection.onLogs(...)` and the `ParsedTransactionWithMeta` from
// `connection.getParsedTransaction(sig)`. Buy fixtures may additionally
// carry an `expected` field (computed offline, see the fixture comment
// blocks) so the test asserts an exact BuyEvent without re-parsing.
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

const FIXTURES_ROOT = fileURLToPath(new URL('./fixtures/pump-fun-bc/', import.meta.url))

type Category = 'buy' | 'sell' | 'failed' | 'non-buy'

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

describe('parseBuy (Pump.fun bonding curve)', () => {
  // ── Canonical buy ────────────────────────────────────────────────────────
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
        dexProgram: DexProgramId.PUMP_FUN_BC,
      })
    })
  })

  // ── Sells ────────────────────────────────────────────────────────────────
  describe('sells', () => {
    it.each(loadFixtures('sell'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })

  // ── Failed transactions ──────────────────────────────────────────────────
  describe('failed transactions', () => {
    it.each(loadFixtures('failed'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })

  // ── Non-buy Pump.fun BC instructions ─────────────────────────────────────
  // Pump.fun's bonding-curve program exposes ClaimCashbackV2, Create,
  // Migrate, etc.; aggregators also CPI into it from a non-Pump.fun
  // top-level program. None of these are canonical buys we should fire on.
  describe('non-buy Pump.fun BC instructions', () => {
    it.each(loadFixtures('non-buy'))('returns null for $name', ({ fixture }) => {
      expect(parseBuy(fixture.logs, fixture.tx)).toBeNull()
    })
  })
})
