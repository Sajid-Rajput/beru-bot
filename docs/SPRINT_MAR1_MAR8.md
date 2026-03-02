<!-- AI-AGENT METADATA
document_type: sprint_plan
project: beru-bot (@BeruMonarchBot)
sprint_name: "Shadow Sell v2 — Full Implementation"
sprint_start: 2026-03-01
sprint_end: 2026-03-08
launch_date: 2026-03-09
developer: Solo (1 engineer)
base_template: bot-base/telegram-bot-template (Docker deploy branch)
companion_docs:
  - ARCHITECTURE.md (2,220 lines — single source of truth for implementation)
  - beru_bot_interface_and_flow.md (2,347 lines — UI/UX specification)
  - COMMUNITY_AND_GROWTH_STRATEGY.md (1,454 lines — waitlist + community)
total_tasks: 88
critical_path: Day1→Day2→Day3→Day5→Day6→Day8
-->

# Sprint Plan — March 1–8, 2026

## Sprint Metadata

| Field | Value |
|-------|-------|
| Sprint Goal | Implement Beru Bot Shadow Sell v2 from zero to production-ready |
| Duration | 8 days (March 1 → March 8) |
| Launch Date | **March 9, 2026** |
| Developer | 1 (solo) |
| Starting Codebase | Empty — greenfield from `bot-base/telegram-bot-template` |
| Target | Production deploy on 4-core VPS with Docker Compose (5 containers) |

---

## Agent Reading Protocol

```
IF task == "understand full sprint"       → read entire document
IF task == "implement a specific day"     → jump to that day's section (Ctrl+F "## Day N")
IF task == "find a specific task"         → search by task ID (e.g., "T1.3")
IF task == "check dependencies"           → read Section: Dependency Graph
IF task == "check acceptance criteria"    → each task has ✅ criteria inline
IF task == "understand file locations"    → see ARCHITECTURE.md Section 6.2 + Section 15.10
```

---

## Table of Contents

