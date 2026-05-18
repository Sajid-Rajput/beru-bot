---
status: accepted
date: 2026-05-17
accepted: 2026-05-17
---

# Buy Detector internal shape: one deep module, parser registry as the only public seam

[ADR 0001](0001-replace-quicknode-streams-with-logssubscribe.md) names the **Buy Detector** and pins its external responsibilities — `logsSubscribe` WS subscriptions per **DEX Program**, reconnect/heartbeat → degraded-mode polling, dedup, enqueue. It does not pin the *internal* shape: how the subscription manager, parsers, matcher, cache, and enqueuer relate; what's exported; what's a real seam vs. an internal collaborator; or where the components live in the source tree. With three DEX parsers planned from day one and the **Watched Mint** cache + RPC failover wrapper already merged in `src/services/`, the internal shape needs to be decided before issue #25 (BuyDetectorService minimal) is picked up. This ADR pins three decisions: the public/private boundary, the file layout, and how referrer attribution reaches the `SellJob` payload.

## Decisions

### 1. The Buy Detector is one deep module; `ParserRegistry` is its only public seam (B-3)

- **Public surface:** `BuyDetector` (start/stop, `getStatus()` for ops); `ParserRegistry` (the seam where adding a new DEX adds new code, not edited code); `BuyEvent` and `Parser` types.
- **Internal collaborators (not exported):** subscription manager, matcher, enqueuer.

Reasoning by the LANGUAGE.md *real-seam* rule ("one adapter = hypothetical seam; two adapters = real seam"):

- **Parsers** — three adapters from day one (Pump.fun BC, PumpSwap AMM, Raydium AMM v4), more later (Orca? Meteora? Pump.fun v2?). Real seam.
- **Subscription failover** — three providers (Chainstack primary, Helius fallback, mainnet-beta polling last-resort), but consumed only by the BuyDetector itself, not extension points for the codebase at large. Hypothetical seam; internal.
- **Matcher** — one implementation. A pure function with no extension story. Internal.
- **Enqueuer** — one implementation. Internal.

The monolith alternative (B-1) folds parsers inside `BuyDetector` too; the parser-registry-only-public alternative (B-3) keeps the one real extension point open while keeping everything else closed. The fully-decomposed alternative (B-2) makes `BuyDetector` a shallow wire-up coordinator with no behavior of its own — it fails the deletion test.

### 2. Buy Detector gets its own top-level directory; cache and parsers move under it

```
src/buy-detector/
  index.ts                          — BuyDetector facade: start/stop, getStatus, wires internals
  subscription-manager.ts           — internal: WS state machine, primary/degraded/fallback
  matcher.ts                        — internal: cache lookup, threshold check, sellPercentage rule
  enqueuer.ts                       — internal: dedupe (Redis SET NX), referral snapshot, SellJob push
  watched-feature-cache.ts          — moved from src/services/watched-mint-cache.ts
  watched-feature-cache.adapter.ts  — moved from src/services/watched-mint-cache.adapter.ts
  parsers/
    index.ts                        — ParserRegistry (exported)
    types.ts                        — BuyEvent + Parser type (moved from src/services/dex-parsers/)
    pump-fun-bc.parser.ts           — adapter
    pump-swap.parser.ts             — adapter
    raydium-v4.parser.ts            — adapter
```

The colocation makes the module's surface visible to a reader; **none** of these files have consumers outside the Buy Detector. `SolanaRpcService` (`src/services/solana-rpc.service.ts`) stays where it is — it has consumers in **Sell Execution** as well.

### 3. The cache is renamed `WatchedFeatureCache` and widens scope to carry referrer snapshots (R-ii)

The legacy name `WatchedMintCache` was always inaccurate: entries are keyed by `featureId`, hold `ProjectFeatureConfig[]`, and a single mint can carry multiple watching **Project Features**. The rename matches the actual key.

The cache's scope widens to include the referrer chain snapshot that `SellJob.referralSnapshot` needs:

- **Cache entry shape:** `{ featureId, projectId, userId, mint, config, referralSnapshot }`.
- **Loader join:** `projectFeatures ⋈ projects ⋈ users ⋈ referrals` (vs. the current 2-way join).
- **Pub/sub:** add a `referral:changed` channel keyed by `userId`. On message, the cache refreshes every entry where `userId = X`. Low frequency event (referrals are stable).
- **Lookup contract:** the matcher reads `cache.get(mint)` and gets everything needed to construct a `SellJob` — no further DB reads in the hot path.

