# Beru Bot — Shadow Sell

Beru Bot is a Telegram bot that runs the **Shadow Sell** feature: each user attaches the bot to a token mint they hold, and the bot automatically sells a slice of that holding whenever a qualifying buy lands on a configured DEX. The bot is built around a few domain concepts that recur across the codebase, the docs, and the operational tooling.

## Language

**Shadow Sell**:
The bot feature itself — automatic, configurable selling of a held SPL token whenever buys above user-set thresholds hit the on-chain pool.
_Avoid_: smart sell, auto-sell, sniper.

**Buy Detector**:
The subsystem that observes on-chain swaps against the configured DEX Programs, matches each parsed buy against every Watched Mint's Project Feature thresholds, resolves the actual sell percentage from the matched config + buy size, snapshots the owner's referrer chain, dedupes by transaction signature, and emits one Sell Job per qualifying Project Feature. Lives at `src/buy-detector/` as a single deep module; the only public seam is the per-DEX `ParserRegistry`. Owns the Watched Feature cache (mints + thresholds + referrer chains, keyed by featureId, kept fresh via Redis pub/sub), the WebSocket subscriptions, the subscription mode state machine (primary WSS → degraded poll → reconnect-and-reconcile), and the per-DEX log parsers. All Shadow Sell *policy* lives here (should-we-sell, how-much, who-gets-what-cut) — *mechanics* live downstream in Sell Execution.
_Avoid_: stream handler, webhook handler, listener.

**Sell Job**:
The durable unit of work the Buy Detector hands to Sell Execution after a buy has been matched, deduped by transaction signature, and resolved into a concrete sell percentage. A self-contained snapshot: `{ featureId, triggerSignature, mint, mainWalletPubkey, sellPercentage, configSnapshot, buyAmountSol, referralSnapshot, schemaVersion }`. The `referralSnapshot` captures the Project Feature owner's tier-1/tier-2 referrer ids and shares at match time, so referral attribution is locked when the buy lands — not when the sell completes. The executor runs against this snapshot alone (no cache reads, no DB lookups for config or referrals) so policy changes after enqueue don't race execution. Persisted through BullMQ; one Sell Job = one execution attempt.
_Avoid_: sell event, sell request, trade order, sell signal.

**Sell Execution**:
The worker-side module that consumes a Sell Job and runs the on-chain *mechanics* end-to-end inside the Sell Window: spin Ephemeral Wallet, fund it, swap via Jupiter, then a single multi-instruction sweep TX that pays user net to the main wallet and platform fee to the platform fee wallet atomically. After the sweep confirms, in one Postgres transaction: stamp `transactions.sweep_tx_signature`, set status to `completed`, and insert the `fee_ledger` row (status `pending`, referrer shares computed from `SellJob.referralSnapshot`) — so the audit row only exists if the fee was actually collected on-chain. Pure mechanics — no matching, no threshold checks, no Watched Mint cache reads, no policy decisions, no live referral chain reads. The interface is small on purpose: `SellJob in → completion-or-failure out`. Idempotent on `(featureId, triggerSignature)`: every Sell Job (fresh, retried, recovered) starts by looking up the existing `transactions` row, reads which step signatures are already on-chain, and resumes from the first not-yet-landed step. State is durable in `transactions` as the single source of truth. The recovery scanner does not invoke this module directly — it re-enqueues a Sell Job, and the idempotency check routes it to the right resumption point. Referrer disbursements are downstream: `fee-payout.worker` batches `pending` `fee_ledger` rows and stamps `feeTxSignature` when paid. User-facing messages cross processes via the Notification seam — Sell Execution enqueues a fat Notification and is done; the bot process consumes it and talks to Telegram.
_Avoid_: sell worker, swap runner, sell service, trader.

**Watched Mint**:
An SPL token mint currently being monitored by an active Project Feature (i.e. a feature row with `is_watching = true`). The set of Watched Mints is the filter the Buy Detector applies to incoming log notifications.
_Avoid_: tracked token, watched token, mint.

**Project Feature**:
A single user's configuration of Shadow Sell for one token mint — thresholds (min/max sell %, min MCAP, min buy SOL), whitelist, status (idle / watching / executing / stopped). The unit that transitions between watching and not-watching.
_Avoid_: feature config, project config, watcher.

**DEX Program**:
A Solana on-chain program against which buys are detected. MVP scope: Pump.fun bonding curve, PumpSwap AMM, Raydium AMM v4. Each DEX Program has its own log layout and gets its own parser.
_Avoid_: protocol, AMM, exchange.

**Sell Window**:
The brief post-buy interval in which mirror-selling can ride the price impact of the triggering buy. Detection latency directly compresses this window — every extra second is price erosion.
_Avoid_: trade window, opportunity, edge.

**Ephemeral Wallet**:
A throwaway Solana keypair generated per sell execution. Receives the tokens + SOL gas via a combined funding TX, performs the Jupiter swap, then sweeps proceeds back to the user's main wallet (and the platform fee wallet, atomically in the same sweep TX). Isolates each sell from the main key. Stores only keypair material in the `ephemeral_wallets` table; lifecycle state lives in the linked `transactions` row.
_Avoid_: temp wallet, throwaway, hot wallet.

**Notification**:
The cross-process seam for every user-facing message the bot sends. Subsystems running in the worker process (Sell Execution, recovery, market-cap monitor, fee-payout) enqueue a fat-payload Notification — `{ userId, kind, context }` carrying everything needed to render — onto a BullMQ queue consumed by the bot process. The consumer (`notification.consumer.ts`) owns template rendering, i18n, the Telegram API call, and per-chat rate limiting. The seam exists so worker-side modules never import the Telegram SDK and never read the DB to render a message.
_Avoid_: alert, push, toast, message.

## Relationships

- A **User** owns up to 3 **Project Features** (one per token mint, enforced as `MAX_PROJECTS_PER_USER`).
- A **Project Feature** has exactly one **Watched Mint** while `is_watching = true`.
- The **Buy Detector** holds zero or more **Watched Mints** in its in-memory cache and N **DEX Program** WebSocket subscriptions (N = 3 for MVP).
- A buy on a **DEX Program** that touches a **Watched Mint** produces one **Sell Job** per qualifying **Project Feature** (deduped by tx signature at the **Buy Detector** seam).
- Each **Sell Job** is consumed by exactly one **Sell Execution** attempt, which spawns exactly one **Ephemeral Wallet** that lives for the duration of that attempt.

## Flagged ambiguities

- "watched token" / "tracked mint" / "monitored token" — all resolved as **Watched Mint**.
- "stream handler" (legacy QuickNode Streams term) — replaced by **Buy Detector**.
- "WatchedMintCache" (legacy name) — replaced by **WatchedFeatureCache** under `src/buy-detector/`. The cache was always keyed by featureId, not mint; the rename matches the actual key and the wider scope (also holds referrer snapshots).
- "project" vs "project feature": a Project is the wrapper row (token + wallet + soft-delete); a **Project Feature** is the configured-and-stateful Shadow Sell behavior on that Project. Most of the bot's logic operates on Project Features.
