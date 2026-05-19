import type { Parser } from '../types.js'

import { DexProgramId } from '#root/utils/dex-programs.js'
import { describe, expect, it, vi } from 'vitest'

import { ParserRegistry } from '../index.js'

const noopParser: Parser = vi.fn(() => null)

describe('parserRegistry', () => {
  it('returns a registered parser for a DEX program', () => {
    const registry = new ParserRegistry()
    registry.register(DexProgramId.PUMP_FUN_BC, noopParser)

    expect(registry.get(DexProgramId.PUMP_FUN_BC)).toBe(noopParser)
  })

  it('returns undefined for an unregistered DEX program', () => {
    const registry = new ParserRegistry()

    expect(registry.get(DexProgramId.PUMP_FUN_BC)).toBeUndefined()
  })

  it('overwrites a previously registered parser for the same program id', () => {
    const registry = new ParserRegistry()
    const first: Parser = vi.fn(() => null)
    const second: Parser = vi.fn(() => null)

    registry.register(DexProgramId.PUMP_FUN_BC, first)
    registry.register(DexProgramId.PUMP_FUN_BC, second)

    expect(registry.get(DexProgramId.PUMP_FUN_BC)).toBe(second)
  })
})
