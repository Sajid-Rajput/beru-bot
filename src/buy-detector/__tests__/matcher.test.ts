import type { BuyEvent } from '../parsers/index.js'
import type { ProjectFeatureConfig } from '../watched-feature-cache.js'

import { LAMPORTS_PER_SOL } from '#root/utils/constants.js'
import { DexProgramId } from '#root/utils/dex-programs.js'
import { describe, expect, it } from 'vitest'

import { matchBuy } from '../matcher.js'

const MINT = 'MintAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function makeFeature(overrides: Partial<ProjectFeatureConfig> = {}): ProjectFeatureConfig {
  return {
    featureId: 'feat-1',
    projectId: 'proj-1',
    userId: 'user-1',
    mint: MINT,
    mainWalletPubkey: 'WalletAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    config: {
      minSellPercentage: 10,
      maxSellPercentage: 50,
      targetMarketCapUsd: 100_000,
      minBuyAmountSol: 1,
      hysteresisPercentage: 5,
    },
    referralSnapshot: { tier1: null, tier2: null },
    ...overrides,
  }
}

function makeBuy(solIn: bigint, overrides: Partial<BuyEvent> = {}): BuyEvent {
  return {
    signature: 'sig-xyz',
    mint: MINT,
    buyer: 'BuyerAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    solIn,
    slot: 1,
    dexProgram: DexProgramId.PUMP_FUN_BC,
    ...overrides,
  }
}

describe('matchBuy', () => {
  it('drops a buy that is below the feature\'s minBuyAmountSol', () => {
    const feature = makeFeature({ config: {
      minSellPercentage: 10,
      maxSellPercentage: 50,
      targetMarketCapUsd: 100_000,
      minBuyAmountSol: 1,
      hysteresisPercentage: 5,
    } })
    const halfSol = BigInt(Math.floor(0.5 * LAMPORTS_PER_SOL))

    const matches = matchBuy(makeBuy(halfSol), [feature])

    expect(matches).toEqual([])
  })

  it('clamps sellPercentage at maxSellPercentage when the ramp would overshoot', () => {
    const feature = makeFeature({ config: {
      minSellPercentage: 10,
      maxSellPercentage: 50,
      targetMarketCapUsd: 100_000,
      minBuyAmountSol: 1,
      hysteresisPercentage: 5,
    } })
    // ratio = 20 → raw = 200; clamped to maxSellPercentage = 50
    const twentySol = BigInt(20 * LAMPORTS_PER_SOL)

    const [match] = matchBuy(makeBuy(twentySol), [feature])

    expect(match.sellPercentage).toBe(50)
  })

  it('emits one match per qualifying feature watching the same mint', () => {
    const featA = makeFeature({ featureId: 'feat-a', userId: 'user-a' })
    const featB = makeFeature({ featureId: 'feat-b', userId: 'user-b' })
    const featLowMin = makeFeature({
      featureId: 'feat-c',
      userId: 'user-c',
      config: {
        minSellPercentage: 10,
        maxSellPercentage: 50,
        targetMarketCapUsd: 100_000,
        minBuyAmountSol: 100,
        hysteresisPercentage: 5,
      },
    })
    const fiveSol = BigInt(5 * LAMPORTS_PER_SOL)

    const matches = matchBuy(makeBuy(fiveSol), [featA, featB, featLowMin])

    expect(matches.map(m => m.feature.featureId)).toEqual(['feat-a', 'feat-b'])
  })

  it('resolves sellPercentage on a linear ramp from min to max as buyAmount scales above min', () => {
    // ramp: 10% at 1.0 SOL, 50% at 5.0 SOL (4x the minimum). At 3.0 SOL
    // (halfway through the 1..5 SOL band) the ramp lands at 30%.
    const feature = makeFeature({ config: {
      minSellPercentage: 10,
      maxSellPercentage: 50,
      targetMarketCapUsd: 100_000,
      minBuyAmountSol: 1,
      hysteresisPercentage: 5,
    } })
    const threeSol = BigInt(3 * LAMPORTS_PER_SOL)

    const [match] = matchBuy(makeBuy(threeSol), [feature])

    expect(match.sellPercentage).toBe(30)
  })
})
