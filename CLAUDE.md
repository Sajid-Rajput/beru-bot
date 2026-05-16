# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Beru Bot — Shadow Sell v2.** A Telegram bot for Solana token automation, built on grammY + Hono + BullMQ + Drizzle/Postgres. The same source tree runs as **two long-lived Node processes**:

- `src/main.ts` — the grammY bot. Picks polling vs. webhook based on `BOT_MODE`; webhook mode also starts the Hono HTTP server.
- `src/worker.ts` — BullMQ workers (sell execution, market-cap monitor, recovery, fee payout, notifications). Currently a stub placeholder; the worker files in `src/workers/` are not yet wired up (T2.x sprint).

`src/app.ts` is a stub from earlier planning — `main.ts` is the real entry point.

## Commands

Package manager is **pnpm** (a `preinstall` hook rejects npm/yarn).

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Type-check | `pnpm typecheck` |
| Lint / autofix | `pnpm lint` / `pnpm format` |
| Test (all) | `pnpm test` |
| Test (watch) | `pnpm test:watch` |
| Test (one file) | `pnpm test src/services/__tests__/foo.test.ts` |
| Test (name filter) | `pnpm test -t "pattern"` |
| Coverage | `pnpm test:coverage` |
| Build | `pnpm build` → `build/` |
| Dev (bot, host) | `pnpm dev` (tsc-watch + tsx on `src/main.ts`) |
| Local infra only | `pnpm docker:dev:infra` (Postgres + Redis) |
| Full Docker stack | `pnpm docker:up` (app + worker + pg + redis + caddy) |
| Drizzle | `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` |
| DB / Redis shell | `pnpm docker:shell:postgres` / `pnpm docker:shell:redis` |

A husky pre-commit hook runs `lint-staged` (eslint on staged `*.ts`). Lint config is `@antfu/eslint-config` — it enforces formatting, so run `pnpm format` rather than fighting it.

## Architecture

### Process topology

Two Node processes share the codebase and the same Postgres + Redis: **app** (`main.ts`) and **worker** (`worker.ts`). Each opens its own `postgres.js` pool (`max: 10`), so a full deployment is ~20 DB connections. In Docker, Postgres and Redis sit on an `internal: true` network (`beru_internal`); only `app` and `caddy` touch the outside. Caddy terminates TLS and proxies to the Hono server on port 3000.

### Configuration (`src/config.ts`)

`process.env` is parsed through a **valibot** schema that returns a typed, validated `config` singleton. Two non-obvious things:

- Env vars are `SCREAMING_SNAKE_CASE` in `.env`, but the schema and all consumers use **camelCase**. `convertKeysToCamelCase` bridges them at boot. When adding a setting, add it to the schema in camelCase (`MY_NEW_VAR` → `myNewVar`) and document in `.env.example`.
- The schema is a **discriminated union on `botMode`** (`polling` | `webhook`). Webhook mode requires `botWebhook`, `botWebhookSecret`, `serverHost`, `serverPort`. Branch on `config.isPollingMode` / `config.isWebhookMode`; don't re-read env.

Outside `src/config.ts`, never read `process.env` directly — import the typed `config`.

### Imports & module resolution

- The `#root/*` → `./src/*` alias is declared in **three places** that must stay in sync: `tsconfig.json` `paths`, `package.json` `imports` (runtime — resolves to `build/src/*`), and `vitest.config.ts` `resolve.alias` (tests — resolves to `src/*`).
- Project is ESM with `moduleResolution: NodeNext`. **All intra-repo imports must use the `.js` extension** even when the source is `.ts`: `import { x } from '#root/utils/foo.js'`. Vitest's `extensionAlias` rewrites `.js` → `.ts` at test time.

### Bot wiring (`src/bot/index.ts`)

`createBot()` installs middleware in a **specific order** — re-arranging silently breaks features. Roughly:

1. Inject `ctx.config` and a per-update child logger.
2. `errorBoundary(errorHandler)` wraps everything below.
3. grammY plugins: `parseMode('HTML')`, `sequentialize` (polling only, key = `from.id`), `autoChatAction`, `hydrateReply`, `hydrate`.
4. `session` (Redis, key = `from.id` as string).
5. `conversations` (Redis, key namespaced as `convo:<id>` — keep this prefix so it doesn't collide with session keys).
6. `i18n`.
7. Beru chain: `rateLimit` → `debounce` → `userResolution` → `messageManagement`.
8. Feature handlers, then `smartDetection`, `adminFeature`, optional `languageFeature`, and `unhandledFeature` **last**.

Session and conversation state are durable across restarts via Redis.

### Database (`src/db/`)

- `schema/` — Drizzle tables, one file per table, re-exported through `schema/index.ts`.
- `repositories/` — query helpers per aggregate. **Use these from features** rather than writing inline Drizzle queries.
- `index.ts` — exports the `db` singleton and re-exports the schema. It opens the Postgres pool **eagerly on import**, so importing it from a script touches the DB. For test isolation use the `createDb(url)` factory.
- Migrations live in `drizzle/`. Generate with `pnpm db:generate`, apply with `pnpm db:migrate`. `db:push` is for local dev only.

### Queue & workers (`src/queue/`, `src/workers/`)

BullMQ on `ioredis`. `src/queue/redis.ts` owns the shared `ioredis` connection (also reused by the bot's session adapter). `src/queue/queues.ts` declares queue handles. Worker entries in `src/workers/*.worker.ts` are intended to be registered from `src/worker.ts` — wiring lands in the T2.x sprint.

### HTTP server (`src/server/`)

Hono + `@hono/node-server`. Routes under `src/server/routes/` (`health`, `quicknode`, `waitlist`). The grammY `/webhook` route is mounted inside `createServer()` only when `botMode === 'webhook'`. Custom middlewares: `requestId`, `setLogger` (per-request child logger on `c.var.logger`), `requestLogger` in debug mode.

## Testing

Vitest. Test files live colocated under `src/**/__tests__/*.test.ts`. Coverage provider is v8. The vitest config mirrors the runtime `#root/*` alias and adds `extensionAlias` so `.js` import specifiers resolve to `.ts` sources.

## Conventions to keep

- Reach for `src/db/repositories/` before writing inline Drizzle queries in handlers.
- Put external-API calls in `src/services/`, DB calls in repositories, Telegram-flow logic in `src/bot/handlers/` or `src/bot/features/`.
- New env vars: schema entry in `src/config.ts` **and** an entry in `.env.example`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `Sajid-Rajput/beru-bot`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, using default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
