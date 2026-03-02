import process from 'node:process'
import { API_CONSTANTS } from 'grammy'
import * as v from 'valibot'

const baseConfigSchema = v.object({
  debug: v.optional(v.pipe(v.string(), v.transform(JSON.parse), v.boolean()), 'false'),
  logLevel: v.optional(v.pipe(v.string(), v.picklist(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])), 'info'),
  botToken: v.pipe(v.string(), v.regex(/^\d+:[\w-]+$/, 'Invalid token')),
  botAllowedUpdates: v.optional(v.pipe(v.string(), v.transform(JSON.parse), v.array(v.picklist(API_CONSTANTS.ALL_UPDATE_TYPES))), '[]'),
  botAdmins: v.optional(v.pipe(v.string(), v.transform(JSON.parse), v.array(v.number())), '[]'),

  // ── Database ──────────────────────────────────────────────────────────────
  databaseUrl: v.pipe(v.string(), v.nonEmpty('DATABASE_URL is required'), v.regex(/^postgresql:\/\//, 'DATABASE_URL must start with postgresql://')),

  // ── Redis ──────────────────────────────────────────────────────────────────
  redisUrl: v.pipe(v.string(), v.nonEmpty('REDIS_URL is required'), v.regex(/^rediss?:\/\//, 'REDIS_URL must start with redis:// or rediss://')),

  // ── Security ───────────────────────────────────────────────────────────────
  masterKeySecret: v.pipe(
    v.string(),
    v.regex(/^[0-9a-f]{64}$/, 'MASTER_KEY_SECRET must be exactly 64 lowercase hex chars (openssl rand -hex 32)'),
  ),
  qnWebhookSecret: v.optional(v.string(), ''),
  domain: v.optional(v.string(), 'localhost'),

  // ── Solana ────────────────────────────────────────────────────────────────
  solanaRpcUrl: v.optional(v.string(), ''),
  platformFeeWallet: v.optional(v.string(), ''),
  platformFeePercentage: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '0.01'),

  // ── QuickNode ─────────────────────────────────────────────────────────────
  qnStreamId: v.optional(v.string(), ''),
  qnApiKey: v.optional(v.string(), ''),
  qnKvStoreId: v.optional(v.string(), ''),

  // ── Referral ──────────────────────────────────────────────────────────────
  referralTier1Pct: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '0.35'),
  referralTier2Pct: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '0.05'),
  referralUserDiscountPct: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '0.10'),
  referralMinPayoutSol: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '0.01'),
  referralLinkFormat: v.optional(v.string(), 'https://t.me/BeruMonarchBot?start=ref_{telegramId}'),

  // ── Community & Pre-Launch ────────────────────────────────────────────────
  preLaunchMode: v.optional(v.pipe(v.string(), v.transform(JSON.parse), v.boolean()), 'true'),
  announcementChannelId: v.optional(v.string(), ''),
  communityGroupId: v.optional(v.string(), ''),

  // ── Bot metadata ─────────────────────────────────────────────────────────
  botUsername: v.optional(v.string(), 'BeruMonarchBot'),
  supportBot: v.optional(v.string(), 'BeruSupportBot'),
})

const configSchema = v.variant('botMode', [
  // polling config
  v.pipe(
    v.object({
      botMode: v.literal('polling'),
      ...baseConfigSchema.entries,
    }),
    v.transform(input => ({
      ...input,
      isDebug: input.debug,
      isWebhookMode: false as const,
      isPollingMode: true as const,
    })),
  ),
  // webhook config
  v.pipe(
    v.object({
      botMode: v.literal('webhook'),
      ...baseConfigSchema.entries,
      botWebhook: v.pipe(v.string(), v.url()),
      botWebhookSecret: v.pipe(v.string(), v.minLength(12)),
      serverHost: v.optional(v.string(), '0.0.0.0'),
      serverPort: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '3000'),
    }),
    v.transform(input => ({
      ...input,
      isDebug: input.debug,
      isWebhookMode: true as const,
      isPollingMode: false as const,
    })),
  ),
])

export type Config = v.InferOutput<typeof configSchema>
export type PollingConfig = v.InferOutput<typeof configSchema['options'][0]>
export type WebhookConfig = v.InferOutput<typeof configSchema['options'][1]>

export function createConfig(input: v.InferInput<typeof configSchema>) {
  return v.parse(configSchema, input)
}

// ── Bootstrap from process.env ──────────────────────────────────────────────
function createConfigFromEnvironment() {
  type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
    ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
    : Lowercase<S>

  type KeysToCamelCase<T> = {
    [K in keyof T as CamelCase<string & K>]: T[K] extends object ? KeysToCamelCase<T[K]> : T[K]
  }

  function toCamelCase(str: string): string {
    return str.toLowerCase().replace(/_([a-z])/g, (_match, p1) => p1.toUpperCase())
  }

  function convertKeysToCamelCase<T>(obj: T): KeysToCamelCase<T> {
    const result: any = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const camelCaseKey = toCamelCase(key)
        result[camelCaseKey] = obj[key]
      }
    }
    return result
  }

  try {
    process.loadEnvFile()
  }
  catch {
    // No .env file found
  }

  try {
    const envInput = convertKeysToCamelCase(process.env) as unknown as v.InferInput<typeof configSchema>
    return createConfig(envInput)
  }
  catch (error) {
    throw new Error('Invalid config', {
      cause: error,
    })
  }
}

export const config = createConfigFromEnvironment()
