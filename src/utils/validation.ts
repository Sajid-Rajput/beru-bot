/**
 * Reusable Valibot schemas for user-supplied inputs.
 *
 * All schemas produce clear, user-facing error messages that can be passed
 * directly to `ValidationError` or sent back in bot replies.
 */

import * as v from 'valibot'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

// ── Solana address / public-key ───────────────────────────────────────────────

/**
 * Matches any base-58 string in the valid Solana public-key character space.
 * 32 chars (minimum compressed) – 44 chars (standard 256-bit key in base58).
 */
export const solanaAddressSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    'Invalid Solana address — must be a 32–44 character base-58 string.',
  ),
)

/** Alias used for token-mint addresses (same format as a public key). */
export const solanaMintSchema = solanaAddressSchema

/** Alias used for payout wallet addresses. */
export const payoutWalletSchema = solanaAddressSchema

// ── Solana private key ────────────────────────────────────────────────────────

/**
 * Validates a base-58 encoded Solana private key.
 *
 * Rules:
 *  1. Must decode to exactly 64 bytes (first 32 = seed, last 32 = public key).
 *  2. Must produce a valid `Keypair` (catches degenerate edge-cases).
 *
 * NOTE: This schema does NOT log or store the decoded bytes.
 */
export const solanaPrivateKeySchema = v.pipe(
  v.string(),
  v.trim(),
  v.check((value) => {
    try {
      const bytes = bs58.decode(value)
      return bytes.length === 64
    }
    catch {
      return false
    }
  }, 'Invalid private key — must be a base-58 encoded 64-byte Solana secret key.'),
  v.check((value) => {
    try {
      const bytes = bs58.decode(value)
      Keypair.fromSecretKey(bytes)
      return true
    }
    catch {
      return false
    }
  }, 'Invalid private key — the key bytes do not form a valid Solana keypair.'),
)

// ── Shadow-sell config fields ─────────────────────────────────────────────────

/**
 * minSellPercentage: integer 1–100 (inclusive).
 */
export const minSellPctSchema = v.pipe(
  v.number('Minimum sell percentage must be a number.'),
  v.integer('Minimum sell percentage must be a whole number.'),
  v.minValue(1, 'Minimum sell percentage must be at least 1%.'),
  v.maxValue(100, 'Minimum sell percentage cannot exceed 100%.'),
)

/**
 * maxSellPercentage: integer 1–100 (inclusive).
 *
 * Cross-validation (maxSell ≥ minSell) must be performed at the object level;
 * see `shadowSellConfigSchema` below.
 */
export const maxSellPctSchema = v.pipe(
  v.number('Maximum sell percentage must be a number.'),
  v.integer('Maximum sell percentage must be a whole number.'),
  v.minValue(1, 'Maximum sell percentage must be at least 1%.'),
  v.maxValue(100, 'Maximum sell percentage cannot exceed 100%.'),
)

/**
 * targetMarketCapUsd: float ≥ 0.  A value of 0 means "disabled".
 */
export const minMcapSchema = v.pipe(
  v.number('Target market cap must be a number.'),
  v.minValue(0, 'Target market cap cannot be negative.'),
)

/**
 * minBuyAmountSol: float ≥ 0.001 SOL (dust threshold).
 */
export const minBuyAmountSchema = v.pipe(
  v.number('Minimum buy amount must be a number.'),
  v.minValue(0.001, 'Minimum buy amount must be at least 0.001 SOL.'),
)

/**
 * hysteresisPercentage: integer 0–50 (prevents oscillating sells).
 */
export const hysteresisPctSchema = v.pipe(
  v.number('Hysteresis percentage must be a number.'),
  v.integer('Hysteresis percentage must be a whole number.'),
  v.minValue(0, 'Hysteresis percentage cannot be negative.'),
  v.maxValue(50, 'Hysteresis percentage cannot exceed 50%.'),
)

// ── Combined shadow-sell config schema ───────────────────────────────────────

/**
 * Full `ShadowSellConfig` object schema with cross-field validation.
 *
 * Ensures `maxSellPercentage >= minSellPercentage`.
 */
export const shadowSellConfigSchema = v.pipe(
  v.object({
    minSellPercentage: minSellPctSchema,
    maxSellPercentage: maxSellPctSchema,
    targetMarketCapUsd: minMcapSchema,
    minBuyAmountSol: minBuyAmountSchema,
    hysteresisPercentage: hysteresisPctSchema,
  }),
  v.check(
    (cfg) => cfg.maxSellPercentage >= cfg.minSellPercentage,
    'Maximum sell percentage must be greater than or equal to minimum sell percentage.',
  ),
)

export type ValidatedShadowSellConfig = v.InferOutput<typeof shadowSellConfigSchema>
