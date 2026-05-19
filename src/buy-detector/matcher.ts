import type { BuyEvent } from './parsers/index.js'
import type { ProjectFeatureConfig } from './watched-feature-cache.js'

import { LAMPORTS_PER_SOL } from '#root/utils/constants.js'

/**
 * One feature that matched a buy, paired with the resolved sell percentage.
 * The enqueuer turns each `Match` into a `SellJob`.
 */
export interface Match {
  feature: ProjectFeatureConfig
  /** Integer percent (1..100) of the user's holding to sell. */
  sellPercentage: number
  /** SOL spent by the buyer that triggered this match (decimal SOL, not lamports). */
  buyAmountSol: number
}

/**
 * Pure function — filters a buy against every watching Project Feature on the
 * touched mint and resolves a concrete `sellPercentage` per match.
 *
 * Threshold rule: drop the feature if `buyAmountSol < config.minBuyAmountSol`.
 */
export function matchBuy(buy: BuyEvent, features: ProjectFeatureConfig[]): Match[] {
  const buyAmountSol = Number(buy.solIn) / LAMPORTS_PER_SOL
  const matches: Match[] = []

  for (const feature of features) {
    const { config } = feature
    if (buyAmountSol < config.minBuyAmountSol)
      continue

    matches.push({
      feature,
      sellPercentage: resolveSellPercentage(buyAmountSol, config),
      buyAmountSol,
    })
  }

  return matches
}

/**
 * Linear ramp from `minSellPercentage` upward as `buyAmountSol` scales past
 * `minBuyAmountSol`. At the threshold (`ratio = 1`) the ramp returns
 * `minSellPercentage`. Each additional multiple of `minBuyAmountSol` adds
 * another `minSellPercentage` chunk. Clamped to `[min, max]` and rounded.
 */
function resolveSellPercentage(
  buyAmountSol: number,
  config: { minSellPercentage: number, maxSellPercentage: number, minBuyAmountSol: number },
): number {
  const ratio = buyAmountSol / config.minBuyAmountSol
  const raw = Math.round(config.minSellPercentage * ratio)
  if (raw < config.minSellPercentage)
    return config.minSellPercentage
  if (raw > config.maxSellPercentage)
    return config.maxSellPercentage
  return raw
}
