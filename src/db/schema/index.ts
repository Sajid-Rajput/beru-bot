export * from './audit-log.js'
export * from './enums.js'
export * from './ephemeral-wallets.js'
export * from './fee-ledger.js'
export * from './project-features.js'
export * from './projects.js'
export * from './referral-payouts.js'
export * from './referrals.js'
export * from './transactions.js'
export * from './users.js'
export * from './waitlist-entries.js'
export * from './wallets.js'
export * from './whitelist-entries.js'

// ── JSONB config interfaces ──

/** Shadow Sell feature config shape (stored in project_features.config) */
export interface ShadowSellConfig {
  minSellPercentage: number
  maxSellPercentage: number
  targetMarketCapUsd: number
  minBuyAmountSol: number
  hysteresisPercentage: number
}
