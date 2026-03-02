import { pgEnum } from 'drizzle-orm/pg-core'

// ── Feature types available in the platform ──
export const featureTypeEnum = pgEnum('feature_type', [
  'shadow_sell',
  'monarch_limit',
  'phantom_swap',
  'legion_volume',
  'eternal_dca',
])

// ── Feature lifecycle status (FSM) ──
export const featureStatusEnum = pgEnum('feature_status', [
  'idle',
  'pending',
  'watching',
  'executing',
  'completed',
  'stopped',
  'error',
])

// ── How the wallet was obtained ──
export const walletSourceEnum = pgEnum('wallet_source', [
  'imported',
  'generated',
])

// ── Transaction lifecycle status ──
export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'funding',
  'swapping',
  'sweeping',
  'completed',
  'failed',
  'recovery_needed',
])

// ── Ephemeral wallet lifecycle status ──
export const ephemeralStatusEnum = pgEnum('ephemeral_status', [
  'created',
  'funded',
  'swapping',
  'completed',
  'recovery_needed',
  'recovered',
  'failed',
])

// ── Fee collection status ──
export const feeCollectionStatusEnum = pgEnum('fee_collection_status', [
  'pending',
  'collected',
  'failed',
])

// ── Referral payout status ──
export const payoutStatusEnum = pgEnum('payout_status', [
  'pending',
  'sent',
  'confirmed',
  'failed',
])

// ── Waitlist entry status ──
export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'waiting',
  'notified',
  'activated',
])

// ── Referral tier (community strategy) ──
export const referralTierEnum = pgEnum('referral_tier', [
  'none',
  'supporter',
  'shadow_elite',
  'monarch',
])
