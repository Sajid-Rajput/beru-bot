// ── Version ───────────────────────────────────────────────────────────────
export const BERU_BOT_VERSION = '0.1.0'

// ── BullMQ queue names ────────────────────────────────────────────────────
export const QUEUE_SELL_EXECUTION = 'sell-execution'
export const QUEUE_MARKET_CAP_MONITOR = 'market-cap-monitor'
export const QUEUE_RECOVERY = 'recovery'
export const QUEUE_FEE_PAYOUT = 'fee-payout'
export const QUEUE_NOTIFICATION = 'notification'

// ── Solana ────────────────────────────────────────────────────────────────
export const SOLANA_COMMITMENT = 'confirmed' as const
/** Mirrors `@solana/web3.js` LAMPORTS_PER_SOL — defined locally to avoid importing the full SDK */
export const LAMPORTS_PER_SOL = 1_000_000_000

// ── Fee structure (§15.7) ─────────────────────────────────────────────────
// These are compile-time reference defaults.  Runtime code should prefer the
// corresponding `config.*` values which may be overridden via environment variables.
/** Platform fee applied to gross sell proceeds (1%) */
export const PLATFORM_FEE_PERCENTAGE = 0.01
/** Tier-1 referrer revenue share of effective fee (35%) */
export const REFERRAL_TIER1_PCT = 0.35
/** Tier-2 referrer revenue share of effective fee (5%) */
export const REFERRAL_TIER2_PCT = 0.05
/** Fee discount granted to referred users (10%) */
export const REFERRAL_USER_DISCOUNT_PCT = 0.10
/** Minimum accrued earnings before SOL payout is triggered */
export const REFERRAL_MIN_PAYOUT_SOL = 0.01

// ── Cryptography (§15.7) ─────────────────────────────────────────────────
/** PBKDF2 iteration count — MUST NOT be lowered without a full re-encryption */
export const PBKDF2_ITERATIONS = 600_000
/** AES-256-GCM key length in bytes */
export const AES_KEY_LENGTH = 32
/** AES-GCM IV length in bytes */
export const IV_LENGTH = 16
/** Per-wallet PBKDF2 salt length in bytes */
export const SALT_LENGTH = 32
/** AES-GCM auth tag length in bytes */
export const AUTH_TAG_LENGTH = 16

// ── BullMQ worker settings (§15.7) ───────────────────────────────────────
/** Max parallel sell jobs across the sell-execution worker */
export const BULLMQ_SELL_CONCURRENCY = 5
/** Safety rate limit: sell jobs per minute */
export const BULLMQ_SELL_RATE_MAX = 10

// ── Redis TTLs / timings (§15.7) ─────────────────────────────────────────
/** Per-feature sell mutex TTL — must exceed max pipeline duration (seconds) */
export const SELL_LOCK_TTL = 60
/** Webhook payload deduplication window (seconds) */
export const DEDUP_TTL = 300
/** Replay-protection window: reject webhooks older than this (seconds) */
export const WEBHOOK_TIMESTAMP_TOLERANCE = 30
/** Nonce dedup TTL for webhook replay protection (seconds) */
export const NONCE_TTL = 60

// ── Polling / intervals in milliseconds (§15.7) ───────────────────────────
/** DexScreener MCAP poll cycle (ms) */
export const MCAP_POLL_INTERVAL = 30_000
/** QuickNode KV store sync cycle (ms) */
export const QN_KV_SYNC_INTERVAL = 300_000
/** Recovery worker cycle (ms) */
export const RECOVERY_INTERVAL = 300_000
/** Watched-token cache rebuild safety net (ms) */
export const CACHE_REFRESH_INTERVAL = 60_000
/** BullMQ worker graceful shutdown drain timeout (ms) */
export const GRACEFUL_SHUTDOWN_TIMEOUT = 30_000

// ── Rate limiting & UX (§15.7) ────────────────────────────────────────────
/** Max Telegram messages per user per minute before throttle */
export const RATE_LIMIT_MESSAGES = 30
/** Callback query button debounce window (ms) */
export const BUTTON_DEBOUNCE = 1_000

// ── Domain limits (§15.7) ────────────────────────────────────────────────
/** Maximum Shadow Sell projects a single user may own */
export const MAX_PROJECTS_PER_USER = 3
/** Maximum whitelist entries per project feature */
export const MAX_WHITELIST_ENTRIES = 25
/** Max recovery attempts for an ephemeral wallet before marking failed */
export const MAX_RECOVERY_ATTEMPTS = 5

// ── SOL amounts (§15.7) ──────────────────────────────────────────────────
/** SOL forwarded to each ephemeral wallet to cover gas + rent */
export const EPHEMERAL_GAS_BUDGET = 0.005

// ── Message lifetimes ────────────────────────────────────────────────────
/** Private key message is auto-deleted after this many seconds (24 h) */
export const KEY_DISPLAY_DELETE_AFTER = 86_400

// ── Redis key helpers (§15.8) ────────────────────────────────────────────
// Functions return the full Redis key string for a given entity.
export const redisKeys = {
  dedup: (txSignature: string) => `dedup:${txSignature}`,
  sellLock: (featureId: string) => `sell-lock:${featureId}`,
  nonce: (nonceValue: string) => `nonce:${nonceValue}`,
  rate: (telegramId: number | string) => `rate:${telegramId}`,
  debounce: (telegramId: number | string, callbackData: string) =>
    `debounce:${telegramId}:${callbackData}`,
  fileCache: () => 'bot:file_cache',
  waitlistCount: () => 'waitlist:count',
} as const