1. [Sprint Overview & Velocity](#1-sprint-overview--velocity)
2. [Dependency Graph](#2-dependency-graph)
3. [Day 1 — Foundation & Infrastructure](#day-1--march-1--foundation--infrastructure)
4. [Day 2 — Core Services Layer](#day-2--march-2--core-services-layer)
5. [Day 3 — Bot Handlers: Onboarding & Projects](#day-3--march-3--bot-handlers-onboarding--projects)
6. [Day 4 — Bot Handlers: Dashboard, Config & CRUD](#day-4--march-4--bot-handlers-dashboard-config--crud)
7. [Day 5 — Webhook Intake & Sell Execution Pipeline](#day-5--march-5--webhook-intake--sell-execution-pipeline)
8. [Day 6 — Background Workers & Notification System](#day-6--march-6--background-workers--notification-system)
9. [Day 7 — Waitlist, Integration Testing & Polish](#day-7--march-7--waitlist-integration-testing--polish)
10. [Day 8 — Production Deployment & Launch Prep](#day-8--march-8--production-deployment--launch-prep)
11. [Risk Register](#risk-register)
12. [Definition of Done](#definition-of-done)

---

## 1. Sprint Overview & Velocity

### 1.1 Daily Theme Map

| Day | Date | Theme | Hours (est.) | Output |
|-----|------|-------|-------------|--------|
| 1 | Mar 1 (Sat) | Foundation & Infrastructure | 10-12h | Docker stack running, all DB tables migrated, project structure ready |
| 2 | Mar 2 (Sun) | Core Services Layer | 10-12h | CryptoService, WalletService, repositories, queues, validation |
| 3 | Mar 3 (Mon) | Bot Handlers: Onboarding | 10-12h | Start → Setup → Import → New Project → Key Display all working |
| 4 | Mar 4 (Tue) | Bot Handlers: Dashboard & Config | 10-12h | Dashboard, config screens, whitelist, delete, referrals, wallets |
| 5 | Mar 5 (Wed) | Webhook + Sell Pipeline | 10-12h | HMAC webhook → dedup → 10-step sell pipeline → Jupiter swap |
| 6 | Mar 6 (Thu) | Workers + Notifications | 10-12h | MCAP monitor, recovery, fee payout, all notification types |
| 7 | Mar 7 (Fri) | Waitlist + Testing + Polish | 10-12h | Waitlist feature, full e2e tests, bug fixes, error handling |
| 8 | Mar 8 (Sat) | Deploy + Launch Prep | 8-10h | VPS → Docker → TLS → webhook → smoke test → channels → checklist |

### 1.2 Deliverable Checklist (End of Sprint)

- [ ] Docker Compose stack with 5 containers running on VPS
- [ ] PostgreSQL with 12 tables migrated (11 core + 1 waitlist)
- [ ] Full bot UI (15+ screens) responding to all commands and callbacks
- [ ] Envelope encryption for all wallet private keys
- [ ] StreamWebhookHandler accepting and verifying QuickNode webhooks
- [ ] 10-step sell execution pipeline processing sells in ~4-7s
- [ ] MarketCapMonitorWorker polling DexScreener every 30s
- [ ] RecoveryWorker scanning for stuck funds every 5 minutes
- [ ] FeePayoutWorker ready for weekly cron
- [ ] Notification system with pinned status + transient auto-delete
- [ ] Waitlist mode active for pre-launch signups
- [ ] Caddy TLS termination on bot.berubot.com
- [ ] Database backup cron configured
- [ ] Telegram community channels created

---

## 2. Dependency Graph

```
T1.1 (Clone template)
  │
  ├─→ T1.2 (Install deps) ─→ T1.4 (Project structure) ─→ ALL Day 2+
  │
  ├─→ T1.3 (Docker Compose) ─→ T1.7 (Verify stack) ─→ ALL Day 2+
  │
  └─→ T1.5 (.env + config.ts) ─→ ALL Day 2+

T1.6 (Drizzle schemas + migration)
  │
  ├─→ T2.4 (Repositories) ─→ ALL Day 3+
  │
  └─→ T1.8 (DB connection module) ─→ T2.4

T2.1 (CryptoService) ─→ T2.2 (WalletService) ─→ T3.5 (Import wallet)
                                                  ─→ T3.8 (Generate project wallet)
                                                  ─→ T5.6 (Ephemeral wallet)

T2.3 (Redis + BullMQ) ─→ T5.3 (Webhook dedup)
                        ─→ T5.5 (Sell worker)
                        ─→ T6.1 (Monitor worker)
                        ─→ T6.2 (Recovery worker)
                        ─→ T6.3 (Fee payout worker)

T3.1 (Bot init) ─→ T3.2 (Start handler) ─→ ALL bot handlers

T5.1 (Hono server) ─→ T5.2 (HMAC middleware) ─→ T5.3 (Webhook handler)
                                                  ─→ T5.4 (Sell queue producer)
                                                  ─→ T5.5 (Sell worker)

T6.4 (NotificationService) ─→ T6.5 (Pinned status) ─→ T5.5 (sell notifications)

T7.1 (Waitlist schema) ─→ T7.2 (Waitlist handlers)

T8.1 (VPS) ─→ T8.2 (Deploy) ─→ T8.3 (TLS) ─→ T8.4 (Webhook registration)
                                              ─→ T8.5 (Smoke test)
                                              ─→ T8.8 (Launch checklist)
```

---

## Day 1 — March 1 — Foundation & Infrastructure

> **Goal:** Get Docker stack running with all 5 containers, all 12 database tables created, project structure matching ARCHITECTURE.md Section 6.2.

### T1.1 — Clone Base Template

| Field | Value |
|-------|-------|
| ID | T1.1 |
| Priority | 🔴 Critical |
| Est. Time | 30 min |
| Depends On | — |
| Ref | `bot-base/telegram-bot-template` (Docker deploy branch) |

**Instructions:**
1. Clone `bot-base/telegram-bot-template` into the `beru-bot` project directory
2. Checkout the `docker-deploy` branch as the base
3. Remove the template's default example handlers, keeping the Grammy.js + Hono skeleton
4. Initialize fresh git history: `git init` (or reset the existing `.git`)

**✅ Acceptance Criteria:**
- Template files are in the project root
- Grammy.js + Hono skeleton compiles with `tsc --noEmit`
- `.git` is initialized with a clean commit: `chore: init from bot-base template`

---

### T1.2 — Install All NPM Dependencies

| Field | Value |
|-------|-------|
| ID | T1.2 |
| Priority | 🔴 Critical |
| Est. Time | 30 min |
| Depends On | T1.1 |
| Ref | ARCHITECTURE.md Section 2 (Technology Stack) |

**Instructions:**
Install ALL packages listed in ARCHITECTURE.md Section 2.3:

```bash
# Core
npm install grammy @grammyjs/conversations @grammyjs/hydrate @grammyjs/parse-mode
npm install hono @hono/node-server
npm install drizzle-orm postgres
npm install bullmq ioredis
npm install @solana/web3.js @solana/spl-token
npm install valibot pino pino-pretty
npm install dotenv

# Dev
npm install -D typescript @types/node tsx drizzle-kit
npm install -D vitest @vitest/coverage-v8
```

**Additional packages** the architecture implies but doesn't list explicitly:
```bash
npm install bs58          # Solana key encoding
npm install node-fetch    # HTTP client for DexScreener / Jupiter APIs (or use native fetch in Node 20)
npm install uuid          # UUID generation if needed
```

**✅ Acceptance Criteria:**
- `package.json` lists all dependencies
- `npm install` completes without errors
- `node_modules/` exists and is in `.gitignore`

---

### T1.3 — Docker Compose Configuration

| Field | Value |
|-------|-------|
| ID | T1.3 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T1.1 |
| Ref | ARCHITECTURE.md Section 3 (Infrastructure & Deployment) |

**Instructions:**
Create the following files exactly as specified in ARCHITECTURE.md:

1. **`docker-compose.yml`** — 5 services: `app`, `worker`, `postgres`, `redis`, `caddy`
   - 2 networks: `beru_internal`, `beru_external`
   - 2 volumes: `pg_data`, `redis_data`
   - Copy the YAML from ARCHITECTURE.md Section 3.2

2. **`Dockerfile`** — Multi-stage build (base → deps → build → app/worker targets)
   - Copy from ARCHITECTURE.md Section 3.5

3. **`Caddyfile`** — Reverse proxy config
   - Copy from ARCHITECTURE.md Section 3.4
   - Domain: `bot.berubot.com`

4. **`.dockerignore`** — Exclude `node_modules`, `.git`, `*.md`, etc.

**✅ Acceptance Criteria:**
- `docker compose config` validates without errors
- `docker compose up -d postgres redis` starts PostgreSQL and Redis
- `docker compose logs postgres` shows "database system is ready to accept connections"
- `docker compose logs redis` shows "Ready to accept connections"

---

### T1.4 — Project Directory Structure

| Field | Value |
|-------|-------|
| ID | T1.4 |
| Priority | 🔴 Critical |
| Est. Time | 45 min |
| Depends On | T1.1, T1.2 |
| Ref | ARCHITECTURE.md Section 6.2 (Directory Structure) |

**Instructions:**
Create the complete directory structure from ARCHITECTURE.md Section 6.2. Create placeholder `index.ts` barrel files where needed:

```
src/
├── app.ts                    # Bot + Hono server entry point
├── worker.ts                 # Worker entry point
├── config.ts                 # Environment config
├── bot/
│   ├── index.ts              # Bot factory (createBot)
│   ├── handlers/
│   │   ├── start.ts
│   │   ├── home.ts
│   │   ├── quick-setup.ts
│   │   ├── new-project.ts
│   │   ├── dashboard.ts
│   │   ├── my-projects.ts
│   │   ├── wallets.ts
│   │   ├── referrals.ts
│   │   ├── config-screens.ts
│   │   ├── whitelist.ts
│   │   ├── delete-project.ts
│   │   └── waitlist.ts
│   ├── keyboards/
│   │   ├── home.keyboard.ts
│   │   ├── dashboard.keyboard.ts
│   │   ├── config.keyboard.ts
│   │   ├── whitelist.keyboard.ts
│   │   ├── projects.keyboard.ts
│   │   └── waitlist.keyboard.ts
│   ├── callback-data/
│   │   └── index.ts
│   ├── middlewares/
│   │   ├── message-management.ts
│   │   ├── rate-limit.ts
│   │   ├── debounce.ts
│   │   └── smart-detection.ts
│   └── helpers/
│       ├── message-builder.ts
│       └── video-sender.ts
├── server/
│   ├── index.ts              # Hono app factory
│   ├── routes/
│   │   ├── quicknode.ts      # Webhook route
│   │   ├── health.ts         # Health check
│   │   └── waitlist.ts       # Waitlist count API
│   └── middlewares/
│       └── hmac-verify.ts
├── services/
│   ├── crypto.service.ts
│   ├── wallet.service.ts
│   ├── project.service.ts
│   ├── queue.service.ts
│   ├── notification.service.ts
│   ├── dexscreener.service.ts
│   ├── jupiter.service.ts
│   └── solana.service.ts
├── workers/
│   ├── sell-execution.worker.ts
│   ├── market-cap-monitor.worker.ts
│   ├── recovery.worker.ts
│   ├── fee-payout.worker.ts
│   └── notification.consumer.ts
├── db/
│   ├── index.ts              # Drizzle client init
│   ├── schema/
│   │   ├── index.ts          # barrel export
│   │   ├── enums.ts
│   │   ├── users.ts
│   │   ├── wallets.ts
│   │   ├── projects.ts
│   │   ├── project-features.ts
│   │   ├── whitelist-entries.ts
│   │   ├── transactions.ts
│   │   ├── ephemeral-wallets.ts
│   │   ├── fee-ledger.ts
│   │   ├── referrals.ts
│   │   ├── referral-payouts.ts
│   │   ├── audit-log.ts
│   │   └── waitlist-entries.ts
│   └── repositories/
│       ├── user.repository.ts
│       ├── wallet.repository.ts
│       ├── project.repository.ts
│       ├── project-feature.repository.ts
│       ├── whitelist.repository.ts
│       ├── transaction.repository.ts
│       ├── ephemeral-wallet.repository.ts
│       ├── fee-ledger.repository.ts
│       ├── referral.repository.ts
│       ├── audit-log.repository.ts
│       └── waitlist.repository.ts
└── utils/
    ├── constants.ts          # All numeric constants from ARCHITECTURE.md 15.7
    ├── errors.ts             # Custom error classes
    └── logger.ts             # Pino logger factory
```

Also create:
- `drizzle.config.ts` at project root
- `tsconfig.json` updated for strict mode, paths, outDir: `dist/`

**✅ Acceptance Criteria:**
- All directories and files exist (files can be empty or have basic exports)
- `tsc --noEmit` passes
- Import paths resolve correctly

---

### T1.5 — Environment Configuration

| Field | Value |
|-------|-------|
| ID | T1.5 |
| Priority | 🔴 Critical |
| Est. Time | 1h |
| Depends On | T1.1 |
| Ref | ARCHITECTURE.md Section 15.3 (Environment Variables) |

**Instructions:**
1. Create `.env.example` with ALL variables from ARCHITECTURE.md Section 15.3 (with empty/placeholder values)
2. Create `.env` (gitignored) with development values:
   - `BOT_MODE=polling` (for local dev)
   - `DB_HOST=localhost` (or `postgres` for Docker)
   - `REDIS_HOST=localhost` (or `redis` for Docker)
   - Generate a test `MASTER_KEY_SECRET` (64 hex chars)
3. Create `src/config.ts`:
   - Load with `dotenv`
   - Validate ALL env vars using Valibot schemas
   - Export typed config object
   - Fail fast on missing required vars with clear error messages

**`src/config.ts` must export:**
```typescript
export const config = {
  bot: { token, mode, webhookSecret, admins, domain, username },
  db: { user, password, name, host, port, url },
  redis: { host, port, url },
  security: { masterKeySecret, qnWebhookSecret },
  solana: { rpcUrl, platformFeeWallet, platformFeePercentage },
  quicknode: { streamId, apiKey, kvStoreId },
  referral: { tier1Pct, tier2Pct, userDiscountPct, minPayoutSol },
  logging: { level },
}
```

**✅ Acceptance Criteria:**
- `.env.example` has all 25+ env vars documented
- `src/config.ts` validates and exports typed config
- Missing `BOT_TOKEN` throws: `"Missing required env: BOT_TOKEN"`
- Config is importable from any module: `import { config } from '@/config'`

---

### T1.6 — Database Schemas (Drizzle ORM)

| Field | Value |
|-------|-------|
| ID | T1.6 |
| Priority | 🔴 Critical |
| Est. Time | 2.5h |
| Depends On | T1.2, T1.4 |
| Ref | ARCHITECTURE.md Section 5.2 (All Tables), Section 15.7 (Enums), COMMUNITY_AND_GROWTH_STRATEGY.md Section 7.4 (Waitlist) |

**Instructions:**
Implement all Drizzle ORM schemas. Create 12 tables + 7 enums:

**Enums** (`src/db/schema/enums.ts`):
- `featureTypeEnum`: `shadow_sell`, `monarch_limit`, `phantom_swap`, `legion_volume`, `eternal_dca`
- `featureStatusEnum`: `idle`, `pending`, `watching`, `executing`, `completed`, `stopped`, `error`
- `walletSourceEnum`: `imported`, `generated`
- `transactionStatusEnum`: `pending`, `funding`, `swapping`, `sweeping`, `completed`, `failed`, `recovery_needed`
- `ephemeralStatusEnum`: `created`, `funded`, `swapping`, `completed`, `recovery_needed`, `recovered`, `failed`
- `feeCollectionStatusEnum`: `pending`, `collected`, `failed`
- `payoutStatusEnum`: `pending`, `sent`, `confirmed`, `failed`

**Tables** (one file per table in `src/db/schema/`):
1. `users` — telegram_id (unique), username, first_name, referral_code (unique), referred_by_user_id, payout_wallet_address, timestamps
2. `wallets` — user_id FK, public_key (unique), encrypted_private_key, encryption_iv, encryption_salt, encryption_auth_tag, source (enum), is_assigned, timestamps
3. `projects` — user_id FK, wallet_id FK, token_mint, token_name, token_symbol, token_decimals, dex_url, deleted_at (soft delete), timestamps. Unique constraint: `(user_id, token_mint)` WHERE `deleted_at IS NULL`
4. `project_features` — project_id FK, feature_type (enum), status (enum), config (JSONB), is_watching_transactions, pinned_message_id, stats (JSONB), timestamps
5. `whitelist_entries` — project_feature_id FK, wallet_address, timestamps
6. `transactions` — project_feature_id FK, type (feature_type enum), status (transaction_status enum), trigger_tx_signature, trigger_buyer_address, trigger_buy_amount_sol, sell_amount_tokens, sell_percentage, sell_tx_signature, received_sol, error_message, timestamps
7. `ephemeral_wallets` — transaction_id FK, public_key, encrypted_private_key, encryption_iv, encryption_salt, encryption_auth_tag, status (ephemeral_status enum), recovery_attempts, timestamps
8. `fee_ledger` — transaction_id FK (unique), gross_fee, effective_fee, referral_discount, tier1_share, tier1_user_id, tier2_share, tier2_user_id, platform_net, collection_status (enum), collection_tx_signature, timestamps
9. `referrals` — referrer_id FK (users), referred_id FK (users), tier (1 or 2), timestamps
10. `referral_payouts` — user_id FK, amount_sol, tx_signature, status (payout_status enum), period_start, period_end, timestamps
11. `audit_log` — user_id FK (nullable), event_type, event_data (JSONB), ip_address, timestamps. Index: `(user_id, created_at)`
12. `waitlist_entries` — telegram_id (unique), username, first_name, position, referred_by (self-ref on telegram_id), referral_count, source, status (`waiting`/`notified`/`activated`), joined_at, notified_at, activated_at, timestamps

**Config JSONB interface** for Shadow Sell (reference in `src/db/schema/project-features.ts`):
```typescript
interface ShadowSellConfig {
  min_sell_percentage: number // default 5
  max_sell_percentage: number // default 20
  min_market_cap_usd: number // default 0 (disabled)
  min_buy_amount_sol: number // default 0.1
}
```

**Barrel export** (`src/db/schema/index.ts`):
- Export all tables and enums from a single barrel file

**Migration:**
- Create `drizzle.config.ts` at project root
- Run `npx drizzle-kit generate` to create migration files in `drizzle/` directory
- Run `npx drizzle-kit migrate` against the Docker PostgreSQL instance

**✅ Acceptance Criteria:**
- All 12 table schemas compile
- All 7 enums are defined
- `npx drizzle-kit generate` produces migration SQL
- `npx drizzle-kit migrate` applies successfully to PostgreSQL
- `\dt` in psql shows all 12 tables
- Indexes from ARCHITECTURE.md Section 5.3 are created

---

### T1.7 — Verify Docker Stack

| Field | Value |
|-------|-------|
| ID | T1.7 |
| Priority | 🟡 High |
| Est. Time | 30 min |
| Depends On | T1.3, T1.6 |
| Ref | ARCHITECTURE.md Section 3 |

**Instructions:**
1. Run `docker compose up -d` — all 5 containers should start
2. Verify PostgreSQL: `docker compose exec postgres psql -U beru -d beru_bot -c '\dt'`
3. Verify Redis: `docker compose exec redis redis-cli ping` → `PONG`
4. Verify app container starts (even if it immediately errors on missing bot token, the container should build)
5. Check logs: `docker compose logs --tail=20`
6. Verify networks: `docker network ls | grep beru`

**✅ Acceptance Criteria:**
- All 5 containers are in `running` or `healthy` state
- PostgreSQL has all 12 tables
- Redis responds to `PING`
- Both Docker networks exist (`beru_internal`, `beru_external`)

---

### T1.8 — Database Connection Module

| Field | Value |
|-------|-------|
| ID | T1.8 |
| Priority | 🔴 Critical |
| Est. Time | 30 min |
| Depends On | T1.5, T1.6 |
| Ref | ARCHITECTURE.md Section 5, Drizzle ORM docs |

**Instructions:**
Create `src/db/index.ts`:
1. Initialize `postgres` client from `postgres` npm package using `config.db.url`
2. Initialize Drizzle ORM client with all schema imports
3. Export the `db` instance for use across the application
4. Include connection error handling and retry logic

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config'
import * as schema from './schema'

const client = postgres(config.db.url)
export const db = drizzle(client, { schema })
```

**✅ Acceptance Criteria:**
- `db` is importable from `@/db`
- A simple query like `db.select().from(schema.users)` executes without error against Docker PostgreSQL
- Connection uses the URL from config

---

### T1.9 — Logger & Constants Setup

| Field | Value |
|-------|-------|
| ID | T1.9 |
| Priority | 🟡 High |
| Est. Time | 30 min |
| Depends On | T1.4, T1.5 |
| Ref | ARCHITECTURE.md Section 13.1 (Logging), Section 15.7 (Constants) |

**Instructions:**

1. **`src/utils/logger.ts`**:
   - Create Pino logger instance with `config.logging.level`
   - Add `name: 'beru-bot'` or `name: 'beru-worker'` based on process
   - Use `pino-pretty` in development mode only

2. **`src/utils/constants.ts`**:
   - Export ALL numeric constants from ARCHITECTURE.md Section 15.7
   - Use TypeScript `as const` for type safety
   - Group by category: SECURITY, BULLMQ, TIMING, LIMITS, FEE

3. **`src/utils/errors.ts`**:
   - Create custom error classes:
     - `AppError` (base)
     - `ValidationError`
     - `CryptoError`
     - `SolanaError`
     - `WebhookError`
     - `RateLimitError`

**✅ Acceptance Criteria:**
- Logger outputs structured JSON in production, pretty-printed in dev
- All constants from Section 15.7 are exported and typed
- Error classes have proper `name` properties and optional `cause`

---

## Day 2 — March 2 — Core Services Layer

> **Goal:** Implement all foundational services that bot handlers and workers depend on — encryption, wallet management, queue producers, data access repositories, and input validation.

### T2.1 — CryptoService (Envelope Encryption)

| Field | Value |
|-------|-------|
| ID | T2.1 |
| Priority | 🔴 Critical |
| Est. Time | 2h |
| Depends On | T1.5 (config), T1.9 (constants) |
| Ref | ARCHITECTURE.md Section 4.2–4.3 (full implementation code provided) |

**Instructions:**
Implement `src/services/crypto.service.ts` exactly as specified in ARCHITECTURE.md Section 4.3.

**Key implementation details:**
1. **Master Encryption Key (MEK)** derivation:
   - Input: `MASTER_KEY_SECRET` from env (64 hex chars = 32 bytes)
   - Method: PBKDF2 with 600,000 iterations, SHA-512, per-wallet random salt (32 bytes)
   - Output: 256-bit AES key (MEK)

2. **Encrypt flow:** `plaintext → generate random DEK → AES-256-GCM encrypt plaintext with DEK → AES-256-GCM encrypt DEK with MEK → return { encryptedData, encryptedDek, iv, salt, authTag }`

3. **Decrypt flow:** `{ encryptedData, encryptedDek, iv, salt, authTag } → derive MEK from salt → AES-256-GCM decrypt DEK with MEK → AES-256-GCM decrypt data with DEK → return plaintext`

4. **Memory safety:** Zero out all Buffer instances containing plaintext keys using `.fill(0)` in `finally` blocks

**MUST comply with invariants** (ARCHITECTURE.md Section 15.9):
- Invariant 1: MASTER_KEY_SECRET never in DB, logs, or network
- Invariant 2: Plaintext keys zeroed from memory after use
- Invariant 3: Private keys never in log output
- Invariant 4: 2-layer envelope encryption for all wallets

**✅ Acceptance Criteria:**
- Encrypt then decrypt roundtrip returns original plaintext
- Different salts produce different ciphertexts for the same plaintext
- Wrong MASTER_KEY_SECRET fails to decrypt (throws `CryptoError`)
- No plaintext key data leaks to console/logs during operation
- Unit tests: minimum 5 test cases (roundtrip, wrong key, tampered data, different salts, memory zeroing)

---

### T2.2 — WalletService

| Field | Value |
|-------|-------|
| ID | T2.2 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T2.1 (CryptoService), T1.6 (wallet schema) |
| Ref | ARCHITECTURE.md Section 4.2, 5.2 (wallets table) |

**Instructions:**
Implement `src/services/wallet.service.ts`:

1. **`generateWallet()`**: Generate a new Solana keypair using `@solana/web3.js Keypair.generate()`, encrypt the private key with CryptoService, store in DB, return public key.

2. **`importWallet(privateKeyBase58: string, userId: string)`**: Decode the base58 private key, validate it's a valid Solana keypair, encrypt with CryptoService, store in DB with `source: 'imported'`, return public key. **MUST zero** the input key buffer after encryption.

3. **`decryptWalletKey(walletId: string)`**: Fetch wallet record from DB, decrypt private key using CryptoService, log audit event `wallet.decrypt`, return Keypair. Caller is responsible for zeroing after use.

4. **`assignWalletToProject(walletId: string, projectId: string)`**: Set `is_assigned = true` on the wallet.

5. **`getWalletsByUser(userId: string)`**: Return all wallets for a user with public keys only (never return encrypted data to handlers).

**✅ Acceptance Criteria:**
- Generated wallet has valid Solana public key (32-44 chars, base58)
- Imported wallet round-trips correctly (import → decrypt → matches original)
- Audit log entry created on every `decryptWalletKey` call
- Private key input buffer is zeroed after import
- Wallet stored with all encryption fields populated (encrypted_private_key, iv, salt, auth_tag)

---

### T2.3 — Redis Connection & BullMQ Queue Setup

| Field | Value |
|-------|-------|
| ID | T2.3 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T1.3 (Docker Redis), T1.5 (config) |
| Ref | ARCHITECTURE.md Section 15.2 (Queue Registry), 15.8 (Redis Key Patterns) |

**Instructions:**

1. **Redis connection** (`src/db/redis.ts` or `src/services/redis.ts`):
   - Create IORedis client from `config.redis.url`
   - Export for use by BullMQ and direct Redis commands (dedup, locks, rate limits)
   - Handle reconnection events with logging

2. **Queue definitions** (`src/services/queue.service.ts`):
   - Define 5 BullMQ queues per ARCHITECTURE.md Section 15.2:
     - `sell-queue` — sell execution jobs
     - `notification-queue` — Telegram notification jobs
     - `monitor` — repeatable MCAP monitor (30s)
     - `recovery` — repeatable recovery scan (5min)
     - `fee-payout` — weekly cron
   - Export producer methods:
     - `enqueueSellJob(data: SellJobData)`
     - `enqueueNotification(data: NotificationData)`
   - Configure sell-queue with: `concurrency: 5`, `limiter: { max: 10, duration: 60000 }`

3. **Type definitions** for job data:
```typescript
interface SellJobData {
  tokenMint: string
  buyerAddress: string
  buyAmountSol: number
  triggerTxSignature: string
}

interface NotificationData {
  telegramId: number
  type: string
  data: Record<string, unknown>
}
```

**✅ Acceptance Criteria:**
- Redis client connects to Docker Redis
- All 5 queues are instantiated
- `enqueueSellJob()` adds a job to the sell-queue
- `enqueueNotification()` adds a job to the notification-queue
- Redis key patterns from Section 15.8 are documented as constants

---

### T2.4 — Repository Layer (Data Access)

| Field | Value |
|-------|-------|
| ID | T2.4 |
| Priority | 🔴 Critical |
| Est. Time | 3h |
| Depends On | T1.6 (schemas), T1.8 (db connection) |
| Ref | ARCHITECTURE.md Section 5.2, 15.4 (Entity Quick Map), 15.10 (File-to-Concept Map) |

**Instructions:**
Create all repository files in `src/db/repositories/`. Each repository encapsulates Drizzle queries for one entity.

**Repositories to implement:**

1. **`user.repository.ts`**
   - `findByTelegramId(id: number)` → User | null
   - `create(data: NewUser)` → User
   - `updatePayoutWallet(userId: string, address: string)` → void
   - `findByReferralCode(code: string)` → User | null

2. **`wallet.repository.ts`**
   - `create(data: NewWallet)` → Wallet
   - `findById(id: string)` → Wallet | null
   - `findByPublicKey(pubkey: string)` → Wallet | null
   - `findByUserId(userId: string)` → Wallet[]
   - `setAssigned(walletId: string, assigned: boolean)` → void

3. **`project.repository.ts`**
   - `create(data: NewProject)` → Project
   - `findById(id: string)` → Project | null (exclude soft-deleted)
   - `findByUserIdAndMint(userId: string, mint: string)` → Project | null
   - `findAllByUserId(userId: string)` → Project[] (exclude soft-deleted)
   - `countByUserId(userId: string)` → number
   - `softDelete(id: string)` → void

4. **`project-feature.repository.ts`**
   - `create(data: NewProjectFeature)` → ProjectFeature
   - `findByProjectId(projectId: string)` → ProjectFeature | null
   - `updateStatus(id: string, status: FeatureStatus)` → void
   - `updateConfig(id: string, config: ShadowSellConfig)` → void
   - `setWatching(id: string, watching: boolean)` → void
   - `findAllWatching()` → ProjectFeature[] (for monitor worker)
   - `updatePinnedMessageId(id: string, messageId: number)` → void
   - `updateStats(id: string, stats: object)` → void

5. **`whitelist.repository.ts`**
   - `create(featureId: string, address: string)` → WhitelistEntry
   - `findByFeatureId(featureId: string)` → WhitelistEntry[]
   - `delete(id: string)` → void
   - `countByFeatureId(featureId: string)` → number
   - `isWhitelisted(featureId: string, address: string)` → boolean

6. **`transaction.repository.ts`**
   - `create(data: NewTransaction)` → Transaction
   - `updateStatus(id: string, status: TransactionStatus, extra?: Partial<Transaction>)` → void
   - `findPendingByFeatureId(featureId: string)` → Transaction[]

7. **`ephemeral-wallet.repository.ts`**
   - `create(data: NewEphemeralWallet)` → EphemeralWallet
   - `updateStatus(id: string, status: EphemeralStatus)` → void
   - `findRecoveryNeeded()` → EphemeralWallet[] (for recovery worker)
   - `incrementRecoveryAttempts(id: string)` → void

8. **`fee-ledger.repository.ts`**
   - `create(data: NewFeeLedger)` → FeeLedger
   - `findByTransactionId(txId: string)` → FeeLedger | null
   - `findPendingPayouts(userId: string, periodStart: Date, periodEnd: Date)` → FeeLedger[]

9. **`referral.repository.ts`**
   - `create(referrerId: string, referredId: string, tier: number)` → Referral
   - `findReferrer(userId: string)` → { tier1: User | null, tier2: User | null }
   - `findReferredUsers(userId: string)` → User[]
   - `getEarnings(userId: string)` → { total: number, pending: number }

10. **`audit-log.repository.ts`**
    - `create(event: AuditEvent)` → void
    - `findByUserId(userId: string, limit?: number)` → AuditLog[]

11. **`waitlist.repository.ts`**
    - `join(data: WaitlistJoinData)` → { position: number, referralLink: string }
    - `findByTelegramId(id: number)` → WaitlistEntry | null
    - `getCount()` → number
    - `findAllWaiting()` → WaitlistEntry[]
    - `markNotified(ids: string[])` → void

**Design rules:**
- Every repository function takes and returns plain objects (not Drizzle internals)
- Use `eq()`, `and()`, `isNull()` from drizzle-orm for query building
- Respect soft-delete: always exclude `deleted_at IS NOT NULL` in project queries (Invariant 12)
- Respect unique constraints from Section 15.9 (Invariant 13)

**✅ Acceptance Criteria:**
- All 11 repository files exist with typed methods
- Basic CRUD operations work against Docker PostgreSQL
- Soft-delete filter is present in all project queries
- Methods return properly typed entities

---

### T2.5 — Valibot Validation Schemas

| Field | Value |
|-------|-------|
| ID | T2.5 |
| Priority | 🟡 High |
| Est. Time | 1h |
| Depends On | T1.4 |
| Ref | beru_bot_interface_and_flow.md Section 9.1 (Input Validation Errors) |

**Instructions:**
Create `src/utils/validation.ts` with Valibot schemas for all user inputs:

1. **Solana private key**: Valid base58, 64/88 bytes when decoded, produces valid keypair
2. **Solana public key (CA)**: Base58, 32-44 chars, `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`
3. **Solana wallet address**: Same as public key validation
4. **Min/Max Sell %**: Number, 1–100, integer
5. **Min MCAP**: Number, ≥ 0 (0 = disabled), max 1 trillion
6. **Min Buy Amount**: Number, ≥ 0.001 SOL, max 10,000 SOL
7. **Custom percentage input**: Parseable as number, within allowed range
8. **Custom SOL amount input**: Parseable as number, within allowed range
9. **Custom USD amount input**: Parseable as number, within allowed range

Error messages should match exactly what's specified in `beru_bot_interface_and_flow.md` Section 9.1.

**✅ Acceptance Criteria:**
- All 9 validators exist and return typed results
- Invalid inputs produce specific error messages (not generic "invalid")
- Edge cases handled: empty string, negative numbers, NaN, Infinity, extremely large numbers

---

### T2.6 — ProjectService & DexScreenerService

| Field | Value |
|-------|-------|
| ID | T2.6 |
| Priority | 🟡 High |
| Est. Time | 1.5h |
| Depends On | T2.2 (WalletService), T2.4 (Repositories) |
| Ref | ARCHITECTURE.md Section 6 (Core Services), beru_bot_interface_and_flow.md (Token Found screen) |

**Instructions:**

1. **`src/services/dexscreener.service.ts`**:
   - `fetchTokenInfo(mintAddress: string)`: Call DexScreener API, return `{ name, symbol, decimals, priceUsd, marketCapUsd, dexUrl, imageUrl }` or `null` if not found
   - Timeout: 10 seconds
   - Rate limit: respect DexScreener limits (no burst)
   - Cache results in memory for 60 seconds to avoid duplicate API calls

2. **`src/services/project.service.ts`**:
   - `createProject(userId: string, walletId: string, tokenMint: string, tokenInfo: TokenInfo)`:
     - Check project count limit (MAX_PROJECTS_PER_USER = 3, Invariant 13)
     - Check duplicate (user_id + token_mint, Invariant 13)
     - Generate new wallet for project (via WalletService)
     - Create project record
     - Create project_feature record with default Shadow Sell config
     - Log audit event `project.create`
     - Return project with feature
   - `deleteProject(projectId: string, userId: string)`:
     - Stop any active feature first
     - Soft-delete project
     - Unassign wallet
     - Log audit event `project.delete`
   - `getProjectDashboard(projectId: string)`: Return full project data with feature, config, and stats

**✅ Acceptance Criteria:**
- DexScreener returns token info for valid Solana token mints
- `createProject` enforces MAX_PROJECTS_PER_USER limit
- `createProject` rejects duplicate token mints for same user
- Default Shadow Sell config values match: `{ min_sell: 5, max_sell: 20, min_mcap: 0, min_buy: 0.1 }`
- Audit logs are created for project lifecycle events

---

## Day 3 — March 3 — Bot Handlers: Onboarding & Projects

> **Goal:** Full onboarding flow works — from `/start` through Quick Setup / Import Wallet through New Project creation to Key Display. Smart CA detection active for all text messages.

### T3.1 — Bot Initialization & Middleware Stack

| Field | Value |
|-------|-------|
| ID | T3.1 |
| Priority | 🔴 Critical |
| Est. Time | 1h |
| Depends On | T1.5 (config), T2.3 (Redis) |
| Ref | ARCHITECTURE.md Section 6.1, bot-base template patterns |

**Instructions:**
Create `src/bot/index.ts`:

1. Initialize Grammy.js Bot instance with `config.bot.token`
2. Install plugins: `@grammyjs/hydrate`, `@grammyjs/parse-mode`, `@grammyjs/conversations`
3. Define session type with:
   - `lastNavMessageId?: number` — tracks Navigation-category message for deletion
   - `inputState?: { type: string, projectId?: string }` — tracks awaited input context
   - `user?: { id: string, telegramId: number }` — cached user record
4. Register middleware stack (order matters):
   - Rate limit middleware (30/min per user)
   - Button debounce middleware (1s cooldown)
   - User resolution middleware (ensure user exists in DB, create if not)
   - Message management middleware (delete prior nav messages)
5. Register all command handlers
6. Register all callback query handlers
7. Register text message handler (smart detection)
8. Export `createBot()` factory function

**✅ Acceptance Criteria:**
- Bot responds to `/start` with a basic message (handler registered)
- Session persists `lastNavMessageId` across interactions
- Rate limit blocks excessive messages (>30/min)
- User is auto-created in DB on first interaction

---

### T3.2 — Start Command & Welcome/Home Screens

| Field | Value |
|-------|-------|
| ID | T3.2 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T3.1, T2.4 (user repository) |
| Ref | beru_bot_interface_and_flow.md SCR_WELCOME, SCR_HOME |

**Instructions:**
Implement `src/bot/handlers/start.ts`:

1. **Deep link parsing** — Parse `ctx.match` for:
   - No param → normal flow
   - `ref_{telegramId}` → post-launch referral
   - `wl_{telegramId}` → waitlist referral
   - `website` / `community` → source tracking

2. **First-time user** → Show `SCR_WELCOME`:
   - Send video `VID_WELCOME` (or placeholder image if video not ready)
   - Message text exactly as in interface doc Section 3.3
   - Inline keyboard: `Quick Setup | My Projects | Wallets | Referrals | Support`
   - Delete all prior messages in chat
   - Store `lastNavMessageId` in session

3. **Returning user** → Show `SCR_HOME`:
   - Send video `VID_HOME` (or placeholder)
   - Message text with user's stats (projects count, active features)
   - Same inline keyboard
   - Delete prior navigation message

4. **Referral handling**: If `ref_{telegramId}` param, create referral record (tier 1), and if the referrer has a referrer, create tier 2 referral record.

**Keyboard** (`src/bot/keyboards/home.keyboard.ts`):
```
Row 1: [⚡ Quick Setup]
Row 2: [📁 My Projects] [🔧 New Project]
Row 3: [👛 Wallets]
Row 4: [🎁 Referrals] [📞 Support]
```

Callback data: `cb_quick_setup`, `cb_my_projects`, `cb_new_project`, `cb_wallets`, `cb_referrals`, `cb_support`

**✅ Acceptance Criteria:**
- `/start` shows welcome screen for brand new users
- `/start` shows home screen for returning users
- Referral deep links create DB records
- Navigation message ID is stored in session
- Prior navigation message is deleted when new one is sent

---

### T3.3 — Message Management Middleware

| Field | Value |
|-------|-------|
| ID | T3.3 |
| Priority | 🔴 Critical |
| Est. Time | 1h |
| Depends On | T3.1 |
| Ref | beru_bot_interface_and_flow.md Section 2 (Message Management System) |

**Instructions:**
Implement `src/bot/middlewares/message-management.ts`:

**4 message categories** (from interface doc):
1. **Navigation**: Replace previous nav message (delete old, send new, store ID)
2. **Pinned Status**: Additive — never delete, pin in chat
3. **Transient**: Auto-delete after timer (30s/45s/60s)
4. **Sensitive**: Auto-delete after 24h, use spoiler formatting

**Middleware behavior:**
- Before sending any Navigation message: delete `session.lastNavMessageId` if it exists
- After sending: store new message ID in `session.lastNavMessageId`
- For Transient messages: use `setTimeout` to delete after specified duration
- For Sensitive messages: schedule deletion after 24h (or use `setTimeout` if practical)
- For user-pasted private keys: delete the user's message IMMEDIATELY (Invariant 7)

**Helper functions** in `src/bot/helpers/message-builder.ts`:
- `sendNavigationMessage(ctx, text, keyboard, options?)` — handles delete+send+store
- `sendTransientMessage(ctx, text, deleteAfterMs)` — sends and schedules auto-delete
- `sendSensitiveMessage(ctx, text, keyboard, deleteAfterMs)` — sends with spoiler, schedules delete
- `sendPinnedStatusMessage(ctx, text)` — sends and pins
- `updatePinnedStatusMessage(ctx, messageId, newText)` — edits existing pinned message

**✅ Acceptance Criteria:**
- Sending a navigation message deletes the previous one
- Transient messages disappear after their timer
- User-pasted text for private keys is immediately deleted
- No orphaned messages accumulate in the chat

---

### T3.4 — Rate Limit & Debounce Middlewares

| Field | Value |
|-------|-------|
| ID | T3.4 |
| Priority | 🟡 High |
| Est. Time | 45 min |
| Depends On | T2.3 (Redis) |
| Ref | ARCHITECTURE.md Section 15.7 (Constants), 15.8 (Redis Key Patterns) |

**Instructions:**

1. **`src/bot/middlewares/rate-limit.ts`**:
   - Redis key: `rate:{telegramId}` with TTL 60s
   - `INCR` on each message, reject if > `RATE_LIMIT_MESSAGES` (30)
   - On reject: send transient message "⚠️ Too many messages. Please slow down." (30s auto-delete)

2. **`src/bot/middlewares/debounce.ts`**:
   - Redis key: `debounce:{telegramId}:{callbackData}` with TTL 1s (SET NX)
   - If key exists → `answerCallbackQuery` with empty string (swallow the duplicate click)
   - Prevents double-tap on inline buttons

**✅ Acceptance Criteria:**
- Rapid clicks on the same button only process the first one within 1 second
- Sending >30 messages in 60 seconds triggers rate limit warning
- Rate limit resets after 60 seconds

---

### T3.5 — Quick Setup & Wallet Import Flow

| Field | Value |
|-------|-------|
| ID | T3.5 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T2.2 (WalletService), T3.3 (message management) |
| Ref | beru_bot_interface_and_flow.md SCR_QUICK_SETUP, SCR_WALLET_IMPORTED |

**Instructions:**
Implement `src/bot/handlers/quick-setup.ts`:

1. **SCR_QUICK_SETUP** (triggered by `cb_quick_setup` or `/wallets`):
   - Navigation message: "👛 Paste your Solana wallet private key to import it."
   - Set `session.inputState = { type: 'import_wallet' }`
   - Inline keyboard: `[🏠 Home]`

2. **Private key input handling** (in smart detection middleware):
   - When `session.inputState.type === 'import_wallet'` and user sends text:
     - **IMMEDIATELY delete user's message** (Invariant 7)
     - Validate private key with Valibot schema
     - If invalid: send transient error "❌ Invalid private key format" (30s)
     - If valid: call `WalletService.importWallet(key, userId)`
     - If wallet already exists: send transient error "⚠️ This wallet is already imported"
     - If success: show SCR_WALLET_IMPORTED

3. **SCR_WALLET_IMPORTED**:
   - Navigation message: "✅ Wallet imported successfully!\n\n👛 `{publicKey}`"
   - Inline keyboard: `[🔧 New Project] [🏠 Home]`
   - Clear `session.inputState`

**✅ Acceptance Criteria:**
- User's private key message is deleted within 1 second of receipt
- Valid key imports successfully and shows confirmation with public key
- Invalid key shows specific error message
- Duplicate wallet import is rejected
- Session input state is cleared after completion

---

### T3.6 — Smart CA Detection Middleware

| Field | Value |
|-------|-------|
| ID | T3.6 |
| Priority | 🔴 Critical |
| Est. Time | 1h |
| Depends On | T3.1, T2.4 (project repository) |
| Ref | beru_bot_interface_and_flow.md Section 12.4 (Smart Input Detection Rules) |

**Instructions:**
Implement `src/bot/middlewares/smart-detection.ts`:

**Priority order for every incoming text message:**
1. **Command check**: `/^\/.+/` → route to command handler (Grammy handles this)
2. **Solana CA check**: `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/` →
   - Delete user's message immediately
   - Check if user has existing project with this token mint
     - YES → redirect to SCR_DASHBOARD for that project
     - NO → enter new project flow (SCR_TOKEN_FOUND)
3. **Active input state check**: If `session.inputState` exists →
   - Route to appropriate handler based on `inputState.type`
   - Delete user's message immediately (for sensitive inputs)
4. **Fallback**: Silently ignore (no response)

**✅ Acceptance Criteria:**
- Pasting a Solana CA immediately creates or navigates to a project
- The user's CA message is deleted
- Input-state-aware routing works (e.g., config value, private key)
- Non-matching messages are silently ignored

---

### T3.7 — New Project Flow (CA Input → Token Found → Confirm)

| Field | Value |
|-------|-------|
| ID | T3.7 |
| Priority | 🔴 Critical |
| Est. Time | 2h |
| Depends On | T2.6 (DexScreenerService, ProjectService), T3.6 (CA detection) |
| Ref | beru_bot_interface_and_flow.md SCR_NEW_PROJECT_CA_INPUT, SCR_TOKEN_FOUND, SCR_TOKEN_NOT_FOUND |

**Instructions:**
Implement `src/bot/handlers/new-project.ts`:

1. **SCR_NEW_PROJECT_CA_INPUT** (triggered by `cb_new_project` or `/new`):
   - Check project count < MAX_PROJECTS_PER_USER (3)
   - If at limit: send transient error "⚠️ Maximum 3 projects allowed. Delete a project to add a new one." (30s)
   - Navigation message: "📋 Paste a Solana token contract address (CA) to create a new project."
   - Set `session.inputState = { type: 'new_project_ca' }`
   - Keyboard: `[🏠 Home]`

2. **Token validation** (when CA is detected by smart middleware):
   - Call `DexScreenerService.fetchTokenInfo(mint)`
   - If not found → show SCR_TOKEN_NOT_FOUND:
     - "❌ Token not found on any DEX. Make sure the contract address is correct."
     - Keyboard: `[🔄 Try Again] [🏠 Home]`
   - If found → show SCR_TOKEN_FOUND with token info:
     - Display: name, symbol, price, market cap, DEX
     - Ask user to select wallet (list imported wallets) or use auto-generated wallet
     - Keyboard: `[✅ Confirm — {tokenName}] [❌ Cancel]`

3. **Confirm** (`cb_confirm_project:{tokenMint}`):
   - Call `ProjectService.createProject(userId, walletId, tokenMint, tokenInfo)`
   - Generate a project-specific wallet (auto-generated or imported)
   - Show SCR_PROJECT_KEY (see T3.8)

**✅ Acceptance Criteria:**
- Valid CA shows token info from DexScreener
- Invalid/unknown CA shows "Token not found" screen
- User can confirm and create a project
- Project count limit is enforced
- Duplicate token mint for same user is rejected

---

### T3.8 — Project Key Display Screen

| Field | Value |
|-------|-------|
| ID | T3.8 |
| Priority | 🔴 Critical |
| Est. Time | 45 min |
| Depends On | T2.2 (WalletService), T3.7 |
| Ref | beru_bot_interface_and_flow.md SCR_PROJECT_KEY |

**Instructions:**
Implement key display in `src/bot/handlers/new-project.ts`:

1. **SCR_PROJECT_KEY** — Sensitive message category:
   - Decrypt the project wallet's private key (one-time display)
   - Send message with **Telegram spoiler formatting**: `||{privateKey}||`
   - Include public key in plain text
   - Warning text: "⚠️ Save this key securely! This message will be auto-deleted in 24 hours."
   - Keyboard: `[✅ I've Saved It — Go to Dashboard]`
   - Schedule auto-delete: 24 hours (`KEY_DISPLAY_DELETE_AFTER = 86400s`)
   - Log audit event: `wallet.decrypt`

2. **Acknowledge** (`cb_key_acknowledged:{projectId}`):
   - Navigate to SCR_DASHBOARD for the newly created project
   - Delete the key display message immediately (don't wait for 24h timer)

**✅ Acceptance Criteria:**
- Private key is shown with Telegram spoiler tags (`||key||`)
- Message auto-deletes after 24 hours if not acknowledged
- Acknowledging immediately deletes the message and shows dashboard
- Audit log records the key display event

---

## Day 4 — March 4 — Bot Handlers: Dashboard, Config & CRUD

> **Goal:** Full dashboard with all config screens, whitelist CRUD, project deletion, referrals, and wallets screens. All 15+ bot screens are functional.

### T4.1 — Project Dashboard (SCR_DASHBOARD)

| Field | Value |
|-------|-------|
| ID | T4.1 |
| Priority | 🔴 Critical |
| Est. Time | 2h |
| Depends On | T2.4 (repositories), T3.7 (project creation) |
| Ref | beru_bot_interface_and_flow.md SCR_DASHBOARD (V1) |

**Instructions:**
Implement `src/bot/handlers/dashboard.ts`:

1. **Dashboard V1 rendering** (V1 for MVP — all config inline):
   - Fetch project + feature + stats from DB
   - Build message with:
     - Token name, symbol, CA (abbreviated), DEX link
     - Project wallet public key
     - Feature status indicator (🟢 Active / 🔴 Stopped / ⏳ Pending)
     - Current config values (Min Sell%, Max Sell%, Min MCAP, Min Buy)
     - Stats: total sells, total SOL received (if any)

2. **Inline keyboard** (state-aware per ARCHITECTURE.md Section 8.4):
   - **When `idle` or `stopped`:**
     ```
     [Min Sell: 5%] [Max Sell: 20%]
     [Min MCAP: $0] [Min Buy: 0.1 SOL]
     [📋 Whitelist (0)]
     [▶️ Start Shadow Sell]
     [📁 My Projects] [🏠 Home]
     [🗑 Delete Project]
     ```
   - **When `watching` or `executing`:**
     - Config buttons are **disabled** (show values but no callback, or use "locked" text)
     - Replace Start with `[⏹ Stop Shadow Sell]`
     - Add `[🔄 Refresh]`
   - Button callbacks: `cb_config_min_sell:{projectId}`, `cb_start:{projectId}`, etc.

3. **Refresh handler** (`cb_refresh:{projectId}`):
   - Re-fetch data and update the existing message (edit, don't send new)

**✅ Acceptance Criteria:**
- Dashboard shows correct project info and config values
- Config buttons are clickable when idle/stopped, disabled when watching/executing (Invariant 23)
- Start/Stop button changes based on feature status
- Refresh updates the message in-place
- Delete button present

---

### T4.2 — Config Screens (5 Sub-Screens)

| Field | Value |
|-------|-------|
| ID | T4.2 |
| Priority | 🔴 Critical |
| Est. Time | 2.5h |
| Depends On | T4.1 (dashboard), T2.5 (validation) |
| Ref | beru_bot_interface_and_flow.md SCR_CONFIG_MIN_SELL, SCR_CONFIG_MAX_SELL, SCR_CONFIG_MIN_MCAP, SCR_CONFIG_MIN_BUY |

**Instructions:**
Implement `src/bot/handlers/config-screens.ts`:

Each config screen follows the same pattern:
1. Show current value + preset buttons + custom input option
2. User selects preset → update config → return to dashboard
3. User selects "Custom" → enter input mode → validate → update → return to dashboard

**5 Config Screens:**

**a) Min Sell %** (`cb_config_min_sell:{projectId}`):
- Presets: `[1%] [3%] [5%] [10%] [15%] [Custom]`
- Current value highlighted
- Callback: `cb_set_min_sell:{value}:{projectId}`
- Validation: 1–100, integer, must be ≤ max_sell

**b) Max Sell %** (`cb_config_max_sell:{projectId}`):
- Presets: `[10%] [15%] [20%] [30%] [50%] [Custom]`
- Callback: `cb_set_max_sell:{value}:{projectId}`
- Validation: 1–100, integer, must be ≥ min_sell

**c) Min MCAP** (`cb_config_min_mcap:{projectId}`):
- Presets: `[$0 (Off)] [$10K] [$50K] [$100K] [$500K] [Custom]`
- Callback: `cb_set_min_mcap:{value}:{projectId}`
- Validation: ≥ 0 (0 = disabled)

**d) Min Buy Amount** (`cb_config_min_buy:{projectId}`):
- Presets: `[0.1 SOL] [0.5 SOL] [1 SOL] [2 SOL] [5 SOL] [Custom]`
- Callback: `cb_set_min_buy:{value}:{projectId}`
- Validation: ≥ 0.001 SOL

**e) Custom input mode** (when "Custom" is selected):
- Set `session.inputState = { type: 'config_{field}', projectId }`
- Message: "Enter a custom value for {field}:"
- On valid input: update config, return to dashboard
- On invalid: show specific error, let user retry
- Cancel: `cb_cancel_config:{projectId}` → return to dashboard

**After any config update:**
- Update `project_features.config` JSONB in DB
- Log audit event: `config.change` with old_value and new_value
- Return to dashboard (re-render)

**✅ Acceptance Criteria:**
- All 5 config screens render with preset buttons
- Preset selection immediately updates and returns to dashboard
- Custom input validates and shows specific errors
- Config changes are persisted to DB
- Audit log tracks all config changes
- Cross-validation works (min_sell ≤ max_sell)

---

### T4.3 — Whitelist CRUD

| Field | Value |
|-------|-------|
| ID | T4.3 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T2.4 (whitelist repository), T4.1 (dashboard) |
| Ref | beru_bot_interface_and_flow.md SCR_WHITELIST, SCR_ADD_WHITELIST |

**Instructions:**
Implement `src/bot/handlers/whitelist.ts`:

1. **SCR_WHITELIST** (`cb_config_whitelist:{projectId}`):
   - List all whitelisted wallets with pagination (5 per page)
   - Each entry: abbreviated address + `[🗑]` remove button
   - Keyboard:
     ```
     [wallet1...abc] [🗑]
     [wallet2...def] [🗑]
     [➕ Add Wallet]
     [◀️ Prev] [▶️ Next]      (if multiple pages)
     [🔙 Back to Project]
     ```
   - Show count: "📋 Whitelist ({count}/25)"

2. **Add Whitelist** (`cb_add_whitelist:{projectId}`):
   - Check limit: MAX_WHITELIST_ENTRIES = 25
   - If at limit: show transient error
   - Set `session.inputState = { type: 'add_whitelist', projectId }`
   - Message: "Paste a Solana wallet address to whitelist:"
   - Validate address format
   - Check for duplicates
   - Save to DB

3. **Remove Whitelist** (`cb_remove_whitelist:{walletAddress}:{projectId}`):
   - Delete from DB immediately
   - Re-render whitelist screen

**✅ Acceptance Criteria:**
- Whitelist shows all entries with pagination
- Add validates Solana address format
- Duplicate addresses are rejected
- 25-entry limit is enforced
- Remove immediately updates the list

---

### T4.4 — My Projects & Wallets Screens

| Field | Value |
|-------|-------|
| ID | T4.4 |
| Priority | 🟡 High |
| Est. Time | 1h |
| Depends On | T2.4 (repositories), T3.2 (home screen) |
| Ref | beru_bot_interface_and_flow.md SCR_MY_PROJECTS, SCR_WALLETS |

**Instructions:**

1. **SCR_MY_PROJECTS** (`cb_my_projects` or `/projects`):
   Implement `src/bot/handlers/my-projects.ts`:
   - List all user's non-deleted projects
   - Each project as a button: `[{tokenSymbol} — {status emoji}]`
   - Selecting a project → navigates to SCR_DASHBOARD
   - Keyboard:
     ```
     [TOKEN1 — 🟢]
     [TOKEN2 — 🔴]
     [🔧 New Project]
     [🏠 Home]
     ```
   - Empty state: "No projects yet. Create your first project!"
   - Callback: `cb_select_project:{projectId}`

2. **SCR_WALLETS** (`cb_wallets` or `/wallets`):
   Implement `src/bot/handlers/wallets.ts`:
   - List all imported wallets with public keys
   - Show which wallets are assigned to projects
   - Keyboard:
     ```
     [⚡ Quick Setup (Import New)]
     [🏠 Home]
     ```

**✅ Acceptance Criteria:**
- My Projects shows all projects with correct status indicators
- Selecting a project navigates to its dashboard
- Wallets shows all imported wallets
- Empty states have helpful messages

---

### T4.5 — Delete Project Flow

| Field | Value |
|-------|-------|
| ID | T4.5 |
| Priority | 🟡 High |
| Est. Time | 45 min |
| Depends On | T4.1 (dashboard), T2.6 (ProjectService) |
| Ref | beru_bot_interface_and_flow.md SCR_DELETE_CONFIRM |

**Instructions:**
Implement `src/bot/handlers/delete-project.ts`:

1. **SCR_DELETE_CONFIRM** (`cb_delete_project:{projectId}`):
   - Warning message: "⚠️ Are you sure you want to delete {tokenName}?\n\nThis will stop all active features and cannot be undone."
   - If feature is active (watching/executing): extra warning about stopping
   - Keyboard: `[🗑 Yes, Delete] [🔙 Keep Project]`

2. **Confirm delete** (`cb_confirm_delete:{projectId}`):
   - Call `ProjectService.deleteProject(projectId, userId)`
   - Navigate to SCR_MY_PROJECTS
   - Send transient notification: "✅ Project deleted." (30s)

3. **Cancel** (`cb_cancel_delete:{projectId}`):
   - Return to SCR_DASHBOARD

**✅ Acceptance Criteria:**
- Confirmation screen shows before deletion
- Active features are stopped before deletion
- Soft-delete is used (deleted_at set, not hard delete)
- User is redirected to My Projects after deletion

---

### T4.6 — Referrals & Payout Wallet Screens

| Field | Value |
|-------|-------|
| ID | T4.6 |
| Priority | 🟡 High |
| Est. Time | 1.5h |
| Depends On | T2.4 (referral repository) |
| Ref | beru_bot_interface_and_flow.md SCR_REFERRALS, SCR_SET_PAYOUT_WALLET |

**Instructions:**
Implement `src/bot/handlers/referrals.ts`:

1. **SCR_REFERRALS** (`cb_referrals` or `/rewards`):
   - Show referral stats:
     - Referral link: `https://t.me/BeruMonarchBot?start=ref_{telegramId}`
     - Total referrals count
     - Tier 1 count + Tier 2 count
     - Total earnings (SOL)
     - Pending payout (SOL)
     - Payout wallet (if set)
   - Keyboard:
     ```
     [📋 Copy Referral Link]
     [👛 Set Payout Wallet]
     [🏠 Home]
     ```

2. **SCR_SET_PAYOUT_WALLET** (`cb_set_payout_wallet`):
   - Message: "Paste a Solana wallet address for referral payouts:"
   - Set `session.inputState = { type: 'set_payout_wallet' }`
   - Validate Solana address
   - Save to `users.payout_wallet_address`
   - Show confirmation + return to referrals

3. **Copy Referral Link**: Use Telegram's copy-to-clipboard pattern (the link is displayed in the message, user can tap to copy)

**✅ Acceptance Criteria:**
- Referral stats display correctly
- Payout wallet can be set/updated
- Referral link follows format: `https://t.me/BeruMonarchBot?start=ref_{telegramId}`
- Earnings show correct totals from fee_ledger

---

### T4.7 — Shadow Sell Activation (Start/Stop)

| Field | Value |
|-------|-------|
| ID | T4.7 |
| Priority | 🔴 Critical |
| Est. Time | 2h |
| Depends On | T4.1 (dashboard), T2.3 (BullMQ), T2.4 (repositories) |
| Ref | beru_bot_interface_and_flow.md (Shadow Sell Activation), ARCHITECTURE.md Section 8.1 (FSM) |

**Instructions:**
Add start/stop handlers to `src/bot/handlers/dashboard.ts`:

1. **Start Shadow Sell** (`cb_start:{projectId}`):
   **Pre-flight checks** (from interface doc):
   - ✅ Wallet has token balance > 0
   - ✅ Config is valid (min_sell ≤ max_sell, all values set)
   - If checks fail: send transient error with specific reason (30s)

   **If checks pass:**
   - Transition feature status: `idle` → `pending` → `watching` (ARCHITECTURE.md Section 8.1)
   - Set `is_watching_transactions = true`
   - Add token mint to watched-token cache (and sync to QuickNode KV)
   - Send state alert: "⚡ Shadow Sell is now WATCHING for buys" (transient, 30s)
   - Create Pinned Status Message (MSG_PINNED_STATUS) — initial state:
     ```
     ⚔️ Shadow Sell — Active

     Token: {name} ({symbol})
     Status: 👁️ Watching
     Sells: 0 | SOL: 0.000

     Config: {min}–{max}% | MCAP ≥ ${mcap} | Buy ≥ {buy} SOL
     ```
   - Pin this message in chat
   - Store `pinned_message_id` in project_feature
   - Disable config buttons on dashboard (Invariant 23)

2. **Stop Shadow Sell** (`cb_stop:{projectId}`):
   - Transition feature status: `watching`/`executing` → `stopped`
   - Set `is_watching_transactions = false`
   - Remove token mint from watched-token cache (sync to QN KV)
   - Update Pinned Status Message to:
     ```
     ⚔️ Shadow Sell — Stopped

     Token: {name} ({symbol})
     Status: ⏹ Stopped by user
     Total Sells: {n} | Total SOL: {x}
     ```
   - Re-enable config buttons on dashboard
   - Send state alert: "⏹ Shadow Sell stopped" (transient, 30s)

**✅ Acceptance Criteria:**
- Pre-flight checks prevent activation with invalid config or zero balance
- Feature transitions follow FSM rules from Section 8.1
- Pinned status message is created and pinned on start
- Pinned status message is updated on stop
- Config buttons are disabled during active state (Invariant 23)
- QuickNode KV is updated with watched tokens

---

## Day 5 — March 5 — Webhook Intake & Sell Execution Pipeline

> **Goal:** Full sell pipeline operational — QuickNode webhook → HMAC verify → dedup → enqueue → 10-step sell execution → Jupiter swap → sweep + fee → notify.

### T5.1 — Hono HTTP Server Setup

| Field | Value |
|-------|-------|
| ID | T5.1 |
| Priority | 🔴 Critical |
| Est. Time | 45 min |
| Depends On | T1.5 (config) |
| Ref | ARCHITECTURE.md Section 3, 6.1, bot-base template |

**Instructions:**
Create `src/server/index.ts`:

1. Initialize Hono app
2. Register routes:
   - `POST /webhook/quicknode` → StreamWebhookHandler (T5.3)
   - `POST /webhook/telegram` → Grammy webhook handler (from bot-base template)
   - `GET /health` → Health check endpoint (T5.1b)
   - `GET /api/waitlist/count` → Waitlist count (T7.3)
3. Global error handler middleware
4. Request logging middleware (Pino)

**Health check** (`src/server/routes/health.ts`):
```json
{
  "status": "ok",
  "uptime": 12345,
  "version": "2.0.0",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "bot": "running"
  }
}
```

**Entry point** integration (`src/app.ts`):
- Start Grammy bot
- Start Hono server on port 3000
- Bot uses webhook mode (in production) or polling mode (in dev)

**✅ Acceptance Criteria:**
- Hono server starts on port 3000
- `/health` returns 200 with JSON status
- Bot receives Telegram updates via webhook (or polling in dev)
- QuickNode webhook route is registered

---

### T5.2 — HMAC-SHA256 Webhook Verification Middleware

| Field | Value |
|-------|-------|
| ID | T5.2 |
| Priority | 🔴 Critical |
| Est. Time | 1h |
| Depends On | T5.1, T1.5 (config.security.qnWebhookSecret) |
| Ref | ARCHITECTURE.md Section 4.4 (QuickNode Webhook Security) |

**Instructions:**
Implement `src/server/middlewares/hmac-verify.ts`:

1. Extract headers:
   - `x-qn-signature` — HMAC-SHA256 signature
   - `x-qn-timestamp` — Unix timestamp
   - `x-qn-nonce` — Unique nonce

2. **Timestamp validation** (Invariant 6):
   - Reject if `|now - timestamp| > WEBHOOK_TIMESTAMP_TOLERANCE` (30 seconds)
   - Audit log: `auth.webhook_reject` with reason `timestamp_expired`

3. **Nonce deduplication** (Section 15.8):
   - Redis key: `nonce:{nonceValue}` with SET NX, TTL 60s
   - If key exists → reject (replay attack)
   - Audit log: `auth.webhook_reject` with reason `nonce_replay`

4. **HMAC verification** (Invariant 5):
   - Compute: `HMAC-SHA256(QN_WEBHOOK_SECRET, timestamp + "." + nonce + "." + body)`
   - Compare with `x-qn-signature` using timing-safe comparison
   - Reject-first, process-second

5. On any rejection: respond 401, log audit event

**✅ Acceptance Criteria:**
- Valid HMAC + fresh timestamp + new nonce → request passes through
- Expired timestamp (>30s old) → 401
- Replayed nonce → 401
- Invalid HMAC → 401
- Timing-safe comparison used (no timing attacks)

---

### T5.3 — StreamWebhookHandler

| Field | Value |
|-------|-------|
| ID | T5.3 |
| Priority | 🔴 Critical |
| Est. Time | 2h |
| Depends On | T5.2 (HMAC), T2.3 (Redis + BullMQ) |
| Ref | ARCHITECTURE.md Section 6.3 (StreamWebhookHandler), 15.8 (Redis dedup) |

**Instructions:**
Implement `src/server/routes/quicknode.ts`:

**Processing pipeline** (5 steps from ARCHITECTURE.md Section 6.3):

1. **HMAC verify** → handled by middleware (T5.2)

2. **Dedup** — Redis `SET NX`:
   - Key: `dedup:{txSignature}`, TTL: `DEDUP_TTL` (300s)
   - If key exists → return 200 OK (already processed, idempotent)

3. **Parse** — Extract from webhook payload:
   - Transaction signature
   - Token mint address
   - Buyer wallet address
   - Buy amount in SOL
   - SPL token transfer details

4. **Lookup** — Check watched-token cache:
   - Is this token mint in our watched set?
   - If NO → return 200 OK (not our concern)
   - If YES → find matching project_feature (must be in `watching` status)
   - Check whitelist: if buyer address is whitelisted → skip (return 200)

5. **Enqueue** — Add to sell-queue:
   ```typescript
   await queueService.enqueueSellJob({
     tokenMint,
     buyerAddress,
     buyAmountSol,
     triggerTxSignature,
   })
   ```

**Watched-token cache** (in-memory Set, rebuilt on boot):
- `Set<string>` of token mints being watched
- Updated when features start/stop watching
- Safety net: refresh from DB every `CACHE_REFRESH_INTERVAL` (60s)

**✅ Acceptance Criteria:**
- Duplicate webhook payloads are deduplicated via Redis
- Non-watched tokens are silently ignored
- Whitelisted buyer addresses are skipped
- Valid buys are enqueued to sell-queue
- Handler always returns 200 (never 5xx to QuickNode)
- Cache miss falls back to DB lookup

---

### T5.4 — Jupiter API Client

| Field | Value |
|-------|-------|
| ID | T5.4 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T1.5 (config) |
| Ref | ARCHITECTURE.md Section 7.2 (Steps 3, 6) |

**Instructions:**
Implement `src/services/jupiter.service.ts`:

1. **`getQuote(inputMint, outputMint, amount, slippageBps)`**:
   - Call Jupiter Quote API v6: `GET https://quote-api.jup.ag/v6/quote`
   - Params: `inputMint`, `outputMint`, `amount`, `slippageBps` (default 50 = 0.5%)
   - Return: quote object with `outAmount`, `routePlan`, `priceImpactPct`

2. **`getSwapTransaction(quoteResponse, userPublicKey)`**:
   - Call Jupiter Swap API: `POST https://quote-api.jup.ag/v6/swap`
   - Body: `{ quoteResponse, userPublicKey, wrapAndUnwrapSol: true }`
   - Return: serialized transaction (base64)

3. **Error handling:**
   - Timeout: 15 seconds per request
   - Retry: 1 retry on 5xx with 2s delay
   - No retry on 4xx (bad input)
   - Log all quote requests with amounts (but never log private keys)

**✅ Acceptance Criteria:**
- Quote returns valid output amount for known token pairs
- Swap transaction returns a serializable transaction
- Timeout and retry logic works
- Errors are properly typed and loggable

---

### T5.5 — Solana Transaction Helpers

| Field | Value |
|-------|-------|
| ID | T5.5 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T1.5 (config.solana) |
| Ref | ARCHITECTURE.md Section 7.2 (pipeline steps) |

**Instructions:**
Implement `src/services/solana.service.ts`:

1. **Solana connection**: Create `Connection` from `config.solana.rpcUrl`

2. **`getTokenBalance(walletPublicKey, tokenMint)`**: Get SPL token balance for a wallet

3. **`getSolBalance(walletPublicKey)`**: Get SOL balance

4. **`buildCombinedFundingTx(fromKeypair, toPublicKey, tokenMint, tokenAmount, solAmount)`**:
   - Single transaction with 2 instructions:
     - Transfer SPL tokens from main wallet to ephemeral wallet
     - Transfer SOL (gas budget) from main wallet to ephemeral wallet
   - This is the "combined TX" optimization from ARCHITECTURE.md Section 7.3

5. **`buildSweepAndFeeTx(ephemeralKeypair, mainWalletPublicKey, platformFeeWallet, feeAmount)`**:
   - Single transaction with 2 instructions:
     - Transfer (SOL balance - fee - rent) from ephemeral to main wallet
     - Transfer fee from ephemeral to platform fee wallet
   - Atomic fee collection (Invariant 18)

6. **`sendAndConfirmTransaction(tx, signers, commitment)`**:
   - Send transaction to Solana network
   - Wait for confirmation with `confirmed` commitment (ADR #5 from Section 15.6)
   - Return transaction signature

7. **`calculateSellAmount(tokenBalance, minPct, maxPct)`**:
   - Generate random percentage between minPct and maxPct
   - Calculate token amount: `balance * (randomPct / 100)`
   - Return `{ percentage, tokenAmount }`

**✅ Acceptance Criteria:**
- Token and SOL balances can be fetched
- Combined funding TX has exactly 2 instructions
- Sweep TX atomically sends SOL to main wallet + fee to platform wallet
- Random sell percentage is within min/max range
- `confirmed` commitment is used (not `finalized`)

---

### T5.6 — SellExecutionWorker (10-Step Pipeline)

| Field | Value |
|-------|-------|
| ID | T5.6 |
| Priority | 🔴 Critical |
| Est. Time | 3h |
| Depends On | T5.4 (Jupiter), T5.5 (Solana), T2.1 (CryptoService), T2.2 (WalletService), T2.3 (BullMQ) |
| Ref | ARCHITECTURE.md Section 7.2 (Full 10-Step Pipeline) |

**Instructions:**
Implement `src/workers/sell-execution.worker.ts`:

**Full 10-step pipeline** — follow ARCHITECTURE.md Section 7.2 EXACTLY:

```
Step 1  → Acquire Redis sell lock (SET NX, TTL 60s)  → fail if locked
Step 2  → Load project feature config, verify status = watching
Step 3  → Parallel pre-flight: [balance check] + [Jupiter quote]
Step 4  → Generate ephemeral wallet (encrypted), save to DB
Step 5  → Build + send combined funding TX (tokens + SOL to ephemeral)
Step 6  → Deserialize Jupiter swap TX, sign with ephemeral key, send
Step 7  → Handle swap result (success → continue, fail → mark recovery_needed)
Step 8  → Build + send sweep TX (SOL to main wallet + fee to platform)
Step 9  → Record transaction + fee ledger entries
Step 10 → Release sell lock, enqueue notification, check if balance = 0
```

**Critical invariants to enforce:**
- Invariant 14: At most ONE sell per project_feature at any time
- Invariant 16: `attempts: 1` on BullMQ job (no automatic retry)
- Invariant 18: Fee collection atomic with sweep
- Invariant 24: `watching → executing` acquires sell lock
- Invariant 25: `executing → watching` releases sell lock
- Invariant 27: If post-sell balance = 0 → transition to `completed`

**Fee calculation** (ARCHITECTURE.md Section 9.1):
```typescript
const grossFee = receivedSol * PLATFORM_FEE_PERCENTAGE // 1%
const referralDiscount = hasReferrer ? grossFee * REFERRAL_USER_DISCOUNT_PCT : 0 // 10%
const effectiveFee = grossFee - referralDiscount
const tier1Share = hasReferrer ? effectiveFee * REFERRAL_TIER1_PCT : 0 // 35%
const tier2Share = hasSubReferrer ? effectiveFee * REFERRAL_TIER2_PCT : 0 // 5%
const platformNet = effectiveFee - tier1Share - tier2Share
```

**Error handling at each step:**
- Steps 1-4: Fail fast, release lock, no on-chain state to recover
- Step 5-6: If TX fails after funding, mark ephemeral as `recovery_needed`
- Step 7: If swap fails, DON'T sweep, mark for recovery
- Step 8-9: If sweep fails, mark for recovery (funds in ephemeral)
- Step 10: Always runs (finally block), always releases lock

**State transitions during pipeline:**
- Entry: `watching` → `executing`
- Success: `executing` → `watching` (or `completed` if balance = 0)
- Failure: `executing` → `watching` (ephemeral goes to recovery flow)

**✅ Acceptance Criteria:**
- Sell lock prevents concurrent sells on same feature
- Ephemeral wallet is generated, encrypted, and stored per-sell
- Combined funding TX sends both tokens and SOL
- Jupiter swap executes from ephemeral wallet
- Sweep atomically returns SOL and collects fee
- Fee ledger entry created with correct calculations
- Notification enqueued after completion
- Failed sells mark ephemeral for recovery
- Zero balance triggers `completed` status

---

## Day 6 — March 6 — Background Workers & Notification System

> **Goal:** All 4 BullMQ workers operational + complete notification system with pinned status messages and auto-delete transients.

### T6.1 — MarketCapMonitorWorker

| Field | Value |
|-------|-------|
| ID | T6.1 |
| Priority | 🔴 Critical |
| Est. Time | 2.5h |
| Depends On | T2.3 (BullMQ), T2.4 (repositories), T2.6 (DexScreenerService) |
| Ref | ARCHITECTURE.md Section 6.5 (Dual-Loop Model) |

**Instructions:**
Implement `src/workers/market-cap-monitor.worker.ts`:

**Dual-loop architecture:**

1. **Hot loop** (every 30s — `MCAP_POLL_INTERVAL`):
   - Fetch all features with `status = watching`
   - For each: call DexScreener API to get current market cap
   - Evaluate against `config.min_market_cap_usd`:
     - If MCAP < threshold and status = `watching`:
       - Transition to `stopped` (paused due to MCAP)
       - Remove from watched-token cache
       - Update pinned status: "⏸️ Paused — MCAP below threshold"
       - Send state alert notification
     - If MCAP ≥ threshold and feature was paused-due-to-MCAP:
       - Transition back to `watching`
       - Add to watched-token cache
       - Update pinned status: "👁️ Watching"
       - Send state alert notification
   - **Hysteresis**: Use a 5% buffer to prevent rapid flapping
     - Stop at: MCAP < threshold
     - Resume at: MCAP > threshold * 1.05

2. **Cold loop** (every 5min — `QN_KV_SYNC_INTERVAL`):
   - Rebuild the full watched-token set from DB
   - Sync to QuickNode KV store via Streams API
   - This ensures eventual consistency even if hot loop misses updates

3. **Redis lock**: Acquire lock before running to prevent overlapping cycles (Invariant 17)

**✅ Acceptance Criteria:**
- Monitor polls DexScreener every 30 seconds
- Features below MCAP threshold are paused
- Features above threshold are resumed
- Hysteresis prevents rapid start/stop cycling
- QuickNode KV is synced every 5 minutes
- Redis lock prevents concurrent monitor runs
- Pinned status messages are updated

---

### T6.2 — RecoveryWorker

| Field | Value |
|-------|-------|
| ID | T6.2 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T2.3 (BullMQ), T5.5 (Solana helpers), T2.1 (CryptoService) |
| Ref | ARCHITECTURE.md Section 6.6 (RecoveryWorker) |

**Instructions:**
Implement `src/workers/recovery.worker.ts`:

**Runs every 5 minutes** (`RECOVERY_INTERVAL`):

1. Query: `SELECT * FROM ephemeral_wallets WHERE status = 'recovery_needed' AND recovery_attempts < MAX_RECOVERY_ATTEMPTS`

2. For each ephemeral wallet:
   - Decrypt private key
   - Check SOL balance
   - Check token balance
   - If has SOL: attempt sweep to main wallet (minus minimum rent)
   - If has tokens: attempt transfer back to main wallet
   - If has both: combined TX
   - On success: update status to `recovered`
   - On failure: increment `recovery_attempts`, keep as `recovery_needed`
   - If `recovery_attempts >= MAX_RECOVERY_ATTEMPTS` (5): mark as `failed`, alert via notification

3. **Memory safety**: Zero all decrypted keys in finally block

**✅ Acceptance Criteria:**
- Stuck funds in ephemeral wallets are recovered
- Max 5 recovery attempts before marking as failed
- Failed recovery triggers admin notification
- Decrypted keys are zeroed after use
- Only processes `recovery_needed` status ephemeral wallets

---

### T6.3 — FeePayoutWorker

| Field | Value |
|-------|-------|
| ID | T6.3 |
| Priority | 🟡 High |
| Est. Time | 1.5h |
| Depends On | T2.3 (BullMQ), T2.4 (referral + fee repositories), T5.5 (Solana helpers) |
| Ref | ARCHITECTURE.md Section 6.7 (FeePayoutWorker), Section 9 (Fee Model) |

**Instructions:**
Implement `src/workers/fee-payout.worker.ts`:

**Weekly cron** (runs every Sunday):

1. Query all users with `tier1_share + tier2_share > REFERRAL_MIN_PAYOUT_SOL` (0.01 SOL) for the current period

2. For each eligible user:
   - Calculate total earnings from fee_ledger entries in the period
   - Check that user has `payout_wallet_address` set
   - If no payout wallet: skip (carry over to next period)
   - Build SOL transfer transaction
   - Send payout
   - Record in `referral_payouts` table with `status: 'sent'`
   - After confirmation: update to `status: 'confirmed'`

3. **Invariant 22**: Skip users below minimum payout (carry over)

4. **Notification**: Send payout notification to each user: "🎁 Referral payout: {amount} SOL sent to {wallet}"

**✅ Acceptance Criteria:**
- Only pays out to users with payout wallet set
- Minimum payout threshold enforced (0.01 SOL)
- Below-threshold amounts carry over to next period
- Payout records created in DB
- Users notified of payouts
- Payout transaction confirmed on-chain

---

### T6.4 — NotificationService

| Field | Value |
|-------|-------|
| ID | T6.4 |
| Priority | 🔴 Critical |
| Est. Time | 2h |
| Depends On | T3.3 (message management), T2.3 (BullMQ notification queue) |
| Ref | ARCHITECTURE.md Section 15.7 (Notification Types), beru_bot_interface_and_flow.md (Message Categories) |

**Instructions:**
Implement `src/services/notification.service.ts`:

1. **Notification consumer** (`src/workers/notification.consumer.ts`):
   - Consumes from `notification-queue` (concurrency: 10)
   - Routes to notification type handlers
   - Handles Telegram API rate limits (retry with backoff)

2. **Notification types** (from ARCHITECTURE.md Section 15.7):

| Type | Message | Auto-Delete |
|------|---------|-------------|
| `sell.completed` | "🗡️ Sell Executed — {amount} {token} → {sol} SOL" | 60s |
| `sell.failed` | "⚠️ Sell Failed — {reason}" | 45s |
| `feature.activated` | "⚡ Shadow Sell is now WATCHING for buys" | 30s |
| `feature.paused` | "⏸️ Shadow Sell paused — MCAP below threshold" | 30s |
| `feature.completed` | "✅ Shadow Sell completed — token balance exhausted" | 30s |
| `feature.error` | "❌ Shadow Sell error — {reason}" | 30s |
| `payout.sent` | "🎁 Referral payout: {amount} SOL sent to {wallet}" | Never |
| `recovery.success` | "🔄 Funds recovered from ephemeral wallet" | 30s |

3. **Auto-delete logic**: After sending, schedule `setTimeout` for the specified duration, then call `deleteMessage`. Store the timeout reference for graceful shutdown cancellation.

**✅ Acceptance Criteria:**
- All 8 notification types are implemented
- Auto-delete timers work correctly
- Telegram rate limits are handled with backoff
- Notification consumer processes from BullMQ queue
- `payout.sent` notifications are persistent (no auto-delete)

---

### T6.5 — Pinned Status Message Lifecycle

| Field | Value |
|-------|-------|
| ID | T6.5 |
| Priority | 🔴 Critical |
| Est. Time | 1h |
| Depends On | T6.4 (NotificationService), T4.7 (Start/Stop) |
| Ref | beru_bot_interface_and_flow.md (MSG_PINNED_STATUS — 5 states) |

**Instructions:**
Extend `src/services/notification.service.ts` or create `src/bot/helpers/pinned-status.ts`:

**5 pinned status message states:**

1. **Initial** (on start):
   ```
   ⚔️ Shadow Sell — Active
   Token: {name} ({symbol})
   Status: 👁️ Watching
   Sells: 0 | SOL: 0.000
   Config: {min}–{max}% | MCAP ≥ ${mcap} | Buy ≥ {buy} SOL
   ```

2. **After sells** (updated after each sell):
   ```
   ⚔️ Shadow Sell — Active
   Token: {name} ({symbol})
   Status: 👁️ Watching
   Sells: {n} | SOL: {total}
   Last: {amount} {token} → {sol} SOL ({time ago})
   Config: {min}–{max}% | MCAP ≥ ${mcap} | Buy ≥ {buy} SOL
   ```

3. **Paused** (MCAP below threshold):
   ```
   ⚔️ Shadow Sell — Paused
   Token: {name} ({symbol})
   Status: ⏸️ MCAP below threshold (${current} < ${min})
   Sells: {n} | SOL: {total}
   ```

4. **Stopped** (user stopped):
   ```
   ⚔️ Shadow Sell — Stopped
   Token: {name} ({symbol})
   Status: ⏹ Stopped by user
   Total Sells: {n} | Total SOL: {total}
   ```

5. **Completed** (balance exhausted):
   ```
   ⚔️ Shadow Sell — Completed ✅
   Token: {name} ({symbol})
   Status: ✅ Token balance exhausted
   Total Sells: {n} | Total SOL: {total}
   ```

**Implementation:**
- Use `ctx.api.editMessageText()` to update existing pinned message (never send new)
- Get `pinned_message_id` from `project_features` table
- After each sell: update stats in project_features.stats JSONB, then update pinned message
- Handle "message not modified" error gracefully (no-op)

**✅ Acceptance Criteria:**
- Pinned message is created when Shadow Sell starts
- Pinned message updates after each sell with new stats
- Pinned message reflects pause/stop/complete states
- "Message not modified" errors are handled silently
- Stats persist in DB across bot restarts

---

### T6.6 — Worker Entry Point & Bootstrap

| Field | Value |
|-------|-------|
| ID | T6.6 |
| Priority | 🔴 Critical |
| Est. Time | 1h |
| Depends On | T5.6, T6.1, T6.2, T6.3, T6.4 |
| Ref | ARCHITECTURE.md Section 12 (Boot Architecture), 12.2 (Shutdown) |

**Instructions:**
Implement `src/worker.ts`:

**Boot sequence:**
1. Load config
2. Initialize logger
3. Connect to PostgreSQL
4. Connect to Redis
5. Register BullMQ workers:
   - SellExecutionWorker (concurrency: 5)
   - MarketCapMonitorWorker (repeatable: every 30s)
   - RecoveryWorker (repeatable: every 5min)
   - FeePayoutWorker (cron: `0 0 * * 0` — Sunday midnight)
   - NotificationConsumer (concurrency: 10) — NOTE: runs in app container, not worker
6. Log: "Worker started — all consumers registered"

**Graceful shutdown** (ARCHITECTURE.md Section 12.2):
- Trap `SIGTERM` and `SIGINT`
- Call `worker.close()` on each BullMQ worker (waits for active jobs)
- Timeout: `GRACEFUL_SHUTDOWN_TIMEOUT` (30s)
- Close DB and Redis connections
- Log: "Worker shutdown complete"
- `process.exit(0)`

**App entry point** (`src/app.ts`):
- Boot sequence for the app process:
  1. Load config, logger
  2. Connect to DB and Redis
  3. Build watched-token cache from DB
  4. Initialize Grammy bot
  5. Initialize Hono server
  6. Start Hono on port 3000
  7. Set Telegram webhook (production) or start polling (dev)
  8. Register NotificationConsumer in app process
  9. Log: "App started — bot and server ready"

**✅ Acceptance Criteria:**
- Worker process starts and registers all 4 workers
- App process starts bot + HTTP server
- Graceful shutdown waits for active jobs before exiting
- Both processes can be started independently

---

## Day 7 — March 7 — Waitlist, Integration Testing & Polish

> **Goal:** Waitlist feature complete, all features integration-tested, bugs fixed, error handling verified.

### T7.1 — Waitlist Bot Handlers

| Field | Value |
|-------|-------|
| ID | T7.1 |
| Priority | 🟡 High |
| Est. Time | 2h |
| Depends On | T2.4 (waitlist repository), T3.2 (start handler) |
| Ref | COMMUNITY_AND_GROWTH_STRATEGY.md Section 7 (Pre-Launch Waitlist Feature) |

**Instructions:**
Implement `src/bot/handlers/waitlist.ts`:

**Pre-launch mode**: During pre-launch (before March 9), ALL `/start` interactions route to waitlist flow instead of normal onboarding. Use a feature flag or env var: `PRE_LAUNCH_MODE=true`.

1. **Welcome Screen (Waitlist mode)**:
   ```
   ⚔️ Beru Bot
   Your Strongest Soldier on Solana

   Shadow Sell, Volume Generation,
   Limit Orders, and more — coming soon.

   Be among the first to command the shadows.
   ```
   Keyboard:
   ```
   [🎯 Join the Waitlist]
   [📢 Announcements]  (URL: t.me/BeruBotAnnouncements)
   [💬 Community]       (URL: t.me/BeruBotCommunity)
   [🌐 Website]        (URL: berubot.com)
   ```

2. **Join Waitlist** (`cb_join_waitlist`):
   - Call `waitlistRepository.join()` with position calculation logic from COMMUNITY doc Section 7.5
   - Show confirmation:
     ```
     ✅ You're on the waitlist!

     Your position: #{position}

     Want to move up? Share your referral link:
     t.me/BeruMonarchBot?start=wl_{telegramId}

     Each friend who joins moves you up 1 spot.
     ```
   - Keyboard:
     ```
     [📋 Copy Referral Link]
     [📊 Check My Position]
     [📢 Join Announcements]
     [💬 Join Community]
     ```

3. **Check Position** (`cb_check_position`):
   - Fetch current position and referral stats
   - Show status screen

4. **Referral flow** (when user arrives via `?start=wl_{referrerId}`):
   - Join waitlist (if not already joined)
   - Credit referrer: position - 1 (min 1), referral_count + 1
   - Notify referrer: "🎉 Someone joined via your link! Your new position: #{newPos} (was #{oldPos})"

5. **Feature flag**: When `PRE_LAUNCH_MODE=false` (post-launch), the `/start` command should route to normal flow and waitlist buttons should be hidden.

**✅ Acceptance Criteria:**
- New users see waitlist welcome in pre-launch mode
- Join creates a waitlist entry with incrementing position
- Referral links credit the referrer and bump their position
- Referrer receives notification when someone joins via their link
- Position check shows accurate stats
- Feature flag switches between waitlist and normal mode

---

### T7.2 — Waitlist Count API Endpoint

| Field | Value |
|-------|-------|
| ID | T7.2 |
| Priority | 🟢 Low |
| Est. Time | 30 min |
| Depends On | T7.1, T5.1 (Hono server) |
| Ref | COMMUNITY_AND_GROWTH_STRATEGY.md Section 7.8 (Website Integration) |

**Instructions:**
Implement `src/server/routes/waitlist.ts`:

```
GET /api/waitlist/count
Response: { count: number, lastUpdated: string }
```

- Cache result in Redis with 5-minute TTL (`waitlist:count`)
- Rate limit: 60 requests/minute (to prevent abuse)

**✅ Acceptance Criteria:**
- Returns current waitlist count
- Response is cached in Redis (5min TTL)
- Second call within 5min returns cached value

---

### T7.3 — Integration Testing

| Field | Value |
|-------|-------|
| ID | T7.3 |
| Priority | 🔴 Critical |
| Est. Time | 4h |
| Depends On | All Day 1-6 tasks |
| Ref | All 3 spec documents |

**Instructions:**
Test all critical flows end-to-end. Testing can be manual (interactive bot testing) and/or automated (Vitest):

**Flow 1 — Complete Onboarding:**
1. `/start` → welcome screen appears
2. Quick Setup → paste private key → key deleted, wallet imported
3. New Project → paste CA → token found → confirm → wallet generated → key displayed
4. Acknowledge key → dashboard with project

**Flow 2 — Configuration:**
5. Dashboard → change Min Sell to 10% (preset) → saved, dashboard updates
6. Dashboard → change Max Sell to custom 25% → saved
7. Dashboard → add whitelist address → appears in list
8. Dashboard → remove whitelist → list updates
9. All config validation: invalid values show specific errors

**Flow 3 — Shadow Sell Activation:**
10. Start Shadow Sell → pre-flight checks pass → status changes to watching
11. Pinned status message created and pinned
12. Config buttons disabled on dashboard
13. Stop → status changes back, config re-enabled

**Flow 4 — Sell Pipeline (if possible to test):**
14. Send mock webhook payload → handler processes → sell job enqueued
15. Verify dedup: same webhook → not re-processed
16. Verify whitelist skip: whitelisted buyer → skipped

**Flow 5 — Fee Calculation:**
17. Verify: 1 SOL received → 0.01 SOL gross fee
18. Verify: with referrer → 0.009 effective fee → 0.00315 tier1 share
19. Verify: fee ledger record matches calculation

**Flow 6 — Error Handling (from interface doc Section 9):**
20. Empty private key → "Please paste a valid Solana private key"
21. Invalid CA → "Token not found"
22. 4th project → "Maximum 3 projects allowed"
23. 26th whitelist entry → "Maximum 25 wallets allowed"
24. Min Sell > Max Sell → specific error
25. Start with 0 balance → "Wallet has no token balance"

**Flow 7 — Referrals:**
26. `/start ref_123` → referral created
27. Referral screen shows correct stats
28. Payout wallet can be set

**Flow 8 — State Machine:**
29. Verify all valid transitions from Section 8.1 FSM
30. Verify invalid transitions are rejected

**✅ Acceptance Criteria:**
- All 30 test cases pass
- No unhandled exceptions in logs
- All error messages match interface doc specifications
- Fee calculations are mathematically correct
- State machine transitions are valid

---

### T7.4 — Bug Fixes & Code Polish

| Field | Value |
|-------|-------|
| ID | T7.4 |
| Priority | 🟡 High |
| Est. Time | 2h |
| Depends On | T7.3 |

**Instructions:**
- Fix all bugs discovered during integration testing
- Review all TODO/FIXME comments in code
- Ensure all error messages match the interface document exactly
- Verify all audit log events are firing
- Check for memory leaks (especially in notification timers)
- Verify Docker containers restart cleanly
- Run `tsc --noEmit` — zero TypeScript errors
- Run linter (if configured) — zero warnings

**✅ Acceptance Criteria:**
- Zero TypeScript compilation errors
- All integration test cases pass after fixes
- No unhandled promise rejections
- Logs are clean (no spurious errors)

---

## Day 8 — March 8 — Production Deployment & Launch Prep

> **Goal:** Application running in production on VPS with TLS, webhooks configured, community channels created, smoke-tested, and ready for March 9 launch.

### T8.1 — VPS Provisioning

| Field | Value |
|-------|-------|
| ID | T8.1 |
| Priority | 🔴 Critical |
| Est. Time | 1h |
| Depends On | — (can start independently) |
| Ref | ARCHITECTURE.md Section 11 (MVP Constraints — resource budget) |

**Instructions:**
1. Provision a 4-core VPS (Ubuntu 22.04 LTS recommended)
   - 4 vCPU, 8GB RAM, 80GB SSD
   - Provider: any (Hetzner, DigitalOcean, Contabo, etc.)
2. Install Docker Engine + Docker Compose v2
3. Install `ufw` firewall — allow ports 22 (SSH), 80, 443 only
4. Create non-root user with sudo access
5. Configure SSH key authentication (disable password auth)
6. Set hostname: `beru-bot-prod`

**✅ Acceptance Criteria:**
- VPS is accessible via SSH
- Docker is installed and running
- Firewall allows only 22, 80, 443
- Password auth disabled

---

### T8.2 — Production Deployment

| Field | Value |
|-------|-------|
| ID | T8.2 |
| Priority | 🔴 Critical |
| Est. Time | 2h |
| Depends On | T8.1, All Day 1-7 |
| Ref | ARCHITECTURE.md Section 3 (Infrastructure) |

**Instructions:**
1. Clone/push repo to VPS
2. Create `.env` on VPS with production values:
   - Real `BOT_TOKEN` from @BotFather
   - Strong `DB_PASSWORD` (generate: `openssl rand -hex 32`)
   - Real `MASTER_KEY_SECRET` (generate: `openssl rand -hex 32`) — **BACK THIS UP SECURELY**
   - Real `QN_WEBHOOK_SECRET` from QuickNode
   - Production `SOLANA_RPC_URL` (QuickNode endpoint)
   - Real `PLATFORM_FEE_WALLET` address
   - `BOT_MODE=webhook`
   - `DOMAIN=bot.berubot.com`
3. Build and start: `docker compose up -d --build`
4. Run migrations: `docker compose exec app npx drizzle-kit migrate`
5. Verify all 5 containers are running: `docker compose ps`
6. Check logs: `docker compose logs --tail=50`

**✅ Acceptance Criteria:**
- All 5 containers running and healthy
- Database has all 12 tables
- App container logs: "App started — bot and server ready"
- Worker container logs: "Worker started — all consumers registered"

---

### T8.3 — Caddy TLS & Domain Configuration

| Field | Value |
|-------|-------|
| ID | T8.3 |
| Priority | 🔴 Critical |
| Est. Time | 30 min |
| Depends On | T8.2 |
| Ref | ARCHITECTURE.md Section 3.4 (Caddyfile) |

**Instructions:**
1. Point DNS: `bot.berubot.com` → VPS IP address (A record)
2. Wait for DNS propagation (check with `dig bot.berubot.com`)
3. Caddy will automatically obtain Let's Encrypt TLS certificate
4. Verify HTTPS: `curl https://bot.berubot.com/health`

**✅ Acceptance Criteria:**
- `https://bot.berubot.com/health` returns 200 with valid TLS
- Certificate is from Let's Encrypt
- HTTP → HTTPS redirect works

---

### T8.4 — Webhook Registration

| Field | Value |
|-------|-------|
| ID | T8.4 |
| Priority | 🔴 Critical |
| Est. Time | 30 min |
| Depends On | T8.3 |
| Ref | ARCHITECTURE.md Section 3, 4.4 |

**Instructions:**
1. **Telegram webhook**: Set via Bot API:
   ```
   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://bot.berubot.com/webhook/telegram&secret_token={BOT_WEBHOOK_SECRET}
   ```
   Verify: `https://api.telegram.org/bot{TOKEN}/getWebhookInfo`

2. **QuickNode Stream webhook**:
   - Go to QuickNode dashboard → Streams
   - Create/update Stream to send webhooks to: `https://bot.berubot.com/webhook/quicknode`
   - Set webhook signing secret in QuickNode dashboard
   - Configure Stream filter for SPL token transfers on monitored mints

**✅ Acceptance Criteria:**
- Telegram webhook is set and verified
- QuickNode Stream webhook is configured and test payload received
- Bot responds to `/start` via webhook (not polling)

---

### T8.5 — Database Backup Cron

| Field | Value |
|-------|-------|
| ID | T8.5 |
| Priority | 🟡 High |
| Est. Time | 30 min |
| Depends On | T8.2 |
| Ref | ARCHITECTURE.md Section 13.3 (Database Backup) |

**Instructions:**
Set up daily database backup with the cron job from ARCHITECTURE.md:

```bash
# Add to VPS crontab:
0 3 * * * docker compose exec -T postgres pg_dump -U beru beru_bot | gzip > /backups/beru_$(date +\%Y\%m\%d).sql.gz

# Create backup directory
mkdir -p /backups

# Retention: keep last 7 days
find /backups -name "*.sql.gz" -mtime +7 -delete
```

**✅ Acceptance Criteria:**
- Cron job is registered (`crontab -l` shows entry)
- Manual test: backup file is created and valid
- Backup can be restored: `gunzip < backup.sql.gz | psql -U beru beru_bot`

---

### T8.6 — Production Smoke Testing

| Field | Value |
|-------|-------|
| ID | T8.6 |
| Priority | 🔴 Critical |
| Est. Time | 1.5h |
| Depends On | T8.4 |

**Instructions:**
Run through all critical flows on the production bot:

1. ✅ `/start` → waitlist welcome appears (pre-launch mode)
2. ✅ Join waitlist → position assigned
3. ✅ Referral link → opens bot
4. ✅ Health endpoint: `https://bot.berubot.com/health` → 200
5. ✅ Waitlist count API: `https://bot.berubot.com/api/waitlist/count` → JSON response
6. ✅ Check container health: all 5 running
7. ✅ Check logs: no errors on startup
8. ✅ Send test webhook to QuickNode endpoint (curl with proper HMAC) → 200
9. ✅ Invalid HMAC webhook → 401

**✅ Acceptance Criteria:**
- All 9 smoke tests pass on production
- No 5xx errors in logs
- Response times < 2 seconds for all bot interactions

---

### T8.7 — Telegram Community Channels

| Field | Value |
|-------|-------|
| ID | T8.7 |
| Priority | 🟡 High |
| Est. Time | 1h |
| Depends On | — |
| Ref | COMMUNITY_AND_GROWTH_STRATEGY.md Section 2 |

**Instructions:**
Create two Telegram presences:

1. **`@BeruBotAnnouncements`** (Broadcast Channel):
   - Follow creation steps from COMMUNITY doc Section 2.1.1
   - Set description, profile picture, public link
   - Pin welcome message
   - Enable signature mode for admin posts

2. **`@BeruBotCommunity`** (Group Chat):
   - Follow creation steps from COMMUNITY doc Section 2.2.1
   - Set description, rules, profile picture
   - Configure admin permissions
   - Pin welcome message with bot link
   - Enable slow mode (30 seconds initially)

**✅ Acceptance Criteria:**
- Both channels are created and publicly accessible
- Welcome messages are pinned
- Bot links are present in descriptions
- @BeruBotAnnouncements is broadcast-only (non-admins cannot post)

---

### T8.8 — Launch Checklist

| Field | Value |
|-------|-------|
| ID | T8.8 |
| Priority | 🔴 Critical |
| Est. Time | 30 min |
| Depends On | T8.1 through T8.7 |

**Final checklist before declaring "launch-ready":**

| # | Item | Status |
|---|------|--------|
| 1 | All 5 Docker containers healthy | ☐ |
| 2 | TLS certificate valid on bot.berubot.com | ☐ |
| 3 | Telegram webhook set and verified | ☐ |
| 4 | QuickNode Stream webhook configured | ☐ |
| 5 | Database backup cron running | ☐ |
| 6 | `.env` has production MASTER_KEY_SECRET (backed up) | ☐ |
| 7 | Bot responds to `/start` in production | ☐ |
| 8 | Waitlist mode active (PRE_LAUNCH_MODE=true) | ☐ |
| 9 | Health endpoint returns 200 | ☐ |
| 10 | @BeruBotAnnouncements created | ☐ |
| 11 | @BeruBotCommunity created | ☐ |
| 12 | berubot.com "Launch Bot" button links to @BeruMonarchBot | ☐ |
| 13 | No errors in last 100 log lines | ☐ |
| 14 | MASTER_KEY_SECRET backed up in secure location (NOT in git) | ☐ |

**✅ All 14 items must be checked. March 9 launch is GO.**

---

## Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Jupiter API changes/downtime | Low | High | Pin Jupiter API version; implement retry with backoff; have manual sell fallback |
| R2 | DexScreener rate limit hit | Medium | Medium | Cache responses (60s), batch requests, implement backoff |
| R3 | QuickNode Stream misses transactions | Low | High | RecoveryWorker catches stuck states; Redis dedup prevents double processing |
| R4 | Wallet encryption bug | Low | Critical | Extensive unit tests for CryptoService; test with real Solana devnet wallets |
| R5 | Docker build fails on VPS | Low | Medium | Test build locally first; use multi-stage build for smaller images |
| R6 | Sell pipeline >7s latency | Medium | Medium | Use `confirmed` commitment; combined funding TX; parallel pre-flight |
| R7 | MASTER_KEY_SECRET lost | Low | Critical | Back up immediately after generation; document recovery procedure |
| R8 | Redis data loss | Low | Medium | Redis AOF persistence enabled in Docker Compose; BullMQ handles reconnection |
| R9 | Scope creep (Day 7-8) | High | High | Strict adhererence to MVP scope; defer nice-to-haves to post-launch |
| R10 | Solo developer illness/burnout | Medium | High | Maintain 8-10h days (not 16h); take breaks; critical path has 1 buffer day |

---

## Definition of Done

A task is **done** when:
1. Code is written and compiles without TypeScript errors
2. Acceptance criteria are met (as listed in each task)
3. No regressions to previously working features
4. Code follows the patterns established in ARCHITECTURE.md
5. Audit log events fire for security-sensitive operations
6. Error messages match the interface document's specifications

**Sprint is done** when:
- All tasks T1.1 through T8.8 are completed
- Launch checklist (T8.8) has all 14 items checked
- Bot is responding to commands on production
- Zero critical bugs in production logs

---

*Sprint plan for @BeruMonarchBot — Shadow Sell Engine v2*
*March 1–8, 2026 | Launch Day: March 9, 2026*
*"ARISE // TRADE // CONQUER"*