This keeps the Buy Detector's hot path zero-DB and concentrates "everything the Buy Detector needs about a watched feature" behind one in-memory data structure with one pub/sub invalidation story.

## Consequences

- **Issue #25 (BuyDetectorService minimal) is rewritten.** The service is no longer a flat file at `src/services/buy-detector.service.ts` — it becomes the facade `src/buy-detector/index.ts` that wires the internal collaborators. The public method `addWatchedMint(mint, cfg)` is replaced by the cache's reactive pub/sub model (the cache owns its own lifecycle; `BuyDetector` doesn't expose write methods). Enqueue payload changes from raw `BuyEvent` to the fully-resolved `SellJob` shape ([ADR 0002](0002-sell-execution-state-machine.md)) — which means the matcher + enqueuer + referral snapshot logic ships in #25, not in #28.
- **Issue #26 (PumpSwap + Raydium subs) is rewritten.** Parsers live under `src/buy-detector/parsers/` and register with `ParserRegistry` rather than a flat barrel.
- **Issue #27 (heartbeat + degraded mode) is rewritten.** Implementation matches ADR-0001 unchanged; the file location moves into `subscription-manager.ts` as a non-exported internal collaborator.
- **Issues #15, #16, #17 (DEX parsers, already specified)** keep their pure-function signature `parseBuy(logs, tx): BuyEvent | null`. The work itself is reusable; the file path moves and they register with `ParserRegistry` rather than being looked up via a barrel. Minimal rewrite.
- **A new prereq issue moves cache + parsers + types** from `src/services/` and `src/services/dex-parsers/` into `src/buy-detector/`. Pure file moves + import path updates. No behavior change. Blocks #25 / #26.
- **A new prereq issue renames `WatchedMintCache` → `WatchedFeatureCache` and adds the referrer-chain column to the loader query + the `referral:changed` pub/sub channel.** Includes test updates for the new entry shape. Blocks #25.
- **`CONTEXT.md`'s "Flagged ambiguities" section** records the legacy `WatchedMintCache` name and resolves to `WatchedFeatureCache` so future contributors don't reach for the old term.
- **No new module names enter the domain vocabulary** beyond what `CONTEXT.md` already defines. `ParserRegistry`, `subscription-manager`, `matcher`, `enqueuer` are internal implementation terms, not domain concepts.

## Considered options

### Internal shape

- **B-1 — Monolith.** Single file, parsers as a private internal map. Rejected (mildly): the parser registry is a genuinely pluggable seam, and hiding it inside the module forces every new DEX to edit the central file rather than add a new file. Adds friction proportional to DEX count.
- **B-2 — Four exported sub-modules.** `SubscriptionManager`, `ParserRegistry`, `Matcher`, `SellJobEnqueuer` each exported, with `BuyDetector` as a thin coordinator. Rejected: the coordinator fails the deletion test — delete it and the four pieces still work, just need wiring elsewhere. That's a hint the coordinator is shallow. Also fragments the test surface: each module tests in isolation, but the wire-up (the part that actually breaks in production) has no test.

### Referral chain source

- **R-i — Live DB read in the enqueuer.** Every emitted `SellJob` triggers a referral chain query. Rejected: latency in the Sell Window (hundreds of queries/second on busy mints) for data that is effectively stable, and it leaves the executor's "zero upstream reads" property dependent on the enqueuer making one upstream read.
- **R-iii — Separate `ReferralChainCache` sibling module.** Two caches inside the Buy Detector, both keyed differently (mint vs. userId), both with pub/sub. Rejected by the deletion test: delete the sibling cache and `WatchedFeatureCache` could absorb it, or fall back to live reads — it doesn't earn its keep as a standalone module. The Buy Detector is the only consumer of referral snapshots in the worker; a separate cache for a single consumer is over-factoring.

### Cache scope and naming

- **Keep `WatchedMintCache` name.** Rejected: the name suggests entries are keyed by mint, but they're keyed by `featureId`. The mismatch is already a source of confusion for new readers. Cheap to fix now (one merged consumer); much harder once `BuyDetector` ships with the legacy name in its public API and signatures throughout the worker.

## Related

- [ADR 0001](0001-replace-quicknode-streams-with-logssubscribe.md) — Buy Detector external scope and provider stack
- [ADR 0002](0002-sell-execution-state-machine.md) — `SellJob` shape that this module produces, including `referralSnapshot`
- `CONTEXT.md` — domain vocabulary: **Buy Detector**, **Sell Job**, **Watched Mint**, **Project Feature**
