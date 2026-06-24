import { DexProgramId } from '#root/utils/dex-programs.js'
import { describe, expect, it } from 'vitest'

import { MVP_PARSERS, MVP_PROGRAMS } from '../mvp.js'

describe('mVP parser wiring', () => {
  it('registers a parser for every DEX program in MVP scope', () => {
    const wired = new Set(MVP_PARSERS.map(([programId]) => programId))

    for (const programId of Object.values(DexProgramId))
      expect(wired.has(programId)).toBe(true)
  })

  it('derives MVP_PROGRAMS from MVP_PARSERS so the two cannot drift', () => {
    expect(MVP_PROGRAMS).toEqual(MVP_PARSERS.map(([programId]) => programId))
  })
})
