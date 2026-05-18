---
status: accepted
date: 2026-05-17
accepted: 2026-05-17
---

# Sell Execution state machine: pure executor, hybrid durability, idempotent recovery

The **Sell Execution** module is the worker-side consumer of `SellJob`s emitted by the **Buy Detector** ([ADR 0001](0001-replace-quicknode-streams-with-logssubscribe.md)). It runs the on-chain *mechanics* of one sell attempt inside the **Sell Window**: spin **Ephemeral Wallet**, fund it, swap via Jupiter, then a single multi-instruction sweep that pays the user net to the main wallet and the platform fee to the platform fee wallet, atomically. The original sprint plan (issue #28's 10-step pipeline) folded matching, balance pre-flight, and fee math inside the same worker, took raw `buyEvent`s, and tracked attempt lifecycle on `ephemeral_wallets.status` with `recovery.worker` running its own decrypt+sweep path. That shape made the module simultaneously large, coupled to upstream cache state, and duplicated with the recovery worker. This ADR pins a different shape — five interlocking decisions — that keep the executor narrow, the durability story simple, and the recovery path free of code duplication.

## Decisions

### 1. Sell Execution is a pure executor; matching lives upstream in the Buy Detector (Shape A)

The `SellJob` arriving on the queue is fully resolved: the **Buy Detector** has already matched the buy against every **Watched Mint**'s **Project Feature** thresholds, picked a concrete `sellPercentage`, snapshotted the owner's referrer chain, and deduped by `triggerSignature`. The executor takes `{ featureId, triggerSignature, mint, mainWalletPubkey, sellPercentage, configSnapshot, buyAmountSol, referralSnapshot, schemaVersion }` and runs against this snapshot alone — no `WatchedFeatureCache` reads, no live config or referral lookups, no policy. Policy changes after enqueue cannot race execution.

### 2. Durability is hybrid: BullMQ owns retry loop, Postgres owns on-chain trail (Shape γ)

BullMQ's retry/backoff handles transient failures inside one attempt. Postgres carries the durable on-chain side-effect trail (which signatures landed) so a worker crash or BullMQ data loss never strands an **Ephemeral Wallet** that holds user funds. The two systems own different concerns: BullMQ owns *"is this attempt still in progress,"* Postgres owns *"is there money on this Ephemeral Wallet that hasn't been swept."*

### 3. The `transactions` row is the single source of truth (γ.i)

`transactions` carries the complete lifecycle of one Sell Execution attempt. Schema cleanup follows:

- Add `funding_tx_signature` and `sweep_tx_signature` columns to `transactions` (`triggerTxSignature` and `sellTxSignature` for the swap already exist — the row now carries all four signatures).
- Drop `ephemeral_wallets.status`, `ephemeral_wallets.recovery_attempts`, and the `idx_ephemeral_wallets_recovery` partial index.
- Drop the `ephemeral_status` pgEnum entirely.
- Recreate the recovery partial index on `transactions` keyed by `WHERE status = 'recovery_needed'`.
- `ephemeral_wallets` reduces to keypair custody only: encrypted private key, IVs, DEK, public key, mint, main wallet pubkey, link to `transactions`.

One state machine, in one table.

### 4. Recovery is a scanner-enqueuer; the executor is idempotent (R-3)

`recovery.worker` does not run sell mechanics. It scans `transactions WHERE status = 'recovery_needed' AND last_attempt_at < now() - interval '5 min'` and re-enqueues a `SellJob` for each row. Sell Execution is **idempotent on `(featureId, triggerSignature)`**: every job (fresh, retried, recovered) starts by looking up the existing `transactions` row, checks on-chain status for each persisted signature, and resumes from the first not-yet-landed step. The same code path handles fresh execution and recovery — no duplicated sweep primitive in two workers.

Retry budgets per step (different shapes for different failure modes):

- **Funding TX** — 3 attempts, exponential backoff (~250 ms / 1 s / 4 s). Cheap to retry; no funds moved yet.
- **Swap TX** — 1 send + N confirm-checks (`getSignatureStatus` polling for 30 s). Avoid double-swap: if a previous attempt's `swap_tx_signature` is set, query on-chain before sending a new one.
- **Sweep TX** — 5+ attempts, more aggressive backoff. Idempotent on amount; double-spends fail safely; "move SOL from A to B + B'" is recoverable.

### 5. Fees collected on-chain in the sweep TX; `fee-payout.worker` does referral disbursements only (F-1)

The sweep TX is a single Solana transaction with two transfer instructions: `Ephemeral Wallet → user main wallet` (user net) and `Ephemeral Wallet → platform fee wallet` (effective fee). Atomic: both transfers land or neither. After confirmation, **one Postgres transaction** writes:

- `transactions.sweep_tx_signature = <sig>`, `transactions.status = 'completed'`
- `fee_ledger` row with the computed accounting (gross, fee, referral discount, tier-1/tier-2 shares from `SellJob.referralSnapshot`, platform net), `collectionStatus: pending`, `feeTxSignature: null`

`fee_ledger.collectionStatus = pending` means *"platform has its fee on-chain; referral shares haven't been paid out yet."* `fee-payout.worker` is the referral-disbursement worker — batches `pending` rows by referrer, sends payout TX(s), updates rows to `collected` with the batch signature. It does **not** collect platform fees (those landed during sweep). Recovery rule for the rare race "sweep landed but Postgres write failed": scanner sees `transactions` with `sweep_tx_signature` set on-chain but no `fee_ledger` row → write the missing `fee_ledger` row.

### 6. User-facing messages cross processes via the Notification seam (N-2, fat payload)

Sell Execution does not import the Telegram SDK. On terminal outcomes (completed / failed / unrecoverable) it enqueues a `Notification` job — `{ userId, kind, context }` carrying everything the bot process needs to render — onto a BullMQ queue consumed by `notification.consumer.ts` running in the bot process. The consumer owns template rendering, i18n, the Telegram API call, and per-chat rate limiting. Sell Execution makes zero DB reads to construct the payload; the consumer makes zero DB reads to render. Same seam used by `recovery.worker`, `market-cap-monitor`, and `fee-payout.worker`.

## Consequences

- **The 10-step pipeline in issue #28 is rewritten.** The executor is shorter (no matching, no balance pre-flight, no own-DB referral lookup) but its first step gains an idempotency check. Net code is smaller and more testable.
- **Schema migration is required before #28 can be picked up.** A new prereq issue covers adding/dropping columns and rebuilding the partial index. Cheap to do now (no `transactions` rows exist in any production-like state); expensive later.
- **`recovery.worker` (issue #20) is rewritten.** It becomes ~30 lines of scan + re-enqueue. No keypair decryption, no sweep TX building, no audit log writes — those move into the executor's idempotent fast path.
- **One state machine, one source of truth.** The `ephemeral_status` enum disappears. Reading "is this attempt healthy?" requires looking at exactly one row.
- **`fee-payout.worker` (issue #21) scope is narrower than the original spec.** It only disburses referral shares from `pending` `fee_ledger` rows. Platform fee collection happens inline with sweep.
- **The Sell Window narrows by one DB write.** The original design had a separate `ephemeral_wallets.status` update and a `transactions.status` update per step; γ.i collapses them. Latency budget improves marginally inside the window.
- **`Notification` is the only seam workers use to talk to users.** `src/services/notification.service.ts` (4-line stub) is deleted. The worker side never imports `grammy`.

## Considered options

### Module boundary

- **Shape B — Sell Execution owns matching + execution.** Single module spans `buyEvent → matched features → executed sells`. Rejected: the cache it would need (`WatchedFeatureCache`) already lives in the **Buy Detector**, and policy ("does this buy qualify, at what percent?") naturally belongs next to the cache that holds the thresholds. Splitting policy across two modules is worse than locating it once.
- **Shape C — No internal queue; synchronous within the worker.** `Buy Detector → matcher → executor` all run inline. Rejected: throws away BullMQ's at-least-once delivery and retry/backoff for exactly the part of the pipeline that needs durability most (Ephemeral Wallets holding user funds).

### Durability

- **BullMQ-only checkpoints.** Step state lives entirely in BullMQ's job data; recovery falls back to dead-letter inspection. Rejected: BullMQ state isn't built to express "Ephemeral Wallet X holds 0.42 SOL that needs sweeping." If a BullMQ job is abandoned or its data is lost, no Postgres trail exists to reconstruct from. Stranded on-chain funds are unrecoverable.
- **Postgres-only state, BullMQ as trigger.** Every step writes Postgres; BullMQ jobs are short triggers. Rejected: every step writes the DB, latency goes up inside the Sell Window, and the state machine splits across code paths and table columns.

### Schema layout for attempt state

- **γ.ii — Keep both `transactions.status` and `ephemeral_wallets.status` enums; sharpen who owns what.** `transactions` holds the audit view, `ephemeral_wallets` holds internal lifecycle. Rejected: the `recovery_needed` value already lives in both enums, evidence of an unprincipled split. Two rows have to stay coherent, and "what stage is this attempt in?" has two answers. The `transactions` row is the only audit consumer; `ephemeral_wallets` has no readers that benefit from its own status.

### Recovery boundary

- **R-1 — Recovery is a separate entry point inside Sell Execution.** Same module, two entry points: one for fresh jobs, one for stuck rows. Equivalent to R-3 but skips the queue indirection. Rejected (mildly): R-3 forces idempotency-by-signature, which we have to handle anyway because BullMQ delivers at-least-once. Routing recovery through the same queue means idempotency is solved once and consistently.
- **R-2 — Recovery is a separate executor module.** `recovery.worker` has its own decrypt + sweep primitive. Rejected: duplicates the sweep TX builder, key zeroing logic, fee math, and audit row writes. Two implementations of the same sequence will drift, and security-sensitive code is the worst place for drift.

### Fee placement

- **F-2 — Fee parked in the Ephemeral Wallet, swept later.** Sweep TX sends only user share; fee chunk stays on Ephemeral Wallet for `fee-payout.worker` to collect. Rejected: directly contradicts the **Ephemeral Wallet** definition ("lives for the duration of one attempt") and keeps a dangling on-chain liability per sell that recovery has to scan for.
- **F-3 — Two separate TXs at sweep time (user TX + platform fee TX).** Rejected: more on-chain TXs widen the Sell Window, more confirmations to wait for, and add a recovery branch ("user TX landed but fee TX didn't"). The atomic multi-instruction sweep is strictly simpler.

### Notification mechanism

- **N-1 — Sell Execution calls Telegram directly.** Worker imports `grammy` and `bot.api.sendMessage(...)`. Rejected: couples worker-side modules to the Telegram API. Rate limiting, i18n, message templates, per-chat session state all live in the bot process — splitting them across two processes is locality decay.
- **N-3 — Sell Execution writes a `notifications` table; bot polls or LISTEN/NOTIFY.** Rejected: durability for notifications isn't a product requirement. If the bot process is briefly down and a notification is lost, the user sees the sell anyway via `transactions` history. Over-engineered for the failure mode.

### Notification payload

- **Thin (DB-keyed) — `{ userId, kind, transactionId }`.** Rejected: forces the bot-side consumer to re-read `transactions` + `fee_ledger` to render. Couples the consumer to DB schema and adds latency. The fat payload trades a slightly larger queue message for a render path with zero DB reads.

## Related

- [ADR 0001](0001-replace-quicknode-streams-with-logssubscribe.md) — Buy Detector design (produces `SellJob`s consumed by this module)
- [ADR 0003](0003-buy-detector-internal-shape.md) — Buy Detector internal structure (sibling decision)
- `CONTEXT.md` — domain vocabulary: **Sell Execution**, **Sell Job**, **Ephemeral Wallet**, **Sell Window**, **Notification**
